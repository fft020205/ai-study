import {useEffect,useState} from 'react';
import {isPreparing,preparationSeconds,type VisionPreparation} from './visionPreparation';
export function VisionPreparationStatus({state,compact=false,onRetry}:{state:VisionPreparation;compact?:boolean;onRetry:()=>void}){
  const preparing=isPreparing(state),[elapsed,setElapsed]=useState(()=>preparationSeconds(state,Date.now()));
  useEffect(()=>{
    if(!preparing){setElapsed(0);return;}
    const tick=()=>setElapsed(preparationSeconds(state,Date.now()));tick();
    const timer=setInterval(tick,1000);return()=>clearInterval(timer);
  },[state.startedAt,preparing]);
  if(state.stage==='off')return null;
  const slow=preparing&&elapsed>=60;
  const labels={loading_runtime:'加载检测…',loading_model:'准备模型…',checking_frame:'等待有效画面',ready:'检测就绪',error:'检测不可用',off:''};
  return <section className={`vision-preparation vision-status ${compact?'compact':''} ${state.stage}`} aria-label="视觉检测准备状态" aria-busy={preparing}>
    <div className="vision-status-line"><strong role="status">{slow&&state.stage!=='checking_frame'?'加载较慢':labels[state.stage]}</strong>{preparing&&!slow&&<span className="vision-status-count">{elapsed}秒</span>}{(slow||state.stage==='error')&&<button type="button" className="vision-retry" onClick={onRetry} aria-label="重新加载检测">重试</button>}</div>
    {preparing&&<div className="vision-progress" role="progressbar" aria-label="视觉检测准备进度" aria-valuetext={labels[state.stage]}><span/></div>}
  </section>;
}
