from dataclasses import dataclass
import math


def adequate_baseline(engine):
    return all(math.isfinite(value) and value > minimum for value, minimum in (
        (engine.baseline_blink,.1),(engine.baseline_gaze,.0001),(engine.baseline_jitter,.000011)))


@dataclass(frozen=True)
class CalibrationReference:
    device_key: str
    consent_key: str
    created_at: float
    last_valid_at: float
    seconds: float
    complete: bool
    baseline: tuple[float,float,float]
    samples: tuple[tuple[float,...],tuple[float,...],tuple[float,...]]


class CalibrationCache:
    """Bounded, process-local references; no images, landmarks or persistence."""
    def __init__(self,clock,ttl=900,capacity=128):
        self.clock=clock;self.ttl=ttl;self.capacity=capacity;self.entries={}

    def fresh(self,ref):
        stamp=ref.last_valid_at if ref.complete else ref.created_at
        return bool(self.ttl and 0<=self.clock()-stamp<self.ttl)

    def prune(self):
        self.entries={key:ref for key,ref in self.entries.items() if self.fresh(ref)}

    def forget(self,key):self.entries.pop(key,None)

    def remember(self,key,run):
        self.prune();engine=run.engine
        if (not self.ttl or not run.device_key or run.effective_seconds<=0
            or not engine.calibrating and not adequate_baseline(engine)):
            self.forget(key);return
        ref=CalibrationReference(device_key=run.device_key,consent_key=run.consent_key,
            created_at=run.calibration_created_at,last_valid_at=run.last_calibration_verified_at,
            seconds=min(60,run.effective_seconds),complete=not engine.calibrating,
            baseline=(engine.baseline_blink,engine.baseline_gaze,engine.baseline_jitter),
            samples=tuple(tuple(values) for values in (engine.blink_samples,engine.gaze_samples,engine.jitter_samples)) if engine.calibrating else ((),(),()))
        if not self.fresh(ref):return
        self.entries.pop(key,None);self.entries[key]=ref
        while len(self.entries)>self.capacity:self.entries.pop(next(iter(self.entries)))

    def peek(self,key):
        self.prune();return self.entries.get(key)

    def take(self,key,device_key):
        self.prune();ref=self.entries.pop(key,None)
        return ref if device_key and ref and ref.device_key==device_key else None
