import {useState} from 'react';
import type {Task} from '@/lib/types';
import {Button,Icon,Notice} from '@/components/ui';
export function TaskSelector({tasks,onSelect}:{tasks:Task[];onSelect:(t:Task)=>void}){
  const [interest,setInterest]=useState(''),[note,setNote]=useState('');
  const start=()=>{const match=tasks.find(t=>interest.includes(t.title)||({variable:/编程|变量|代码|交换|python/i,mean:/均值|平均|统计|数学/,causality:/因果|相关|证据|app/i}[t.id]?.test(interest)));if(match)onSelect(match);else setNote('先从上面的三个小任务中选一个。其他主题会在后续加入。');};
  return <section className="content-page selection" data-design-node="5:63"><div className="readable stack-20">
    <h1>今天，想弄懂什么？</h1><p className="muted small desktop-copy">选择一个约 8–10 分钟的小任务，和 AI 一起推理、验证。</p><p className="muted small mobile-copy">选一个短任务，和 AI 边聊边学。</p>
    <div className="task-grid">{tasks.map(t=><button className="task-card" key={t.id} onClick={()=>onSelect(t)}><div className="subject-icon"><Icon name={t.icon}/></div><div className="task-copy"><h2>{t.title}</h2><p>{t.subtitle}</p><span className="caption">约 8–10 分钟 · 可暂停</span></div></button>)}</div>
    <form className="start-prompt" onSubmit={e=>{e.preventDefault();start();}}><Icon name="mutedSpark"/><input aria-label="想学习的主题" placeholder="也可以先告诉我：你想从哪里开始？" value={interest} onChange={e=>setInterest(e.target.value)}/><Button variant="primary" type="submit">开始</Button></form>
    {note&&<Notice>{note}</Notice>}
  </div></section>;
}
