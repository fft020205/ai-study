import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button,Icon} from './ui';
import {LanguageSwitcher} from './LanguageSwitcher';
import {HistoryList} from '@/features/history/HistoryList';
import {localizeSessionTitle} from '@/i18n/course';
import type {LearningSession} from '@/lib/types';
export function Shell({children,sessions,current,onNew,onOpen,onRename,onDelete,onAISettings,onPrivacy,onEnd,cameraLive}:{children:React.ReactNode;sessions:LearningSession[];current:LearningSession|null;onNew:()=>void;onOpen:(s:LearningSession)=>void;onRename:(s:LearningSession)=>void;onDelete:(s:LearningSession)=>void;onAISettings:()=>void;onPrivacy:()=>void;onEnd:()=>void;cameraLive:boolean}){
  const {t}=useTranslation();
  const [nav,setNav]=useState(false),[menu,setMenu]=useState(false);const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const close=(e:PointerEvent)=>{if(menuRef.current&&!menuRef.current.contains(e.target as Node))setMenu(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenu(false);setNav(false);}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[]);
  const supportStatus=current?.support_mode==='on'?'supportOn':current?.support_mode==='paused'?'supportPaused':'supportOff';
  return <div className="app-shell">
    {nav&&<button className="nav-scrim" aria-label={t('shell.closeNavigation')} onClick={()=>setNav(false)}/>}
    <aside className={`sidebar ${nav?'open':''}`} aria-label={t('shell.navigation')}>
      <button aria-label={t('shell.home')} className="brand" onClick={()=>{onNew();setNav(false);}}><Icon name="spark"/><span>{t('common.appName')}</span></button>
      <Button className="new-learning" onClick={()=>{onNew();setNav(false);}} title={t('shell.newLearning')}><Icon name="plus"/><span>{t('shell.newLearning')}</span></Button>
      <span className="caption nav-label">{t('shell.history')}</span>
      <HistoryList sessions={sessions} currentId={current?.id} onOpen={s=>{onOpen(s);setNav(false);}} onRename={onRename} onDelete={onDelete}/>
      <div className="sidebar-bottom"><strong>{t('shell.control')}</strong><span className={cameraLive?'status-on':''}>{cameraLive?'●':'○'}　{t(cameraLive?'shell.cameraOn':'shell.cameraOff')}</span><span className={current?.support_mode==='on'?'status-on':''}>{current?.support_mode==='on'?'●':'○'}　{t(`shell.${supportStatus}`)}</span></div>
      <button className="privacy-entry" onClick={()=>{onPrivacy();setNav(false);}}>{t('shell.privacy')}</button>
    </aside>
    <main className="workspace">
      <header className="header"><button className="menu-trigger" aria-label={t('shell.openNavigation')} onClick={()=>setNav(!nav)}><Icon name="menu"/></button><div className="breadcrumb">{current&&<><span>{localizeSessionTitle(current)}</span><span className="muted">/</span><span className="muted breadcrumb-detail">{t(`shell.breadcrumb.${current.task_id}`)}</span></>}</div>
        <LanguageSwitcher/>
        <div className="account" ref={menuRef}><button className="avatar-trigger" aria-label={t('shell.openAccount')} aria-expanded={menu} onClick={()=>setMenu(!menu)}><span>{t('shell.avatar')}</span></button>{menu&&<div className="account-menu"><span className="caption">{t('shell.guest')}</span><button onClick={()=>{setMenu(false);onAISettings();}}>{t('common.aiSettings')}</button><button onClick={()=>{setMenu(false);onPrivacy();}}>{t('common.privacy')}</button>{current?.status==='active'&&<button onClick={()=>{setMenu(false);onEnd();}}>{t('shell.endSession')}</button>}</div>}</div>
      </header>{children}
    </main>
  </div>;
}
