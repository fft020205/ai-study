import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {Task} from '@/lib/types';
import {Button,Icon,Notice} from '@/components/ui';
import {courseSubtitle,courseTitle} from '@/i18n/course';
export function TaskSelector({tasks,onSelect}:{tasks:Task[];onSelect:(t:Task)=>void}){
  const {t}=useTranslation();
  const [interest,setInterest]=useState(''),[note,setNote]=useState('');
  const start=()=>{
    const query=interest.trim().toLocaleLowerCase();
    const patterns:Record<string,RegExp>={variable:/编程|变量|代码|交换|python|program|variable|code|swap/i,mean:/均值|平均|统计|数学|average|mean|statistic|math/i,causality:/因果|相关|证据|app|causal|correlation|evidence/i};
    const match=tasks.find(task=>interest.includes(task.title)||query.includes(courseTitle(task.id,task.title).toLocaleLowerCase())||patterns[task.id]?.test(interest));
    if(match)onSelect(match);else setNote(t('tasks.fallback'));
  };
  return <section className="content-page selection" data-design-node="5:63"><div className="readable stack-20">
    <h1>{t('tasks.title')}</h1><p className="muted small desktop-copy">{t('tasks.descriptionDesktop')}</p><p className="muted small mobile-copy">{t('tasks.descriptionMobile')}</p>
    <div className="task-grid">{tasks.map(task=><button className="task-card" key={task.id} onClick={()=>onSelect(task)}><div className="subject-icon"><Icon name={task.icon}/></div><div className="task-copy"><h2>{courseTitle(task.id,task.title)}</h2><p>{courseSubtitle(task.id,task.subtitle)}</p><span className="caption">{t('tasks.duration')}</span></div></button>)}</div>
    <form className="start-prompt" onSubmit={e=>{e.preventDefault();start();}}><Icon name="mutedSpark"/><input aria-label={t('tasks.interestLabel')} placeholder={t('tasks.interestPlaceholder')} value={interest} onChange={e=>setInterest(e.target.value)}/><Button variant="primary" type="submit">{t('tasks.start')}</Button></form>
    {note&&<Notice>{note}</Notice>}
  </div></section>;
}
