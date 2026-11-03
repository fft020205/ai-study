import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {CameraAlert} from '../../lib/types';
import {activeCameraAlerts} from './cameraAlerts';

export function CameraStatusWarning({alerts}:{alerts:CameraAlert[]}){
  const {t}=useTranslation();
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
  return <section className="camera-state-warning" aria-label={t('alerts.label')} role="status"><div className="camera-warning-tags">{visible.map(alert=>{
    const source=t(alert.source==='visual_heuristic'?'alerts.visualSource':'alerts.selfSource');
    const label=t(alert.source==='visual_heuristic'?(alert.kind==='fatigue'?'alerts.possibleFatigue':'alerts.possibleHighLoad'):(alert.kind==='fatigue'?'alerts.fatigue':'alerts.highLoad'));
    const detail=alert.source==='visual_heuristic'?alert.evidence_note:t('alerts.selfDetail',{quote:alert.evidence_quote});
    return <span key={alert.kind+alert.source} className="camera-warning-tag" title={t('alerts.tooltip',{source,detail})} aria-label={t('alerts.tagLabel',{label,source})}><span className="camera-warning-mark" aria-hidden="true">!</span>{label}</span>;
  })}</div></section>;
}
