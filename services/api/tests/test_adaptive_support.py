"""Test-only providers and temporary sessions: no real model, camera or user data."""
import asyncio
import hashlib
import importlib
from contextlib import asynccontextmanager
from types import SimpleNamespace
import uuid
import httpx
import pytest
from study.ai import AIUnavailable
from study.config import Settings
from study.contracts import Activity,Consent
from study.learning import new_session,public_session
from study.main import create_app
from study.policy import SupportPolicy
from study.support import support_context,support_key
from conftest import TestProvider


def claim(value,now=100,source='self_report'):
    return dict(value=value,quote='测试用户的当前自述',source=source,at=now,turn=0)


def test_support_context_combines_needs_respects_corrections_and_does_not_diagnose():
    s=new_session('variable',Consent(support=True))
    s['learner_state']={'fatigue':claim('present'),'cognitive_load':claim('high'),'cognition':claim('difficulty',source='task_answer')}
    context=support_context(s,now=100)
    assert context['kind']=='fatigue' and [v['kind'] for v in context['signals']]==['fatigue','cognitive_load','difficulty']
    s['learner_state']={'fatigue':claim('absent',source='correction')}
    visual=dict(valid=True,calibrated=True,support_hint='possible_fatigue')
    assert support_context(s,visual,100)['kind']=='general'
    assert support_context(s,visual,401)['signals']==[dict(kind='fatigue',source='visual_behavior',tentative=True)]
    assert support_context(s,visual|{'valid':False},401)['kind']=='general'
    assert support_context(s,visual|{'calibrated':False},401)['kind']=='general'
    s['learner_state']={'cognition':claim('difficulty',source='task_answer')}
    assert support_context(s,now=100)['kind']=='difficulty'
    assert support_context(s,now=99)['kind']=='general'
    s['dialogue_turn']=4
    assert support_context(s,now=101)['kind']=='general'


def test_support_refresh_requires_a_stable_change_and_never_calls_for_identical_samples():
    policy=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    context=support_context(s,now=100,fallback='waiting')
    s['episode']=dict(id='same-card',kind='waiting',created_at=100,text='测试旧卡',context_key=support_key(s,context))
    flags=Activity(version=0,foreground=True,has_draft=False,composing=False,busy=False,reading=False)
    for now in range(100,140,2):assert policy.refresh(s,flags,now) is None
    visual=dict(valid=True,calibrated=True,support_hint='possible_fatigue',cli=80)
    for now in range(140,146,2):assert policy.refresh(s,flags,now,visual) is None
    assert policy.refresh(s,flags,146,visual|{'cli':83})['kind']=='fatigue'
    # Typing retains the card but resets eligibility for any new rewrite.
    assert policy.refresh(s,flags.model_copy(update={'has_draft':True}),148,visual) is None
    assert s['episode']['id']=='same-card'
    assert policy.refresh(s,flags,150,visual) is None


class AdaptiveProvider(TestProvider):
    def __init__(self):
        super().__init__();self.hold=False;self.fail=False;self.hint=False
        self.entered=asyncio.Event();self.release=asyncio.Event()
    @property
    def supports(self):return [payload for _,payload in self.calls if payload.get('event')=='support']
    async def complete_json(self,system,payload):
        if payload.get('event')!='support':return await super().complete_json(system,payload)
        self.calls.append((system,payload))
        if self.hold:self.entered.set();await self.release.wait()
        if self.fail:raise AIUnavailable('测试刷新失败')
        kind=payload['proactive_context']['kind']
        return dict(reply=f'测试模型生成的 {kind} 支持与具体建议',support_title=f'测试标题 {kind}',focus_id=payload['focus']['id'],
            move='hint' if self.hint else 'invite',exercise_action='keep',exercise=None,assistance='hint' if self.hint else 'none')


