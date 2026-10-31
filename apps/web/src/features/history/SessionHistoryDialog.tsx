import {useState,type FormEvent} from 'react';
import {Dialog} from '@/components/Dialog';
import {Button} from '@/components/ui';
import {api} from '@/lib/api';
import type {LearningSession,SessionTitle} from '@/lib/types';
export type HistoryAction={mode:'rename'|'delete';session:LearningSession};
export function SessionHistoryDialog({action,onClose,onRenamed,onDeleted}:{action:HistoryAction;onClose:()=>void;onRenamed:(title:SessionTitle)=>void;onDeleted:(id:string)=>void}){
  const [title,setTitle]=useState(action.session.title),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const rename=action.mode==='rename';
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(saving||(rename&&!title.trim()))return;setSaving(true);setError('');
    try{
      if(rename)onRenamed(await api.rename(action.session.id,title.trim()));
      else{await api.delete(action.session.id);onDeleted(action.session.id);}
      onClose();
    }catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setSaving(false);}
  };
  return <Dialog titleId="history-dialog-title" onClose={()=>{if(!saving)onClose();}}><form className="history-form" onSubmit={event=>void submit(event)}>
    <h2 id="history-dialog-title">{rename?'重命名学习记录':'删除这次学习记录？'}</h2>
    {rename?<><label className="small" htmlFor="history-title">名称</label><input id="history-title" name="title" autoFocus maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} disabled={saving} aria-describedby="history-title-help"/><p id="history-title-help" className="caption muted">最多80个字符。</p></>:<><p className="history-target">{action.session.title}</p><p>删除后，本产品内的对话、进度和同意记录将无法恢复。</p></>}
    {error&&<p className="history-error" role="alert">{error}</p>}
    <div className="actions"><Button type="submit" variant="primary" disabled={saving||(rename&&!title.trim())}>{saving?(rename?'正在保存…':'正在删除…'):(rename?'保存名称':'确认删除')}</Button><Button type="button" disabled={saving} onClick={onClose}>{rename?'取消':'保留记录'}</Button></div>
  </form></Dialog>;
}
