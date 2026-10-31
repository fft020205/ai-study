import asyncio
import json
import pytest
from websockets.asyncio.server import serve
from study.ai import DeepTutorProvider,TeachingService,AIProtocolError,parse_json
from study.config import Settings
from study.tasks import TASKS

async def test_openai_compatible_endpoint_and_server_only_key(monkeypatch):
    import httpx
    import study.ai as module
    received=[]
    def handler(request):
        received.append(request)
        return httpx.Response(200,json={'choices':[{'message':{'content':'{"reply":"真实接口合同测试"}'}}]})
    client_type=httpx.AsyncClient
    monkeypatch.setattr(module.httpx,'AsyncClient',lambda **kw:client_type(transport=httpx.MockTransport(handler),**kw))
    p=module.OpenAIProvider(Settings(ai_base_url='https://provider.example/v1/',ai_api_key='test-only-key',ai_model='test-model',_env_file=None))
    assert await p.complete_json('只输出JSON',{'student_text':'test'})=={'reply':'真实接口合同测试'}
    assert str(received[0].url)=='https://provider.example/v1/chat/completions'
    assert received[0].headers['authorization']=='Bearer test-only-key'
    assert json.loads(received[0].content)['response_format']=={'type':'json_object'}

async def test_provider_error_body_is_not_leaked(monkeypatch):
    import httpx
    import study.ai as module
    client_type=httpx.AsyncClient
    transport=httpx.MockTransport(lambda req:httpx.Response(401,text='secret-key-debug'))
    monkeypatch.setattr(module.httpx,'AsyncClient',lambda **kw:client_type(transport=transport,**kw))
    p=module.OpenAIProvider(Settings(ai_api_key='test-only-key',ai_model='test-model',_env_file=None))
    with pytest.raises(module.AIUnavailable) as error:await p.complete_json('JSON',{})
    assert 'secret' not in str(error.value) and 'test-only-key' not in str(error.value)

def test_malformed_reply_rejected():
    with pytest.raises(AIProtocolError):parse_json('不是JSON')
    with pytest.raises(AIProtocolError):parse_json('[]')

async def test_deeptutor_actual_v2_wire_and_dedup():
    received=[]
    async def peer(ws):
        request=json.loads(await ws.recv());received.append(request)
        event={'type':'content','turn_id':'t1','seq':1,'content':'{"reply":"已收到"}'}
        await ws.send(json.dumps(event));await ws.send(json.dumps(event))
        await ws.send(json.dumps({'type':'done','turn_id':'t1','seq':2}))
    async with serve(peer,'127.0.0.1',0) as server:
        port=server.sockets[0].getsockname()[1]
        p=DeepTutorProvider(Settings(deeptutor_ws_url=f'ws://127.0.0.1:{port}',deeptutor_token='test-only',_env_file=None))
        assert await p.complete_json('Only JSON',{'input':'hello'})=={'reply':'已收到'}
    assert received[0]['protocol_version']=='2.0' and received[0]['type']=='start_turn'
    assert received[0]['config']=={} and 'cognitive_state' not in received[0]
    assert 'session_id' not in received[0] and not received[0]['tools']

async def test_grader_cannot_invent_evidence():
    from study.learning import new_session
    from study.contracts import Consent
    class BadEvidence:
        configured=True
        async def complete_json(self,system,payload):
            if 'exercise' in payload:
                return {'evaluation':dict(verdict='supported',evidence_quote='并未说过的话',misconception='',feedback='')}
            assert payload['verified_evaluation']['verdict']=='unknown'
            return dict(reply='请再说一步理由。',focus_id='copy',move='reflect',exercise_action='keep',exercise=None)
    s=new_session('variable',Consent());s['exercise']={'id':'q','prompt':'题目','reference':'答案','rubric':'判据'}
    evaluation,_,_=await TeachingService(BadEvidence()).respond(s,'4')
    assert evaluation.evaluation.verdict=='unknown'