@asynccontextmanager
async def environment(tmp_path,monkeypatch,provider=None):
    now=[100.0];clock=SimpleNamespace(time=lambda:now[0])
    for module in ('study.main','study.support','study.dialogue','study.learning'):
        monkeypatch.setattr(importlib.import_module(module),'time',clock)
    provider=provider or AdaptiveProvider()
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/adaptive.db',support_wait_seconds=0,_env_file=None),provider=provider)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as client:
        await client.get('/api/bootstrap')
        s=(await client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':False}})).json()
        s=(await client.post(f"/api/sessions/{s['id']}/turns",json=dict(event='open',version=s['version'],request_id=str(uuid.uuid4())))).json()
        owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest();sid=s['id']
        async def read():return (await client.get(f'/api/sessions/{sid}')).json()
        async def tick(**extra):
            current=await read()
            response=await client.post(f'/api/sessions/{sid}/activity',json=dict(version=current['version'],foreground=True,has_draft=False,composing=False,busy=False,reading=False)|extra)
            assert response.status_code==200,response.text
            return response.json()
        async def settle():
            for _ in range(20):
                await asyncio.sleep(0);current=await read()
                if not current['pending']:return current
            raise AssertionError('test model did not settle')
        def state(**claims):
            current=app.state.repo.get(owner,sid)
            current['learner_state']=claims
            app.state.repo.save(owner,current,current['version'])
        yield SimpleNamespace(app=app,client=client,provider=provider,now=now,owner=owner,sid=sid,read=read,tick=tick,settle=settle,state=state)


async def test_existing_card_adapts_across_states_without_duplicate_cards_or_episodes(tmp_path,monkeypatch):
    async with environment(tmp_path,monkeypatch) as env:
        await env.tick();initial=await env.settle();eid=initial['episode']['id']
        assert initial['episode']['kind']=='waiting'
        env.state(fatigue=claim('present',110))
        for now in range(110,116,2):
            env.now[0]=now;assert (await env.tick())['episode']['text']==initial['episode']['text']
        env.now[0]=116;await env.tick();fatigue=await env.settle()
        assert fatigue['episode']['kind']=='fatigue' and fatigue['episode']['title']=='测试标题 fatigue'
        for now in range(132,200,2):env.now[0]=now;await env.tick()
        assert len(env.provider.supports)==2
        env.now[0]=200;env.state(fatigue=claim('absent',200),cognitive_load=claim('high',200))
        for now in range(200,208,2):env.now[0]=now;await env.tick()
        load=await env.settle();assert load['episode']['kind']=='cognitive_load'
        assert env.provider.supports[-1]['previous_support']['text']==fatigue['episode']['text']
        env.now[0]=501
        for now in range(501,509,2):env.now[0]=now;await env.tick()
        limited=await env.settle();assert limited['episode']['kind']=='cognitive_load'
        assert len(env.provider.supports)==3
        current=await env.read()
        response=await env.client.post(f'/api/sessions/{env.sid}/turns',json=dict(text='我们继续讨论',version=current['version'],request_id=str(uuid.uuid4())))
        assert response.status_code==200
        for now in range(510,518,2):env.now[0]=now;await env.tick()
        neutral=await env.settle();assert neutral['episode']['kind']=='general'
        assert all(v['episode']['id']==eid for v in (fatigue,load,neutral))
        raw=env.app.state.repo.get(env.owner,env.sid)
        assert raw['episodes_count']==1 and len(env.provider.supports)==4
        assert 'pending_context' not in neutral['episode'] and 'context_key' not in neutral['episode']
        assert 'reference' not in str(neutral['episode'])


@pytest.mark.parametrize('action',['pause','failure'])
async def test_refresh_keeps_previous_card_when_interrupted_or_failed(tmp_path,monkeypatch,action):
    async with environment(tmp_path,monkeypatch) as env:
        await env.tick();old=(await env.settle())['episode']
        env.provider.hold=True;env.state(fatigue=claim('present',130))
        for now in range(130,138,2):env.now[0]=now;await env.tick()
        await asyncio.wait_for(env.provider.entered.wait(),1)
        assert (await env.read())['episode']['text']==old['text']
        if action=='pause':
            current=await env.read()
            await env.client.post(f'/api/sessions/{env.sid}/controls',json=dict(action='pause',version=current['version']))
        else:env.provider.fail=True;env.provider.release.set()
        after=await env.settle()
        assert after['episode'] is None if action=='pause' else after['episode']['text']==old['text']
        assert not after['pending']
        env.provider.release.set()


async def test_changed_visual_state_during_generation_cannot_publish_old_interpretation(tmp_path,monkeypatch):
    async with environment(tmp_path,monkeypatch) as env:
        await env.tick();old=(await env.settle())['episode']
        visual=dict(valid=True,calibrated=True,support_hint='possible_overload')
        monkeypatch.setattr(env.app.state.vision,'snapshot',lambda *args:dict(visual))
        env.provider.hold=True
        for now in range(130,138,2):env.now[0]=now;await env.tick()
        await asyncio.wait_for(env.provider.entered.wait(),1)
        assert env.provider.supports[-1]['proactive_context']['kind']=='cognitive_load'
        visual['support_hint']='possible_fatigue';env.provider.release.set()
        after=await env.settle()
        assert after['episode']['text']==old['text'] and after['episode']['kind']=='waiting'


async def test_visible_support_hint_counts_as_help_for_later_grading(tmp_path,monkeypatch):
    provider=AdaptiveProvider();provider.hint=True
    async with environment(tmp_path,monkeypatch,provider) as env:
        env.state(cognition=claim('difficulty'))
        await env.tick();s=await env.settle()
        assert s['episode']['kind']=='difficulty' and s['hint_level']==1
        response=await env.client.post(f'/api/sessions/{env.sid}/turns',json=dict(text='我理解了',version=s['version'],request_id=str(uuid.uuid4())))
        assert response.status_code==200,response.text
        assert response.json()['records'][0]['status']=='completed_with_hint'


async def test_new_cards_have_no_session_cap_and_each_normal_reply_resets_the_round(tmp_path,monkeypatch):
    async with environment(tmp_path,monkeypatch) as env:
        for index in range(5):
            current=await env.read()
            if index:
                response=await env.client.post(f'/api/sessions/{env.sid}/turns',json=dict(text=f'我继续回答{index}',version=current['version'],request_id=str(uuid.uuid4())))
                assert response.status_code==200
            raw=env.app.state.repo.get(env.owner,env.sid)
            env.state(cognition=claim('difficulty',env.now[0])|{'turn':raw['dialogue_turn']})
            await env.tick();shown=await env.settle()
            assert shown['episode']['kind']=='difficulty'
            choice=await env.client.post(f'/api/sessions/{env.sid}/controls',json=dict(action='think',version=shown['version']))
            assert choice.status_code==200 and choice.json()['episode'] is None
        raw=env.app.state.repo.get(env.owner,env.sid)
        assert raw['episodes_count']==5 and len(env.provider.supports)==5
        assert len(raw['support_round']['states'])==1


async def test_rapid_different_states_generate_without_global_cooldown_and_stop_at_three(tmp_path,monkeypatch):
    async with environment(tmp_path,monkeypatch) as env:
        env.state(cognition=claim('difficulty'));await env.tick();first=await env.settle()
        for start,dimension,value in [(101,'fatigue','present'),(108,'cognitive_load','high')]:
            env.state(**{dimension:claim(value,start)})
            for now in range(start,start+8,2):env.now[0]=now;await env.tick()
            await env.settle()
        raw=env.app.state.repo.get(env.owner,env.sid)
        assert len(env.provider.supports)==3 and len(raw['support_round']['states'])==3
        assert [p['proactive_context']['kind'] for p in env.provider.supports]==['difficulty','fatigue','cognitive_load']
        env.state(fatigue=claim('present',116),cognitive_load=claim('high',116))
        for now in range(116,150,2):env.now[0]=now;await env.tick()
        final=await env.settle()
        assert len(env.provider.supports)==3 and final['episode']['id']==first['episode']['id']
        assert 'support_round' not in final


@pytest.mark.parametrize('refresh',[False,True])
@pytest.mark.parametrize('flags',[{'has_draft':True,'composing':True},{'reading':True}])
async def test_triggered_support_finishes_while_typing_or_reading(tmp_path,monkeypatch,refresh,flags):
    async with environment(tmp_path,monkeypatch) as env:
        old=None
        if refresh:
            await env.tick();old=(await env.settle())['episode']
        env.now[0]=130
        env.state(fatigue=claim('present',130))
        env.provider.hold=True
        for now in range(130,138,2):
            env.now[0]=now;pending=await env.tick()
        await asyncio.wait_for(env.provider.entered.wait(),1)
        episode_id=pending['episode']['id']
        interrupted=await env.tick(**flags)
        assert interrupted['pending'], 'Unsent input and reading must not cancel triggered support'
        assert interrupted['episode']['id']==episode_id
        if old:assert interrupted['episode']['text']==old['text']
        env.provider.release.set()
        after=await env.settle()
        assert not after['pending'] and after['episode']['id']==episode_id
        assert after['episode']['kind']=='fatigue' and after['episode']['text']
        assert len(env.provider.supports)==(2 if refresh else 1)
