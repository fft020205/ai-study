import {useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import ReactMarkdown,{type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Button,Icon} from '@/components/ui';
import {localizeFocusTitle,localizeSessionTitle} from '@/i18n/course';
import {localizeError} from '@/i18n/errors';
import type {Action,LearningSession} from '@/lib/types';
import {pendingUserMessage,type ActiveTurn} from './activeTurn';
export function Conversation({session,busy,onAction,onReading,configured,onAISettings,turn,onRetry}:{session:LearningSession;busy:boolean;onAction:(a:Action)=>void;onReading:(v:boolean)=>void;configured:boolean;onAISettings:()=>void;turn:ActiveTurn|null;onRetry:()=>void}){
  const {t}=useTranslation();
  const markdownComponents:Components={
    a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img:()=>null,
    table:({children})=><div className="table-scroll" role="region" aria-label={t('conversation.tableLabel')} tabIndex={0}><table>{children}</table></div>
  };
  const log=useRef<HTMLDivElement>(null),following=useRef(true),manualUntil=useRef(0);
  const local=turn?.sessionId===session.id?turn:null,optimistic=pendingUserMessage(session,local);
  const messages=optimistic?[...session.messages,optimistic]:session.messages;
  useEffect(()=>{if(local?.requestId){following.current=true;manualUntil.current=0;if(log.current)log.current.scrollTop=log.current.scrollHeight;onReading(false);}},[local?.requestId,onReading]);
  useEffect(()=>{if(following.current&&log.current)log.current.scrollTop=log.current.scrollHeight;},[local?.reply,local?.phase,messages.length,session.episode?.text]);
  useEffect(()=>{if(log.current&&following.current){log.current.scrollTop=session.messages.length===1?0:log.current.scrollHeight;onReading(false);}},[session.messages.length,onReading]);
  const supportEnabled=session.status==='active'&&session.support_mode==='on'&&session.consent.support;
  const preparingSupport=supportEnabled&&session.pending&&session.episode&&!session.episode.text&&!busy;
  const visibleEpisode=supportEnabled&&session.episode?.text&&['waiting','difficulty','cognitive_load','fatigue','visual_signal'].includes(session.episode.reason);
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
    <div className="lesson-top"><p className="caption muted">{localizeSessionTitle(session)} · {localizeFocusTitle(session.current_node.title)}</p></div>
    {session.messages.length===0&&!busy&&<div className="info-block stack-20"><h2>{t(configured?'conversation.readyTitle':'conversation.connectTitle')}</h2><p className="muted">{t(configured?'conversation.readyDescription':'conversation.connectDescription')}</p>{configured?<Button onClick={()=>onAction('open')}>{t('conversation.startAI')}</Button>:<Button onClick={onAISettings}>{t('common.configureAI')}</Button>}</div>}
    <div className="message-list" role="log" aria-label={t('conversation.logLabel')}>{messages.map(m=><article key={m.id} className={`message ${m.role}`}>
      {m.role==='assistant'&&<div className="message-author"><Icon name="spark"/><span>{t(m.source==='ai'?'conversation.assistant':m.source==='hint'?'conversation.hintSource':m.source==='answer'?'conversation.answerSource':'conversation.taskSource')}</span></div>}
      <div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{m.text}</ReactMarkdown></div>{m.code&&<pre className="code-block"><span>Python</span><code>{m.code}</code></pre>}
    </article>)}</div>
    {busy&&!local?.reply&&<div className="ai-thinking" role="status" aria-label={t(local?.phase==='sending'?'conversation.sendingLabel':'conversation.thinkingLabel')}><Icon name="spark"/><span>{t(local?.phase==='sending'?'conversation.sending':'conversation.thinking')}</span><span className="thinking-dots" aria-hidden="true"><i/><i/><i/></span></div>}
    {local?.reply&&<article className="message assistant streaming-message" aria-label={t('conversation.receiving')}><div className="message-author"><Icon name="spark"/><span>{t('conversation.assistant')}</span></div><div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{local.reply}</ReactMarkdown><span className="stream-cursor" aria-hidden="true"/></div></article>}
    {local?.phase==='failed'&&<div className="turn-failure" role="alert"><p>{t(local.acceptedId?'conversation.sentButIncomplete':local.text?'conversation.notSent':'conversation.replyIncomplete')}{localizeError(local.error,'errors.replyInterrupted')}</p><button type="button" onClick={onRetry} disabled={busy}>{t(local.acceptedId||!local.text?'conversation.regenerate':'conversation.retrySend')}</button></div>}
    {preparingSupport&&<div className="ai-thinking" role="status" aria-label={t('conversation.preparingSupport')}><Icon name="spark"/><span>{t('conversation.preparingSupport')}</span><span className="thinking-dots" aria-hidden="true"><i/><i/><i/></span></div>}
    {session.protected&&<p className="caption protected" role="status">{t('conversation.protected')}</p>}
    {session.support_mode==='paused'&&<div className="inline-state"><span>{t('conversation.supportPaused')}</span><button onClick={()=>onAction('resume')}>{t('conversation.resume')}</button></div>}
    {visibleEpisode&&<section className="support-card" aria-label={t('conversation.support')}><div className="message-author"><Icon name="spark"/><span>{session.episode?.title?.trim()||t('conversation.defaultSupportTitle')}</span></div><div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{session.episode?.text}</ReactMarkdown></div><div className="actions"><Button onClick={()=>onAction('think')}>{t('conversation.thinkingAction')}</Button><Button onClick={()=>onAction('hint')} disabled={!configured||busy}>{t('conversation.helpAction')}</Button><Button variant="ghost" onClick={()=>onAction('reject')}>{t('conversation.dismissAction')}</Button></div></section>}


  </div></div>;
}
