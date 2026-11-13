"""Behavioral contract tests. All provider responses here are explicit test doubles."""
import asyncio
import copy
import json
import uuid
import httpx
import pytest
from pydantic import ValidationError
from study.ai import TeachingService, AIProtocolError
from study.contracts import Consent, TurnAssessment
from study.courses import DIALOGUE_VERSION
from study.dialogue import ground_assessment, learner_state, response_policy, generation_context, history_for, unknown_assessment
from study.learning import new_session, ensure_dialogue, public_session, commit_dialogue
from study.main import create_app
from study.config import Settings
from conftest import TestProvider,create,control


def session():
    s=new_session('variable',Consent())
    s['exercise']={'id':'q1','prompt':'x=2;y=x;x=3。y是多少？说明理由。','reference':'y=2，因为不联动','rubric':'2且说明不联动'}
    return s


def assessment(text='我有点紧张',verdict='supported',**kw):
    return TurnAssessment.model_validate({'evaluation':dict(verdict=verdict,evidence_quote=text,feedback=''),**kw})


def test_correct_and_tense_are_independent_and_context_is_projected():
    s=session();a=assessment(pressure={'value':'medium','quote':'紧张'})
    a=ground_assessment(s,'我有点紧张',a);state=learner_state(s,a,'message',100)
    assert state['cognition']['value']=='no_clear_difficulty'
    assert state['pressure']['value']=='medium' and state['valence']['value']=='unknown'
    assert response_policy(state,a,'message')['reduce_information_load']
    payload=generation_context(s,'我有点紧张','message',a,state)
    assert payload['example_reference'] is None and payload['active_exercise']=={'prompt':s['exercise']['prompt']}
    assert 'rubric' not in json.dumps(payload) and 'y=2，因为不联动' not in json.dumps(payload,ensure_ascii=False)
    assert generation_context(s,'','answer',a,state)['example_reference']=='y=2，因为不联动'


def test_unknown_does_not_become_negative_and_wrong_does_not_mean_stressed():
    s=session();a=assessment('还行吧',verdict='incorrect',valence={'value':'negative','quote':'我很难受'})
    a=ground_assessment(s,'还行吧',a);state=learner_state(s,a,'message',100)
    assert state['valence']['value']=='unknown' and state['pressure']['value']=='unknown'
    assert not response_policy(state,a,'message')['acknowledge_explicit_feeling']
    assert state['cognition']['value']=='difficulty'


def test_explicit_correction_replaces_old_claims_and_expires():
    s=session();s['learner_state']={'valence':{'value':'negative','quote':'不高兴','source':'self_report','at':95,'turn':0}}
    a=assessment('其实我很开心',verdict='unknown',valence={'value':'positive','quote':'很开心'})
    s['learner_state']=learner_state(s,a,'correct',100)
    assert s['learner_state']['valence']['value']=='positive'
    assert s['learner_state']['valence']['source']=='correction'
    assert learner_state(s,unknown_assessment(),'message',401)['valence']['value']=='unknown'
    s['dialogue_turn']=5
    assert learner_state(s,unknown_assessment(),'message',101)['valence']['value']=='unknown'
    assert learner_state(s,unknown_assessment(),'correct',101)['valence']['value']=='unknown'


def test_difficulty_plus_negative_uses_one_small_step():
    a=assessment('我不会，感觉很烦',verdict='unknown',cognition={'value':'difficulty','quote':'我不会'},valence={'value':'negative','quote':'很烦'})
    s=session();state=learner_state(s,ground_assessment(s,'我不会，感觉很烦',a),'message',100)
    p=response_policy(state,a,'message')
    assert p['reduce_information_load'] and p['acknowledge_explicit_feeling']


def test_history_is_bounded_and_only_contains_visible_messages():
    s=session();s['messages']=[{'role':'user','text':str(i),'source':'submitted','code':''} for i in range(100)]
    assert len(history_for(s))==24 and history_for(s)[-1]['text']=='99'
    assert 'reference' not in json.dumps(history_for(s))


