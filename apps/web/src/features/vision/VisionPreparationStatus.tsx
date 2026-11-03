import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {isPreparing,preparationSeconds,type VisionPreparation} from './visionPreparation';
export function VisionPreparationStatus({state,compact=false,onRetry}:{state:VisionPreparation;compact?:boolean;onRetry:()=>void}){
  const {t}=useTranslation();
  const preparing=isPreparing(state),[elapsed,setElapsed]=useState(()=>preparationSeconds(state,Date.now()));
  useEffect(()=>{
    if(!preparing){setElapsed(0);return;}
    const tick=()=>setElapsed(preparationSeconds(state,Date.now()));tick();
    const timer=setInterval(tick,1000);return()=>clearInterval(timer);
  },[state.startedAt,preparing]);
  if(state.stage==='off')return null;
  const slow=preparing&&elapsed>=60;
  const labels={loading_runtime:t('vision.loadingRuntime'),loading_model:t('vision.loadingModel'),checking_frame:t('vision.checkingFrame'),ready:t('vision.ready'),error:t('vision.error'),off:''};
  return <section className={`vision-preparation vision-status ${compact?'compact':''} ${state.stage}`} aria-label={t('vision.preparationLabel')} aria-busy={preparing}>
    <div className="vision-status-line"><strong role="status">{slow&&state.stage!=='checking_frame'?t('vision.slow'):labels[state.stage]}</strong>{preparing&&!slow&&<span className="vision-status-count">{t('vision.seconds',{seconds:elapsed})}</span>}{(slow||state.stage==='error')&&<button type="button" className="vision-retry" onClick={onRetry} aria-label={t('vision.reload')}>{t('common.retry')}</button>}</div>
    {preparing&&<div className="vision-progress" role="progressbar" aria-label={t('vision.progress')} aria-valuetext={labels[state.stage]}><span/></div>}
  </section>;
}
