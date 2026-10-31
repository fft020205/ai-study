import asyncio
import uuid
import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from study.config import Settings
from study.main import create_app
from study.storage import Repository,SessionTitleRow,LearningRow
from conftest import create,TestProvider


def test_title_is_persistent_and_does_not_change_learning_or_course(fixture_app):
    client,app,provider=fixture_app;s=create(client);calls=len(provider.calls)
    response=client.patch(f"/api/sessions/{s['id']}",json={'title':'  我的变量笔记  '})
    assert response.status_code==200 and response.json()['title']=='我的变量笔记'
    assert response.json()['title_version']==1
    renamed=client.get(f"/api/sessions/{s['id']}").json()
    assert renamed['title']=='我的变量笔记' and renamed['version']==s['version']
    assert renamed['task_id']==s['task_id'] and renamed['messages']==s['messages']
    assert renamed['updated_at']==s['updated_at'] and len(provider.calls)==calls
    assert client.get('/api/bootstrap').json()['sessions'][0]['title']=='我的变量笔记'
    assert client.get(f"/api/sessions/{s['id']}/export").json()['session']['title']=='我的变量笔记'
    with Session(app.state.repo.engine) as db:owner=db.scalar(select(LearningRow.owner).where(LearningRow.id==s['id']))
    reloaded=Repository(str(app.state.repo.engine.url)).get(owner,s['id'])
    assert reloaded['custom_title']=='我的变量笔记' and reloaded['title_version']==1
    assert client.patch(f"/api/sessions/{s['id']}",json={'title':'我的变量笔记'}).json()['title_version']==1
    assert client.patch(f"/api/sessions/{s['id']}",json={'title':'新名称'}).json()['title_version']==2


def test_title_validation_owner_and_csrf(fixture_app):
    client,app,_=fixture_app;s=create(client)
    for value in ['', '   ', 'x'*81, '两行\n标题', '坏\x00标题']:
        assert client.patch(f"/api/sessions/{s['id']}",json={'title':value}).status_code==422
    assert client.patch(f"/api/sessions/{s['id']}",json={'title':'正常','task_id':'mean'}).status_code==422
    assert client.patch(f"/api/sessions/{s['id']}",headers={'X-Study-Client':''},json={'title':'不允许'}).status_code==403
    assert client.patch(f"/api/sessions/{s['id']}",headers={'Origin':'https://wrong.example'},json={'title':'不允许'}).status_code==403
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as other:
        assert other.patch(f"/api/sessions/{s['id']}",json={'title':'不允许'}).status_code==404
        assert other.delete(f"/api/sessions/{s['id']}").status_code==404
    assert client.get(f"/api/sessions/{s['id']}").json()['title']==s['title']


def test_delete_removes_title_metadata_and_allows_ended_rename(fixture_app):
    client,app,_=fixture_app;s=create(client)
    ended=client.post(f"/api/sessions/{s['id']}/controls",json={'action':'end','version':s['version']}).json()
    assert client.patch(f"/api/sessions/{s['id']}",json={'title':'结束后的笔记'}).status_code==200
    assert client.get(f"/api/sessions/{s['id']}").json()['status']=='ended'
    assert client.delete(f"/api/sessions/{s['id']}").status_code==204
    with Session(app.state.repo.engine) as db:assert db.get(SessionTitleRow,s['id']) is None
    assert client.patch(f"/api/sessions/{s['id']}",json={'title':'已删除'}).status_code==404


async def test_rename_during_generation_keeps_latest_title_without_cancelling(tmp_path):
    entered=asyncio.Event();release=asyncio.Event()
    class SlowProvider(TestProvider):
        async def complete_json(self,system,payload):
            entered.set();await release.wait()
            return await super().complete_json(system,payload)
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/history.db',_env_file=None),provider=SlowProvider())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as client:
        await client.get('/api/bootstrap')
        s=(await client.post('/api/sessions',json={'task_id':'variable'})).json()
        pending=asyncio.create_task(client.post(f"/api/sessions/{s['id']}/turns",json={'event':'open','version':s['version'],'request_id':str(uuid.uuid4())}))
        await asyncio.wait_for(entered.wait(),2)
        before=(await client.get(f"/api/sessions/{s['id']}")).json()
        renamed=await client.patch(f"/api/sessions/{s['id']}",json={'title':'生成中的新名字'})
        assert renamed.status_code==200
        during=(await client.get(f"/api/sessions/{s['id']}")).json()
        assert during['pending'] and during['version']==before['version']
        release.set();reply=await asyncio.wait_for(pending,2)
        assert reply.status_code==200 and reply.json()['title']=='生成中的新名字'
        assert not reply.json()['pending'] and reply.json()['messages']


