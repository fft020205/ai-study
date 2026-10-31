"""Calibration is a server-owned precondition, using the actual engine and synthetic features."""
import asyncio
import hashlib
import uuid
import httpx
import pytest
from study.config import Settings
from study.contracts import Consent
from study.learning import new_session
from study.main import create_app
from study.vision import VisionService,VisionPacket
from conftest import TestProvider,create


class Clock:
    value=1000.0
    def monotonic(self):return self.value
    def wall(self):return 1800000000+self.value
    def advance(self,n=0.5):self.value+=n


def packet(clock,seq,quality='valid',zero=False):
    features={'blink_rate':0 if zero else 10,'gaze_deviation':0 if zero else .1,'head_jitter':0 if zero else .001}
    return VisionPacket(seq=seq,sampled_at=clock.wall(),quality=quality,features=features if quality=='valid' else None)


def setup_camera(client,app):
    clock=Clock();app.state.vision.clock=clock.monotonic;app.state.vision.wall_time=clock.wall
    s=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
    owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest()
    return s,owner,clock


@pytest.mark.parametrize('endpoint,event',[('turns','open'),('turns/stream','open'),('turns','message'),('turns/stream','message'),('controls','open'),('controls','hint')])
def test_camera_flow_cannot_call_ai_or_accept_answers_before_calibration(fixture_app,endpoint,event):
    client,app,provider=fixture_app;s,owner,clock=setup_camera(client,app)
    body=dict(version=s['version'],request_id=str(uuid.uuid4()),event=event,text='测试回答' if event=='message' else '')
    if endpoint=='controls':body=dict(version=s['version'],action=event)
    response=client.post(f"/api/sessions/{s['id']}/{endpoint}",json=body)
    assert response.status_code==409 and '校准' in response.json()['detail']
    assert provider.calls==[]
    current=client.get(f"/api/sessions/{s['id']}").json()
    assert not current['pending'] and current['messages']==[] and current['version']==s['version']
    # Waiting out the wall clock, or creating a run without effective frames, cannot unlock it.
    app.state.vision.start(owner,app.state.repo.get(owner,s['id']));clock.advance(120)
    assert not app.state.vision.dialogue_ready(owner,app.state.repo.get(owner,s['id']))


def test_real_calibration_unlocks_opening_and_reopening_requires_a_new_baseline(fixture_app):
    client,app,provider=fixture_app;s,owner,clock=setup_camera(client,app)
    lease=client.post(f"/api/sessions/{s['id']}/vision/start").json()
    with client.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
        for seq in range(1,121):
            clock.advance();ws.send_json(packet(clock,seq).model_dump());ws.receive_json()
        body=dict(event='open',version=s['version'],request_id=str(uuid.uuid4()))
        assert client.post(f"/api/sessions/{s['id']}/turns/stream",json=body).status_code==409
        clock.advance();ws.send_json(packet(clock,121).model_dump());result=ws.receive_json()['data']
        assert result['calibrated'] and result['baseline_quality']=='adequate'
        response=client.post(f"/api/sessions/{s['id']}/turns",json=body)
        assert response.status_code==200 and len(provider.calls)==1
        current=response.json()
        # Temporary bad frames after a completed baseline do not repeatedly interrupt a lesson.
        clock.advance();ws.send_json(packet(clock,122,'no_face').model_dump());ws.receive_json()
        assert app.state.vision.dialogue_ready(owner,app.state.repo.get(owner,s['id']))
    assert not app.state.vision.dialogue_ready(owner,app.state.repo.get(owner,s['id']))
    client.post(f"/api/sessions/{s['id']}/vision/start")
    response=client.post(f"/api/sessions/{s['id']}/turns",json=dict(event='hint',version=current['version'],request_id=str(uuid.uuid4())))
    assert response.status_code==409 and len(provider.calls)==1


def test_invalid_baseline_stays_blocked_and_explicit_camera_off_allows_text(fixture_app):
    client,app,provider=fixture_app;s,owner,clock=setup_camera(client,app)
    state=app.state.repo.get(owner,s['id']);app.state.vision.start(owner,state);run=app.state.vision.current(owner,state)
    for seq in range(1,122):clock.advance();run.observe(packet(clock,seq,zero=True),clock.wall())
    assert run.snapshot()['calibrated'] and not app.state.vision.dialogue_ready(owner,state)
    off=client.post(f"/api/sessions/{s['id']}/controls",json=dict(action='consent',version=s['version'],consent={'support':True,'camera':False})).json()
    response=client.post(f"/api/sessions/{s['id']}/turns",json=dict(event='open',version=off['version'],request_id=str(uuid.uuid4())))
    assert response.status_code==200 and len(provider.calls)==1


