import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {VisualObservation,VisionConnection} from './visualAnalysis';
export function VisualAnalysisStatus({connection,observation,onRetry}:{connection:VisionConnection;observation:VisualObservation|null;onRetry:()=>void}){
  const {t}=useTranslation();
  const [now,setNow]=useState(()=>Date.now()/1000);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()/1000),1000);return()=>clearInterval(timer);},[]);
  if(connection==='off')return null;
  const stale=typeof observation?.sampled_at==='number'&&now-observation.sampled_at>3;
  const calibrated=!!observation?.calibrated,error=connection==='error',insufficient=observation?.status==='baseline_insufficient';
  const paused=connection==='connected'&&(!observation?.valid||stale),connecting=connection==='connecting';
  const calibrating=!calibrated&&!error&&!connecting;
  const required=Math.max(1,Math.min(60,observation?.required_seconds??60));
  const seconds=Math.floor(Math.max(0,Math.min(required,observation?.valid_seconds??0)));
  const title=t(error?'vision.disconnected':connecting?'vision.connecting':insufficient?'vision.recalibrate':paused?(calibrated?'vision.waiting':'vision.paused'):observation?.status==='warming_up'?'vision.warming':observation?.status==='revalidating'?'vision.revalidating':!calibrated?'vision.calibrating':'vision.monitoring');
  return <section className={`vision-preparation vision-status ${error||insufficient?'error':''}`} aria-label={t('vision.analysisLabel')} aria-busy={connecting||calibrating} title={t('vision.behaviorEstimate')}>
    <div className="vision-status-line"><strong role="status">{title}</strong>{calibrating&&<span className="vision-status-count">{t('vision.calibrationSeconds',{seconds,required})}</span>}{(error||insufficient)&&<button type="button" className="vision-retry" aria-label={t('vision.reconnect')} onClick={onRetry}>{t('common.retry')}</button>}</div>
    {calibrating&&<progress className="vision-calibration-progress" max={required} value={seconds} aria-label={t('vision.calibrationProgress')} aria-valuetext={t('vision.calibrationValue',{seconds,required})}/>}
  </section>;
}
