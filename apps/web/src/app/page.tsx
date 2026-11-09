'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
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
import {courseTitle,localizeSessionTitle} from '@/i18n/course';
import {localizeError} from '@/i18n/errors';
import {api} from '@/lib/api';
import {useAuth} from '@/features/auth/AuthGate';
import {readTurnStream} from '@/lib/turnStream';
import type {ActiveTurn} from '@/features/learning/activeTurn';
import type {Action,DialogueEvent,StreamEvent,Bootstrap,Consent,LearningSession,Task} from '@/lib/types';

type View='tasks'|'consent'|'learning'|'settings'|'ai-settings'|'privacy';
export default function Home(){
  const {t}=useTranslation();
  const auth=useAuth();
  const [data,setData]=useState<Bootstrap|null>(null),[session,setSession]=useState<LearningSession|null>(null),[selected,setSelected]=useState<Task|null>(null),[view,setView]=useState<View>('tasks');
  const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[composing,setComposing]=useState(false),[reading,setReading]=useState(false),[cameraLive,setCameraLive]=useState(false),[collapseSignal,setCollapseSignal]=useState(0);
  const [correction,setCorrection]=useState<string|null>(null),[historyAction,setHistoryAction]=useState<HistoryAction|null>(null);
  const active=useRef<LearningSession|null>(null);active.current=session;
  const [cameraAnalysis,setCameraAnalysis]=useState<CameraAnalysisState|null>(null),[cameraRetry,setCameraRetry]=useState(0),[cameraReset,setCameraReset]=useState(0),[cameraClose,setCameraClose]=useState(0);
  const updateCameraAnalysis=useCallback((next:CameraAnalysisState)=>{if(next.sessionId===active.current?.id)setCameraAnalysis(next);},[]);
  const preparedLesson=useRef<string|null>(null);
  const readinessScope=session?`${session.id}:${cameraReset}`:'';
  if(!session?.consent.camera||session.status!=='active')preparedLesson.current=null;
  else if(cameraAnalysis?.sessionId===session.id&&cameraAnalysis.observation?.lesson_ready===false)preparedLesson.current=null;
  else if(!needsLessonCalibration(session,cameraAnalysis))preparedLesson.current=readinessScope;
  const needsCalibration=needsLessonCalibration(session,cameraAnalysis,preparedLesson.current===readinessScope);
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
    const priority=['end','pause','suspend','think','reject','consent','correct'].includes(action);
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
    if(s?.status==='active')await control('suspend');
    setView(next);
  };
  const newLearning=()=>{void navigate('tasks').then(()=>{setSession(null);setDraft('');});};
  const openSession=async(s:LearningSession)=>{if(active.current?.id===s.id&&view==='learning')return;await navigate('learning');setDraft('');try{update(await api.get(s.id));}catch(e){report(e);}};
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
  const camera=<CameraPreview sessionId={session?.id} onAnalysis={updateCameraAnalysis} retrySignal={cameraRetry} recalibrateSignal={cameraReset} closeSignal={cameraClose} alerts={session?.camera_alerts} allowed={cameraAllowed} collapseSignal={collapseSignal} onOpen={async()=>{
    if(!session?.consent.support){await navigate('settings');return;}
    await control('consent',{consent:{support:true,camera:true}});
  }} onLive={setCameraLive} onClose={()=>control('consent',{consent:{support:session?.consent.support||false,camera:false}})}/>;

  return <Shell sessions={data?.sessions||[]} current={session} cameraLive={cameraLive} onNew={newLearning} onOpen={s=>void openSession(s)} onRename={s=>setHistoryAction({mode:'rename',session:s})} onDelete={s=>setHistoryAction({mode:'delete',session:s})} onAISettings={()=>void navigate('ai-settings')} onPrivacy={()=>void navigate('privacy')} onEnd={end}>
    {error&&<div className="global-notice"><Notice>{localizeError(error)}<button onClick={()=>setError('')} aria-label={t('loading.closeNotice')}>{t('loading.close')}</button></Notice></div>}
    {!data?<section className="content-page"><div className="readable"><h1>{t('loading.title')}</h1><p className="muted">{t(error?'loading.unavailable':'loading.preparing')}</p>{error&&<Button onClick={()=>void refresh()}>{t('loading.retry')}</Button>}</div></section>:<>
      {view==='ai-settings'&&<AIConnectionSettings onBack={()=>setView(session?'learning':'tasks')} onConfigured={()=>void refresh()}/>}
      {view==='tasks'&&<TaskSelector tasks={data.tasks} onSelect={selectedTask=>{setSelected(selectedTask);setView('consent');}}/>}
      {view==='consent'&&selected&&<ConsentPanel title={courseTitle(selected.id,selected.title)} aiConfigured={data.capabilities.ai_configured} busy={busy} onSubmit={c=>void start(c)} onBack={()=>setView('tasks')} onAISettings={()=>setView('ai-settings')}/>}
      {view==='settings'&&(session?.status==='active'?<ConsentPanel key={session.id+':settings'} title={localizeSessionTitle(session)} settings initial={session.consent} aiConfigured={data.capabilities.ai_configured} busy={busy} onSubmit={c=>void control('consent',{consent:c}).then(()=>setView('learning'))} onBack={()=>setView('learning')} onAISettings={()=>setView('ai-settings')}/>:<section className="content-page"><div className="readable stack-20"><p className="eyebrow">{t('consent.editable')}</p><h1>{t('consent.settingsTitle')}</h1><p className="muted">{t('consent.noSessionDescription')}</p><div className="actions"><Button onClick={newLearning}>{t('consent.chooseTask')}</Button><Button onClick={()=>setView('ai-settings')}>{t('common.aiSettings')}</Button></div></div></section>)}
      {view==='learning'&&session&&(session.status==='ended'?<SessionSummary session={session} onHome={newLearning} onPrivacy={()=>setView('privacy')}/>:<>
        {needsCalibration?<LessonPreparation title={localizeSessionTitle(session)} camera={cameraAnalysis?.sessionId===session.id?cameraAnalysis:null} busy={busy} onRetry={()=>setCameraRetry(v=>v+1)} onRecalibrate={()=>{preparedLesson.current=null;setCameraAnalysis(null);setCameraReset(v=>v+1);}} onDisableCamera={()=>setCameraClose(v=>v+1)}/>:<>
          <Conversation session={session} configured={data.capabilities.ai_configured} onAISettings={()=>void navigate('ai-settings')} turn={turn} onRetry={()=>void retryTurn()} busy={busy} onAction={a=>void control(a)} onReading={setReading}/>
          <Composer draft={draft} onChange={setDraft} onSend={()=>void send()} onHint={()=>void control('hint')} onComposing={setComposing} busy={busy} configured={data.capabilities.ai_configured} onFocus={()=>setCollapseSignal(v=>v+1)}/>
        </>}
        {camera}
      </>)}
      {view==='privacy'&&<section className="content-page"><div className="readable stack-20"><p className="eyebrow">{t('privacy.eyebrow')}</p><h1>{t('privacy.title')}</h1><div className="info-block"><strong>{t('privacy.textTitle')}</strong><p>{t(auth.required?'privacy.hostedTextBody':'privacy.textBody')}</p></div><div className="info-block"><strong>{t('privacy.cameraTitle')}</strong><p>{t(auth.required?'privacy.hostedCameraBody':'privacy.cameraBody')}</p></div><div className="info-block"><strong>{t('privacy.aiTitle')}</strong><p>{t(auth.required?'privacy.hostedAiBody':'privacy.aiBody')}</p></div><div className="actions"><Button onClick={()=>setView(session?'learning':'tasks')}>{t('common.back')}</Button>{session&&<><a className="button secondary" href={`/api/sessions/${session.id}/export`} download>{t('privacy.export')}</a><Button variant="ghost" onClick={()=>setHistoryAction({mode:'delete',session})}>{t('privacy.delete')}</Button></>}</div><p className="caption muted">{t('privacy.deletionNote')}</p></div></section>}
    </>}
    {correction!==null&&<Dialog titleId="correction-title" onClose={()=>setCorrection(null)}><h2 id="correction-title">{t('correction.title')}</h2><p className="muted">{t('correction.description')}</p><textarea autoFocus aria-label={t('correction.label')} value={correction} maxLength={1000} onChange={e=>setCorrection(e.target.value)} placeholder={t('correction.placeholder')}/><div className="actions"><Button variant="primary" disabled={!correction.trim()} onClick={()=>{const text=correction;setCorrection(null);void control('correct',{text});}}>{t('correction.confirm')}</Button><Button onClick={()=>setCorrection(null)}>{t('common.back')}</Button></div></Dialog>}
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
