"""Shown support is an invitation awaiting a user choice, not expiring telemetry."""
import hashlib
import json
import time
import uuid
import pytest
from study.ai import AIUnavailable
from conftest import create,control


def shown_support(fixture_app,reason='waiting',**extra):
    client,app,provider=fixture_app;s=create(client,support=True)
    owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest()
    state=app.state.repo.get(owner,s['id']);version=state['version']
    state['episode']={'id':'retained','question_key':state['question_key'],'reason':reason,
        'created_at':time.time()-3600,'expires_at':time.time()-3570,'text':'测试中的支持邀请'}
    state.update(extra)
    app.state.repo.save(owner,state,version)
    return client,app,provider,owner,state


@pytest.mark.parametrize('reason',['waiting','cognitive_load','fatigue','visual_signal'])
@pytest.mark.parametrize('flags',[{'has_draft':True},{'composing':True},{'reading':True},{'busy':True},{'foreground':False}])
def test_shown_support_survives_activity_and_legacy_expiry(fixture_app,reason,flags):
    client,_,provider,_,s=shown_support(fixture_app,reason)
    calls=len(provider.calls)
    body=dict(version=s['version'],foreground=True,has_draft=False,composing=False,busy=False,reading=False)|flags
    for _ in range(2):
        response=client.post(f"/api/sessions/{s['id']}/activity",json=body)
        assert response.status_code==200
        after=response.json()
        assert after['episode']['id']=='retained' and after['episode']['expires_at'] is None
        assert after['version']==s['version'] and len(provider.calls)==calls
    assert client.get(f"/api/sessions/{s['id']}").json()['episode']['id']=='retained'


@pytest.mark.parametrize('stream',[False,True])
@pytest.mark.parametrize('fail',[False,True])
def test_sending_and_reply_success_or_failure_preserve_invitation(fixture_app,stream,fail):
    client,_,provider,_,s=shown_support(fixture_app)
    if fail:
        async def unavailable(*args):raise AIUnavailable('测试服务不可用')
        provider.complete_json=unavailable
    response=client.post(f"/api/sessions/{s['id']}/turns"+('/stream' if stream else ''),
        json=dict(text='我正在尝试理解',version=s['version'],request_id=str(uuid.uuid4())))
    if stream:
        frames=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
        assert frames[0]['session']['episode']['id']=='retained'
        assert ('detail' in frames[-1])==fail
        if not fail:assert frames[-1]['session']['episode']['id']=='retained'
    else:assert response.status_code==(502 if fail else 200)
    after=client.get(f"/api/sessions/{s['id']}").json()
    assert not after['pending'] and after['episode']['id']=='retained'


@pytest.mark.parametrize('action,extra',[('think',{}),('reject',{}),('pause',{}),('end',{}),
    ('consent',{'consent':{'support':False,'camera':False}}),('correct',{'text':'其实我没有负荷'}),('hint',{})])
def test_explicit_choices_can_still_clear_support(fixture_app,action,extra):
    client,_,_,_,s=shown_support(fixture_app)
    response=control(client,s,action,**extra)
    assert response.status_code==200,response.text
    assert response.json()['episode'] is None


def test_orphaned_manual_generation_recovery_preserves_shown_support(fixture_app):
    client,_,_,_,s=shown_support(fixture_app,pending='orphan',pending_event='message')
    after=client.get(f"/api/sessions/{s['id']}").json()
    assert not after['pending'] and after['episode']['id']=='retained'
