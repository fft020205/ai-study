"""Deterministic providers are test-only; production SSE forwards actual upstream chunks."""
import asyncio,json,uuid
import httpx,pytest
from fastapi.testclient import TestClient
from study.ai import TeachingService,OpenAIProvider,AIProtocolError,AIUnavailable
from study.config import Settings
from study.main import create_app
from study.learning import new_session
from study.contracts import Consent
from study.stream_protocol import ReplyTextDecoder,StreamFormatError
from conftest import TestProvider,create


def reply(text='真实增量合同测试'):
    return dict(reply=text,focus_id='copy',move='reflect',exercise_action='keep',exercise=None,assistance='none')

class StreamProvider(TestProvider):
    __test__=False
    async def stream_json(self,system,payload):
        self.calls.append((system,payload))
        text=json.dumps(reply(),ensure_ascii=False)
        for i in range(0,len(text),3):yield text[i:i+3];await asyncio.sleep(0)


def events(text):
    result=[]
    for frame in text.split('\n\n'):
        name=None;data=[]
        for line in frame.splitlines():
            if line.startswith('event: '):name=line[7:]
            if line.startswith('data: '):data.append(line[6:])
        if name and data:result.append((name,json.loads('\n'.join(data))))
    return result


def test_reply_decoder_keeps_private_fields_out_and_decodes_split_unicode():
    text=json.dumps({'exercise':{'reply':'PRIVATE','reference':'SECRET'},'reply':'你好\n"解释"😀'},ensure_ascii=True)
    decoder=ReplyTextDecoder();deltas=[decoder.feed(c) for c in text]
    assert ''.join(deltas)=='你好\n"解释"😀'
    assert 'SECRET' not in ''.join(deltas) and 'PRIVATE' not in ''.join(deltas)
    with pytest.raises(StreamFormatError):ReplyTextDecoder().feed('{"reply":"a","reply":"b"}')
    with pytest.raises(StreamFormatError):ReplyTextDecoder().feed('{"reply":"'+('a'*4001))


async def test_openai_sse_is_consumed_incrementally_and_does_not_expose_reasoning(monkeypatch):
    import study.ai as module
    received=[];observed=[]
    class Body(httpx.AsyncByteStream):
        async def __aiter__(self):
            for content in ['{"reply":"你','好","focus_id":"copy","move":"reflect","exercise_action":"keep"}']:
                frame={'choices':[{'delta':{'content':content,'reasoning_content':'PRIVATE_REASONING'},'finish_reason':None}]}
                yield ('data: '+json.dumps(frame,ensure_ascii=False)+'\n\n').encode();await asyncio.sleep(0)
            yield b'data: [DONE]\n\n'
    def handler(request):received.append(request);return httpx.Response(200,headers={'content-type':'text/event-stream'},stream=Body())
    original=httpx.AsyncClient
    monkeypatch.setattr(module.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),**kw))
    provider=OpenAIProvider(Settings(ai_api_key='test-only',ai_model='test-model',_env_file=None))
    async def delta(text):observed.append(text)
    _,result,_=await TeachingService(provider).respond(new_session('variable',Consent()),event='open',on_delta=delta)
    assert observed==['你','好'] and result.reply=='你好'
    assert json.loads(received[0].content)['stream'] is True
    assert 'PRIVATE_REASONING' not in ''.join(observed)


async def test_stream_rejects_truncated_upstream_and_redacts_provider_errors(monkeypatch):
    import study.ai as module
    original=httpx.AsyncClient
    class Truncated(httpx.AsyncByteStream):
        async def __aiter__(self):yield b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
    transport=httpx.MockTransport(lambda req:httpx.Response(200,headers={'content-type':'text/event-stream'},stream=Truncated()))
    monkeypatch.setattr(module.httpx,'AsyncClient',lambda **kw:original(transport=transport,**kw))
    provider=OpenAIProvider(Settings(ai_api_key='test-secret',ai_model='model',_env_file=None))
    with pytest.raises(AIUnavailable):
        async for _ in provider.stream_json('JSON',{}):pass


