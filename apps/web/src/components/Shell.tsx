import {useEffect,useRef,useState} from 'react';
import {Button,Icon} from './ui';
import {HistoryList} from '@/features/history/HistoryList';
import type {LearningSession} from '@/lib/types';
export function Shell({children,sessions,current,onNew,onOpen,onRename,onDelete,onAISettings,onPrivacy,onEnd,cameraLive}:{children:React.ReactNode;sessions:LearningSession[];current:LearningSession|null;onNew:()=>void;onOpen:(s:LearningSession)=>void;onRename:(s:LearningSession)=>void;onDelete:(s:LearningSession)=>void;onAISettings:()=>void;onPrivacy:()=>void;onEnd:()=>void;cameraLive:boolean}){
  const [nav,setNav]=useState(false),[menu,setMenu]=useState(false);const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const close=(e:PointerEvent)=>{if(menuRef.current&&!menuRef.current.contains(e.target as Node))setMenu(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenu(false);setNav(false);}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[]);
  return <div className="app-shell">
    {nav&&<button className="nav-scrim" aria-label="关闭导航" onClick={()=>setNav(false)}/>}
    <aside className={`sidebar ${nav?'open':''}`} aria-label="学习导航">
      <button aria-label="学习助手首页" className="brand" onClick={()=>{onNew();setNav(false);}}><Icon name="spark"/><span>学习助手</span></button>
      <Button className="new-learning" onClick={()=>{onNew();setNav(false);}} title="开始新的学习"><Icon name="plus"/><span>开始新的学习</span></Button>
      <span className="caption nav-label">历史记录</span>
      <HistoryList sessions={sessions} currentId={current?.id} onOpen={s=>{onOpen(s);setNav(false);}} onRename={onRename} onDelete={onDelete}/>
      <div className="sidebar-bottom"><strong>这次学习，由你掌控</strong><span className={cameraLive?'status-on':''}>{cameraLive?'●':'○'}　摄像头{cameraLive?'已开启':'未开启'}</span><span className={current?.support_mode==='on'?'status-on':''}>{current?.support_mode==='on'?'●':'○'}　主动支持{current?.support_mode==='on'?'已开启':current?.support_mode==='paused'?'已暂停':'未开启'}</span></div>
      <button className="privacy-entry" onClick={()=>{onPrivacy();setNav(false);}}>隐私与数据说明</button>
    </aside>
    <main className="workspace">
      <header className="header"><button className="menu-trigger" aria-label="打开导航" onClick={()=>setNav(!nav)}><Icon name="menu"/></button><div className="breadcrumb">{current&&<><span>{current.title}</span><span className="muted">/</span><span className="muted breadcrumb-detail">{current.task_id==='variable'?'追踪旧值与交换':current.task_id==='mean'?'按人数理解平均数':'从差异走向证据'}</span></>}</div>
        <div className="account" ref={menuRef}><button className="avatar-trigger" aria-label="打开账户菜单" aria-expanded={menu} onClick={()=>setMenu(!menu)}><span>访</span></button>{menu&&<div className="account-menu"><span className="caption">访客 · 本机学习记录</span><button onClick={()=>{setMenu(false);onAISettings();}}>AI 接口设置</button><button onClick={()=>{setMenu(false);onPrivacy();}}>隐私与数据</button>{current?.status==='active'&&<button onClick={()=>{setMenu(false);onEnd();}}>结束本次学习</button>}</div>}</div>
      </header>{children}
    </main>
  </div>;
}