def test_default_titles_count_per_course_and_survive_rename_delete_and_restart(fixture_app):
    from study.contracts import Consent
    from study.learning import new_session,public_session
    client,app,provider=fixture_app
    first=create(client,task='mean',opening=False);second=create(client,task='mean',opening=False)
    other_course=create(client,task='variable',opening=False)
    assert [first['title'],second['title'],other_course['title']]==['平均数01','平均数02','编程变量01']
    assert first['title_version']==0
    assert client.patch(f"/api/sessions/{first['id']}",json={'title':'我的均值笔记'}).json()['title_version']==1
    assert client.delete(f"/api/sessions/{second['id']}").status_code==204
    third=create(client,task='mean',opening=False);assert third['title']=='平均数03'
    with Session(app.state.repo.engine) as db:owner=db.scalar(select(LearningRow.owner).where(LearningRow.id==first['id']))
    reloaded=Repository(str(app.state.repo.engine.url))
    assert reloaded.get(owner,first['id'])['custom_title']=='我的均值笔记'
    assert reloaded.get(owner,third['id'])['custom_title']=='平均数03'
    fourth=new_session('mean',Consent());reloaded.create(owner,fourth)
    assert public_session(fourth)['title']=='平均数04'
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as another:
        another.get('/api/bootstrap')
        assert create(another,task='mean',opening=False)['title']=='平均数01'
    assert provider.calls==[]


def test_automatic_title_avoids_a_user_written_name(fixture_app):
    client,_,_=fixture_app
    first=create(client,task='mean',opening=False)
    assert client.patch(f"/api/sessions/{first['id']}",json={'title':'平均数02'}).status_code==200
    assert create(client,task='mean',opening=False)['title']=='平均数03'


def test_legacy_titles_are_backfilled_once_without_changing_learning_state(tmp_path):
    import copy
    from study.contracts import Consent
    from study.learning import new_session
    url=f'sqlite:///{tmp_path}/legacy-titles.db';repo=Repository(url)
    states=[]
    for index in range(3):
        state=new_session('mean',Consent(support=True));state.update(created_at=100+index,version=7,pending='existing-request',pending_event='message')
        states.append(copy.deepcopy(state))
    with Session(repo.engine) as db:
        for state in states:db.add(LearningRow(id=state['id'],owner='legacy-owner',version=state['version'],state=state))
        db.add(SessionTitleRow(id=states[1]['id'],title='平均数02',version=4));db.commit()
    reloaded=Repository(url)
    assert [reloaded.get('legacy-owner',s['id'])['custom_title'] for s in states]==['平均数01','平均数02','平均数03']
    with Session(reloaded.engine) as db:
        for state in states:
            row=db.get(LearningRow,state['id'])
            assert row.version==7 and row.state==state
    again=Repository(url)
    assert again.get('legacy-owner',states[1]['id'])['title_version']==4
    assert [s['custom_title'] for s in sorted(again.list('legacy-owner'),key=lambda s:s['created_at'])]==['平均数01','平均数02','平均数03']
    another=new_session('mean',Consent());again.create('legacy-owner',another)
    assert another['custom_title']=='平均数04'


def test_concurrent_creation_allocates_distinct_names(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from study.contracts import Consent
    from study.learning import new_session
    url=f'sqlite:///{tmp_path}/concurrent-titles.db';repo=Repository(url)
    def create_one(_):
        state=new_session('mean',Consent());repo.create('same-owner',state);return state
    with ThreadPoolExecutor(max_workers=4) as workers:states=list(workers.map(create_one,range(8)))
    assert sorted(s['custom_title'] for s in states)==[f'平均数{i:02d}' for i in range(1,9)]
    last=next(s for s in states if s['custom_title']=='平均数08');repo.delete('same-owner',last['id'])
    later=new_session('mean',Consent());Repository(url).create('same-owner',later)
    assert later['custom_title']=='平均数09'
