"""Actual upstream calibration, with controlled clocks; no real camera or model."""
import asyncio
import hashlib
import uuid

import pytest

from study.contracts import Consent
from study.learning import new_session
from study.vision import VisionService,VisionPacket


DEVICE='a'*64
OTHER_DEVICE='b'*64


class Clock:
    def __init__(self):self.value=1000.0
    def monotonic(self):return self.value
    def wall(self):return 1800000000+self.value
    def advance(self,seconds=.5):self.value+=seconds


def sample(clock,seq,quality='valid',zero=False):
    return VisionPacket(seq=seq,sampled_at=clock.wall(),quality=quality,
        features=dict(blink_rate=0 if zero else 10,gaze_deviation=0 if zero else .1,head_jitter=0 if zero else .001) if quality=='valid' else None)


def setup(ttl=900):
    clock=Clock();service=VisionService(clock=clock.monotonic,wall_time=clock.wall,calibration_cache_seconds=ttl)
    session=new_session('variable',Consent(support=True,camera=True))
    service.start('owner',session,DEVICE)
    return clock,service,session,service.current('owner',session)


def feed(clock,run,first=1,count=121,quality='valid',zero=False):
    for seq in range(first,first+count):
        clock.advance();result=run.observe(sample(clock,seq,quality,zero),clock.wall())
    return result


def test_same_device_reconnect_requires_five_actual_valid_seconds_and_clears_old_signals():
    clock,service,session,old=setup();feed(clock,old)
    old.judgment={'state':'possible_fatigue','reason':'old','reviewed_at_monotonic':clock.monotonic()}
    service.detach('owner',session['id'],old);clock.advance(30)
    lease=service.start('owner',session,DEVICE);run=service.current('owner',session)
    assert lease['calibration_seconds']==5 and lease['calibration_mode']=='resume'
    assert run.run_id!=old.run_id and run.judgment is None
    assert service.dialogue_ready('owner',session)  # Lesson continues; visual recheck is separate.
    assert not run.snapshot()['calibrated']
    assert run.snapshot()['sampled_at'] is None and run.snapshot()['support_hint'] is None
    result=feed(clock,run,count=10)
    assert result['valid_seconds']==4.5 and not result['calibrated']
    # Invalid footage and time spent away cannot fill the quick check.
    feed(clock,run,11,1,'no_face');clock.advance(20)
    feed(clock,run,12,1);assert not run.snapshot()['calibrated']
    result=feed(clock,run,13,1)
    assert result['calibrated'] and service.dialogue_ready('owner',session)
    assert result['status']=='analyzing' and result['valid']
    assert result['cli'] is not None and result['blink_rate_estimated']
    assert result['llm_judgment'] is None and result['support_hint'] is None
    # Brief bad frames no longer reset an extra minute-long gate.
    feed(clock,run,14,1,'no_face')
    result=feed(clock,run,15,1)
    assert result['valid'] and result['status']=='analyzing'


def test_partial_calibration_continues_without_counting_interruption():
    clock,service,session,old=setup();feed(clock,old,count=27)
    assert old.snapshot()['valid_seconds']==13
    service.detach('owner',session['id'],old);clock.advance(100)
    lease=service.start('owner',session,DEVICE);run=service.current('owner',session)
    assert lease['calibration_mode']=='continued' and lease['calibration_seconds']==60
    assert run.snapshot()['valid_seconds']==13
    feed(clock,run,count=94);assert not run.snapshot()['calibrated']
    feed(clock,run,95,1)
    assert run.snapshot()['calibrated'] and service.dialogue_ready('owner',session)


@pytest.mark.parametrize('reason',['expired','different_device','reset','disabled','no_device'])
def test_reuse_is_conservative_and_does_not_extend_lifetime(reason):
    clock,service,session,run=setup(ttl=0 if reason=='disabled' else 900)
    if reason=='no_device':run.device_key=None
    feed(clock,run);service.detach('owner',session['id'],run)
    if reason=='expired':clock.advance(901)
    lease=service.start('owner',session,OTHER_DEVICE if reason=='different_device' else DEVICE,reset=reason=='reset')
    assert lease['calibration_mode']=='full' and lease['calibration_seconds']==60
    assert not service.dialogue_ready('owner',session)


