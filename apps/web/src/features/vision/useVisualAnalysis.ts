import {useCallback,useEffect,useRef,useState} from 'react';
import {request} from '@/lib/api';
import type {Quality} from './quality';
import type {BehavioralFeatures} from './behaviorFeatures';
import type {VisualObservation,VisionConnection} from './visualAnalysis';

type Lease={run_id:string;ticket:string;websocket_path:string;calibration_seconds:number};
export function useVisualAnalysis(sessionId:string|undefined,active:boolean,restartKey=0){
  const socket=useRef<WebSocket|null>(null),connected=useRef(false),seq=useRef(0),lastSent=useRef(0);
  const [state,setState]=useState<{sessionId?:string;restartKey:number;connection:VisionConnection;observation:VisualObservation|null}>({sessionId,restartKey,connection:'off',observation:null});
  useEffect(()=>{
    if(!active||!sessionId){connected.current=false;setState({sessionId,restartKey,connection:'off',observation:null});return;}
    let disposed=false;const abort=new AbortController();
    connected.current=false;seq.current=0;lastSent.current=0;setState({sessionId,restartKey,connection:'connecting',observation:null});
    void (async()=>{
      try{
        const lease=await request<Lease>(`/sessions/${sessionId}/vision/start`,{method:'POST',signal:abort.signal});
        if(disposed)return;
        const url=new URL(lease.websocket_path,location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';
        const ws=new WebSocket(url);socket.current=ws;
        ws.onopen=()=>{if(!disposed)ws.send(JSON.stringify({type:'hello',ticket:lease.ticket}));};
        ws.onmessage=event=>{
          if(disposed)return;
          try{const message=JSON.parse(event.data);if((message.type==='connected'||message.type==='analysis')&&message.data?.run_id===lease.run_id){connected.current=true;setState({sessionId,restartKey,connection:'connected',observation:message.data});}}catch{connected.current=false;setState({sessionId,restartKey,connection:'error',observation:null});ws.close();}
        };
        const failed=()=>{if(!disposed){connected.current=false;setState({sessionId,restartKey,connection:'error',observation:null});}};
        ws.onerror=failed;ws.onclose=failed;
      }catch{if(!disposed){connected.current=false;setState({sessionId,restartKey,connection:'error',observation:null});}}
    })();
    return()=>{disposed=true;abort.abort();connected.current=false;socket.current?.close();socket.current=null;};
  },[sessionId,active,restartKey]);
  const send=useCallback((quality:Quality,features:BehavioralFeatures|null,sampledAt:number)=>{
    const ws=socket.current,now=performance.now();
    if(!connected.current||!ws||ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>16000||now-lastSent.current<450)return;
    lastSent.current=now;
    ws.send(JSON.stringify({seq:++seq.current,sampled_at:sampledAt/1000,quality,features:quality==='valid'?features:null}));
  },[]);
  const current=active&&state.sessionId===sessionId&&state.restartKey===restartKey;
  return {connection:current?state.connection:'off' as VisionConnection,observation:current?state.observation:null,send};
}
