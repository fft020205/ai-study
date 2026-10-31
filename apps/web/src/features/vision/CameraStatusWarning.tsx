import {useEffect,useState} from 'react';
import type {CameraAlert} from '../../lib/types';
import {activeCameraAlerts,cameraAlertLabels} from './cameraAlerts';

export function CameraStatusWarning({alerts}:{alerts:CameraAlert[]}){
  const [now,setNow]=useState(()=>Date.now()/1000);
  useEffect(()=>{
    const current=Date.now()/1000;const visible=activeCameraAlerts(alerts,current);
    const next=visible.length?Math.min(...visible.map(a=>a.expires_at)):null;
    if(!next)return;
    const timer=setTimeout(()=>setNow(Date.now()/1000),Math.max(0,(next-current)*1000)+50);
    return()=>clearTimeout(timer);
  },[alerts,now]);
  const visible=activeCameraAlerts(alerts,Math.max(now,Date.now()/1000));
  if(!visible.length)return null;
  return <section className="camera-state-warning" aria-label="学习状态提醒" role="status"><div className="camera-warning-tags">{visible.map(alert=>{
    const source=alert.source==='visual_heuristic'?'视觉信号，待你确认':'根据你的反馈';
    const label=alert.source==='visual_heuristic'?(alert.kind==='fatigue'?'可能疲劳':'负荷可能偏高'):cameraAlertLabels[alert.kind];
    const detail=alert.source==='visual_heuristic'?alert.evidence_note:`你说：“${alert.evidence_quote}”`;
    return <span key={alert.kind+alert.source} className="camera-warning-tag" title={`${source}。${detail}`} aria-label={`${label}，${source}`}><span className="camera-warning-mark" aria-hidden="true">!</span>{label}</span>;
  })}</div></section>;
}
