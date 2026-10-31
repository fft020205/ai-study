'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Shell} from '@/components/Shell';
import {SessionHistoryDialog,type HistoryAction} from '@/features/history/SessionHistoryDialog';
import {applySessionTitle,mergeSession} from '@/features/history/sessionMetadata';
import {Dialog} from '@/components/Dialog';
import {Button,Notice} from '@/components/ui';
import {TaskSelector} from '@/features/tasks/TaskSelector';
import {AIConnectionSettings} from '@/features/settings/AIConnectionSettings';
import {ConsentPanel} from '@/features/consent/ConsentPanel';
import {Conversation} from '@/features/learning/Conversation';
import {Composer} from '@/features/learning/Composer';
import {LessonPreparation} from '@/features/learning/LessonPreparation';
import {needsLessonCalibration,suspendTurnForCalibration} from '@/features/learning/lessonReadiness';
import type {CameraAnalysisState} from '@/features/vision/visualAnalysis';
import {SessionSummary} from '@/features/learning/SessionSummary';
import {CameraPreview} from '@/features/vision/CameraPreview';
import {useActivity} from '@/features/learning/useActivity';
import {api} from '@/lib/api';
import {readTurnStream} from '@/lib/turnStream';
import type {ActiveTurn} from '@/features/learning/activeTurn';
import type {Action,DialogueEvent,StreamEvent,Bootstrap,Consent,LearningSession,Task} from '@/lib/types';

