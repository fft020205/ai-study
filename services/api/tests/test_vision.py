"""Runs the actual pinned upstream engine. Synthetic inputs are test fixtures only."""
import time
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect
from study.config import Settings
from study.main import create_app
from study.learning import new_session
from study.contracts import Consent
from study.vision import VisionService,VisionPacket,VisionRejected,VisionUnavailable
from study.ai import UnconfiguredProvider

class Clock:
    def __init__(self):self.value=1000.0
    def monotonic(self):return self.value
    def wall(self):return 1800000000+self.value
    def advance(self,n=0.5):self.value+=n

def state():return new_session('variable',Consent(support=True,camera=True))
def service(clock):return VisionService(clock=clock.monotonic,wall_time=clock.wall)
def packet(clock,seq,quality='valid',**features):
    return VisionPacket(seq=seq,sampled_at=clock.wall(),quality=quality,features=({'blink_rate':10,'gaze_deviation':0.1,'head_jitter':0.001}|features) if quality=='valid' else None)

def calibrated_run():
    clock=Clock();v=service(clock);s=state();v.start('owner',s);r=v.current('owner',s)
    for seq in range(1,122):
        clock.advance();r.observe(packet(clock,seq),clock.wall())
    return clock,v,s,r,122


def test_actual_upstream_engine_calibrates_only_on_valid_observation_time():
    c=Clock();v=service(c);s=state();lease=v.start('owner',s);r=v.current('owner',s)
    assert r.engine.__class__.__module__=='adaptive_cognitive_engine'
    assert lease['calibration_seconds']==60
    r.observe(packet(c,1),c.wall());c.advance(60)
    assert r.snapshot()['calibration_progress']==0 and not r.snapshot()['valid']
    r.observe(packet(c,2,'no_face'),c.wall());c.advance()
    r.observe(packet(c,3),c.wall());assert r.snapshot()['calibration_progress']==0
    for seq in range(4,124):c.advance();r.observe(packet(c,seq),c.wall())
    assert r.snapshot()['calibrated'] and r.snapshot()['valid_seconds']==60
    c.advance();result=r.observe(packet(c,124),c.wall())
    assert result['cli'] is not None and result['algorithm']=='adaptive-cognitive-load-analysis'


def test_original_phase_and_sustained_warning_are_real_engine_outputs():
    c,v,s,r,seq=calibrated_run()
    for _ in range(40):
        c.advance();result=r.observe(packet(c,seq,blink_rate=60,gaze_deviation=0.4,head_jitter=0.02),c.wall());seq+=1
    assert result['phase']=='Fatigue' and result['support_hint']=='possible_fatigue'
    assert result['cli']==100  # Original engine clamps its heuristic index; not a probability.
    c.advance(4);assert not r.snapshot()['valid'] and r.snapshot()['support_hint'] is None
    c.advance();result=r.observe(packet(c,seq),c.wall())
    assert result['phase']=='Warm-up' and result['support_hint'] is None


def test_zero_baseline_does_not_create_an_overconfident_warning():
    c=Clock();v=service(c);s=state();v.start('owner',s);r=v.current('owner',s)
    for seq in range(1,123):
        c.advance();r.observe(packet(c,seq,blink_rate=0,gaze_deviation=0,head_jitter=0),c.wall())
    result=r.snapshot()
    assert result['status']=='baseline_insufficient' and not result['valid']
    assert result['cli'] is None and result['support_hint'] is None


def test_packet_validation_rejects_raw_landmarks_nonfinite_and_bad_ranges():
    c=Clock()
    with pytest.raises(ValidationError):VisionPacket.model_validate(packet(c,1).model_dump()|{'landmarks':[]})
    with pytest.raises(ValidationError):packet(c,1,blink_rate=float('nan'))
    with pytest.raises(ValidationError):packet(c,1,head_jitter=-1)
    with pytest.raises(ValidationError):VisionPacket(seq=1,sampled_at=c.wall(),quality='valid')


def test_sequence_freshness_and_privacy_rate_limit():
    c=Clock();v=service(c);s=state();v.start('owner',s);r=v.current('owner',s)
    r.observe(packet(c,1),c.wall())
    with pytest.raises(VisionRejected):r.observe(packet(c,1),c.wall())
    with pytest.raises(VisionRejected):r.observe(packet(c,2),c.wall())
    c.advance()
    with pytest.raises(VisionRejected):r.observe(packet(c,2),c.wall()+10)
    with pytest.raises(VisionRejected):r.observe(packet(c,2),c.wall()-10)


