import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {Icon} from '@/components/ui';
import {localizeSessionTitle} from '@/i18n/course';
import type {LearningSession} from '@/lib/types';
type Menu={session:LearningSession;x:number;y:number;trigger:HTMLButtonElement};
export function HistoryList({sessions,currentId,onOpen,onRename,onDelete}:{sessions:LearningSession[];currentId?:string;onOpen:(s:LearningSession)=>void;onRename:(s:LearningSession)=>void;onDelete:(s:LearningSession)=>void}){
  const {t,i18n}=useTranslation();
  const [menu,setMenu]=useState<Menu|null>(null),menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!menu)return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node)&&!menu.trigger.contains(event.target as Node))setMenu(null);};
    const hide=()=>setMenu(null);
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',hide);window.addEventListener('scroll',hide,true);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',hide);window.removeEventListener('scroll',hide,true);};
  },[menu]);
  const keyboard=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(event.key==='Escape'){event.stopPropagation();event.preventDefault();menu?.trigger.focus();setMenu(null);return;}
    if(event.key==='Tab'){setMenu(null);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const items=Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button')||[]);
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  };
  return <nav className="history" aria-label={t('history.label')}>{sessions.length?sessions.map(s=>{const title=localizeSessionTitle(s);return <div className="history-entry" key={s.id}>
    <button type="button" title={title} aria-label={t('history.open',{title})} aria-current={s.id===currentId?'page':undefined} className={`history-item ${s.id===currentId?'selected':''}`} onClick={()=>{setMenu(null);onOpen(s);}}><Icon name="book"/><span className="history-copy"><span className="history-title">{title}</span><small>{new Date(s.created_at*1000).toLocaleDateString(i18n.resolvedLanguage,{month:'numeric',day:'numeric'})} · {t(s.status==='ended'?'history.ended':'history.active')}</small></span></button>
    <button type="button" className="history-more" title={t('history.manage',{title})} aria-label={t('history.manage',{title})} aria-haspopup="menu" aria-expanded={menu?.session.id===s.id} aria-controls={menu?.session.id===s.id?'history-actions':undefined} onClick={event=>{if(menu?.session.id===s.id){setMenu(null);return;}const rect=event.currentTarget.getBoundingClientRect();setMenu({session:s,trigger:event.currentTarget,x:Math.max(8,Math.min(rect.right-176,innerWidth-184)),y:Math.max(8,Math.min(rect.bottom+4,innerHeight-112))});}}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="4" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="12" cy="8" r="1" fill="currentColor"/></svg></button>
  </div>; }):<p className="caption empty-history">{t('history.empty')}</p>}
  {menu&&createPortal(<div id="history-actions" ref={menuRef} className="history-menu" role="menu" aria-label={t('history.manage',{title:localizeSessionTitle(menu.session)})} style={{left:menu.x,top:menu.y}} onKeyDown={keyboard}><button type="button" role="menuitem" onClick={()=>{const s=menu.session;menu.trigger.focus();setMenu(null);onRename(s);}}>{t('history.rename')}</button><button type="button" role="menuitem" className="history-delete" onClick={()=>{const s=menu.session;menu.trigger.focus();setMenu(null);onDelete(s);}}>{t('history.delete')}</button></div>,document.body)}
  </nav>;
}
