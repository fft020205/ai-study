export type VisualObservation={
  available:boolean;run_id?:string;algorithm?:string;upstream_commit?:string;
  status:'off'|'calibrating'|'analyzing'|'waiting_quality'|'baseline_insufficient';
  valid:boolean;calibrated?:boolean;baseline_quality?:'pending'|'adequate'|'insufficient';quality?:string;calibration_progress?:number;
  valid_seconds?:number;required_seconds?:number;phase?:string;cli?:number|null;
  sampled_at?:number|null;age_seconds?:number|null;support_hint?:'possible_fatigue'|'possible_overload'|null;
  signal_ratios?:{fatigue:number;distraction:number;stress:number}|null;
  llm_judgment?:{state:'possible_fatigue'|'possible_overload'|'no_concern'|'uncertain';reason:string;reviewed_at:number}|null;
  interpretation?:string;
};
export type VisionConnection='off'|'connecting'|'connected'|'error';
export function visualObservationCurrent(value:VisualObservation|null,now:number){
  return !!value?.valid&&!!value.calibrated&&typeof value.sampled_at==='number'&&now>=value.sampled_at-1&&now-value.sampled_at<=3;
}

export type CameraAnalysisState={sessionId?:string;live:boolean;device:'starting'|'live'|'stopped'|'error';deviceMessage:string;issue:boolean;connection:VisionConnection;observation:VisualObservation|null};
