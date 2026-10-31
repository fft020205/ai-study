import {useCallback,useEffect,useRef,useState} from 'react';
import {Button,Icon} from '@/components/ui';
import {FloatingCamera,CameraDragHandle} from './FloatingCamera';
import {VisionPreparationStatus} from './VisionPreparationStatus';
import {initialPreparation,preparationTransition,type VisionPreparation} from './visionPreparation';
import {useVisualAnalysis} from './useVisualAnalysis';
import {VisualAnalysisStatus} from './VisualAnalysisStatus';
import {visualObservationCurrent,type CameraAnalysisState} from './visualAnalysis';
import {CameraStatusWarning} from './CameraStatusWarning';
import type {CameraAlert} from '@/lib/types';
import type {Quality} from './quality';
export function CameraPreview({allowed,collapseSignal,onOpen,onClose,onLive,alerts=[],sessionId,onAnalysis,retrySignal=0,closeSignal=0}:{allowed:boolean;collapseSignal:number;onOpen:()=>Promise<void>;onClose:()=>Promise<void>;onLive:(v:boolean)=>void;alerts?:CameraAlert[];sessionId?:string;onAnalysis?:(state:CameraAnalysisState)=>void;retrySignal?:number;closeSignal?:number}){
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),generation=useRef(0),disposeResources=useRef<(()=>void)|null>(null);
  const [opening,setOpening]=useState(false),[closing,setClosing]=useState(false),[locallyClosed,setLocallyClosed]=useState(false),[request,setRequest]=useState(0),[collapsed,setCollapsed]=useState(false),[state,setState]=useState('等待开启'),[live,setLive]=useState(false);
  const [device,setDevice]=useState<CameraAnalysisState['device']>('starting');
  const analysis=useVisualAnalysis(sessionId,allowed&&!locallyClosed&&live,request);
  const retrySeen=useRef(retrySignal),closeSeen=useRef(closeSignal);
  useEffect(()=>{if(retrySeen.current!==retrySignal){retrySeen.current=retrySignal;setRequest(v=>v+1);}},[retrySignal]);
  const [preparation,setPreparation]=useState<VisionPreparation>(initialPreparation);
  useEffect(()=>{if(collapseSignal&&matchMedia('(max-width:767px)').matches)setCollapsed(true);},[collapseSignal]);
  const stop=useCallback(()=>{generation.current++;disposeResources.current?.();disposeResources.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;setLive(false);setDevice('stopped');onLive(false);setPreparation(initialPreparation);onAnalysis?.({sessionId,live:false,device:'stopped',deviceMessage:'摄像头已停止',issue:false,connection:'off',observation:null});},[onLive,onAnalysis,sessionId]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden){stop();setState('已停止 · 点击重新开启');}};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);};
  },[stop]);
  useEffect(()=>{
    if(!allowed||locallyClosed){stop();return;}
    if(document.hidden)return;
    let worker:Worker|undefined,interval:ReturnType<typeof setInterval>|undefined,disposed=false,inFlight=false,ready=false;
    const epoch=++generation.current;
    const dispose=()=>{disposed=true;clearInterval(interval);worker?.terminate();};
    disposeResources.current=dispose;
    const start=async()=>{
      setState('正在请求摄像头…');setDevice('starting');
      try{
        const media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
        if(disposed||generation.current!==epoch||document.hidden){media.getTracks().forEach(t=>t.stop());return;}
        stream.current=media;if(video.current){video.current.srcObject=media;await video.current.play();}
        if(disposed||generation.current!==epoch)return;
        setState('');setDevice('live');setLive(true);onLive(true);
        for(const track of media.getTracks())track.onended=()=>{stop();setState('摄像头已停止');};
        setPreparation(preparationTransition(initialPreparation,{type:'start',at:Date.now()}));
        try{worker=new Worker(new URL('./vision.worker.ts',import.meta.url));}catch{setPreparation(p=>preparationTransition(p,{type:'error'}));return;}
        worker.onmessage=e=>{
          if(disposed||generation.current!==epoch)return;
          if(e.data.type==='preparation'&&e.data.stage==='runtime_loaded')setPreparation(p=>preparationTransition(p,{type:'runtime_loaded'}));
          if(e.data.type==='ready'){ready=true;setPreparation(p=>preparationTransition(p,{type:'model_ready'}));}
          if(e.data.type==='quality'){inFlight=false;setPreparation(p=>preparationTransition(p,{type:'quality',quality:e.data.quality as Quality}));analysis.send(e.data.quality,e.data.features??null,e.data.sampledAt);}
          if(e.data.type==='error'){ready=false;inFlight=false;setPreparation(p=>preparationTransition(p,{type:'error'}));}
        };
        worker.onerror=()=>{if(disposed||generation.current!==epoch)return;ready=false;inFlight=false;setPreparation(p=>preparationTransition(p,{type:'error'}));};
        worker.postMessage({type:'init',base:location.origin});
        interval=setInterval(async()=>{
          if(disposed||generation.current!==epoch||document.hidden){worker?.terminate();return;}
          if(!ready||inFlight||!video.current||video.current.readyState<2)return;
          inFlight=true;
          try{const bitmap=await createImageBitmap(video.current,{resizeWidth:320,resizeHeight:Math.round(video.current.videoHeight*320/video.current.videoWidth)});if(disposed||generation.current!==epoch){bitmap.close();return;}worker?.postMessage({type:'frame',bitmap,timestamp:performance.now(),sampledAt:Date.now()},[bitmap]);}catch{inFlight=false;}
        },67);
      }catch{if(!disposed&&generation.current===epoch){stop();setDevice('error');setState('无法开启摄像头，请检查权限或设备。');}}
    };
    void start();
    return()=>{dispose();if(disposeResources.current===dispose)disposeResources.current=null;stop();};
  },[allowed,locallyClosed,request,sessionId,onLive,stop,analysis.send]);
  const close=async()=>{
    if(closing)return;
    // Stop locally before waiting for the server; this also disposes the worker effect.
    setClosing(true);setLocallyClosed(true);setCollapsed(true);stop();
    try{await onClose();}finally{setClosing(false);}
  };
  useEffect(()=>{if(closeSeen.current!==closeSignal){closeSeen.current=closeSignal;void close();}},[closeSignal]);
  const reopen=async()=>{
    if(opening||closing)return;
    setOpening(true);
    try{
      await onOpen();
      setLocallyClosed(false);setCollapsed(false);
    }finally{setOpening(false);}
  };
  useEffect(()=>{onAnalysis?.({sessionId,live:allowed&&!locallyClosed&&live,device,deviceMessage:state,
    issue:device==='error'||preparation.stage==='error'||analysis.connection==='error'||analysis.observation?.status==='baseline_insufficient',
    connection:analysis.connection,observation:analysis.observation});},[sessionId,allowed,locallyClosed,live,device,state,preparation.stage,analysis.connection,analysis.observation,onAnalysis]);
  const visual=analysis.observation;
  const visualAlerts:CameraAlert[]=visualObservationCurrent(visual,Date.now()/1000)&&visual?.support_hint?[{
    kind:visual.support_hint==='possible_fatigue'?'fatigue':'high_load',source:'visual_heuristic',evidence_quote:'',
    evidence_note:visual.llm_judgment?`AI结合视觉与对话的暂定意见：${visual.llm_judgment.reason}`:'本机视觉行为引擎连续给出该启发式阶段；需要结合你的实际感受确认。',captured_at:visual.sampled_at!,expires_at:visual.sampled_at!+3
  }]:[];
  const combinedAlerts=[...alerts,...visualAlerts.filter(v=>!alerts.some(a=>a.kind===v.kind))];
  const status=live&&(preparation.stage==='ready'?<VisualAnalysisStatus connection={analysis.connection} observation={analysis.observation} onRetry={()=>setRequest(v=>v+1)}/>:<VisionPreparationStatus state={preparation} compact onRetry={()=>setRequest(v=>v+1)}/>);
  if(!allowed||locallyClosed)return <FloatingCamera><aside className="camera collapsed camera-closed" aria-label="摄像头已关闭"><CameraDragHandle/><button type="button" className="camera-reopen" onClick={()=>void reopen()} disabled={opening||closing}><Icon name="cameraOff"/><span>{closing?'正在关闭…':opening?'正在开启…':'开启摄像头'}</span></button></aside></FloatingCamera>;
  return <FloatingCamera><aside className={`camera ${collapsed?'collapsed':''}`} aria-label="摄像头自览"><div className="camera-picture" hidden={collapsed}><video ref={video} muted playsInline autoPlay aria-label="你的实时摄像头画面"/>{live?<><div className="camera-monitor-badge">{status}</div><CameraStatusWarning alerts={combinedAlerts}/></>:<div className="camera-off-state"><Icon name="cameraOff"/><span>{state}</span><Button variant="ghost" onClick={()=>setRequest(v=>v+1)}>重新开启</Button></div>}</div><div className="camera-toolbar"><CameraDragHandle/><span>{live?(collapsed?'● 已开启':'你'):'摄像头已停止'}</span><button aria-label={collapsed?'展开预览':'收起预览'} onClick={()=>setCollapsed(!collapsed)} title="收起不会关闭摄像头"><Icon name="minimize"/></button><button aria-label="关闭摄像头" onClick={()=>void close()}><Icon name="cameraOff"/></button></div>
</aside></FloatingCamera>;
}