def test_owner_session_isolation_and_invalid_baselines_cannot_be_reused():
    clock,service,session,run=setup();feed(clock,run);service.detach('owner',session['id'],run)
    assert service.start('other-owner',session,DEVICE)['calibration_mode']=='full'
    other=new_session('mean',Consent(support=True,camera=True))
    assert service.start('owner',other,DEVICE)['calibration_mode']=='full'
    assert service.start('owner',session,DEVICE)['calibration_mode']=='resume'
    clock,service,session,run=setup();feed(clock,run,zero=True);service.detach('owner',session['id'],run)
    assert service.start('owner',session,DEVICE)['calibration_mode']=='full'


async def test_explicit_disposal_clears_references_and_resume_does_not_renew_expiry():
    clock,service,session,run=setup();feed(clock,run)
    created=run.calibration_created_at
    await service.stop('owner',session['id'],keep_calibration=True)
    clock.advance(800)
    assert service.start('owner',session,DEVICE)['calibration_mode']=='resume'
    resumed=service.current('owner',session);feed(clock,resumed,count=10)
    service.detach('owner',session['id'],resumed)
    assert service.calibrations.entries[('owner',session['id'])].created_at==created
    clock.advance(100)
    assert service.start('owner',session,DEVICE)['calibration_mode']=='full'
    feed(clock,service.current('owner',session));await service.stop('owner',session['id'])
    assert not service.calibrations.entries


def test_memory_cache_is_bounded_and_stale_disconnect_cannot_replace_current_run():
    clock,service,session,old=setup();feed(clock,old)
    for index in range(140):service.calibrations.remember(('owner',str(index)),old)
    assert len(service.calibrations.entries)==128
    service.start('owner',session,DEVICE)
    current=service.current('owner',session)
    service.detach('owner',session['id'],old)
    assert service.current('owner',session) is current


def test_navigation_preserves_consent_and_dialogue_during_background_visual_recheck(fixture_app):
    client,app,provider=fixture_app;clock=Clock()
    app.state.vision.clock=clock.monotonic;app.state.vision.wall_time=clock.wall
    s=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
    owner=hashlib.sha256(client.cookies['study_identity'].encode()).hexdigest()
    url=f"/api/sessions/{s['id']}"
    lease=client.post(url+'/vision/start',json={'device_key':DEVICE}).json()
    with client.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
        for seq in range(1,122):clock.advance();ws.send_json(sample(clock,seq).model_dump());ws.receive_json()
        suspended=client.post(url+'/controls',json={'action':'suspend','version':s['version']}).json()
        assert suspended['consent']==s['consent'] and suspended['support_mode']=='on'
    lease=client.post(url+'/vision/start',json={'device_key':DEVICE}).json()
    assert lease['calibration_mode']=='resume'
    body=dict(event='open',version=suspended['version'],request_id=str(uuid.uuid4()))
    continued=client.post(url+'/turns',json=body)
    assert continued.status_code==200 and len(provider.calls)==1
    body=dict(event='hint',version=continued.json()['version'],request_id=str(uuid.uuid4()))
    with client.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
        for seq in range(1,12):clock.advance();ws.send_json(sample(clock,seq).model_dump());ws.receive_json()
        opened=client.post(url+'/turns',json=body)
        assert opened.status_code==200 and len(provider.calls)==2
        text=client.get(url+'/export').text
        assert 'device_key' not in text and 'baseline_blink' not in text
        ended=client.post(url+'/controls',json={'action':'end','version':opened.json()['version']})
        assert ended.status_code==200
    assert not app.state.vision.calibrations.entries


def test_camera_close_can_reuse_reference_but_support_revocation_and_delete_clear_it(fixture_app):
    client,app,_=fixture_app;clock=Clock();vision=app.state.vision
    vision.clock=clock.monotonic;vision.wall_time=clock.wall
    s=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
    owner=hashlib.sha256(client.cookies['study_identity'].encode()).hexdigest();url=f"/api/sessions/{s['id']}"
    raw=app.state.repo.get(owner,s['id']);vision.start(owner,raw,DEVICE);feed(clock,vision.current(owner,raw))
    off=client.post(url+'/controls',json=dict(action='consent',version=s['version'],consent=dict(support=True,camera=False))).json()
    assert vision.calibrations.entries and off['consent']['camera'] is False
    on=client.post(url+'/controls',json=dict(action='consent',version=off['version'],consent=dict(support=True,camera=True))).json()
    lease=client.post(url+'/vision/start',json={'device_key':DEVICE}).json();assert lease['calibration_mode']=='resume'
    revoked=client.post(url+'/controls',json=dict(action='consent',version=on['version'],consent=dict(support=False,camera=False)))
    assert revoked.status_code==200 and not vision.calibrations.entries
    enabled=client.post(url+'/controls',json=dict(action='consent',version=revoked.json()['version'],consent=dict(support=True,camera=True)))
    assert enabled.status_code==200
    assert client.post(url+'/vision/start',json={'device_key':DEVICE}).json()['calibration_mode']=='full'
    raw=app.state.repo.get(owner,s['id']);run=vision.current(owner,raw);feed(clock,run)
    vision.detach(owner,s['id'],run);assert vision.calibrations.entries
    assert client.delete(url).status_code==204 and not vision.calibrations.entries


