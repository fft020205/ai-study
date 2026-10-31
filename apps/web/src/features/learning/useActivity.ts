import {useEffect,useRef} from 'react';
import {api} from '@/lib/api';
import type {LearningSession} from '@/lib/types';
export function useActivity(session:LearningSession|null,draft:string,busy:boolean,composing:boolean,reading:boolean,enabled:boolean,onUpdate:(s:LearningSession)=>void){
  const flags=useRef({session,draft,busy,composing,reading,enabled});flags.current={session,draft,busy,composing,reading,enabled};
  const update=useRef(onUpdate);update.current=onUpdate;
  const lastActivity=useRef(Date.now());
  useEffect(()=>{lastActivity.current=Date.now();},[draft,busy,composing,reading,session?.messages.length,enabled]);
  useEffect(()=>{
    let active=true,requesting=false;
    const mark=()=>{lastActivity.current=Date.now();};
    const tick=async()=>{
      const f=flags.current;if(!f.session||f.session.status!=='active'||requesting)return;
      requesting=true;
      try{const next=await api.activity(f.session,{foreground:!document.hidden&&f.enabled,has_draft:!!f.draft,composing:f.composing,busy:f.busy,reading:f.reading||Date.now()-lastActivity.current<5000});if(active&&flags.current.session?.id===next.id&&next.version>=(flags.current.session?.version??0))update.current(next);}catch{/* Telemetry failure cannot interrupt ordinary learning. */}finally{requesting=false;}
    };
    const visibility=()=>{mark();void tick();};
    document.addEventListener('visibilitychange',visibility);document.addEventListener('wheel',mark,{passive:true});document.addEventListener('touchmove',mark,{passive:true});
    const timer=setInterval(()=>void tick(),2000);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('wheel',mark);document.removeEventListener('touchmove',mark);};
  },[]);
}
