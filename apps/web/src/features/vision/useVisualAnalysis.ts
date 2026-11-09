import {useCallback,useEffect,useRef,useState} from 'react';
import {request} from '@/lib/api';
import type {Quality} from './quality';
import type {BehavioralFeatures} from './behaviorFeatures';
import type {VisualObservation,VisionConnection} from './visualAnalysis';

type Lease={run_id:string;ticket:string;websocket_path:string;calibration_seconds:number;lesson_ready?:boolean};
export function useVisualAnalysis(sessionId:string|undefined,active:boolean,restartKey=0,deviceKey?:string|null,resetKey=0){
  const resetSeen=useRef(resetKey);
  const socket=useRef<WebSocket|null>(null),connected=useRef(false),seq=useRef(0),lastSent=useRef(0);
  const [transportKey,setTransportKey]=useState(0);
  const reconnect=useCallback(()=>setTransportKey(value=>value+1),[]);
  const [state,setState]=useState<{sessionId?:string;restartKey:number;connection:VisionConnection;observation:VisualObservation|null}>({sessionId,restartKey,connection:'off',observation:null});
  useEffect(()=>{
    if(!active||!sessionId){connected.current=false;setState({sessionId,restartKey,connection:'off',observation:null});return;}
    let disposed=false,cycle=0,attempts=0;
    let retry:ReturnType<typeof setTimeout>|undefined,handshake:ReturnType<typeof setTimeout>|undefined;
    const abort=new AbortController();
    const connect=async()=>{
      const current=++cycle;
      connected.current=false;seq.current=0;lastSent.current=0;
      setState({sessionId,restartKey,connection:'connecting',observation:null});
      const failed=()=>{
        if(disposed||current!==cycle||retry!==undefined)return;
        connected.current=false;clearTimeout(handshake);
        setState({sessionId,restartKey,connection:'error',observation:null});
        const delay=Math.min(500*2**Math.min(attempts++,4),5000);
        retry=setTimeout(()=>{retry=undefined;void connect();},delay);
        socket.current?.close();
      };
      try{
        const lease=await request<Lease>(`/sessions/${sessionId}/vision/start`,{method:'POST',signal:abort.signal,
          body:JSON.stringify({device_key:deviceKey??null,reset:resetKey!==resetSeen.current})});
        if(disposed||current!==cycle)return;
        resetSeen.current=resetKey;
        const url=new URL(lease.websocket_path,location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';
        const ws=new WebSocket(url);socket.current=ws;
        handshake=setTimeout(failed,8000);
        ws.onopen=()=>{if(!disposed&&current===cycle)ws.send(JSON.stringify({type:'hello',ticket:lease.ticket}));};
        ws.onmessage=event=>{
          if(disposed||current!==cycle||retry!==undefined)return;
          try{
            const message=JSON.parse(event.data);
            if((message.type==='connected'||message.type==='analysis')&&message.data?.run_id===lease.run_id){
              clearTimeout(handshake);attempts=0;connected.current=true;
              setState({sessionId,restartKey,connection:'connected',observation:message.data});
            }
          }catch{failed();}
        };
        ws.onerror=failed;ws.onclose=failed;
      }catch{failed();}
    };
    void connect();
    return()=>{disposed=true;cycle++;abort.abort();clearTimeout(retry);clearTimeout(handshake);connected.current=false;socket.current?.close();socket.current=null;};
  },[sessionId,active,restartKey,deviceKey,resetKey,transportKey]);
  const send=useCallback((quality:Quality,features:BehavioralFeatures|null,sampledAt:number,featureWindowSeconds:number|null=null)=>{
    const ws=socket.current,now=performance.now(),age=Date.now()-sampledAt;
    if(age>2500||age< -1000||!connected.current||!ws||ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>16000||now-lastSent.current<450)return;
    lastSent.current=now;
    ws.send(JSON.stringify({seq:++seq.current,sampled_at:sampledAt/1000,quality,features:quality==='valid'?features:null,feature_window_seconds:quality==='valid'?featureWindowSeconds:null}));
  },[]);
  const current=active&&state.sessionId===sessionId&&state.restartKey===restartKey;
  return {connection:current?state.connection:'off' as VisionConnection,observation:current?state.observation:null,send,reconnect};
}
