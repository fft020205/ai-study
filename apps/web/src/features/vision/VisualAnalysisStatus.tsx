import {useEffect,useState} from 'react';
import type {VisualObservation,VisionConnection} from './visualAnalysis';
export function VisualAnalysisStatus({connection,observation,onRetry}:{connection:VisionConnection;observation:VisualObservation|null;onRetry:()=>void}){
  const [now,setNow]=useState(()=>Date.now()/1000);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()/1000),1000);return()=>clearInterval(timer);},[]);
  if(connection==='off')return null;
  const stale=typeof observation?.sampled_at==='number'&&now-observation.sampled_at>3;
  const calibrated=!!observation?.calibrated,error=connection==='error',insufficient=observation?.status==='baseline_insufficient';
  const paused=connection==='connected'&&(!observation?.valid||stale),connecting=connection==='connecting';
  const calibrating=!calibrated&&!error&&!connecting;
  const seconds=Math.floor(Math.max(0,Math.min(60,observation?.valid_seconds??0)));
  const title=error?'连接中断':connecting?'连接中…':insufficient?'需要重新校准':paused?(calibrated?'等待有效画面':'校准暂停'):!calibrated?'正在校准':'监测中';
  return <section className={`vision-preparation vision-status ${error||insufficient?'error':''}`} aria-label="视觉判定状态" aria-busy={connecting||calibrating} title="视觉行为估计，仅供辅助参考">
    <div className="vision-status-line"><strong role="status">{title}</strong>{calibrating&&<span className="vision-status-count">{seconds}/60秒</span>}{(error||insufficient)&&<button type="button" className="vision-retry" aria-label="重新连接并校准" onClick={onRetry}>重试</button>}</div>
    {calibrating&&<progress className="vision-calibration-progress" max={60} value={seconds} aria-label="个人基线校准进度" aria-valuetext={`有效采样${seconds}秒，共60秒；画面无效时暂停`}/>}
  </section>;
}
