import {useState,type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {Dialog} from '@/components/Dialog';
import {Button} from '@/components/ui';
import {api} from '@/lib/api';
import {localizeSessionTitle} from '@/i18n/course';
import {localizeError} from '@/i18n/errors';
import type {LearningSession,SessionTitle} from '@/lib/types';
export type HistoryAction={mode:'rename'|'delete';session:LearningSession};
export function SessionHistoryDialog({action,onClose,onRenamed,onDeleted}:{action:HistoryAction;onClose:()=>void;onRenamed:(title:SessionTitle)=>void;onDeleted:(id:string)=>void}){
  const {t}=useTranslation();
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
    <h2 id="history-dialog-title">{t(rename?'history.renameTitle':'history.deleteTitle')}</h2>
    {rename?<><label className="small" htmlFor="history-title">{t('history.name')}</label><input id="history-title" name="title" autoFocus maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} disabled={saving} aria-describedby="history-title-help"/><p id="history-title-help" className="caption muted">{t('history.nameHelp')}</p></>:<><p className="history-target">{localizeSessionTitle(action.session)}</p><p>{t('history.deleteWarning')}</p></>}
    {error&&<p className="history-error" role="alert">{localizeError(error,'errors.operationIncomplete')}</p>}
    <div className="actions"><Button type="submit" variant="primary" disabled={saving||(rename&&!title.trim())}>{saving?t(rename?'history.saving':'history.deleting'):t(rename?'history.save':'history.confirmDelete')}</Button><Button type="button" disabled={saving} onClick={onClose}>{t(rename?'history.cancel':'history.keep')}</Button></div>
  </form></Dialog>;
}
