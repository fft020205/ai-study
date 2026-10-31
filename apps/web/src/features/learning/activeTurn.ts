import type {StreamEvent,LearningSession,Message} from '@/lib/types';
export type ActiveTurn={sessionId:string;requestId:string;text:string;event:StreamEvent;phase:'sending'|'thinking'|'streaming'|'failed';reply:string;acceptedId:string|null;error:string};
export function pendingUserMessage(session:LearningSession,turn:ActiveTurn|null):Message|null{
  if(!turn||turn.sessionId!==session.id||!['message','correct'].includes(turn.event)||!turn.text||session.messages.some(m=>m.id===turn.acceptedId||m.request_id===turn.requestId))return null;
  return {id:'local-'+turn.requestId,request_id:turn.requestId,role:'user',text:turn.text,code:'',source:turn.event==='correct'?'correction':'submitted',node_id:session.current_node.id,created_at:0};
}
