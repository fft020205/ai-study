import os
# Importing study.main creates its default app; keep that startup away from user data.
os.environ['DATABASE_URL']='sqlite:///:memory:'

import pytest
from fastapi.testclient import TestClient
from study.config import Settings
from study.storage import Repository
from study.main import create_app

class TestProvider:
    """Only tests may inject deterministic AI responses; never imported by production."""
    __test__=False
    configured=True
    def __init__(self):self.calls=[]
    async def complete_json(self,system,payload):
        self.calls.append((system,payload))
        if 'exercise' in payload:
            return {'evaluation':dict(verdict='supported',evidence_quote=payload['student_text'],misconception='',feedback='')}
        event=payload['event'];focus=payload['focus']['id']
        if not payload['active_exercise'] or event=='skip':
            prompt='x=5；y=x；x=8。最后 y 是多少，为什么？'
            return dict(reply=prompt,focus_id=focus,move='practice',exercise_action='replace',
                exercise=dict(prompt=prompt,reference='y=5，复制执行时的值。',rubric='y=5且解释独立更新。'),assistance='none')
        return dict(reply='测试模型根据本轮上下文生成的回复。',focus_id=focus,move='example' if event=='answer' else 'hint' if event=='hint' else 'reflect',
            exercise_action='keep',exercise=None,assistance='answer' if event=='answer' else 'hint' if event=='hint' else 'none')

@pytest.fixture
def fixture_app(tmp_path):
    cfg=Settings(database_url=f'sqlite:///{tmp_path}/test.db',_env_file=None)
    provider=TestProvider();app=create_app(cfg,Repository(cfg.database_url),provider)
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        client.get('/api/bootstrap')
        yield client,app,provider

def create(client,task='variable',support=False,opening=True):
    r=client.post('/api/sessions',json={'task_id':task,'consent':{'support':support,'camera':False}})
    assert r.status_code==201,r.text
    s=r.json()
    if opening:
        r=control(client,s,'open');assert r.status_code==200,r.text;s=r.json()
    return s

def control(client,s,action,**extra):
    return client.post(f"/api/sessions/{s['id']}/controls",json={'action':action,'version':s['version'],**extra})
