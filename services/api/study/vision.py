"""User-requested upstream engine, isolated per owner/session with no video or CSV IO."""
import asyncio
import hashlib
import secrets
import time
from pathlib import Path
from types import SimpleNamespace
from pydantic import Field, FiniteFloat, model_validator
from typing import Literal
from .contracts import Contract
from .vision_calibration import CalibrationCache,adequate_baseline

UPSTREAM_COMMIT='0c938e4fec21a852401c10213127a630d0b6cf75'
ENGINE_SHA256='96f8ac916cce1e048d28ca9a4f565c31355f16d87838867a1eecd5e4cba62d36'
FEATURE_TTL=3.0
MAX_PACKET_GAP=1.5
CALIBRATION_SECONDS=60.0
RESUME_SECONDS=5.0

class CalibrationRequired(Exception): pass
class VisionUnavailable(Exception): pass
class VisionRejected(Exception): pass
class VisionSampleRejected(VisionRejected): pass

class VisualFeatures(Contract):
    blink_rate: FiniteFloat = Field(ge=0,le=240)
    gaze_deviation: FiniteFloat = Field(ge=0,le=2)
    head_jitter: FiniteFloat = Field(ge=0,le=2)

class VisionPacket(Contract):
    seq: int = Field(ge=1)
    sampled_at: FiniteFloat
    quality: Literal['valid','no_face','multiple_faces','low_light','out_of_frame','stale']
    features: VisualFeatures | None = None
    feature_window_seconds: FiniteFloat | None = Field(default=None,ge=0,le=60)

    @model_validator(mode='after')
    def valid_features(self):
        if (self.quality=='valid') != (self.features is not None):
            raise ValueError('有效画面必须包含特征，失效画面不能提供特征。')
        if self.quality!='valid' and self.feature_window_seconds is not None:
            raise ValueError('无效画面不能提供特征观测时长。')
        return self


def permitted(s):
    return s['status']=='active' and s['support_mode']=='on' and s['consent']['support'] and s['consent']['camera']


def consent_key(s):
    return str(s['consent_log'][-1]['at'])