async def test_generation_receives_history_and_scope_but_not_private_rubric():
    s=session();s['messages']=[{'role':'user','text':'请用仓库的例子','source':'submitted','code':''}]
    provider=TestProvider();await TeachingService(provider).respond(s,'可以少说一点吗')
    grade=provider.calls[0][1];reply=provider.calls[1][1]
    assert grade['exercise']['rubric']==s['exercise']['rubric']
    assert reply['history'][0]['text']=='请用仓库的例子'
    assert reply['course']['scope'].startswith('Python')
    assert reply['active_exercise']=={'prompt':s['exercise']['prompt']}


@pytest.mark.parametrize('invalid',[{'focus_id':'other-course'}, {'assistance':'answer'}])
async def test_invalid_or_leaking_generation_is_rejected(invalid):
    class Broken:
        configured=True
        async def complete_json(self,system,payload):
            return dict(reply='一个回复',focus_id='copy',move='reflect',exercise_action='keep',exercise=None,assistance='none')|invalid
    with pytest.raises((AIProtocolError,ValidationError)):
        await TeachingService(Broken()).respond(session(),event='open')


def test_no_opening_script_and_legacy_migration_preserves_history():
    s=new_session('variable',Consent());assert s['messages']==[] and s['exercise'] is None
    legacy=copy.deepcopy(s)
    for key in ('dialogue_version','focus_id','exercise','learner_state','dialogue_turn','pending_event'):legacy.pop(key)
    legacy.update(content_version='prd-v0.3-mvp.1',parallel=False,node_index=0)
    legacy['messages']=[{'role':'assistant','text':'以前的题目','source':'course'}]
    migrated=ensure_dialogue(legacy)
    assert migrated['messages'][0]['text']=='以前的题目'
    assert migrated['exercise']['reference'] and migrated['dialogue_version']==DIALOGUE_VERSION
    assert 'rubric' not in json.dumps(public_session(migrated))


def test_unknown_interrupts_error_streak_and_examples_do_not_count_as_independent():
    from study.contracts import DialogueReply
    s=session();s['same_error_count']=2;s['last_misconception']='copy_link'
    reply=DialogueReply(reply='模型回复',focus_id='copy',move='reflect',exercise_action='keep')
    commit_dialogue(s,unknown_assessment(),reply,{},'message','还行吧')
    assert s['same_error_count']==0
    s['exposed']=True
    commit_dialogue(s,assessment('2，不联动'),reply,{},'message','2，不联动')
    assert s['records'][-1]['status']=='reviewed_after_example'


def test_open_and_help_are_idempotent_and_no_reference_leaks(fixture_app):
    c,_,p=fixture_app;s=create(c,opening=False);rid=str(uuid.uuid4())
    body=dict(event='open',version=s['version'],request_id=rid)
    first=c.post(f"/api/sessions/{s['id']}/turns",json=body)
    assert first.status_code==200
    assert c.post(f"/api/sessions/{s['id']}/turns",json=body).json()==first.json()
    assert len(p.calls)==1
    assert 'reference' not in first.text and 'rubric' not in first.text
    assert control(c,first.json(),'open').json()==first.json()


