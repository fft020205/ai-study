import {ApiError} from './api';
import type {StreamEvent,LearningSession} from './types';
export type TurnFrame={event:'accepted'|'status'|'delta'|'complete'|'error';data:{request_id:string;session?:LearningSession;message_id?:string|null;phase?:string;text?:string;detail?:string;status?:number}};
export class EventDecoder{
  private buffer='';
  feed(text:string){
    this.buffer+=text;const frames:{event:string;data:string}[]=[];
    if(this.buffer.length>2**21)throw new Error('回复数据过大，请重试。');
    let match:RegExpExecArray|null;
    while((match=/\r?\n\r?\n/.exec(this.buffer))){
      const frame=this.buffer.slice(0,match.index);this.buffer=this.buffer.slice(match.index+match[0].length);
      let event='message';const data:string[]=[];
      for(const line of frame.split(/\r?\n/)){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));}
      if(data.length)frames.push({event,data:data.join('\n')});
    }
    return frames;
  }
}
export async function readTurnStream(session:LearningSession,text:string,event:StreamEvent,requestId:string,signal:AbortSignal,onFrame:(frame:TurnFrame)=>void){
  const response=await fetch(`/api/sessions/${session.id}/turns/stream`,{method:'POST',credentials:'same-origin',cache:'no-store',signal,
    headers:{'Content-Type':'application/json','Accept':'text/event-stream','X-Study-Client':'web-v1'},body:JSON.stringify({text,event,request_id:requestId,version:session.version})});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new ApiError(typeof body.detail==='string'?body.detail:'消息未能发送，请重试。',response.status);}
  if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw new ApiError('服务未返回流式响应。',502);
  const reader=response.body.getReader(),utf8=new TextDecoder(),decoder=new EventDecoder();let complete=false;
  try{
    while(true){
      const {done,value}=await reader.read();const frames=decoder.feed(done?utf8.decode():utf8.decode(value,{stream:true}));
      for(const frame of frames){
        if(!['accepted','status','delta','complete','error'].includes(frame.event))continue;
        const data=JSON.parse(frame.data);
        if(data.request_id!==requestId||data.session&&data.session.id!==session.id)throw new ApiError('回复标识不一致，请重新连接。',502);
        if(frame.event==='error')throw new ApiError(data.detail||'AI 回复中断，请重试。',data.status||502);
        if(frame.event==='delta'&&typeof data.text!=='string')throw new ApiError('流式正文格式不正确。',502);
        if((frame.event==='accepted'||frame.event==='complete')&&!data.session)throw new ApiError('学习状态缺失，请重试。',502);
        onFrame({event:frame.event as TurnFrame['event'],data});
        if(frame.event==='complete'){complete=true;return;}
      }
      if(done)break;
    }
    if(!complete)throw new ApiError('回复连接中断，请重试。',502);
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