class VisionRun:
    def __init__(self,compiled,s,clock,device_key=None,reference=None):
        self.clock=clock;self.run_id=secrets.token_urlsafe(18);self.consent_key=consent_key(s)
        self.effective_seconds=0.0;self.fresh_seconds=0.0;self.last_feature_window_seconds=None
        self.device_key=device_key;self.calibration_created_at=clock()
        self.calibration_mode='full';self.reference=reference
        self.last_calibration_verified_at=reference.last_valid_at if reference else clock()
        namespace={'__name__':'adaptive_cognitive_engine'}
        exec(compiled,namespace)
        # The original engine uses time.time. Its isolated clock advances only on
        # current valid samples; no global time monkeypatch and no fake waiting timer.
        namespace['time']=SimpleNamespace(time=lambda:self.effective_seconds)
        self.engine=namespace['CognitiveEngine']()
        if reference:
            self.calibration_created_at=reference.created_at
            self.effective_seconds=reference.seconds
            self.calibration_mode='resume' if reference.complete else 'continued'
            if reference.complete:
                self.engine.calibrating=False;self.engine.phase='Warm-up'
                self.engine.baseline_blink,self.engine.baseline_gaze,self.engine.baseline_jitter=reference.baseline
            else:
                self.engine.blink_samples=list(reference.samples[0])
                self.engine.gaze_samples=list(reference.samples[1])
                self.engine.jitter_samples=list(reference.samples[2])
        self.last_arrival=None;self.last_capture_age=0.0;self.last_sample=None;self.last_seq=0;self.last_quality='stale'
        self.last_valid_sample=None;self.last_valid_arrival=None;self.latest=None
        self.warning_since=None;self.warning_phase=None;self.ws=None;self.judgment=None;self.observation_epoch=0

    def observe(self,p,wall_now):
        now=self.clock()
        if p.seq<=self.last_seq or (self.last_sample is not None and p.sampled_at<=self.last_sample):
            raise VisionSampleRejected('视觉数据已过期或顺序无效。')
        age=wall_now-p.sampled_at
        if age < -1 or age > FEATURE_TTL: raise VisionSampleRejected('视觉数据不在有效时间范围内。')
        if self.last_arrival is not None and now-self.last_arrival<0.1: raise VisionSampleRejected('视觉数据发送过于频繁。')
        self.last_capture_age=max(0.0,age)
        self.last_seq=p.seq;self.last_sample=p.sampled_at;self.last_arrival=now;self.last_quality=p.quality
        if p.quality!='valid':
            self.observation_epoch+=1
            self.last_valid_sample=None;self.last_valid_arrival=None;self.warning_since=None;self.warning_phase=None;self.judgment=None
            self.engine.cli_history.clear();self.engine.phase='Calibrating' if self.engine.calibrating else 'Warm-up'
            return self.snapshot()
        if self.last_valid_arrival is not None:
            gap=now-self.last_valid_arrival
            sample_gap=p.sampled_at-self.last_valid_sample
            if 0<gap<=MAX_PACKET_GAP and 0<sample_gap<=MAX_PACKET_GAP:
                self.effective_seconds+=min(gap,sample_gap)
                self.fresh_seconds+=min(gap,sample_gap)
            else:
                self.observation_epoch+=1
                self.engine.cli_history.clear();self.engine.phase='Calibrating' if self.engine.calibrating else 'Warm-up'
                self.warning_since=None;self.warning_phase=None
        self.last_valid_arrival=now;self.last_valid_sample=p.sampled_at
        self.last_feature_window_seconds=p.feature_window_seconds if p.feature_window_seconds is not None else min(self.fresh_seconds,60)
        previous_phase=self.latest.get('phase') if self.latest else None
        was_calibrating=self.engine.calibrating
        self.latest=self.engine.process(**p.features.model_dump())
        if was_calibrating and not self.engine.calibrating:self.calibration_created_at=now
        if not self.engine.calibrating and (self.calibration_mode!='resume' or self.fresh_seconds>=RESUME_SECONDS):
            self.last_calibration_verified_at=now
        phase=self.latest['phase']
        if phase!=previous_phase:self.judgment=None;self.observation_epoch+=1
        if phase in ('Overload','Fatigue'):
            if phase!=self.warning_phase:self.warning_since=now
            self.warning_phase=phase
        else:self.warning_since=None;self.warning_phase=None
        # Bound upstream's full history while preserving its 30-sample statistics.
        if len(self.engine.cli_full_history)>600:self.engine.cli_full_history=self.engine.cli_full_history[-600:]
        return self.snapshot()

    def snapshot(self):
        now=self.clock()
        capture_age=now-self.last_arrival+self.last_capture_age if self.last_arrival is not None else None
        fresh=capture_age is not None and capture_age<=FEATURE_TTL
        valid=fresh and self.last_quality=='valid' and self.last_valid_sample is not None
        required=RESUME_SECONDS if self.calibration_mode=='resume' else CALIBRATION_SECONDS
        seconds=self.fresh_seconds if self.calibration_mode=='resume' else self.effective_seconds
        progress=min(seconds/required,1.0)
        verifying=self.calibration_mode=='resume' and self.fresh_seconds<RESUME_SECONDS
        calibrated=not self.engine.calibrating and not verifying
        baseline_ok=self.engine.calibrating or adequate_baseline(self.engine)
        # Blink activity is already normalized by the browser's actual observed
        # duration. Do not impose another uninterrupted 60-second readiness gate.
        usable=valid and baseline_ok
        latest=self.latest or {}
        phase=latest.get('phase','Calibrating')
        if not usable: phase='Unknown'
        hint=None
        if usable and calibrated and phase in ('Overload','Fatigue') and self.warning_since is not None and now-self.warning_since>=3:
            hint='possible_fatigue' if phase=='Fatigue' else 'possible_overload'
        judgment=self.judgment if usable and calibrated and self.judgment and now-self.judgment['reviewed_at_monotonic']<=60 else None
        if judgment:
            hint=judgment['state'] if judgment['state'] in ('possible_fatigue','possible_overload') else None
        return {
            'available':True,'run_id':self.run_id,'observation_epoch':self.observation_epoch,'algorithm':'adaptive-cognitive-load-analysis','upstream_commit':UPSTREAM_COMMIT,
            'status':'baseline_insufficient' if not self.engine.calibrating and not baseline_ok else
                'waiting_quality' if not valid else 'revalidating' if verifying else 'calibrating' if not calibrated else 'analyzing',
            'calibration_mode':self.calibration_mode,'feature_window_seconds':self.last_feature_window_seconds if usable else None,
            'blink_rate_estimated':self.last_feature_window_seconds<59.5 if usable and self.last_feature_window_seconds is not None else None,
            'baseline_quality':'pending' if not calibrated else 'adequate' if baseline_ok else 'insufficient',
            'quality':self.last_quality if fresh else 'stale','valid':usable,'calibrated':calibrated,
            'calibration_progress':progress,'valid_seconds':round(min(seconds,required),1),
            'required_seconds':required,'phase':phase,'cli':latest.get('cli') if usable and calibrated else None,
            'features':{k:latest.get(k) for k in ('blink_rate','gaze_deviation','head_jitter')} if usable else None,
            'signal_meanings':{'fatigue':'眨眼活动相对个人基线的比值','distraction':'虹膜相对眼中心的偏移比值','stress':'头部位移相对个人基线的比值；不是心理压力诊断'},
            'signal_ratios':{k:latest.get(k) for k in ('fatigue','distraction','stress')} if usable and calibrated else None,
            'stability':latest.get('stability') if usable and calibrated else None,
            'sampled_at':self.last_sample,'age_seconds':round(capture_age,2) if capture_age is not None else None,
            'support_hint':hint,'llm_judgment':{k:v for k,v in judgment.items() if k!='reviewed_at_monotonic'} if judgment else None,'interpretation':'heuristic_behavioral_signal_not_diagnosis'
        }


