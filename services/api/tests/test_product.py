import json
import uuid
from fastapi.testclient import TestClient
from study.config import Settings
from study.main import create_app
from study.ai import UnconfiguredProvider
from conftest import create,control

def test_unconfigured_ai_does_not_fabricate_or_persist_answer(tmp_path):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/none.db',_env_file=None),provider=UnconfiguredProvider())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as c:
        s=create(c,opening=False)
        assert s['messages']==[]
        for event in ['open','hint','answer','continue','skip']:
            assert control(c,s,event).status_code==503
        r=c.post(f"/api/sessions/{s['id']}/turns",json={'text':'b=4，因为只改a','version':s['version'],'request_id':str(uuid.uuid4())})
        assert r.status_code==503
        after=c.get(f"/api/sessions/{s['id']}").json()
        assert after['messages']==s['messages']
        assert not after['pending']

def test_ownership_and_csrf(fixture_app):
    c,app,_=fixture_app;s=create(c)
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as other:
        for method,path in [('get',''),('get','/export'),('delete','')]:
            assert getattr(other,method)(f"/api/sessions/{s['id']}"+path).status_code==404
        assert other.get('/api/bootstrap').json()['sessions']==[]
    assert c.post('/api/sessions',headers={'Origin':'https://untrusted.example'},json={'task_id':'mean'}).status_code==403
    assert c.post('/api/sessions',headers={'X-Study-Client':''},json={'task_id':'mean'}).status_code==403

def test_future_answers_and_rubrics_not_public(fixture_app):
    c,_,_=fixture_app;s=create(c)
    body=json.dumps(s,ensure_ascii=False)
    assert 'rubric' not in body and 'backup' not in body
    assert 'answer' not in s['current_node']
    assert s['current_node']['title']=='赋值与复制' and s['messages'][0]['source']=='ai'

def test_hint_example_and_change_are_real_generation(fixture_app):
    c,_,provider=fixture_app;s=create(c);qid=s['current_node']['id']
    s=control(c,s,'hint').json();assert s['hint_level']==1
    s=control(c,s,'answer').json();assert s['exposed'] and not s['ready']
    assert all(m['source']=='ai' for m in s['messages'] if m['role']=='assistant')
    s=control(c,s,'skip').json();assert s['current_node']['id']!=qid
    assert s['records'][-1]['status']=='skipped'
    assert len(provider.calls)==4


def test_priority_controls_accept_stale_version_and_end_is_idempotent(fixture_app):
    c,_,_=fixture_app;s=create(c,support=True);old=dict(s)
    s=control(c,s,'hint').json()
    assert control(c,old,'continue').status_code==409
    s=control(c,old,'pause').json();assert s['support_mode']=='paused' and not s['consent']['camera']
    s=control(c,old,'end').json();assert s['status']=='ended'
    s2=control(c,old,'end').json();assert s2['version']==s['version']

def test_answer_idempotency_and_projection(fixture_app):
    c,_,provider=fixture_app;s=create(c);rid=str(uuid.uuid4())
    payload={'text':'b=4，最后只改变a','version':s['version'],'request_id':rid}
    first=c.post(f"/api/sessions/{s['id']}/turns",json=payload)
    assert first.status_code==200,first.text
    second=c.post(f"/api/sessions/{s['id']}/turns",json=payload)
    assert second.json()==first.json() and len(provider.calls)==3
    assert first.json()['ready']
    projected=provider.calls[2][1]
    assert 'rubric' not in projected and 'answer' not in projected and 'backup' not in json.dumps(projected)
    payload['text']='不同内容'
    assert c.post(f"/api/sessions/{s['id']}/turns",json=payload).status_code==409

def test_correction_protects_current_question(fixture_app):
    c,_,_=fixture_app;s=create(c)
    s=control(c,s,'correct',text='其实我挺开心的，只是在思考').json()
    assert s['current_node']['title']=='赋值与复制' and s['messages'][0]['source']=='ai' and s['protected']
    assert s['messages'][-1]['source']=='ai' and s['messages'][-2]['source']=='correction'

def test_export_and_delete(fixture_app):
    c,_,_=fixture_app;s=create(c)
    result=c.get(f"/api/sessions/{s['id']}/export").json()
    assert result['consent_log'][0]['support'] is False
    assert c.delete(f"/api/sessions/{s['id']}").status_code==204
    assert c.get(f"/api/sessions/{s['id']}").status_code==404

def test_pause_keeps_normal_chat_available(fixture_app):
    c,_,_=fixture_app;s=create(c,support=True);s=control(c,s,'pause').json()
    r=c.post(f"/api/sessions/{s['id']}/turns",json={'text':'b=4，第三行只改a','version':s['version'],'request_id':str(uuid.uuid4())})
    assert r.status_code==200 and r.json()['support_mode']=='paused'

def test_all_courses_remain_open_for_flexible_dialogue(fixture_app):
    c,_,_=fixture_app
    for task in ['variable','mean','causality']:
        s=create(c,task)
        for _ in range(7):s=control(c,s,'skip').json()
        assert s['status']=='active' and len(s['records'])==7
        s=control(c,s,'end').json();assert s['status']=='ended'


def test_activity_rejects_draft_text(fixture_app):
    c,_,_=fixture_app;s=create(c)
    body=dict(version=s['version'],foreground=True,has_draft=True,composing=False,busy=False,reading=False,draft='secret')
    assert c.post(f"/api/sessions/{s['id']}/activity",json=body).status_code==422