def test_stream_accepts_once_then_sends_only_reply_and_commits_atomically(tmp_path):
    provider=StreamProvider();app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/stream.db',_env_file=None),provider=provider)
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        s=create(client,opening=False);request_id=str(uuid.uuid4())
        body={'text':'你好','version':s['version'],'request_id':request_id}
        response=client.post(f"/api/sessions/{s['id']}/turns/stream",json=body)
        assert response.status_code==200 and response.headers['content-type'].startswith('text/event-stream')
        output=events(response.text);assert output[0][0]=='accepted' and output[1][0]=='status'
        accepted=output[0][1]['session'];assert accepted['messages'][-1]['text']=='你好' and accepted['pending']
        deltas=[data['text'] for name,data in output if name=='delta'];assert ''.join(deltas)=='真实增量合同测试' and len(deltas)>1
        assert 'SECRET' not in response.text and 'reference' not in response.text and 'rubric' not in response.text
        final=output[-1][1]['session'];assert output[-1][0]=='complete' and not final['pending']
        assert [m['role'] for m in final['messages']]==['user','assistant']
        assert final['messages'][0]['request_id']==request_id
        assert provider.calls[0][1]['history']==[]  # Submitted text is not duplicated in model history.
        calls=len(provider.calls)
        replay=client.post(f"/api/sessions/{s['id']}/turns/stream",json=body)
        assert events(replay.text)[0][0]=='complete' and len(provider.calls)==calls
        assert client.post(f"/api/sessions/{s['id']}/turns/stream",json=body|{'text':'不同内容'}).status_code==409


def test_streamed_final_objective_ends_session_and_cleans_up_support_and_vision(tmp_path):
    import hashlib
    provider=StreamProvider();app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/milestone-stream.db',_env_file=None),provider=provider)
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        client.get('/api/bootstrap');s=create(client,support=True,opening=False)
        owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest()
        state=app.state.repo.get(owner,s['id']);version=state['version']
        state['focus_id']='swap'
        state['records']=[{'node_id':'copy','exercise_id':'q1','status':'completed_independently','hints':0},
            {'node_id':'overwrite','exercise_id':'q2','status':'completed_with_hint','hints':1}]
        state['exercise']={'id':'q3','prompt':'交换前怎样保留旧值？','reference':'覆盖前暂存','rubric':'说明覆盖前暂存'}
        app.state.repo.save(owner,state,version);s['version']=state['version']
        app.state.policy.windows[s['id']]='test-window';app.state.policy.state_windows[s['id']]='test-state-window'
        stops=[];original_stop=app.state.vision.stop
        async def observed_stop(*args,**kwargs):
            stops.append((args,kwargs));await original_stop(*args,**kwargs)
        app.state.vision.stop=observed_stop
        response=client.post(f"/api/sessions/{s['id']}/turns/stream",json={'text':'覆盖前暂存旧值','version':s['version'],'request_id':str(uuid.uuid4())})
        output=events(response.text);assert output[-1][0]=='complete'
        final=output[-1][1]['session']
        assert final['status']=='ended' and final['milestone_reached'] and not final['ready']
        assert final['current_node']['title']=='暂存与迁移' and final['support_mode']=='off' and not final['consent']['camera']
        assert final['records'][-1]['node_id']=='swap' and final['messages'][-1]['text']=='真实增量合同测试'
        assert provider.calls[-1][1]['milestone']['reached']
        assert s['id'] not in app.state.policy.windows and s['id'] not in app.state.policy.state_windows
        assert stops==[((owner,s['id']),{'keep_calibration':False})]
        later=client.post(f"/api/sessions/{s['id']}/turns/stream",json={'text':'继续','version':final['version'],'request_id':str(uuid.uuid4())})
        assert later.status_code==409


def test_failed_reply_can_retry_without_duplicate_user_message(tmp_path):
    class FailOnce(StreamProvider):
        fail=True
        async def stream_json(self,system,payload):
            if self.fail:
                self.fail=False;yield '{"reply":"未完成';raise AIUnavailable('测试上游中断')
            async for part in super().stream_json(system,payload):yield part
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/retry.db',_env_file=None),provider=FailOnce())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        s=create(client,opening=False);body={'text':'你好','version':s['version'],'request_id':str(uuid.uuid4())}
        first=events(client.post(f"/api/sessions/{s['id']}/turns/stream",json=body).text)
        assert first[-1][0]=='error'
        state=client.get(f"/api/sessions/{s['id']}").json();assert not state['pending'] and len(state['messages'])==1
        second=events(client.post(f"/api/sessions/{s['id']}/turns/stream",json=body).text)
        assert second[-1][0]=='complete' and len(second[-1][1]['session']['messages'])==2