def test_user_correction_overrides_visual_warning_without_rewriting_metrics():
    c,v,s,r,seq=calibrated_run()
    for _ in range(40):c.advance();r.observe(packet(c,seq,blink_rate=60,gaze_deviation=0.4,head_jitter=0.02),c.wall());seq+=1
    s['learner_state']={'fatigue':{'value':'absent','source':'correction','at':c.wall(),'turn':1,'quote':'我不累'}};s['dialogue_turn']=1
    result=v.snapshot('owner',s)
    assert result['phase']=='Fatigue' and result['support_hint'] is None and result['user_override']


@pytest.fixture
def client_app(tmp_path):
    cfg=Settings(database_url=f'sqlite:///{tmp_path}/vision.db',_env_file=None)
    app=create_app(cfg,provider=UnconfiguredProvider());clock=Clock()
    app.state.vision.clock=clock.monotonic;app.state.vision.wall_time=clock.wall
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as c:
        c.get('/api/bootstrap')
        s=c.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
        yield c,app,clock,s


def test_websocket_real_engine_wire_and_revoke(client_app):
    c,app,clock,s=client_app
    lease=c.post(f"/api/sessions/{s['id']}/vision/start").json()
    with c.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});assert ws.receive_json()['type']=='connected'
        for seq in range(1,123):
            clock.advance();ws.send_json(packet(clock,seq).model_dump());result=ws.receive_json()
        assert result['data']['calibrated'] and result['data']['cli'] is not None
        own=c.get(f"/api/sessions/{s['id']}/vision").json();assert own['valid']
        ended=c.post(f"/api/sessions/{s['id']}/controls",json={'action':'end','version':s['version']})
        assert ended.status_code==200
        assert not c.get(f"/api/sessions/{s['id']}/vision").json()['available']
        assert c.post(f"/api/sessions/{s['id']}/vision/start").status_code==409


