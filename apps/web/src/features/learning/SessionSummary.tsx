import {useTranslation} from 'react-i18next';
import type {LearningSession} from '@/lib/types';
import {Button} from '@/components/ui';
import {localizeFocusTitle,localizeSessionTitle} from '@/i18n/course';
export function SessionSummary({session,onHome,onPrivacy}:{session:LearningSession;onHome:()=>void;onPrivacy:()=>void}){
  const {t}=useTranslation();
  const completed=session.records.filter(r=>r.status.startsWith('completed'));
  const title=localizeSessionTitle(session),focus=localizeFocusTitle(session.current_node.title);
  const independent=completed.filter(r=>r.status==='completed_independently').length;
  return <section className="content-page summary-page" data-design-node="5:68"><div className="readable stack-20"><p className="eyebrow">{t('summary.eyebrow')}</p><h1>{t('summary.title')}</h1><p className="muted small">{t('summary.stopped',{title})}</p><div className="summary-card"><strong>{t('summary.practiced')}</strong><p>{t('summary.topics',{title,focus})}</p><p>{completed.length?t('summary.completed',{count:completed.length,independent}):t('summary.none')}</p><p className="caption muted">{t('summary.caveat')}</p></div><div className="actions"><Button variant="primary" onClick={onHome}>{t('summary.home')}</Button><a className="button ghost" href={`/api/sessions/${session.id}/export`} download={`study-${session.id}.json`}>{t('summary.export')}</a></div><button className="text-button muted" onClick={onPrivacy}>{t('summary.privacy')}</button></div></section>;
}