def test_no_proactive_model_during_preparation_and_priority_controls_still_work(fixture_app):
    client,app,provider=fixture_app
    s=create(client,support=True);calls=len(provider.calls)
    s=client.post(f"/api/sessions/{s['id']}/controls",json=dict(action='consent',version=s['version'],consent={'support':True,'camera':True})).json()
    app.state.policy.settings.support_wait_seconds=0
    response=client.post(f"/api/sessions/{s['id']}/activity",json=dict(version=s['version'],foreground=True,has_draft=False,composing=False,busy=False,reading=False))
    assert response.status_code==200 and not response.json()['pending'] and len(provider.calls)==calls
    correction=client.post(f"/api/sessions/{s['id']}/turns/stream",json=dict(event='correct',text='其实我没有疲劳',version=s['version'],request_id=str(uuid.uuid4())))
    assert correction.status_code==200 and 'event: complete' in correction.text and len(provider.calls)==calls
    assert client.get(f"/api/sessions/{s['id']}").json()['messages'][-1]['source']=='correction'
    paused=client.post(f"/api/sessions/{s['id']}/controls",json=dict(action='pause',version=0))
    assert paused.status_code==200 and not paused.json()['consent']['camera']
    ended=client.post(f"/api/sessions/{s['id']}/controls",json=dict(action='end',version=0))
    assert ended.status_code==200 and ended.json()['status']=='ended'


async def test_loss_of_run_between_assessment_and_reply_blocks_the_second_model_call(tmp_path):
    entered=asyncio.Event();release=asyncio.Event()
    class SlowAssessment(TestProvider):
        async def complete_json(self,system,payload):
            output=await super().complete_json(system,payload)
            if 'exercise' in payload:entered.set();await release.wait()
            return output
    provider=SlowAssessment();app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/preparation.db',_env_file=None),provider=provider)
    clock=Clock();app.state.vision.clock=clock.monotonic;app.state.vision.wall_time=clock.wall
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as client:
        await client.get('/api/bootstrap')
        s=(await client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}})).json()
        owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest();state=app.state.repo.get(owner,s['id'])
        app.state.vision.start(owner,state);run=app.state.vision.current(owner,state)
        for seq in range(1,122):clock.advance();run.observe(packet(clock,seq),clock.wall())
        request=asyncio.create_task(client.post(f"/api/sessions/{s['id']}/turns/stream",json=dict(text='先保存这个回答',version=s['version'],request_id=str(uuid.uuid4()))))
        await asyncio.wait_for(entered.wait(),2)
        await app.state.vision.stop(owner,s['id']);release.set()
        response=await asyncio.wait_for(request,2)
        assert 'event: error' in response.text and len(provider.calls)==1
        after=(await client.get(f"/api/sessions/{s['id']}")).json()
        assert not after['pending'] and [m['text'] for m in after['messages']]==['先保存这个回答']


@pytest.mark.parametrize('intent',['pause','end'])
async def test_recognized_priority_intent_still_executes_if_the_camera_disconnects(tmp_path,intent):
    entered=asyncio.Event();release=asyncio.Event()
    class ControlProvider(TestProvider):
        async def complete_json(self,system,payload):
            self.calls.append((system,payload));entered.set();await release.wait()
            return dict(evaluation=dict(verdict='unknown',feedback=''),intent=intent,intent_quote=payload['student_text'])
    provider=ControlProvider();app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/priority.db',_env_file=None),provider=provider)
    clock=Clock();app.state.vision.clock=clock.monotonic;app.state.vision.wall_time=clock.wall
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as client:
        await client.get('/api/bootstrap')
        s=(await client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}})).json()
        owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest();state=app.state.repo.get(owner,s['id'])
        app.state.vision.start(owner,state);run=app.state.vision.current(owner,state)
        for seq in range(1,122):clock.advance();run.observe(packet(clock,seq),clock.wall())
        request=asyncio.create_task(client.post(f"/api/sessions/{s['id']}/turns/stream",json=dict(text='结束学习' if intent=='end' else '暂停支持',version=s['version'],request_id=str(uuid.uuid4()))))
        await asyncio.wait_for(entered.wait(),2);await app.state.vision.stop(owner,s['id']);release.set()
        response=await asyncio.wait_for(request,2)
        assert 'event: complete' in response.text and len(provider.calls)==1
        final=(await client.get(f"/api/sessions/{s['id']}")).json()
        assert not final['consent']['camera'] and final['status']==('ended' if intent=='end' else 'active')
        if intent=='pause':assert final['support_mode']=='paused'
