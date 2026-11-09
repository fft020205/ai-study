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
    assert not service.dialogue_ready('owner',session)
    assert run.snapshot()['sampled_at'] is None and run.snapshot()['support_hint'] is None
    result=feed(clock,run,count=10)
    assert result['valid_seconds']==4.5 and not result['calibrated']
    # Invalid footage and time spent away cannot fill the quick check.
    feed(clock,run,11,1,'no_face');clock.advance(20)
    feed(clock,run,12,1);assert not service.dialogue_ready('owner',session)
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
    resumed=service.current('owner',session);feed(clock,resumed,count=11)
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


def test_navigation_suspend_preserves_consent_and_server_gate_still_requires_recheck(fixture_app):
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
    assert client.post(url+'/turns/stream',json=body).status_code==409 and not provider.calls
    with client.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
        for seq in range(1,12):clock.advance();ws.send_json(sample(clock,seq).model_dump());ws.receive_json()
        opened=client.post(url+'/turns',json=body)
        assert opened.status_code==200 and len(provider.calls)==1
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
