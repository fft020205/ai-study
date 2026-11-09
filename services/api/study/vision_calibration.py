from dataclasses import dataclass
import math


def adequate_baseline(engine):
    return all(math.isfinite(value) and value > minimum for value, minimum in (
        (engine.baseline_blink, .1), (engine.baseline_gaze, .0001), (engine.baseline_jitter, .000011)))


@dataclass(frozen=True)
class CalibrationReference:
    device_key: str
    created_at: float
    seconds: float
    complete: bool
    baseline: tuple[float, float, float]
    samples: tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]]


class CalibrationCache:
    """Bounded, process-local references; no images, landmarks or persistence."""
    def __init__(self, clock, ttl=900, capacity=128):
        self.clock=clock;self.ttl=ttl;self.capacity=capacity;self.entries={}

    def prune(self):
        now=self.clock()
        self.entries={key:ref for key,ref in self.entries.items() if 0<=now-ref.created_at<self.ttl}

    def forget(self, key):
        self.entries.pop(key,None)

    def remember(self, key, run):
        self.prune()
        engine=run.engine
        if (not self.ttl or not run.device_key or run.effective_seconds<=0
            or not engine.calibrating and not adequate_baseline(engine)):
            self.forget(key);return
        ref=CalibrationReference(run.device_key,run.calibration_created_at,min(60,run.effective_seconds),
            not engine.calibrating,(engine.baseline_blink,engine.baseline_gaze,engine.baseline_jitter),
            tuple(tuple(values) for values in (engine.blink_samples,engine.gaze_samples,engine.jitter_samples)) if engine.calibrating else ((),(),()))
        if not 0<=self.clock()-ref.created_at<self.ttl:return
        self.entries.pop(key,None);self.entries[key]=ref
        while len(self.entries)>self.capacity:self.entries.pop(next(iter(self.entries)))

    def take(self, key, device_key):
        self.prune()
        ref=self.entries.pop(key,None)
        return ref if device_key and ref and ref.device_key==device_key else None
