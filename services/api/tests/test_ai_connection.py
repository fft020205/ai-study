import json
import stat
import uuid
from pathlib import Path
import httpx
import pytest
from fastapi.testclient import TestClient
from study.config import Settings
from study.main import create_app
from conftest import create

SECRET = 'test-key-kept-on-server'

def settings(tmp_path, **kwargs):
    return Settings(database_url=f'sqlite:///{tmp_path}/settings.db',
                    ai_config_path=str(tmp_path/'connection.json'), _env_file=None, **kwargs)

def client(app):
    return TestClient(app, base_url='http://127.0.0.1:18000', client=('127.0.0.1',50000),
                      headers={'X-Study-Client':'web-v1'})

def payload(**overrides):
    return dict(provider='openai',base_url='https://model.example/v1',
                model='my-model',api_key=SECRET,timeout_seconds=20,**overrides)

def test_save_is_private_survives_restart_and_activates_without_restart(tmp_path, monkeypatch):
    cfg=settings(tmp_path)
    calls=[]
    def respond(request):
        calls.append(request)
        data=json.loads(json.loads(request.content)['messages'][1]['content'])
        response=({'evaluation':{'verdict':'supported','evidence_quote':data['student_text'],'misconception':'','feedback':''}}
                  if 'exercise' in data else {'reply':'请继续说明下一步。','focus_id':'copy','move':'reflect','exercise_action':'keep','exercise':None})
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(response)}}]})
    real_client=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:real_client(transport=httpx.MockTransport(respond),**kw))
    with client(create_app(cfg)) as c:
        assert not c.get('/api/health').json()['ai_configured']
        result=c.put('/api/settings/ai',json=payload())
        assert result.status_code==200,result.text
        assert result.json()['has_api_key'] and result.json()['configured']
        assert SECRET not in result.text and 'api_key' not in result.json()
        read=c.get('/api/settings/ai')
        assert SECRET not in read.text
        assert c.get('/api/health').json()['ai_configured']
        assert c.get('/api/bootstrap').json()['capabilities']['ai_configured']
        s=create(c)
        r=c.post(f"/api/sessions/{s['id']}/turns",json={'text':'b=4，因为只改a','version':s['version'],'request_id':str(uuid.uuid4())})
        assert r.status_code==200,r.text
        assert len(calls)==3
        assert all(r.headers['Authorization']==f'Bearer {SECRET}' for r in calls)
    path=tmp_path/'connection.json'
    assert stat.S_IMODE(path.stat().st_mode)==0o600
    with client(create_app(cfg)) as restarted:
        assert restarted.get('/api/settings/ai').json()['configured']
        assert restarted.get('/api/health').json()['provider']=='openai'


def test_retains_key_but_requires_new_key_for_another_destination(tmp_path):
    with client(create_app(settings(tmp_path))) as c:
        assert c.put('/api/settings/ai',json=payload()).status_code==200
        update=payload();update.pop('api_key');update['model']='another-model'
        assert c.put('/api/settings/ai',json=update).status_code==200
        update['base_url']='https://another.example/v1'
        assert c.put('/api/settings/ai',json=update).status_code==400
        assert c.get('/api/settings/ai').json()['base_url']=='https://model.example/v1'
        update['api_key']='new-test-key'
        assert c.put('/api/settings/ai',json=update).status_code==200


def test_disabling_and_clearing_override_environment_after_restart(tmp_path):
    cfg=settings(tmp_path, ai_provider='openai',ai_api_key=SECRET,ai_model='env-model')
    with client(create_app(cfg)) as c:
        body={'provider':'none','base_url':cfg.ai_base_url,'model':'','clear_api_key':True}
        result=c.put('/api/settings/ai',json=body)
        assert result.status_code==200
        assert not result.json()['has_api_key']
    with client(create_app(cfg)) as restarted:
        read=restarted.get('/api/settings/ai').json()
        assert read['provider']=='none' and not read['has_api_key'] and not read['load_error']


@pytest.mark.parametrize('url',[
    'http://remote.example/v1','https://user:secret@example.com/v1',
    'https://example.com/v1?key=secret','file:///tmp/config',
    'https://bad host/v1','https://example.com:abc/v1',
])
def test_validation_does_not_echo_keys(tmp_path,url):
    with client(create_app(settings(tmp_path))) as c:
        body=payload();body['base_url']=url
        response=c.put('/api/settings/ai',json=body)
        assert response.status_code==422
        assert SECRET not in response.text and url not in response.text
        assert not (tmp_path/'connection.json').exists()


def test_unsaved_connection_test_uses_json_contract_and_does_not_persist(tmp_path,monkeypatch):
    calls=[]
    def respond(request):
        calls.append(request)
        return httpx.Response(200,json={'choices':[{'message':{'content':'{"ok":true}'}}]})
    real_client=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:real_client(transport=httpx.MockTransport(respond),**kw))
    with client(create_app(settings(tmp_path))) as c:
        body=payload();body['base_url']='http://127.0.0.1:9999/v1/chat/completions'
        response=c.post('/api/settings/ai/test',json=body)
        assert response.status_code==200,response.text
        assert response.json()['ok'] and SECRET not in response.text
        assert str(calls[0].url)=='http://127.0.0.1:9999/v1/chat/completions'
        outgoing=json.loads(calls[0].content)
        assert outgoing['model']=='my-model' and outgoing['response_format']=={'type':'json_object'}
        assert json.loads(outgoing['messages'][1]['content'])=={'connection_test':True}
        assert not c.get('/api/health').json()['ai_configured']
        assert not (tmp_path/'connection.json').exists()


def test_upstream_failure_is_sanitized(tmp_path,monkeypatch):
    def respond(request):
        return httpx.Response(401,text='bad key '+SECRET)
    real_client=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:real_client(transport=httpx.MockTransport(respond),**kw))
    with client(create_app(settings(tmp_path))) as c:
        response=c.post('/api/settings/ai/test',json=payload())
        assert response.status_code==400
        assert SECRET not in response.text and '401' not in response.text


def test_local_settings_reject_remote_peers_origins_hosts_and_forwarded_clients(tmp_path):
    app=create_app(settings(tmp_path))
    with client(app) as c:
        assert c.get('/api/settings/ai').status_code==200
        assert c.get('/api/settings/ai',headers={'Origin':'https://evil.example'}).status_code==403
        assert c.get('/api/settings/ai',headers={'Host':'evil.example'}).status_code==403
        assert c.get('/api/settings/ai',headers={'X-Forwarded-For':'203.0.113.1'}).status_code==403
        assert c.get('/api/settings/ai',headers={'X-Study-Client':''}).status_code==403
    with TestClient(app,base_url='http://127.0.0.1:18000',client=('203.0.113.1',50000),headers={'X-Study-Client':'web-v1'}) as remote:
        assert remote.get('/api/settings/ai').status_code==403
    with client(create_app(settings(tmp_path,ai_settings_enabled=False))) as disabled:
        assert disabled.get('/api/settings/ai').status_code==403


def test_failed_storage_keeps_old_live_config_and_invalid_file_is_not_echoed(tmp_path):
    cfg=settings(tmp_path)
    cfg.ai_config_path=str(tmp_path/'as-directory')
    Path(cfg.ai_config_path).mkdir()
    with client(create_app(cfg)) as c:
        assert c.get('/api/settings/ai').json()['load_error']
        response=c.put('/api/settings/ai',json=payload())
        assert response.status_code==400
        assert not c.get('/api/health').json()['ai_configured']
        assert SECRET not in response.text
