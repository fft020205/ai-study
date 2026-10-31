import type {CameraAlert} from '../../lib/types';

export const cameraAlertLabels={fatigue:'有些疲劳',high_load:'负荷偏高'};
export function activeCameraAlerts(alerts:CameraAlert[],now:number):CameraAlert[]{
  return alerts.filter(a=>(a.kind==='fatigue'||a.kind==='high_load')&&(a.source==='self_report'||a.source==='correction'||a.source==='visual_heuristic')
    &&(a.source==='visual_heuristic'?!!a.evidence_note?.trim():!!a.evidence_quote.trim())&&Number.isFinite(a.captured_at)&&Number.isFinite(a.expires_at)
    &&a.captured_at<=now&&a.expires_at>now&&a.expires_at>a.captured_at);
}