async def test_user_is_saved_before_slow_ai_and_end_cancels_partial_reply(tmp_path):
    entered=asyncio.Event();release=asyncio.Event()
    class Slow(StreamProvider):
        async def stream_json(self,system,payload):
            yield '{"reply":"进行中的正文';entered.set();await release.wait()
            yield '","focus_id":"copy","move":"reflect","exercise_action":"keep"}'
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/cancel-stream.db',_env_file=None),provider=Slow())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as client:
        await client.get('/api/bootstrap');s=(await client.post('/api/sessions',json={'task_id':'variable'})).json()
        pending=asyncio.create_task(client.post(f"/api/sessions/{s['id']}/turns/stream",json={'text':'立刻可见','version':s['version'],'request_id':str(uuid.uuid4())}))
        await asyncio.wait_for(entered.wait(),2)
        current=(await client.get(f"/api/sessions/{s['id']}")).json()
        assert current['messages'][-1]['text']=='立刻可见' and current['pending']
        ended=await client.post(f"/api/sessions/{s['id']}/controls",json={'action':'end','version':s['version']})
        assert ended.status_code==200
        release.set()
        result=await asyncio.wait_for(pending,2)
        final=(await client.get(f"/api/sessions/{s['id']}")).json()
        assert final['status']=='ended' and [m['role'] for m in final['messages']]==['user'] and not final['pending']
        assert not any(name=='complete' for name,_ in events(result.text))


def test_stream_requires_origin_owner_and_configured_provider(fixture_app):
    client,app,_=fixture_app;s=create(client,opening=False);body={'text':'你好','version':s['version'],'request_id':str(uuid.uuid4())}
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as other:
        assert other.post(f"/api/sessions/{s['id']}/turns/stream",json=body).status_code==404
    assert client.post(f"/api/sessions/{s['id']}/turns/stream",headers={'Origin':'https://wrong.example'},json=body).status_code==403


def test_streamed_correction_is_saved_once_and_without_ai_still_applies(tmp_path):
    from study.ai import UnconfiguredProvider
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/correct-stream.db',_env_file=None),provider=UnconfiguredProvider())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        s=create(client,opening=False);body={'event':'correct','text':'我没有信息过载','version':s['version'],'request_id':str(uuid.uuid4())}
        response=client.post(f"/api/sessions/{s['id']}/turns/stream",json=body)
        result=events(response.text)[-1][1]['session']
        assert result['protected'] and result['messages'][0]['source']=='correction' and not result['pending']
        assert events(client.post(f"/api/sessions/{s['id']}/turns/stream",json=body).text)[-1][1]['session']['messages']==result['messages']


async def test_disconnected_stream_clears_pending_and_keeps_accepted_message(tmp_path):
    entered=asyncio.Event()
    class Slow(StreamProvider):
        async def stream_json(self,system,payload):
            yield '{"reply":"半条回复';entered.set();await asyncio.Event().wait()
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/disconnect.db',_env_file=None),provider=Slow())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as client:
        await client.get('/api/bootstrap');s=(await client.post('/api/sessions',json={'task_id':'variable'})).json()
        task=asyncio.create_task(client.post(f"/api/sessions/{s['id']}/turns/stream",json={'text':'保留这句','version':s['version'],'request_id':str(uuid.uuid4())}))
        await asyncio.wait_for(entered.wait(),2);task.cancel()
        with pytest.raises(asyncio.CancelledError):await task
        for _ in range(3):await asyncio.sleep(0)
        state=(await client.get(f"/api/sessions/{s['id']}")).json()
        assert not state['pending'] and [m['text'] for m in state['messages']]==['保留这句']


def test_invalid_final_schema_does_not_commit_a_provisional_answer(tmp_path):
    class Invalid(StreamProvider):
        async def stream_json(self,system,payload):
            yield json.dumps(reply()|{'focus_id':'outside-course'})
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/invalid.db',_env_file=None),provider=Invalid())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        s=create(client,opening=False)
        response=client.post(f"/api/sessions/{s['id']}/turns/stream",json={'text':'你好','version':s['version'],'request_id':str(uuid.uuid4())})
        assert events(response.text)[-1][0]=='error'
        state=client.get(f"/api/sessions/{s['id']}").json()
        assert not state['pending'] and [m['role'] for m in state['messages']]==['user']


def test_reading_and_typing_preserve_visible_support(fixture_app):
    import time,hashlib
    client,app,_=fixture_app;s=create(client,support=True)
    owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest()
    state=app.state.repo.get(owner,s['id']);version=state['version']
    state['episode']={'id':'shown','question_key':state['question_key'],'reason':'waiting','created_at':time.time(),'expires_at':time.time()+30,'text':'测试邀请'}
    app.state.repo.save(owner,state,version)
    body={'version':state['version'],'foreground':True,'has_draft':False,'composing':False,'busy':False,'reading':True}
    shown=client.post(f"/api/sessions/{s['id']}/activity",json=body).json()
    assert shown['episode']['id']=='shown'
    hidden=client.post(f"/api/sessions/{s['id']}/activity",json=body|{'has_draft':True}).json()
    assert hidden['episode']['id']=='shown'
