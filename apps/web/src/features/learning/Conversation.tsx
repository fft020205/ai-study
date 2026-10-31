import {useEffect,useRef} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Button,Icon} from '@/components/ui';
import type {Action,LearningSession} from '@/lib/types';
import {pendingUserMessage,type ActiveTurn} from './activeTurn';
export function Conversation({session,busy,onAction,onReading,configured,onAISettings,turn,onRetry}:{session:LearningSession;busy:boolean;onAction:(a:Action)=>void;onReading:(v:boolean)=>void;configured:boolean;onAISettings:()=>void;turn:ActiveTurn|null;onRetry:()=>void}){
  const log=useRef<HTMLDivElement>(null),following=useRef(true),manualUntil=useRef(0);
  const local=turn?.sessionId===session.id?turn:null,optimistic=pendingUserMessage(session,local);
  const messages=optimistic?[...session.messages,optimistic]:session.messages;
  useEffect(()=>{if(local?.requestId){following.current=true;manualUntil.current=0;if(log.current)log.current.scrollTop=log.current.scrollHeight;onReading(false);}},[local?.requestId,onReading]);
  useEffect(()=>{if(following.current&&log.current)log.current.scrollTop=log.current.scrollHeight;},[local?.reply,local?.phase,messages.length,session.episode?.text]);
  useEffect(()=>{if(log.current&&following.current){log.current.scrollTop=session.messages.length===1?0:log.current.scrollHeight;onReading(false);}},[session.messages.length,onReading]);
  const visibleEpisode=session.status==='active'&&session.support_mode==='on'&&session.consent.support&&session.episode?.text&&['waiting','difficulty','cognitive_load','fatigue','visual_signal'].includes(session.episode.reason);
  const markManualScroll=()=>{manualUntil.current=performance.now()+1000;};
  const handleScroll=()=>{
    const el=log.current!;const atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<=45;
    if(atBottom){following.current=true;onReading(false);}
    else if(performance.now()<=manualUntil.current){following.current=false;onReading(true);}
  };
  return <div className="conversation-viewport" ref={log} onWheel={markManualScroll} onTouchMove={markManualScroll}
    onPointerDown={event=>{if(event.target===event.currentTarget)markManualScroll();}}
    onKeyDown={event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))markManualScroll();}}
    onScroll={handleScroll}><div className="readable conversation" data-design-node="5:65">
    <div className="lesson-top"><p className="caption muted">{session.title} · {session.current_node.title}</p></div>
    {session.messages.length===0&&!busy&&<div className="info-block stack-20"><h2>{configured?'准备开始这次学习':'连接 AI 后开始对话'}</h2><p className="muted">{configured?'可以让 AI 从这个课题开始，也可以直接写下你想讨论的问题。':'填写 API 地址、密钥和模型名后，AI 会围绕这个课题与你交流。'}</p>{configured?<Button onClick={()=>onAction('open')}>让 AI 开始</Button>:<Button onClick={onAISettings}>配置 AI 接口</Button>}</div>}
    <div className="message-list" role="log" aria-label="学习对话">{messages.map(m=><article key={m.id} className={`message ${m.role}`}>
      {m.role==='assistant'&&<div className="message-author"><Icon name="spark"/><span>{m.source==='ai'?'学习助手':m.source==='hint'?'课程提示':m.source==='answer'?'课程示范':'学习任务'}</span></div>}
      <div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:()=>null}}>{m.text}</ReactMarkdown></div>{m.code&&<pre className="code-block"><span>Python</span><code>{m.code}</code></pre>}
    </article>)}</div>
    {busy&&!local?.reply&&<div className="ai-thinking" role="status" aria-label={local?.phase==='sending'?'正在发送消息':'AI 正在思考'}><Icon name="spark"/><span>{local?.phase==='sending'?'正在发送':'正在思考'}</span><span className="thinking-dots" aria-hidden="true"><i/><i/><i/></span></div>}
    {local?.reply&&<article className="message assistant streaming-message" aria-label="正在接收的AI回复"><div className="message-author"><Icon name="spark"/><span>学习助手</span></div><div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:()=>null}}>{local.reply}</ReactMarkdown><span className="stream-cursor" aria-hidden="true"/></div></article>}
    {local?.phase==='failed'&&<div className="turn-failure" role="alert"><p>{local.acceptedId?'消息已发送，AI 回复未完成。':local.text?'消息未发送。':'AI 回复未完成。'}{local.error}</p><button type="button" onClick={onRetry} disabled={busy}>{local.acceptedId||!local.text?'重新生成回复':'重试发送'}</button></div>}
    {session.protected&&<p className="caption protected" role="status">主动提醒已暂停，继续输入即可恢复对话。</p>}
    {session.support_mode==='paused'&&<div className="inline-state"><span>主动支持已暂停，文字学习仍可继续。</span><button onClick={()=>onAction('resume')}>恢复支持</button></div>}
    {visibleEpisode&&<section className="support-card" aria-label="主动支持"><div className="message-author"><Icon name="spark"/><span>{session.episode?.title?.trim()||'按你的节奏来'}</span></div><div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:()=>null}}>{session.episode?.text}</ReactMarkdown></div><div className="actions"><Button onClick={()=>onAction('think')}>我还在思考</Button><Button onClick={()=>onAction('hint')} disabled={!configured||busy}>需要一点帮助</Button><Button variant="ghost" onClick={()=>onAction('reject')}>暂时不用</Button></div></section>}


  </div></div>;
}
