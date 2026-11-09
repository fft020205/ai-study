"""Hosted access tests use the existing test-only model provider, never a live key."""
import hashlib
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from study.accounts import AccountRow, LoginRow, UsageRow, COOKIE, current_owner
from study.ai import AIUnavailable
from study.config import Settings
from study.main import create_app
from study.storage import Repository
from conftest import TestProvider


@pytest.fixture
def hosted(tmp_path):
    config=Settings(database_url=f'sqlite:///{tmp_path}/hosted.db',auth_required=True,
                    ai_settings_enabled=False,ai_daily_calls_per_user=3,ai_daily_calls_total=5,_env_file=None)
    repo=Repository(config.database_url)
    app=create_app(config,repo,TestProvider())
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as client:
        yield client,app,config,repo


def signup(client,name='learner'):
    result=client.post('/api/auth/register',json={'username':name,'password':'a-long-test-password'})
    assert result.status_code==201,result.text
    return result.json()['user']


def test_login_gate_and_private_settings(hosted):
    client,_,_,_=hosted
    assert client.get('/api/health').status_code==200
    assert client.get('/api/bootstrap').status_code==401
    # A forged guest cookie cannot authenticate an account.
    client.cookies.set('study_identity','f'*64)
    assert client.get('/api/bootstrap').status_code==401
    signup(client)
    assert client.get('/api/bootstrap').status_code==200
    assert client.get('/api/settings/ai').status_code==403
    assert client.get('/openapi.json').status_code==404


def test_cross_device_history_and_cross_account_isolation(hosted):
    client,app,_,_=hosted
    signup(client)
    created=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':False,'camera':False}}).json()
    with TestClient(app,headers={'X-Study-Client':'web-v1'}) as other:
        signup(other,'another-user')
        for method,path in [('get',''),('get','/export'),('delete','')]:
            assert getattr(other,method)(f"/api/sessions/{created['id']}{path}").status_code==404
        assert other.patch(f"/api/sessions/{created['id']}",json={'title':'stolen'}).status_code==404
        assert other.get('/api/bootstrap').json()['sessions']==[]
    client.post('/api/auth/logout')
    assert client.get('/api/bootstrap').status_code==401
    result=client.post('/api/auth/login',json={'username':'LEARNER','password':'a-long-test-password'})
    assert result.status_code==200
    assert client.get('/api/bootstrap').json()['sessions'][0]['id']==created['id']


def test_password_token_storage_and_logout_revocation(hosted):
    client,app,config,repo=hosted
    user=signup(client)
    token=client.cookies.get(COOKIE)
    with Session(repo.engine) as db:
        assert db.get(AccountRow,user['id']).password_hash.startswith('scrypt$')
        assert db.get(LoginRow,token) is None
        assert db.get(LoginRow,hashlib.sha256(token.encode()).hexdigest()) is not None
    client.post('/api/auth/logout')
    with TestClient(app,headers={'X-Study-Client':'web-v1','Cookie':f'{COOKIE}={token}'}) as replay:
        assert replay.get('/api/bootstrap').status_code==401
    result=client.post('/api/auth/login',json={'username':'learner','password':'wrong-test-password'})
    assert result.status_code==401
    assert 'password' not in result.text


def test_expired_login_and_secure_cookie(hosted):
    client,app,config,repo=hosted
    config.cookie_secure=True
    with TestClient(app,base_url='https://testserver',headers={'X-Study-Client':'web-v1'}) as secure:
        response=secure.post('/api/auth/register',json={'username':'secure-user','password':'another-test-password'})
        cookie=response.headers['set-cookie'].lower()
        assert all(flag in cookie for flag in ['secure','httponly','samesite=strict'])
        assert secure.get('/api/bootstrap').status_code==200
        with Session(repo.engine) as db:
            db.execute(update(LoginRow).values(expires_at=time.time()-1));db.commit()
        assert secure.get('/api/bootstrap').status_code==401


def test_signup_and_login_reject_cross_origin_and_do_not_echo_password(hosted):
    client,_,_,_=hosted
    assert client.post('/api/auth/register',headers={'Origin':'https://attacker.invalid'},json={'username':'learner','password':'a-long-test-password'}).status_code==403
    result=client.post('/api/auth/register',json={'username':'learner','password':'sensitive'})
    assert result.status_code==422 and 'sensitive' not in result.text
    for _ in range(10):
        assert client.post('/api/auth/login',json={'username':'unknown','password':'wrong-test-password'}).status_code==401
    assert client.post('/api/auth/login',json={'username':'unknown','password':'wrong-test-password'}).status_code==429


def test_registration_can_be_closed(hosted):
    client,_,config,_=hosted
    config.registration_enabled=False
    assert client.post('/api/auth/register',json={'username':'learner','password':'a-long-test-password'}).status_code==403