class VisionService:
    def __init__(self,enabled=True,clock=time.monotonic,wall_time=time.time,calibration_cache_seconds=900):
        self.runs={};self.tickets={};self.clock=clock;self.wall_time=wall_time;self.enabled=enabled;self.compiled=None
        self.calibrations=CalibrationCache(lambda:self.clock(),ttl=calibration_cache_seconds)
        if enabled:
            try:
                path=Path(__file__).resolve().parents[3]/'integrations/adaptive-cognitive-load-analysis/cognitive_engine.py'
                source=path.read_bytes()
                if hashlib.sha256(source).hexdigest()!=ENGINE_SHA256: raise ValueError('checksum')
                self.compiled=compile(source,str(path),'exec')
            except (OSError,ValueError,SyntaxError):self.enabled=False

    def start(self,owner,s,device_key=None,reset=False):
        if not self.enabled: raise VisionUnavailable('视觉判定引擎未安装或校验失败，请检查本机集成。')
        if not permitted(s):raise VisionRejected('请先开启摄像头和主动支持。')
        self.prune()
        key=(owner,s['id']);old=self.runs.pop(key,None)
        if old and not reset:self.calibrations.remember(key,old)
        if reset:self.calibrations.forget(key)
        reference=None if reset else self.calibrations.take(key,device_key)
        self.tickets={ticket:value for ticket,value in self.tickets.items() if value[0]!=key}
        self.runs[key]=run=VisionRun(self.compiled,s,self.clock,device_key,reference)
        ticket=secrets.token_urlsafe(32)
        self.tickets[ticket]=(key,run.run_id,self.clock()+30)
        if old and old.ws:
            asyncio.create_task(self._close(old.ws))
        return {'run_id':run.run_id,'ticket':ticket,'websocket_path':f"/api/sessions/{s['id']}/vision/ws",'calibration_seconds':RESUME_SECONDS if reference and reference.complete else CALIBRATION_SECONDS,'calibration_mode':run.calibration_mode,'lesson_ready':self.dialogue_ready(owner,s)}

    def attach(self,owner,s,ticket,ws):
        value=self.tickets.pop(ticket,None);key=(owner,s['id']);run=self.runs.get(key)
        if not value or value[0]!=key or self.clock()>value[2] or not run or value[1]!=run.run_id or not permitted(s) or run.consent_key!=consent_key(s):
            raise VisionRejected('视觉连接凭据已失效，请重新开启。')
        run.ws=ws;return run

    def current(self,owner,s,run_id=None):
        run=self.runs.get((owner,s['id']))
        if not run or not permitted(s) or run.consent_key!=consent_key(s) or (run_id and run.run_id!=run_id):
            raise VisionRejected('视觉会话已关闭或授权已更新。')
        return run

    def dialogue_ready(self,owner,s):
        if not s.get('consent',{}).get('camera'):return True
        try:run=self.current(owner,s)
        except VisionRejected:
            return self.reference_ready(self.calibrations.peek((owner,s['id'])),s)
        observation=run.snapshot()
        if observation.get('calibrated') and observation.get('baseline_quality')=='adequate':return True
        # A transient transport outage does not undo a lesson's completed setup.
        # New consent, a changed device, reset or expired idle reference still gate.
        return self.reference_ready(run.reference,s)

    def reference_ready(self,reference,s):
        return bool(reference and reference.complete and reference.device_key and permitted(s)
            and reference.consent_key==consent_key(s) and self.calibrations.fresh(reference))

    def require_dialogue_ready(self,owner,s):
        if not self.dialogue_ready(owner,s):
            raise CalibrationRequired('摄像头尚未完成校准，完成后即可开始对话。')

    def record_judgment(self,owner,s,observation,judgment):
        try:run=self.current(owner,s,observation.get('run_id'))
        except VisionRejected:return
        current=run.snapshot()
        if not current.get('valid') or not current.get('calibrated') or current.get('phase')!=observation.get('phase') or current.get('observation_epoch')!=observation.get('observation_epoch'):return
        run.judgment=judgment.model_dump()|{'reviewed_at':self.wall_time(),'reviewed_at_monotonic':self.clock()}

    def project(self,owner,run,s):
        observation=run.snapshot()
        observation['lesson_ready']=self.dialogue_ready(owner,s)
        hint=observation['support_hint']
        dimension,value=('fatigue','absent') if hint=='possible_fatigue' else ('cognitive_load','manageable')
        claim=s.get('learner_state',{}).get(dimension,{})
        if (hint and claim.get('value')==value and claim.get('source') in ('self_report','correction')
            and 0<=self.wall_time()-claim.get('at',0)<=300 and s.get('dialogue_turn',0)-claim.get('turn',-100)<=3):
            observation['support_hint']=None;observation['user_override']=True;observation['llm_judgment']=None
        return observation

    def snapshot(self,owner,s):
        try:return self.project(owner,self.current(owner,s),s)
        except VisionRejected:return {'available':False,'valid':False,'status':'off','support_hint':None,'lesson_ready':self.dialogue_ready(owner,s)}

    def detach(self,owner,sid,run,remember=True):
        key=(owner,sid)
        if self.runs.get(key) is not run:return
        self.runs.pop(key,None)
        if remember:self.calibrations.remember(key,run)
        else:self.calibrations.forget(key)

    async def stop(self,owner,sid,keep_calibration=False):
        key=(owner,sid);run=self.runs.pop(key,None)
        if keep_calibration and run:self.calibrations.remember(key,run)
        elif not keep_calibration:self.calibrations.forget(key)
        self.tickets={k:v for k,v in self.tickets.items() if v[0]!=key}
        if run and run.ws:await self._close(run.ws)

    async def _close(self,ws):
        try:await asyncio.wait_for(ws.close(code=1000),1)
        except Exception:pass

    def prune(self):
        self.calibrations.prune()
        now=self.clock()
        self.tickets={k:v for k,v in self.tickets.items() if v[2]>now}
        for key,run in list(self.runs.items()):
            if run.ws is None and (run.last_arrival is None) and not any(v[0]==key for v in self.tickets.values()):self.runs.pop(key,None)
