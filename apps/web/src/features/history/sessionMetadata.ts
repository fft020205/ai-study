import type {LearningSession,SessionTitle} from '@/lib/types';
export function applySessionTitle(session:LearningSession,title:SessionTitle):LearningSession{
  return session.id===title.id&&title.title_version>=(session.title_version??0)?{...session,title:title.title,title_version:title.title_version}:session;
}
export function mergeSession(current:LearningSession,incoming:LearningSession):LearningSession{
  if(current.id!==incoming.id)return incoming;
  const content=current.version>incoming.version?current:incoming;
  const title=(current.title_version??0)>(incoming.title_version??0)?current:incoming;
  return applySessionTitle(content,title);
}