def test_real_generation_quota_is_persistent_and_per_account(hosted):
    client,app,config,repo=hosted
    signup(client)
    session=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':False,'camera':False}}).json()
    for action in ['open','hint','hint']:
        result=client.post(f"/api/sessions/{session['id']}/controls",json={'version':session['version'],'action':action})
        assert result.status_code==200,result.text
        session=result.json()
    result=client.post(f"/api/sessions/{session['id']}/controls",json={'version':session['version'],'action':'hint'})
    assert result.status_code==429
    with Session(repo.engine) as db:
        assert db.scalar(select(UsageRow.calls).where(UsageRow.scope=='global'))==3
    # New app, same database: login sessions, records, and quota survive restart.
    reloaded=create_app(config,Repository(config.database_url),TestProvider())
    with TestClient(reloaded,headers={'X-Study-Client':'web-v1','Cookie':f'{COOKIE}={client.cookies.get(COOKIE)}'}) as again:
        latest=again.get('/api/bootstrap').json()['sessions'][0]
        assert latest['id']==session['id']
        result=again.post(f"/api/sessions/{session['id']}/controls",json={'version':latest['version'],'action':'hint'})
        assert result.status_code==429


def test_streaming_quota_keeps_authenticated_identity(hosted):
    client,app,config,repo=hosted
    signup(client)
    session=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':False,'camera':False}}).json()
    result=client.post(f"/api/sessions/{session['id']}/turns/stream",json={'version':session['version'],'event':'open','request_id':'stream-auth-test','text':''})
    assert result.status_code==200
    assert 'event: complete' in result.text,result.text
    with Session(repo.engine) as db:
        assert db.scalar(select(UsageRow.calls).where(UsageRow.scope=='global'))==1


def test_quota_concurrency_does_not_overspend(hosted):
    client,app,config,repo=hosted
    user=signup(client)
    from study.accounts import Accounts
    accounts=Accounts(repo.engine,config)
    def consume(_):
        token=current_owner.set(user['id'])
        try:
            accounts.consume();return True
        except AIUnavailable:
            return False
        finally:
            current_owner.reset(token)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(consume,range(8)))
    assert sum(results)==3
    with Session(repo.engine) as db:
        assert db.scalar(select(UsageRow.calls).where(UsageRow.scope=='global'))==3


def test_websocket_requires_account_not_guest_cookie(hosted):
    client,_,_,_=hosted
    signup(client)
    session=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
    client.post('/api/auth/logout')
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/sessions/{session['id']}/vision/ws",headers={'Origin':'http://localhost:3000','Cookie':'study_identity='+'a'*64}):
            pass


def test_authenticated_calibration_resume_and_logout_clear_reference(hosted):
    # Synthetic features exercise the real engine and the merged account/WS path.
    from test_calibration_resume import Clock, sample, DEVICE
    client,app,_,_=hosted
    user=signup(client)
    clock=Clock();vision=app.state.vision
    vision.clock=clock.monotonic;vision.wall_time=clock.wall
    session=client.post('/api/sessions',json={'task_id':'variable','consent':{'support':True,'camera':True}}).json()
    path=f"/api/sessions/{session['id']}"
    lease=client.post(path+'/vision/start',json={'device_key':DEVICE}).json()
    assert lease['calibration_mode']=='full'
    with client.websocket_connect(lease['websocket_path'],headers={'Origin':'http://localhost:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
        for seq in range(1,122):
            clock.advance();ws.send_json(sample(clock,seq).model_dump());result=ws.receive_json()
        assert result['data']['calibrated']
        suspended=client.post(path+'/controls',json={'action':'suspend','version':session['version']})
        assert suspended.status_code==200
    assert (user['id'],session['id']) in vision.calibrations.entries
    lease=client.post(path+'/vision/start',json={'device_key':DEVICE}).json()
    assert lease['calibration_mode']=='resume' and lease['calibration_seconds']==5
    with client.websocket_connect(lease['websocket_path'],headers={'Origin':'http://localhost:3000'}) as ws:
        ws.send_json({'type':'hello','ticket':lease['ticket']});ws.receive_json()
        for seq in range(1,12):
            clock.advance();ws.send_json(sample(clock,seq).model_dump());result=ws.receive_json()
        assert result['data']['calibrated'] and result['data']['status']=='analyzing'
        assert client.post('/api/auth/logout').status_code==200
    assert not vision.calibrations.entries and not vision.runs
    assert client.post(path+'/vision/start',json={'device_key':DEVICE}).status_code==401
    assert client.post('/api/auth/login',json={'username':'learner','password':'a-long-test-password'}).status_code==200
    assert client.post(path+'/vision/start',json={'device_key':DEVICE}).json()['calibration_mode']=='full'