type View='tasks'|'consent'|'learning'|'settings'|'ai-settings'|'privacy';
export default function Home(){
  const [data,setData]=useState<Bootstrap|null>(null),[session,setSession]=useState<LearningSession|null>(null),[selected,setSelected]=useState<Task|null>(null),[view,setView]=useState<View>('tasks');
  const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[composing,setComposing]=useState(false),[reading,setReading]=useState(false),[cameraLive,setCameraLive]=useState(false),[collapseSignal,setCollapseSignal]=useState(0);
  const [correction,setCorrection]=useState<string|null>(null),[historyAction,setHistoryAction]=useState<HistoryAction|null>(null);
  const active=useRef<LearningSession|null>(null);active.current=session;
  const [cameraAnalysis,setCameraAnalysis]=useState<CameraAnalysisState|null>(null),[cameraRetry,setCameraRetry]=useState(0),[cameraClose,setCameraClose]=useState(0);
  const updateCameraAnalysis=useCallback((next:CameraAnalysisState)=>{if(next.sessionId===active.current?.id)setCameraAnalysis(next);},[]);
  const needsCalibration=needsLessonCalibration(session,cameraAnalysis);
  const preparing=useRef(needsCalibration);preparing.current=needsCalibration;
  const openingAttempted=useRef(new Set<string>());
  const deletedSessions=useRef(new Set<string>());
  const [turn,setTurn]=useState<ActiveTurn|null>(null);
  const streamLock=useRef<string|null>(null);
  const generation=useRef(0),abort=useRef<AbortController|null>(null);
  const update=useCallback((s:LearningSession)=>{
    if(deletedSessions.current.has(s.id))return;
    setSession(old=>old?mergeSession(old,s):s);
    setData(d=>{if(!d)return d;const old=d.sessions.find(x=>x.id===s.id);const merged=old?mergeSession(old,s):s;return {...d,sessions:[merged,...d.sessions.filter(x=>x.id!==s.id)].sort((a,b)=>b.updated_at-a.updated_at)};});
  },[]);
  const refresh=useCallback(async()=>{try{setData(await api.bootstrap());setError('');}catch{setError('暂时无法连接学习服务，请确认项目已启动，然后重试。');}},[]);
  useEffect(()=>{void refresh();return()=>{abort.current?.abort();};},[refresh]);
  const report=(e:unknown)=>setError(e instanceof Error?e.message:'操作没有完成，请重试。');
  useActivity(session,draft,busy,composing,reading,view==='learning'&&!needsCalibration&&correction===null,update);

  const runStream=useCallback(async(s:LearningSession,text:string,event:StreamEvent='message',requestId=crypto.randomUUID())=>{
    if(streamLock.current||preparing.current)return;
    streamLock.current=requestId;const g=++generation.current;
    abort.current?.abort();abort.current=new AbortController();
    const accepted=s.messages.find(m=>m.request_id===requestId)?.id??null;
    setTurn({sessionId:s.id,requestId,text,event,phase:accepted?'thinking':'sending',reply:'',acceptedId:accepted,error:''});
    setBusy(true);setError('');
    try{
      await readTurnStream(s,text,event,requestId,abort.current.signal,frame=>{
        if(g!==generation.current||active.current?.id!==s.id)return;
        if(frame.event==='accepted'){
          update(frame.data.session!);setTurn(old=>old?.requestId===requestId?{...old,acceptedId:frame.data.message_id??null,phase:'thinking'}:old);
        }else if(frame.event==='delta')setTurn(old=>old?.requestId===requestId?{...old,phase:'streaming',reply:old.reply+frame.data.text}:old);
        else if(frame.event==='complete'){update(frame.data.session!);setTurn(null);}
      });
    }catch(e){
      if(g!==generation.current||active.current?.id!==s.id)return;
      const detail=e instanceof Error?e.message:'回复连接中断，请重试。';
      setTurn(old=>old?.requestId===requestId?{...old,phase:'failed',reply:'',error:detail}:old);
      try{
        const next=await api.get(s.id,AbortSignal.timeout(5000));
        if(g===generation.current&&active.current?.id===s.id){
          update(next);const id=next.messages.find(m=>m.request_id===requestId)?.id??null;
          setTurn(old=>old?.requestId===requestId?{...old,acceptedId:id}:old);
        }
      }catch{/* Keep the visible message and retry action when offline. */}
    }finally{if(streamLock.current===requestId)streamLock.current=null;if(g===generation.current)setBusy(false);}
  },[update]);
  const retryTurn=async()=>{
    if(!turn||turn.phase!=='failed'||busy||needsCalibration)return;
    try{const latest=await api.get(turn.sessionId,AbortSignal.timeout(5000));if(active.current?.id===latest.id){update(latest);await runStream(latest,turn.text,turn.event,turn.requestId);}}
    catch(e){setTurn(old=>old?{...old,error:e instanceof Error?e.message:'暂时无法连接，请重试。'}:old);}
  };

  const control=useCallback(async(action:Action,extra:{text?:string;consent?:Consent}={})=>{
    const current=active.current;if(!current)return;
    if(action==='correct'&&!extra.text){setCorrection('');return;}
    const generates=['open','hint','answer','continue','skip','correct'].includes(action);
    const priority=['end','pause','think','reject','consent','correct'].includes(action);
    if(busy&&!priority)return;
    if(generates){if(action==='correct')streamLock.current=null;await runStream(current,extra.text||'',action as StreamEvent);return;}
    streamLock.current=null;setTurn(null);
    const g=++generation.current;abort.current?.abort();abort.current=new AbortController();
    setBusy(generates);setError('');
    try{
      const next=await api.control(current,action,extra);
      if(g!==generation.current||active.current?.id!==current.id)return;
      update(next);if(action==='end')setView('learning');
    }catch(e){if(g===generation.current){report(e);try{const next=await api.get(current.id);if(g===generation.current&&active.current?.id===current.id)update(next);}catch{}}}
    finally{if(g===generation.current)setBusy(false);}
  },[update,busy,runStream]);
  useEffect(()=>{
    if(!needsCalibration)return;
    generation.current++;abort.current?.abort();streamLock.current=null;setTurn(old=>suspendTurnForCalibration(old,session?.id));setBusy(false);
    if(session&&!session.messages.length)openingAttempted.current.delete(session.id);
  },[needsCalibration,session?.id]);
  useEffect(()=>{
    if(view==='learning'&&!needsCalibration&&session?.status==='active'&&!session.messages.length&&!busy&&data?.capabilities.ai_configured&&!openingAttempted.current.has(session.id)){
      openingAttempted.current.add(session.id);void control('open');
    }
  },[view,session,busy,needsCalibration,data?.capabilities.ai_configured,control]);
  const navigate=async(next:View)=>{
    generation.current++;abort.current?.abort();streamLock.current=null;setTurn(null);setBusy(false);setError('');
    const s=active.current;
    if(s?.status==='active')await control('pause');
    setView(next);
  };
  const newLearning=()=>{void navigate('tasks').then(()=>{setSession(null);setDraft('');});};
  const openSession=async(s:LearningSession)=>{await navigate('learning');setDraft('');try{update(await api.get(s.id));}catch(e){report(e);}};
  const start=async(consent:Consent)=>{
    if(!selected)return;setBusy(true);
    try{update(await api.create(selected.id,consent));setDraft('');setView('learning');setError('');}catch(e){report(e);}finally{setBusy(false);}
  };
  const send=async()=>{
    const s=active.current;if(!s||busy||needsCalibration||streamLock.current||!draft.trim())return;
    const text=draft.trim();setDraft('');await runStream(s,text);
  };
  const end=()=>{void control('end');setView('learning');};
  const cameraAllowed=!!(session&&view==='learning'&&session.status==='active'&&session.consent.camera&&session.support_mode==='on');
  const camera=<CameraPreview sessionId={session?.id} onAnalysis={updateCameraAnalysis} retrySignal={cameraRetry} closeSignal={cameraClose} alerts={session?.camera_alerts} allowed={cameraAllowed} collapseSignal={collapseSignal} onOpen={async()=>{
    if(!session?.consent.support){await navigate('settings');return;}
    await control('consent',{consent:{support:true,camera:true}});
  }} onLive={setCameraLive} onClose={()=>control('consent',{consent:{support:session?.consent.support||false,camera:false}})}/>;

  return <Shell sessions={data?.sessions||[]} current={session} cameraLive={cameraLive} onNew={newLearning} onOpen={s=>void openSession(s)} onRename={s=>setHistoryAction({mode:'rename',session:s})} onDelete={s=>setHistoryAction({mode:'delete',session:s})} onAISettings={()=>void navigate('ai-settings')} onPrivacy={()=>void navigate('privacy')} onEnd={end}>
    {error&&<div className="global-notice"><Notice>{error}<button onClick={()=>setError('')} aria-label="关闭提示">关闭</button></Notice></div>}
    {!data?<section className="content-page"><div className="readable"><h1>学习助手</h1><p className="muted">{error?'学习服务暂时不可用。':'正在准备学习空间…'}</p>{error&&<Button onClick={()=>void refresh()}>重试连接</Button>}</div></section>:<>
      {view==='ai-settings'&&<AIConnectionSettings onBack={()=>setView(session?'learning':'tasks')} onConfigured={()=>void refresh()}/>}
      {view==='tasks'&&<TaskSelector tasks={data.tasks} onSelect={t=>{setSelected(t);setView('consent');}}/>}
      {view==='consent'&&selected&&<ConsentPanel title={selected.title} aiConfigured={data.capabilities.ai_configured} busy={busy} onSubmit={c=>void start(c)} onBack={()=>setView('tasks')} onAISettings={()=>setView('ai-settings')}/>}
      {view==='settings'&&(session?.status==='active'?<ConsentPanel key={session.id+':settings'} title={session.title} settings initial={session.consent} aiConfigured={data.capabilities.ai_configured} busy={busy} onSubmit={c=>void control('consent',{consent:c}).then(()=>setView('learning'))} onBack={()=>setView('learning')} onAISettings={()=>setView('ai-settings')}/>:<section className="content-page"><div className="readable stack-20"><p className="eyebrow">随时可更改</p><h1>学习设置</h1><p className="muted">选择任务后，你可以分别决定是否开启主动支持与摄像头。</p><div className="actions"><Button onClick={newLearning}>选择学习任务</Button><Button onClick={()=>setView('ai-settings')}>AI 接口设置</Button></div></div></section>)}
      {view==='learning'&&session&&(session.status==='ended'?<SessionSummary session={session} onHome={newLearning} onPrivacy={()=>setView('privacy')}/>:<>
        {needsCalibration?<LessonPreparation title={session.title} camera={cameraAnalysis?.sessionId===session.id?cameraAnalysis:null} busy={busy} onRetry={()=>setCameraRetry(v=>v+1)} onDisableCamera={()=>setCameraClose(v=>v+1)}/>:<>
          <Conversation session={session} configured={data.capabilities.ai_configured} onAISettings={()=>void navigate('ai-settings')} turn={turn} onRetry={()=>void retryTurn()} busy={busy} onAction={a=>void control(a)} onReading={setReading}/>
          <Composer draft={draft} onChange={setDraft} onSend={()=>void send()} onHint={()=>void control('hint')} onComposing={setComposing} busy={busy} configured={data.capabilities.ai_configured} onFocus={()=>setCollapseSignal(v=>v+1)}/>
        </>}
        {camera}
      </>)}
      {view==='privacy'&&<section className="content-page"><div className="readable stack-20"><p className="eyebrow">由你掌控</p><h1>隐私与数据说明</h1><div className="info-block"><strong>文字与学习记录</strong><p>只有点击发送的文字会进入产品服务。草稿保留在当前页面内存；刷新或离开会清除。访客身份以浏览器 Cookie 区分，请勿在公共设备上共享同一浏览器档案。</p></div><div className="info-block"><strong>摄像头</strong><p>视频和人脸关键点只在浏览器内处理，不发送、不保存。眨眼频率、视线偏移和头部运动特征通过本机后端的视觉引擎判定，临时保存在内存；当前有效状态摘要会提供给你配置的AI服务。视觉行为提示不等于情绪或心理诊断。收起仅隐藏预览；关闭、后台或结束会停采并关闭视觉连接。</p></div><div className="info-block"><strong>AI 服务与保留期限</strong><p>连接 AI 后，已提交文字、近期对话、当前练习及有依据的自述状态会发送至配置的第三方服务。该服务的保存与训练设置须由接入者核实。当前本地学习记录保留至你主动删除，没有自动清理期限。</p></div><div className="actions"><Button onClick={()=>setView(session?'learning':'tasks')}>返回</Button>{session&&<><a className="button secondary" href={`/api/sessions/${session.id}/export`} download>导出这次学习</a><Button variant="ghost" onClick={()=>setHistoryAction({mode:'delete',session})}>删除这次学习记录</Button></>}</div><p className="caption muted">删除只覆盖本产品存储；已发送至第三方服务的记录需按服务商规则另行处理。</p></div></section>}
    </>}
    {correction!==null&&<Dialog titleId="correction-title" onClose={()=>setCorrection(null)}><h2 id="correction-title">纠正我的理解</h2><p className="muted">以你的说明为准，当前题目会保留。</p><textarea autoFocus aria-label="你的纠正" value={correction} maxLength={1000} onChange={e=>setCorrection(e.target.value)} placeholder="其实，我现在是这样想的…"/><div className="actions"><Button variant="primary" disabled={!correction.trim()} onClick={()=>{const text=correction;setCorrection(null);void control('correct',{text});}}>确认纠正</Button><Button onClick={()=>setCorrection(null)}>返回</Button></div></Dialog>}
    {historyAction&&<SessionHistoryDialog key={historyAction.mode+historyAction.session.id} action={historyAction} onClose={()=>setHistoryAction(null)} onRenamed={title=>{
      setSession(old=>old?applySessionTitle(old,title):old);
      setData(d=>d?{...d,sessions:d.sessions.map(s=>applySessionTitle(s,title))}:d);
    }} onDeleted={id=>{
      deletedSessions.current.add(id);
      if(active.current?.id===id){generation.current++;abort.current?.abort();active.current=null;streamLock.current=null;setTurn(null);setSession(null);setDraft('');setBusy(false);setCorrection(null);setView('tasks');setError('');}
      setData(d=>d?{...d,sessions:d.sessions.filter(s=>s.id!==id)}:d);
    }}/>}

  </Shell>;
}
