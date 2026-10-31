"""Natural wording must not be blocked by private exercise bookkeeping."""
import hashlib,json,uuid
import pytest
from fastapi.testclient import TestClient
from study.ai import TeachingService
from study.config import Settings
from study.contracts import Consent
from study.learning import new_session,commit_dialogue,public_session
from study.main import create_app

VISIBLE='举个例子：甲组有3人，每人带2支笔；乙组有2人，每人带7支。把两组合在一起，平均每人带几支？'
SUMMARY='计算两组人数分别为3和2、人均笔数分别为2和7时的加权平均数。'

class ParaphraseProvider:
    configured=True
    def __init__(self,applicable=True):self.applicable=applicable;self.calls=[]
    async def complete_json(self,system,payload):
        self.calls.append(payload)
        if 'exercise' in payload:
            assert payload['exercise']['prompt']==VISIBLE
            assert payload['exercise']['metadata_prompt']==SUMMARY
            return {'evaluation':{'verdict':'supported','evidence_quote':payload['student_text'],'feedback':'','reference_applicable':self.applicable}}
        if payload['event']=='open':
            return {'reply':VISIBLE,'focus_id':payload['focus']['id'],'move':'practice','exercise_action':'replace','exercise':{'prompt':SUMMARY,'reference':'4支','rubric':'总共20支笔、5个人，因此平均4支。'}}
        return {'reply':'可以，我们按这个例子继续理解。','focus_id':payload['focus']['id'],'move':'explain','exercise_action':'keep'}
    async def stream_json(self,system,payload):
        output=await self.complete_json(system,payload)
        text=json.dumps(output,ensure_ascii=False)
        for i in range(0,len(text),5):yield text[i:i+5]

async def opened(applicable=True):
    s=new_session('mean',Consent());provider=ParaphraseProvider(applicable);service=TeachingService(provider)
    assessment,reply,state=await service.respond(s,event='open')
    commit_dialogue(s,assessment,reply,state,'open','')
    return s,provider,service

async def test_natural_paraphrase_is_displayed_without_appending_a_fixed_prompt():
    s,provider,_=await opened()
    assert SUMMARY not in VISIBLE
    assert s['messages'][-1]['text']==VISIBLE
    assert s['exercise']['prompt']==VISIBLE and s['exercise']['metadata_prompt']==SUMMARY
    assert s['exercise']['reference_alignment']=='unverified'
    public=json.dumps(public_session(s),ensure_ascii=False)
    assert SUMMARY not in public and 'rubric' not in public and 'reference_alignment' not in public

@pytest.mark.parametrize('applicable,expected',[(True,'supported'),(False,'unknown'),(None,'unknown')])
async def test_semantic_reference_check_uses_visible_question_before_grading(applicable,expected):
    s,_,service=await opened(applicable)
    assessment,reply,state=await service.respond(s,'4支，因为20支笔分给5个人')
    assert assessment.evaluation.verdict==expected
    commit_dialogue(s,assessment,reply,state,'message','4支，因为20支笔分给5个人')
    assert len(s['records'])==(1 if applicable else 0)

async def test_uncertain_reference_is_not_used_for_a_full_example():
    s,provider,service=await opened(False)
    await service.respond(s,event='answer')
    assert provider.calls[-1]['example_reference'] is None
    assert provider.calls[-1]['active_exercise']=={'prompt':VISIBLE}

async def test_explanation_with_missing_or_unused_metadata_still_displays():
    class Explanation:
        configured=True
        async def complete_json(self,system,payload):
            return {'reply':'平均数可以理解为把总量重新均分，人数不同要先算总量。','focus_id':payload['focus']['id'],'move':'explain','exercise_action':'replace','exercise':None}
    s=new_session('mean',Consent());a,r,state=await TeachingService(Explanation()).respond(s,event='open')
    assert r.exercise_action=='clear'
    commit_dialogue(s,a,r,state,'open','')
    assert s['exercise'] is None and s['messages'][-1]['text'].startswith('平均数')


def test_real_stream_path_accepts_a_paraphrased_example_and_keeps_metadata_private(tmp_path):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/paraphrase.db',_env_file=None),provider=ParaphraseProvider())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        client.get('/api/bootstrap');s=client.post('/api/sessions',json={'task_id':'mean'}).json()
        response=client.post(f"/api/sessions/{s['id']}/turns/stream",json={'event':'open','version':s['version'],'request_id':str(uuid.uuid4())})
        assert response.status_code==200 and 'event: complete' in response.text and 'event: error' not in response.text
        assert SUMMARY not in response.text and 'rubric' not in response.text
        visible=client.get(f"/api/sessions/{s['id']}").json();assert visible['messages'][-1]['text']==VISIBLE
        owner=hashlib.sha256(client.cookies.get('study_identity').encode()).hexdigest()
        stored=app.state.repo.get(owner,s['id']);assert stored['exercise']['prompt']==VISIBLE
