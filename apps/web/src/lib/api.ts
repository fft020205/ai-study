import type { Action, DialogueEvent, Bootstrap, Consent, LearningSession, AIConnection, AIConnectionInput, AIConnectionTest, SessionTitle } from './types';
export class ApiError extends Error { constructor(message:string, public status:number){super(message);} }
export async function request<T>(path:string, options:RequestInit={}):Promise<T> {
  const response=await fetch(`/api${path}`,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Study-Client':'web-v1',...options.headers},cache:'no-store'});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new ApiError(typeof body.detail==='string'?body.detail:'请求未完成，请稍后重试。',response.status);}
  if(response.status===204)return undefined as T;
  return response.json();
}
export const api = {
  aiConnection:()=>request<AIConnection>('/settings/ai'),
  saveAIConnection:(body:AIConnectionInput)=>request<AIConnection>('/settings/ai',{method:'PUT',body:JSON.stringify(body)}),
  testAIConnection:(body:AIConnectionInput)=>request<AIConnectionTest>('/settings/ai/test',{method:'POST',body:JSON.stringify(body)}),
  bootstrap:()=>request<Bootstrap>('/bootstrap'),
  create:(task_id:string,consent:Consent)=>request<LearningSession>('/sessions',{method:'POST',body:JSON.stringify({task_id,consent})}),
  get:(id:string,signal?:AbortSignal)=>request<LearningSession>(`/sessions/${id}`,{signal}),
  control:(s:LearningSession,action:Action,extra:{text?:string;consent?:Consent}={})=>request<LearningSession>(`/sessions/${s.id}/controls`,{method:'POST',body:JSON.stringify({action,version:s.version,...extra})}),
  answer:(s:LearningSession,text:string,request_id:string,signal:AbortSignal,event:DialogueEvent='message')=>request<LearningSession>(`/sessions/${s.id}/turns`,{method:'POST',body:JSON.stringify({text,version:s.version,request_id,event}),signal}),
  activity:(s:LearningSession,flags:{foreground:boolean;has_draft:boolean;composing:boolean;busy:boolean;reading:boolean})=>request<LearningSession>(`/sessions/${s.id}/activity`,{method:'POST',body:JSON.stringify({version:s.version,...flags})}),
  rename:(id:string,title:string)=>request<SessionTitle>(`/sessions/${id}`,{method:'PATCH',body:JSON.stringify({title})}),
  delete:(id:string)=>request<void>(`/sessions/${id}`,{method:'DELETE'})
};