def test_origin_owner_ticket_and_consent_are_enforced(client_app):
    c,app,clock,s=client_app
    lease=c.post(f"/api/sessions/{s['id']}/vision/start").json()
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect(lease['websocket_path'],headers={'origin':'https://wrong.example'}):pass
    other=TestClient(app,headers={'X-Study-Client':'web-v1'})
    try:
        other.get('/api/bootstrap')
        assert other.post(f"/api/sessions/{s['id']}/vision/start").status_code==404
        assert other.get(f"/api/sessions/{s['id']}/vision").status_code==404
        with pytest.raises(WebSocketDisconnect):
            with other.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
                ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
    finally:other.close()
    with c.websocket_connect(lease['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});assert ws.receive_json()['type']=='connected'


def test_expired_ticket_and_replaced_run_cannot_resume(client_app):
    c,app,clock,s=client_app
    first=c.post(f"/api/sessions/{s['id']}/vision/start").json()
    newer=c.post(f"/api/sessions/{s['id']}/vision/start").json()
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect(first['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
            ws.send_json({'type':'hello','ticket':first['ticket']});ws.receive_json()
    clock.advance(31)
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect(newer['websocket_path'],headers={'origin':'http://127.0.0.1:3000'}) as ws:
            ws.send_json({'type':'hello','ticket':newer['ticket']});ws.receive_json()


async def test_live_snapshot_is_projected_to_llm_generation_and_grading():
    from study.ai import TeachingService
    from conftest import TestProvider
    c,v,s,r,seq=calibrated_run();s['visual_observation']=v.snapshot('owner',s)
    p=TestProvider();await TeachingService(p).respond(s,'我想继续')
    assert p.calls[0][1]['visual_observation']['upstream_commit']==s['visual_observation']['upstream_commit']
    assert p.calls[1][1]['visual_observation']['calibrated']
    assert p.calls[1][1]['modalities']['visual_behavior']=='available'
    assert 'landmarks' not in str(p.calls) and 'bitmap' not in str(p.calls)


def test_capture_time_not_delivery_time_controls_validity():
    c=Clock();v=service(c);s=state();v.start('owner',s);r=v.current('owner',s)
    p=packet(c,1);p.sampled_at-=2.5;r.observe(p,c.wall())
    assert r.snapshot()['valid'];c.advance(1);assert not r.snapshot()['valid']


def test_llm_review_is_stored_separately_and_can_suppress_a_raw_warning():
    from study.contracts import VisualJudgment
    c,v,s,r,seq=calibrated_run()
    for _ in range(40):c.advance();r.observe(packet(c,seq,blink_rate=60,gaze_deviation=.4,head_jitter=.02),c.wall());seq+=1
    observation=v.snapshot('owner',s);assert observation['support_hint']=='possible_fatigue'
    v.record_judgment('owner',s,observation,VisualJudgment(state='no_concern',reason='结合用户说明暂不提醒。'))
    result=v.snapshot('owner',s);assert result['llm_judgment']['state']=='no_concern' and result['support_hint'] is None
    c.advance();r.observe(packet(c,seq,'no_face'),c.wall());assert v.snapshot('owner',s)['llm_judgment'] is None


async def test_llm_cannot_return_a_visual_judgment_without_calibrated_input():
    from study.ai import TeachingService
    class Review:
        configured=True
        async def complete_json(self,system,payload):
            return dict(reply='继续讨论当前课题。',focus_id='copy',move='reflect',exercise_action='keep',visual_judgment={'state':'possible_fatigue','reason':'模型无依据猜测。'})
    s=state();_,reply,_=await TeachingService(Review()).respond(s,event='open')
    assert reply.visual_judgment is None


def test_late_llm_review_cannot_overwrite_a_changed_visual_episode():
    from study.contracts import VisualJudgment
    c,v,s,r,seq=calibrated_run();observation=v.snapshot('owner',s)
    c.advance();r.observe(packet(c,seq,'no_face'),c.wall());seq+=1
    c.advance();r.observe(packet(c,seq),c.wall())
    v.record_judgment('owner',s,observation,VisualJudgment(state='possible_fatigue',reason='来自较早画面的解释。'))
    assert v.snapshot('owner',s)['llm_judgment'] is None


async def test_each_model_call_refreshes_the_stream_and_rejects_previous_llm_feedback():
    from study.ai import TeachingService
    from conftest import TestProvider
    c,v,s,r,seq=calibrated_run()
    class ChangingCamera(TestProvider):
        async def complete_json(self,system,payload):
            result=await super().complete_json(system,payload)
            if len(self.calls)==1:
                c.advance();r.observe(packet(c,seq,'no_face'),c.wall())
            return result
    provider=ChangingCamera()
    await TeachingService(provider).respond(s,'我想继续',visual_snapshot=lambda:v.snapshot('owner',s))
    assert provider.calls[0][1]['visual_observation']['valid']
    assert not provider.calls[1][1]['visual_observation']['valid']
    assert provider.calls[1][1]['modalities']['visual_behavior']=='unavailable'
    assert s['visual_observation']['quality']=='no_face'
    assert 'llm_judgment' not in provider.calls[1][1]['visual_observation']


def test_product_turns_use_the_live_stream_and_keep_raw_observations_out_of_storage(tmp_path):
    import uuid
    from conftest import TestProvider
    class Review(TestProvider):
        changed=False
        async def complete_json(self,system,payload):
            result=await super().complete_json(system,payload)
            if 'exercise' in payload:
                clock.advance();run.observe(packet(clock,seq,'no_face'),clock.wall())
            else:
                result['visual_judgment']={'state':'no_concern','reason':'结合当前线索暂不提醒。'}
            return result
    clock=Clock();provider=Review()
    cfg=Settings(database_url=f'sqlite:///{tmp_path}/product-vision.db',_env_file=None)
    app=create_app(cfg,provider=provider);v=app.state.vision
    v.clock=clock.monotonic;v.wall_time=clock.wall
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        client.get('/api/bootstrap')
        s=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
        lease=client.post(f"/api/sessions/{s['id']}/vision/start").json()
        run=next(iter(v.runs.values()))
        for seq in range(1,123):
            clock.advance();run.observe(packet(clock,seq),clock.wall())
        seq+=1
        opened=client.post(f"/api/sessions/{s['id']}/turns",json={'event':'open','version':s['version'],'request_id':str(uuid.uuid4())})
        assert opened.status_code==200
        assert provider.calls[0][1]['visual_observation']['run_id']==lease['run_id']
        observation=client.get(f"/api/sessions/{s['id']}/vision").json()
        assert observation['llm_judgment']['state']=='no_concern'
        replied=client.post(f"/api/sessions/{s['id']}/turns",json={'text':'我想继续','version':opened.json()['version'],'request_id':str(uuid.uuid4())})
        assert replied.status_code==200
        assert provider.calls[1][1]['visual_observation']['valid']
        assert 'llm_judgment' not in provider.calls[1][1]['visual_observation']
        assert not provider.calls[2][1]['visual_observation']['valid']
        assert client.get(f"/api/sessions/{s['id']}/vision").json()['llm_judgment'] is None
        saved=app.state.repo.get(next(iter(v.runs))[0],s['id'])
        assert 'visual_observation' not in saved and 'visual_judgment' not in saved
