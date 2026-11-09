import asyncio
import hashlib
import json
import copy
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
from urllib.parse import urlsplit
from .ai_connection import AIConnection, AIConnectionUpdate, ConnectionSettingsError, is_loopback
from pydantic import ValidationError
from .config import settings
from .contracts import CreateSession, RenameSession, Answer, StreamAnswer, Control, Activity, VisionStart
from .storage import Repository, Conflict, Missing
from .policy import SupportPolicy
from .support import support_context,episode_context,support_key,record_support_attempt,record_support_generation
from .tasks import task_catalog
from .learning import new_session, public_session, apply_control, message, ensure_dialogue, commit_dialogue, AI_ACTIONS, clear_unshown_episode
from .stream_response import ManagedStreamResponse
from .vision import VisionService, VisionPacket, VisionRejected, VisionSampleRejected, VisionUnavailable, CalibrationRequired, permitted
from .ai import make_provider, TeachingService, AIUnavailable, AIProtocolError

def create_app(config=settings, repository=None, provider=None):
    repo=repository or Repository(config.database_url)
    connection=AIConnection(config, load_saved=provider is None)
    ai=TeachingService(provider or make_provider(connection.current))
    policy=SupportPolicy(config)
    vision=VisionService(config.vision_enabled,calibration_cache_seconds=config.vision_calibration_cache_seconds)
    running={}
    @asynccontextmanager
    async def lifespan(app):
        async def prune_calibrations():
            while True:
                await asyncio.sleep(30)
                vision.prune()
        cleanup=asyncio.create_task(prune_calibrations())
        try:
            # Server restart invalidates in-flight results rather than leaving a stuck UI.
            yield
        finally:
            cleanup.cancel()
            try:await cleanup
            except asyncio.CancelledError:pass
            for task in list(running.values()):task.cancel()
            for owner,sid in list(vision.runs):await vision.stop(owner,sid)
            vision.calibrations.entries.clear()

    app=FastAPI(title='AI Study Product API',version='0.2.0',lifespan=lifespan)
    app.state.repo=repo;app.state.policy=policy;app.state.vision=vision
    app.state.ai_connection=connection

    @app.middleware('http')
    async def identity(request: Request, call_next):
        origin=request.headers.get('origin')
        if request.url.path.startswith('/api/settings/ai'):
            forwarded = request.headers.get('x-forwarded-for', '').split(',')
            allowed = {o.strip() for o in config.allowed_origins.split(',')}
            local_origin = not origin or (origin in allowed and is_loopback(urlsplit(origin).hostname))
            if (not config.ai_settings_enabled or not request.client or not is_loopback(request.client.host)
                or not is_loopback(request.url.hostname) or not local_origin
                or any(ip.strip() and not is_loopback(ip.strip()) for ip in forwarded)
                or request.headers.get('x-study-client') != 'web-v1'):
                return JSONResponse({'detail':'AI 接口设置仅限本机访问。'},status_code=403)
        if request.method not in ('GET','HEAD','OPTIONS'):
            if request.headers.get('x-study-client')!='web-v1' or (origin and origin not in config.allowed_origins.split(',')):
                return JSONResponse({'detail':'请求来源无效。'},status_code=403)
        token=request.cookies.get('study_identity')
        fresh=not token or len(token)!=64
        if fresh: token=secrets.token_hex(32)
        request.state.owner=hashlib.sha256(token.encode()).hexdigest()
        result=await call_next(request)
        if fresh: result.set_cookie('study_identity',token,max_age=60*60*24*30,httponly=True,secure=config.cookie_secure,samesite='strict')
        result.headers['Cache-Control']='no-store, no-transform' if result.headers.get('content-type','').startswith('text/event-stream') else 'no-store'
        return result

    @app.exception_handler(RequestValidationError)
    async def validation(request, exc):
        if request.url.path.startswith('/api/settings/ai'):
            # Validation inputs may contain a key; never return Pydantic's input field.
            return JSONResponse({'detail':'配置格式无效，请检查地址、密钥、模型名和超时（1–120秒）。'},status_code=422)
        from fastapi.exception_handlers import request_validation_exception_handler
        return await request_validation_exception_handler(request,exc)

    @app.exception_handler(ConnectionSettingsError)
    async def connection_error(request, exc):
        return JSONResponse({'detail':str(exc)},status_code=400)

    @app.get('/api/settings/ai', tags=['AI 接口设置'])
    def read_ai_connection():
        return connection.public()

    @app.put('/api/settings/ai', tags=['AI 接口设置'])
    async def save_ai_connection(body: AIConnectionUpdate):
        nonlocal ai
        replacement=await connection.save(body)
        ai=TeachingService(replacement)
        return connection.public()

    @app.post('/api/settings/ai/test', tags=['AI 接口设置'])
    async def test_ai_connection(body: AIConnectionUpdate):
        return await connection.test(body)

    @app.exception_handler(Missing)
    async def missing(request,exc): return JSONResponse({'detail':'未找到这次学习。'},status_code=404)
    @app.exception_handler(CalibrationRequired)
    async def calibration_required(request,exc):return JSONResponse({'detail':str(exc)},status_code=409)
    @app.exception_handler(Conflict)
    async def conflict(request,exc): return JSONResponse({'detail':'学习状态已更新，请刷新后继续。'},status_code=409)

    def get(request,sid):
        s=ensure_dialogue(repo.get(request.state.owner,sid))
        if s['pending'] and sid not in running:
            v=s['version'];s['pending']=None;s['pending_event']=None;clear_unshown_episode(s);repo.save(request.state.owner,s,v)
        return s

    def save(request,s,v):
        s['updated_at']=time.time();repo.save(request.state.owner,s,v)
        return public_session(s)

    def cancel(sid):
        policy.reset(sid)
        task=running.pop(sid,None)
        if task and task is not asyncio.current_task(): task.cancel()

    @app.get('/api/health')
    def health(): return {'status':'ok','ai_configured':ai.provider.configured,'provider':connection.current.ai_provider,'vision_configured':vision.enabled}

    @app.get('/api/bootstrap')
    def bootstrap(request: Request):
        return {'tasks':task_catalog(),'sessions':[public_session(s) for s in repo.list(request.state.owner)],'capabilities':{'ai_configured':ai.provider.configured,'camera':True,'visual_signals':True,'visual_analysis':vision.enabled,'acoustic_emotion':False,'voice_input':False,'research':False}}

    @app.post('/api/sessions',status_code=201)
    def create(body: CreateSession,request:Request):
        if body.consent.camera and not body.consent.support: body.consent.camera=False
        s=new_session(body.task_id,body.consent,body.language);repo.create(request.state.owner,s)
        return public_session(s)

    @app.get('/api/sessions/{sid}')
    def read(sid:str,request:Request): return public_session(get(request,sid))

    @app.patch('/api/sessions/{sid}',tags=['历史记录'])
    async def rename_session(sid:str,body:RenameSession,request:Request):
        return repo.rename(request.state.owner,sid,body.title)

    def fingerprint(text, event):
        return hashlib.sha256((event+'\0'+text).encode()).hexdigest()

    def clear_pending(request,sid,request_id,version):
        try:
            current=repo.get(request.state.owner,sid)
            if current['pending']==request_id and current['version']==version:
                current['pending']=None;current['pending_event']=None;clear_unshown_episode(current)
                save(request,current,version)
        except (Missing,Conflict):pass

    async def finish_generation(request, s, body, teaching, event, on_delta=None, submitted_id=None):
        sid=s['id'];started_version=s['version'];this_task=asyncio.current_task();stop_vision=False
        try:
            context=copy.deepcopy(s)
            if submitted_id:context['messages']=[m for m in context['messages'] if m['id']!=submitted_id]
            context['visual_observation']=vision.snapshot(request.state.owner,s)
            context['visual_observation'].pop('llm_judgment',None)
            if event=='support' and not policy.can_generate(context,episode_context(context,context['visual_observation'])):
                clear_pending(request,sid,body.request_id,started_version)
                return public_session(repo.get(request.state.owner,sid))
            assessment,reply,state=await teaching.respond(context,body.text,event,visual_snapshot=lambda:vision.snapshot(request.state.owner,s),on_delta=on_delta,
                before_request=lambda:vision.require_dialogue_ready(request.state.owner,s))
            current=ensure_dialogue(repo.get(request.state.owner,sid))
            if current['version']!=started_version or current['pending']!=body.request_id or current['status']!='active': raise Conflict()
            if reply is not None:vision.require_dialogue_ready(request.state.owner,current)
            if event=='support':
                # Activity heartbeats cancel pending support on new input, reading or leaving.
                # Do not publish if the browser stopped reporting activity while AI was working.
                last=activity_seen.get(sid,0)
                used=context['support_context_used']
                latest=episode_context(current,vision.snapshot(request.state.owner,current))
                shown=bool((current.get('episode') or {}).get('text'))
                if (time.time()-last>8 or current['support_mode']!='on' or current['protected']
                    or support_key(current,latest)!=support_key(context,used) or not policy.can_generate(current,used)
                    or (not shown and used['kind']=='general')):
                    current['pending']=None;current['pending_event']=None;clear_unshown_episode(current)
                    return save(request,current,started_version)
                if reply.visual_judgment:vision.record_judgment(request.state.owner,current,context['visual_observation'],reply.visual_judgment)
                current['episode'].update(text=reply.reply,title=reply.support_title,kind=used['kind'],question_key=current['question_key'],expires_at=None,
                    context_key=support_key(current,used),generated_turn=current.get('dialogue_turn',0),refresh_attempt_at=time.time())
                record_support_generation(current,used)
                current['pending']=None;current['pending_event']=None;clear_unshown_episode(current)
                if reply.assistance=='hint':current['hint_level']=min(2,current['hint_level']+1)
                if not shown:current['last_support_at']=time.time();current['episodes_count']+=1
            else:
                if reply is None:
                    if event=='message' and not submitted_id: message(current,'user',body.text,'submitted')
                    apply_control(current,Control(action=assessment.intent,version=started_version))
                    policy.reset(sid)
                    if assessment.intent in ('end','pause'):stop_vision=True
                else:
                    if reply.visual_judgment:vision.record_judgment(request.state.owner,current,context['visual_observation'],reply.visual_judgment)
                    commit_dialogue(current,assessment,reply,state,event,body.text,record_user=not submitted_id)
                current['requests'][body.request_id]=fingerprint(body.text,event)
                current['requests']=dict(list(current['requests'].items())[-100:])
            result=save(request,current,started_version)
            if stop_vision:await vision.stop(request.state.owner,sid,keep_calibration=current['status']=='active' and current['consent']['support'])
            return result
        except CalibrationRequired as exc:
            clear_pending(request,sid,body.request_id,started_version)
            if event=='support':return None
            raise HTTPException(409,str(exc))
        except asyncio.CancelledError:
            if submitted_id or on_delta is not None or event=='support':clear_pending(request,sid,body.request_id,started_version)
            if event=='support': return None
            raise HTTPException(409,'这条回复已因你的新操作取消。')
        except (AIUnavailable,AIProtocolError,ValidationError,TimeoutError) as exc:
            current=repo.get(request.state.owner,sid)
            if current['pending']==body.request_id and current['version']==started_version:
                v=current['version'];current['pending']=None;current['pending_event']=None
                if event=='support':clear_unshown_episode(current)
                save(request,current,v)
            if event=='support': return None  # No canned fallback for failed automatic support.
            raise HTTPException(502,str(exc) if isinstance(exc,(AIUnavailable,AIProtocolError)) else 'AI 返回格式不正确，输入已保留。')
        except (Conflict,Missing):
            if event=='support': return None
            raise
        finally:
            if running.get(sid) is this_task: running.pop(sid,None)

    def prepare(request,s,body,event):
        if body.language is not None:s['language']=body.language
        v=s['version'];s['pending']=body.request_id;s['pending_event']=event;s['pending_base_version']=body.version
        if event=='support': s['auto_base_version']=v
        else: s.pop('auto_base_version',None)
        if event=='message':clear_unshown_episode(s)
        elif event!='support':s['episode']=None
        if event not in ('support','correct'): s['protected']=False
        save(request,s,v)

    async def generate(request,sid,body,event=None,client_version=None):
        event=event or body.event;teaching=ai;s=get(request,sid)
        if body.request_id in s['requests']:
            known=s['requests'][body.request_id]
            if known!=fingerprint(body.text,event) and not (event=='message' and known==hashlib.sha256(body.text.encode()).hexdigest()):
                raise HTTPException(409,'相同请求标识不能对应不同内容。')
            return public_session(s)
        if event=='message' and not body.text.strip(): raise HTTPException(400,'请输入内容。')
        if s['status']!='active': raise HTTPException(409,'这次学习已经结束。')
        automatic_version=s.get('auto_base_version')
        if body.version!=s['version'] and not (automatic_version is not None and automatic_version<=body.version<=s['version']): raise Conflict()
        if event=='open' and s['messages']: return public_session(s)
        if event=='correct' and not vision.dialogue_ready(request.state.owner,s):return public_session(s)
        vision.require_dialogue_ready(request.state.owner,s)
        if not teaching.provider.configured: raise HTTPException(503,'AI 服务尚未连接。请配置第三方 API；你的输入已保留。')
        cancel(sid)
        if client_version is not None: body.version=client_version
        prepare(request,s,body,event)
        running[sid]=asyncio.current_task()
        return await finish_generation(request,s,body,teaching,event)

    @app.post('/api/sessions/{sid}/controls')
    async def control(sid:str,body:Control,request:Request):
        if body.action in AI_ACTIONS:
            return await generate(request,sid,Answer(version=body.version,request_id=str(uuid.uuid4()),event=body.action,language=body.language))
        # Safety controls are idempotent and valid even with a stale UI version.
        for _ in range(3):
            s=get(request,sid);v=s['version']
            priority=body.action in ('end','pause','suspend') or (body.action=='consent' and body.consent and (not body.consent.camera or not body.consent.support))
            pending_control = bool(s['pending']) and body.action in ('think','reject','correct') and body.version in (v-1,s.get('pending_base_version'))
            automatic_version=s.get('auto_base_version')
            automatic_control=automatic_version is not None and automatic_version<=body.version<=v
            if body.version!=v and not priority and not pending_control and not automatic_control: raise Conflict()
            s.pop('auto_base_version',None)
            if s['status']=='ended': return public_session(s)
            if body.language is not None:s['language']=body.language
            try: apply_control(s,body)
            except ValueError as exc: raise HTTPException(400,str(exc))
            try:
                result=save(request,s,v);cancel(sid)
                if body.action in ('end','pause','consent','suspend'):
                    await vision.stop(request.state.owner,sid,keep_calibration=s['status']=='active' and s['consent']['support'])
                if body.action=='correct' and ai.provider.configured:
                    return await generate(request,sid,Answer(text=body.text,version=s['version'],request_id=str(uuid.uuid4()),language=body.language),event='correct',client_version=body.version)
                return result
            except Conflict:
                if not priority: raise
        raise Conflict()

    @app.post('/api/sessions/{sid}/turns')
    async def turn(sid:str,body:Answer,request:Request):
        return await generate(request,sid,body)

    activity_seen={}
    @app.post('/api/sessions/{sid}/turns/stream',tags=['流式对话'],response_class=StreamingResponse,responses={200:{'content':{'text/event-stream':{'schema':{'type':'string'}}}}})
    async def turn_stream(sid:str,body:StreamAnswer,request:Request):
        owner=request.state.owner;teaching=ai;event=body.event;s=get(request,sid)
        fingerprint_value=fingerprint(body.text,event)
        def frame(name,data):return 'event: '+name+'\ndata: '+json.dumps(data,ensure_ascii=False)+'\n\n'
        if body.request_id in s['requests']:
            if s['requests'][body.request_id]!=fingerprint_value:raise HTTPException(409,'相同请求标识不能对应不同内容。')
            async def replay():yield frame('complete',{'session':public_session(s),'request_id':body.request_id})
            return StreamingResponse(replay(),media_type='text/event-stream',headers={'X-Accel-Buffering':'no','Cache-Control':'no-cache, no-transform'})
        if event in ('message','correct') and not body.text.strip():raise HTTPException(400,'请输入内容。')
        if s['status']!='active':raise HTTPException(409,'这次学习已经结束。')
        accepted=s.get('submitted_requests',{}).get(body.request_id)
        if accepted:
            if accepted['fingerprint']!=fingerprint_value:raise HTTPException(409,'相同请求标识不能对应不同内容。')
            if not s['messages'] or s['messages'][-1]['id']!=accepted['message_id']:raise HTTPException(409,'讨论已继续，请发送一条新消息。')
        automatic=s.get('auto_base_version')
        if s['pending'] and s.get('pending_event')!='support' and event!='correct':raise HTTPException(409,'上一条回复仍在生成，请稍后重试。')
        correcting=event=='correct' and body.version in (s['version'],s['version']-1,s.get('pending_base_version'))
        if not accepted and not correcting and body.version!=s['version'] and not (automatic is not None and automatic<=body.version<=s['version']):raise Conflict()
        if event=='open' and s['messages']:
            async def existing():yield frame('complete',{'session':public_session(s),'request_id':body.request_id})
            return StreamingResponse(existing(),media_type='text/event-stream')
        if event!='correct':vision.require_dialogue_ready(request.state.owner,s)
        if not teaching.provider.configured and event!='correct':raise HTTPException(503,'AI 服务尚未连接，请配置第三方 API 后重试。')
        cancel(sid)
        submitted_id=None
        if event in ('message','correct'):
            if accepted:submitted_id=accepted['message_id']
            else:
                if event=='correct':apply_control(s,Control(action='correct',text=body.text,version=s['version']))
                else:message(s,'user',body.text,'submitted')
                s['messages'][-1]['request_id']=body.request_id;submitted_id=s['messages'][-1]['id']
                s.setdefault('submitted_requests',{})[body.request_id]={'fingerprint':fingerprint_value,'message_id':submitted_id}
                s['submitted_requests']=dict(list(s['submitted_requests'].items())[-100:])
        if event=='correct' and (not teaching.provider.configured or not vision.dialogue_ready(request.state.owner,s)):
            s['requests'][body.request_id]=fingerprint_value
            s['requests']=dict(list(s['requests'].items())[-100:])
            result=save(request,s,s['version'])
            async def corrected():yield frame('complete',{'session':result,'request_id':body.request_id})
            return StreamingResponse(corrected(),media_type='text/event-stream')
        running[sid]=asyncio.current_task()
        try:prepare(request,s,body,event)
        except BaseException:
            running.pop(sid,None);raise
        started=s['version'];initial=public_session(s);queue=asyncio.Queue(maxsize=32);connected=asyncio.Event()
        async def delta(text):await queue.put(('delta',{'text':text,'request_id':body.request_id}))
        async def work():
            try:
                await asyncio.wait_for(connected.wait(),5)
                result=await finish_generation(request,s,body,teaching,event,on_delta=delta,submitted_id=submitted_id)
                await queue.put(('complete',{'session':result,'request_id':body.request_id}))
            except (HTTPException,Conflict,Missing) as exc:
                code=exc.status_code if isinstance(exc,HTTPException) else 404 if isinstance(exc,Missing) else 409
                detail=exc.detail if isinstance(exc,HTTPException) else '这条回复已因学习状态变化取消。'
                while not queue.empty():queue.get_nowait()
                queue.put_nowait(('error',{'detail':detail,'status':code,'request_id':body.request_id}))
            except asyncio.CancelledError:
                clear_pending(request,sid,body.request_id,started)
                while not queue.empty():queue.get_nowait()
                queue.put_nowait(('error',{'detail':'这条回复已取消。','status':409,'request_id':body.request_id}))
            except Exception:
                clear_pending(request,sid,body.request_id,started)
                if not asyncio.current_task().cancelling():await queue.put(('error',{'detail':'回复连接中断，请重试。','status':502,'request_id':body.request_id}))
            finally:
                if running.get(sid) is asyncio.current_task():running.pop(sid,None)
        worker=asyncio.create_task(work());running[sid]=worker
        async def events():
            try:
                connected.set()
                yield frame('accepted',{'session':initial,'message_id':submitted_id,'request_id':body.request_id})
                yield frame('status',{'phase':'thinking','request_id':body.request_id})
                while True:
                    try:name,data=await asyncio.wait_for(queue.get(),10)
                    except TimeoutError:yield ': keep-alive\n\n';continue
                    if name=='delta':
                        try:
                            current=repo.get(owner,sid)
                            active=(current['status']=='active' and vision.dialogue_ready(owner,current) and
                                ((current['version']==started and current['pending']==body.request_id) or
                                 (current['version']==started+1 and body.request_id in current['requests'])))
                        except Missing:active=False
                        if not active:
                            yield frame('error',{'detail':'这条回复已因你的新操作取消。','status':409,'request_id':body.request_id});break
                    yield frame(name,data)
                    if name in ('complete','error'):break
            finally:
                if not worker.done():worker.cancel()
                clear_pending(request,sid,body.request_id,started)
                try:await worker
                except (asyncio.CancelledError,HTTPException):pass
        async def close_stream():
            if not worker.done():worker.cancel()
            clear_pending(request,sid,body.request_id,started)
            try:await asyncio.wait_for(worker,1)
            except (asyncio.CancelledError,TimeoutError,HTTPException):pass
        return ManagedStreamResponse(events(),on_close=close_stream,media_type='text/event-stream',headers={'X-Accel-Buffering':'no','Cache-Control':'no-cache, no-transform'})

    @app.post('/api/sessions/{sid}/activity')
    async def activity(sid:str,body:Activity,request:Request):
        s=get(request,sid);now=time.time();activity_seen[sid]=now
        # Persist the preference only against a current version. An ordinary reply
        # keeps its language snapshot; a switch must not invalidate its stream.
        if (body.language is not None and body.language!=s.get('language','zh-CN')
            and body.version==s['version'] and s['status']=='active'
            and (not s['pending'] or s.get('pending_event')=='support')):
            was_support=s.get('pending_event')=='support'
            if was_support:
                s['pending']=None;s['pending_event']=None;clear_unshown_episode(s);cancel(sid)
            s['language']=body.language
            s.setdefault('auto_base_version',s['version'])
            save(request,s,s['version']);body.version=s['version']
            if was_support:return public_session(s)
        ready=vision.dialogue_ready(request.state.owner,s)
        inactive=body.has_draft or body.composing or body.busy or body.reading or not body.foreground or not ready
        if s.get('pending_event')=='support':
            if inactive:
                v=s['version'];s['pending']=None;s['pending_event']=None;clear_unshown_episode(s)
                save(request,s,v);cancel(sid)
            return public_session(s)
        if not ready:
            policy.reset(sid);return public_session(s)
        # Keep the current card while a changed, stable state is rewritten by the real model.
        visual=vision.snapshot(request.state.owner,s)
        reason=policy.observe(s,body,now,visual=visual) if ai.provider.configured else None
        refresh=policy.refresh(s,body,now,visual=visual) if ai.provider.configured else None
        if reason or refresh:
            if reason:
                target=support_context(s,visual,now,fallback='waiting' if reason=='waiting' else 'general')
                s['episode']={'id':str(uuid.uuid4()),'question_key':s['question_key'],'reason':reason,'kind':target['kind'],
                    'created_at':now,'expires_at':now+30,'text':None}
            else:target=refresh
            record_support_attempt(s,target,now)
            s['episode'].update(pending_context=target,refresh_attempt_at=now)
            body_ai=Answer(version=s['version'],request_id=str(uuid.uuid4()))
            prepare(request,s,body_ai,'support');policy.reset(sid)
            running[sid]=asyncio.create_task(finish_generation(request,s,body_ai,ai,'support'))
        return public_session(s)

    @app.post('/api/sessions/{sid}/vision/start',tags=['视觉判定'])
    async def start_vision(sid:str,request:Request,body:VisionStart|None=None):
        s=get(request,sid)
        try:return vision.start(request.state.owner,s,device_key=body.device_key if body else None,reset=body.reset if body else False)
        except VisionUnavailable as exc:raise HTTPException(503,str(exc))
        except VisionRejected as exc:raise HTTPException(409,str(exc))

    @app.get('/api/sessions/{sid}/vision',tags=['视觉判定'])
    def read_vision(sid:str,request:Request):
        return vision.snapshot(request.state.owner,get(request,sid))

    @app.websocket('/api/sessions/{sid}/vision/ws')
    async def vision_socket(websocket:WebSocket,sid:str):
        origin=websocket.headers.get('origin')
        cookie=websocket.cookies.get('study_identity','')
        if origin not in config.allowed_origins.split(',') or len(cookie)!=64:
            await websocket.close(code=4403);return
        owner=hashlib.sha256(cookie.encode()).hexdigest();run=None;retain_calibration=True
        try:
            s=repo.get(owner,sid)
            if not permitted(s):raise VisionRejected('视觉授权无效。')
            await websocket.accept()
            raw=await asyncio.wait_for(websocket.receive_text(),5)
            if len(raw)>4096:raise VisionRejected('视觉请求过大。')
            hello=json.loads(raw)
            if set(hello)!={'type','ticket'} or hello['type']!='hello':raise VisionRejected('视觉握手格式无效。')
            run=vision.attach(owner,s,hello['ticket'],websocket)
            await websocket.send_json({'type':'connected','data':vision.project(owner,run,s)})
            while True:
                try:raw=await asyncio.wait_for(websocket.receive_text(),1.5)
                except TimeoutError:
                    s=repo.get(owner,sid);vision.current(owner,s,run.run_id)
                    await websocket.send_json({'type':'analysis','data':vision.project(owner,run,s)});continue
                if len(raw)>4096:raise VisionRejected('视觉请求过大。')
                s=repo.get(owner,sid);vision.current(owner,s,run.run_id)
                packet=VisionPacket.model_validate_json(raw)
                try:run.observe(packet,vision.wall_time())
                except VisionSampleRejected:pass  # Drop delayed/batched frames, not the calibrated run.
                result=vision.project(owner,run,s)
                await websocket.send_json({'type':'analysis','data':result})
        except (WebSocketDisconnect,RuntimeError):pass
        except (VisionRejected,Missing,ValidationError,ValueError,TypeError,TimeoutError):
            retain_calibration=False
            try:await websocket.close(code=4409)
            except RuntimeError:pass
        finally:
            if run:vision.detach(owner,sid,run,remember=retain_calibration)

    @app.get('/api/sessions/{sid}/export')
    def export(sid:str,request:Request):
        s=get(request,sid)
        return {'schema_version':'1','session':public_session(s),'consent_log':s['consent_log']}

    @app.delete('/api/sessions/{sid}',status_code=204)
    async def delete_session(sid:str,request:Request):
        repo.delete(request.state.owner,sid);cancel(sid);activity_seen.pop(sid,None);await vision.stop(request.state.owner,sid)
        return Response(status_code=204)

    return app

app=create_app()