async def test_proactive_generation_is_cancelled_by_leaving_page(tmp_path):
    entered=asyncio.Event()
    class Slow(TestProvider):
        async def complete_json(self,system,payload):
            if payload.get('event')=='support':
                entered.set();await asyncio.Event().wait()
            return await super().complete_json(system,payload)
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/auto.db',support_wait_seconds=0,_env_file=None),provider=Slow())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as c:
        await c.get('/api/bootstrap')
        s=(await c.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':False}})).json()
        s=(await c.post(f"/api/sessions/{s['id']}/turns",json={'event':'open','version':s['version'],'request_id':str(uuid.uuid4())})).json()
        flags=dict(version=s['version'],foreground=True,has_draft=False,composing=False,busy=False,reading=False)
        pending=(await c.post(f"/api/sessions/{s['id']}/activity",json=flags)).json()
        await asyncio.wait_for(entered.wait(),2)
        assert pending['pending'] and pending['episode']['text'] is None
        after=(await c.post(f"/api/sessions/{s['id']}/activity",json=flags|{'foreground':False})).json()
        assert not after['pending'] and after['episode'] is None
        assert len(after['messages'])==1


def test_correction_in_normal_text_clears_old_state():
    s=session();s['learner_state']={'pressure':{'value':'high','quote':'很紧张','source':'self_report','at':95,'turn':0}}
    a=assessment('其实我没有紧张，只是在想',verdict='unknown',correction_quote='其实我没有紧张')
    state=learner_state(s,ground_assessment(s,'其实我没有紧张，只是在想',a),'message',100)
    assert state['pressure']['value']=='unknown'


def test_latest_answer_replaces_old_task_difficulty():
    s=session();s['learner_state']={'cognition':{'value':'difficulty','quote':'3','source':'task_answer','at':95,'turn':0}}
    state=learner_state(s,assessment('2，因为复制后分别更新'),'message',100)
    assert state['cognition']['value']=='no_clear_difficulty'


@pytest.mark.parametrize('intent,expected',[('end','ended'),('pause','active'),('reject','active')])
def test_explicit_natural_language_controls_do_not_generate_another_question(tmp_path,intent,expected):
    from fastapi.testclient import TestClient
    class Controls(TestProvider):
        async def complete_json(self,system,payload):
            if 'exercise' in payload:
                return dict(evaluation=dict(verdict='unknown',feedback=''),intent=intent,intent_quote=payload['student_text'])
            return await super().complete_json(system,payload)
    p=Controls();app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/text-control.db',_env_file=None),provider=p)
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as c:
        s=create(c,support=True)
        result=c.post(f"/api/sessions/{s['id']}/turns",json=dict(text='用户明确的控制请求',version=s['version'],request_id=str(uuid.uuid4())))
        assert result.status_code==200,result.text
        after=result.json();assert after['status']==expected and not after['pending']
        assert after['messages'][-1]['role']=='user'
        if intent=='pause': assert after['support_mode']=='paused' and not after['consent']['camera']


async def test_correct_feedback_can_transition_without_continue_button():
    s=session()
    class Flow(TestProvider):
        async def complete_json(self,system,payload):
            if 'exercise' in payload:return await super().complete_json(system,payload)
            question='下一段交换代码中，旧值应该在什么时候保存？'
            return dict(reply='你说明了复制后分别更新。'+question,focus_id='overwrite',move='practice',exercise_action='replace',
                exercise=dict(prompt=question,reference='覆盖前保存',rubric='指出覆盖前'),assistance='none')
    a,r,state=await TeachingService(Flow()).respond(s,'y=2，因为复制后独立更新')
    commit_dialogue(s,a,r,state,'message','y=2，因为复制后独立更新')
    assert s['focus_id']=='overwrite' and s['exercise']['prompt'].startswith('下一段')
    assert s['records'][0]['status']=='completed_independently'


async def test_manual_answer_wins_over_unseen_automatic_generation(tmp_path):
    entered=asyncio.Event()
    class Slow(TestProvider):
        async def complete_json(self,system,payload):
            if payload.get('event')=='support': entered.set();await asyncio.Event().wait()
            return await super().complete_json(system,payload)
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/race.db',support_wait_seconds=0,_env_file=None),provider=Slow())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as c:
        await c.get('/api/bootstrap')
        s=(await c.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':False}})).json()
        s=(await c.post(f"/api/sessions/{s['id']}/turns",json=dict(event='open',version=s['version'],request_id=str(uuid.uuid4())))).json()
        await c.post(f"/api/sessions/{s['id']}/activity",json=dict(version=s['version'],foreground=True,has_draft=False,composing=False,busy=False,reading=False))
        await asyncio.wait_for(entered.wait(),2)
        result=await c.post(f"/api/sessions/{s['id']}/turns",json=dict(text='5，因为复制后独立更新',version=s['version'],request_id=str(uuid.uuid4())))
        assert result.status_code==200,result.text
        assert result.json()['episode'] is None and len(result.json()['messages'])==3


async def test_correction_is_persisted_even_if_reply_fails(tmp_path):
    from fastapi.testclient import TestClient
    from study.ai import AIUnavailable
    class Fails(TestProvider):
        async def complete_json(self,system,payload):
            if payload.get('event')=='correct':raise AIUnavailable('测试接口不可用')
            return await super().complete_json(system,payload)
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/correction.db',_env_file=None),provider=Fails())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as c:
        s=create(c)
        assert control(c,s,'correct',text='我其实很开心').status_code==502
        result=c.get(f"/api/sessions/{s['id']}").json()
        assert result['messages'][-1]['text']=='我其实很开心' and result['protected'] and not result['pending']


def test_camera_reminders_require_explicit_current_self_report_and_support():
    from study.dialogue import camera_alerts
    s=session();s['consent']['support']=True;s['support_mode']='on'
    text='我很累，而且信息太多处理不过来'
    a=assessment(text,verdict='unknown',fatigue={'value':'present','quote':'我很累'},cognitive_load={'value':'high','quote':'信息太多处理不过来'})
    s['learner_state']=learner_state(s,ground_assessment(s,text,a),'message',100);s['dialogue_turn']=1
    alerts=camera_alerts(s,200)
    assert {a['kind'] for a in alerts}=={'fatigue','high_load'}
    assert all(a['source']=='self_report' and a['expires_at']==400 for a in alerts)
    assert camera_alerts(s,400)==[]
    s['support_mode']='paused';assert camera_alerts(s,200)==[]
    s['support_mode']='on';s['dialogue_turn']=5;assert camera_alerts(s,200)==[]


def test_wrong_answer_and_pressure_do_not_create_fatigue_or_high_load_labels():
    from study.dialogue import camera_alerts
    s=session();s['consent']['support']=True;s['support_mode']='on'
    a=assessment('我很紧张',verdict='incorrect',pressure={'value':'high','quote':'很紧张'},fatigue={'value':'present','quote':'我很疲劳'},cognitive_load={'value':'high','quote':'我过载了'})
    a=ground_assessment(s,'我很紧张',a)
    s['learner_state']=learner_state(s,a,'message',100);s['dialogue_turn']=1
    assert s['learner_state']['fatigue']['value']=='unknown'
    assert s['learner_state']['cognitive_load']['value']=='unknown'
    assert camera_alerts(s,200)==[]


def test_correction_removes_old_fatigue_and_load_labels():
    from study.dialogue import camera_alerts
    s=session();s['consent']['support']=True;s['support_mode']='on'
    text='我很累'
    a=assessment(text,verdict='unknown',fatigue={'value':'present','quote':text})
    s['learner_state']=learner_state(s,ground_assessment(s,text,a),'message',100);s['dialogue_turn']=1
    assert camera_alerts(s,101)
    text='其实我不累，也没有信息过载'
    a=assessment(text,verdict='unknown',fatigue={'value':'absent','quote':'我不累'},cognitive_load={'value':'manageable','quote':'没有信息过载'},correction_quote=text)
    s['learner_state']=learner_state(s,ground_assessment(s,text,a),'message',102);s['dialogue_turn']=2
    assert camera_alerts(s,103)==[]


def test_camera_reminders_do_not_accept_guessed_camera_state():
    from study.dialogue import camera_alerts
    s=session();s['consent']['support']=True;s['support_mode']='on';s['dialogue_turn']=1
    s['learner_state']={'fatigue':{'value':'present','quote':'眨眼多','source':'unvalidated_camera','at':100,'turn':1}}
    assert camera_alerts(s,101)==[]


def test_public_api_exposes_only_sourced_reminders_and_accepts_correction(tmp_path):
    from fastapi.testclient import TestClient
    class SelfReport(TestProvider):
        async def complete_json(self,system,payload):
            if 'exercise' in payload:
                text=payload['student_text']
                return dict(evaluation=dict(verdict='unknown',feedback=''),fatigue=dict(value='absent' if '不累' in text else 'present',quote=text),correction_quote=text if '不累' in text else '')
            return await super().complete_json(system,payload)
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/camera-warning.db',_env_file=None),provider=SelfReport())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as c:
        s=create(c,support=True)
        result=c.post(f"/api/sessions/{s['id']}/turns",json=dict(text='我有点累了',version=s['version'],request_id=str(uuid.uuid4())))
        assert result.status_code==200,result.text
        s=result.json();assert s['camera_alerts'][0]['kind']=='fatigue'
        assert s['camera_alerts'][0]['evidence_quote']=='我有点累了'
        assert 'learner_state' not in s and 'rubric' not in result.text
        result=control(c,s,'correct',text='其实我不累')
        assert result.status_code==200,result.text
        assert result.json()['camera_alerts']==[]