@pytest.mark.parametrize('kind',['delayed','batched'])
def test_delayed_or_batched_frames_do_not_destroy_a_calibrated_run(fixture_app,kind):
    client,app,provider=fixture_app;clock=Clock();vision=app.state.vision
    vision.clock=clock.monotonic;vision.wall_time=clock.wall
    s=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
    url=f"/api/sessions/{s['id']}";lease=client.post(url+'/vision/start',json={'device_key':DEVICE}).json()
    with client.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
        for seq in range(1,122):clock.advance();ws.send_json(sample(clock,seq).model_dump());ws.receive_json()
        if kind=='delayed':clock.advance(4)
        bad=sample(clock,122)
        if kind=='delayed':bad.sampled_at-=10
        ws.send_json(bad.model_dump());dropped=ws.receive_json()['data']
        assert dropped['run_id']==lease['run_id'] and dropped['calibrated'] and dropped['lesson_ready']
        if kind=='delayed':assert not dropped['valid'] and dropped['support_hint'] is None
        clock.advance();ws.send_json(sample(clock,123).model_dump());fresh=ws.receive_json()['data']
        assert fresh['valid'] and fresh['calibrated'] and fresh['run_id']==lease['run_id']
        response=client.post(url+'/turns',json=dict(text='我还在回答这个问题',version=s['version'],request_id=str(uuid.uuid4())))
        assert response.status_code==200


def test_active_monitoring_does_not_expire_baseline_mid_lesson_but_reset_still_gates():
    clock,service,session,run=setup();feed(clock,run)
    feed(clock,run,122,1802)
    assert clock.monotonic()-run.calibration_created_at>900
    service.detach('owner',session['id'],run)
    assert service.dialogue_ready('owner',session)
    assert service.start('owner',session,DEVICE)['calibration_mode']=='resume'
    assert service.start('owner',session,DEVICE,reset=True)['calibration_mode']=='full'
    assert not service.dialogue_ready('owner',session)


async def test_vision_disconnect_during_grading_keeps_reply_and_sends_unknown_visual_state(tmp_path):
    import httpx
    from study.config import Settings
    from study.main import create_app
    from conftest import TestProvider
    entered=asyncio.Event();release=asyncio.Event()
    class Slow(TestProvider):
        async def complete_json(self,system,payload):
            result=await super().complete_json(system,payload)
            if 'exercise' in payload:entered.set();await release.wait()
            return result
    provider=Slow();app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/continuity.db',_env_file=None),provider=provider)
    clock=Clock();vision=app.state.vision;vision.clock=clock.monotonic;vision.wall_time=clock.wall
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as client:
        s=(await client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}})).json()
        owner=hashlib.sha256(client.cookies['study_identity'].encode()).hexdigest();url=f"/api/sessions/{s['id']}"
        raw=app.state.repo.get(owner,s['id']);vision.start(owner,raw,DEVICE);run=vision.current(owner,raw);feed(clock,run)
        pending=asyncio.create_task(client.post(url+'/turns/stream',json=dict(text='继续讨论',version=s['version'],request_id=str(uuid.uuid4()))))
        await asyncio.wait_for(entered.wait(),2)
        vision.detach(owner,s['id'],run);release.set()
        result=await asyncio.wait_for(pending,2)
        assert 'event: complete' in result.text and 'event: error' not in result.text
        assert len(provider.calls)==2 and not provider.calls[-1][1]['visual_observation']['valid']
        assert not provider.calls[-1][1]['visual_observation']['available']
        final=(await client.get(url)).json()
        assert not final['pending'] and [m['role'] for m in final['messages']]==['user','assistant']
