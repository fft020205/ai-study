"""Fail closed before publishing an insecure or nonpersistent hosted instance."""
import importlib.util
from pathlib import Path

import pytest

module=importlib.util.spec_from_file_location('study_deploy',Path(__file__).resolve().parents[3]/'deploy/start.py')
deploy=importlib.util.module_from_spec(module)
module.loader.exec_module(deploy)


@pytest.fixture
def deployment_env(monkeypatch,tmp_path):
    for key in ['PUBLIC_URL','RAILWAY_PUBLIC_DOMAIN','AI_API_KEY','AI_BASE_URL','AI_MODEL']:
        monkeypatch.delenv(key,raising=False)
    monkeypatch.setenv('STUDY_DATA_DIR',str(tmp_path))
    monkeypatch.setenv('PUBLIC_URL','https://study.example.test')
    monkeypatch.setenv('AI_BASE_URL','https://model.example.test/v1')
    monkeypatch.setenv('AI_MODEL','test-model')
    monkeypatch.setenv('AI_API_KEY','unit-only-not-a-real-key')
    return monkeypatch,tmp_path


def test_online_startup_enforces_auth_secure_cookies_and_server_config(deployment_env):
    patch,path=deployment_env
    for key,value in {'AUTH_REQUIRED':'false','COOKIE_SECURE':'false','AI_SETTINGS_ENABLED':'true','AI_PROVIDER':'none','DATABASE_URL':'sqlite:///:memory:','AI_CONFIG_PATH':'/private/local-key.json'}.items():
        patch.setenv(key,value)
    env=deploy.production_environment()
    assert env['AUTH_REQUIRED']=='true' and env['COOKIE_SECURE']=='true'
    assert env['AI_SETTINGS_ENABLED']=='false' and env['AI_PROVIDER']=='openai'
    assert env['DATABASE_URL']==f'sqlite:///{path}/study.db'
    assert env['AI_CONFIG_PATH']=='/app/disabled-ai-connection.json'
    assert env['ALLOWED_ORIGINS']=='https://study.example.test'


@pytest.mark.parametrize('origin',['http://study.example.test','https://user:pass@study.example.test','https://study.example.test/a','https://study.example.test?key=secret'])
def test_online_startup_rejects_invalid_origin(deployment_env,origin):
    patch,_=deployment_env;patch.setenv('PUBLIC_URL',origin)
    with pytest.raises(SystemExit):deploy.production_environment()


def test_online_startup_requires_persistent_directory_and_model(deployment_env):
    patch,path=deployment_env
    patch.setenv('STUDY_DATA_DIR',str(path/'missing'))
    with pytest.raises(SystemExit):deploy.production_environment()
    patch.setenv('STUDY_DATA_DIR',str(path));patch.delenv('AI_API_KEY')
    with pytest.raises(SystemExit):deploy.production_environment()


def test_railway_generated_domain_is_used(deployment_env):
    patch,_=deployment_env
    patch.delenv('PUBLIC_URL');patch.setenv('RAILWAY_PUBLIC_DOMAIN','study-test.up.railway.app')
    assert deploy.production_environment()['ALLOWED_ORIGINS']=='https://study-test.up.railway.app'
