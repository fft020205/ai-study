"""Hosted account sessions and persistent upstream-call limits.

No password, login token, or provider credential is returned in account views.
Local development retains the existing guest mode unless AUTH_REQUIRED is set.
"""
import hashlib
import hmac
import re
import secrets
import time
from contextvars import ContextVar
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, SecretStr, Field, field_validator
from sqlalchemy import Column, String, Integer, Float, select, delete, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert

from .storage import Base
from .ai import AIUnavailable

current_owner = ContextVar('study_account_owner', default=None)
COOKIE = 'study_login'
SESSION_SECONDS = 14 * 24 * 60 * 60

class QuotaExceeded(AIUnavailable):
    pass


class AccountRow(Base):
    __tablename__ = 'accounts'
    id = Column(String(64), primary_key=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)


class LoginRow(Base):
    __tablename__ = 'account_logins'
    token_hash = Column(String(64), primary_key=True)
    account_id = Column(String(64), nullable=False, index=True)
    expires_at = Column(Float, nullable=False, index=True)


class UsageRow(Base):
    __tablename__ = 'account_daily_usage'
    day = Column(String(10), primary_key=True)
    scope = Column(String(80), primary_key=True)
    calls = Column(Integer, nullable=False)


class AuthAttemptRow(Base):
    __tablename__ = 'account_auth_attempts'
    # Hashing avoids persisting submitted names and IPs in rate-limit records.
    key = Column(String(64), primary_key=True)
    attempts = Column(Integer, nullable=False)
    expires_at = Column(Float, nullable=False, index=True)


class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=64)
    password: SecretStr = Field(min_length=12, max_length=128)

    @field_validator('username')
    @classmethod
    def username_format(cls, value):
        value = value.strip().casefold()
        if not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,63}', value):
            raise ValueError('invalid username')
        return value


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f'scrypt${salt}${digest}'


def password_matches(password, stored):
    try:
        _, salt, _ = stored.split('$')
        return hmac.compare_digest(password_hash(password, salt), stored)
    except (ValueError, TypeError):
        return False


class Accounts:
    def __init__(self, engine, config):
        self.engine, self.config = engine, config
        Base.metadata.create_all(engine)
        # Equal-cost credential checking also when the account does not exist.
        self.dummy_hash = password_hash(secrets.token_hex(32))
        with Session(engine) as db:
            db.execute(delete(LoginRow).where(LoginRow.expires_at < time.time()))
            db.execute(delete(AuthAttemptRow).where(AuthAttemptRow.expires_at < time.time()))
            db.commit()

    def throttle(self, key, limit, seconds):
        key = hashlib.sha256(key.encode()).hexdigest()
        now = time.time()
        insert = sqlite_insert if self.engine.dialect.name == 'sqlite' else postgres_insert
        with Session(self.engine) as db:
            db.execute(delete(AuthAttemptRow).where(AuthAttemptRow.expires_at < now))
            statement = insert(AuthAttemptRow).values(key=key, attempts=1, expires_at=now+seconds)
            statement = statement.on_conflict_do_update(
                index_elements=['key'], set_={'attempts': AuthAttemptRow.attempts+1},
                where=AuthAttemptRow.attempts < limit).returning(AuthAttemptRow.attempts)
            if db.scalar(statement) is None:
                raise HTTPException(429, '尝试过于频繁，请稍后再试。', headers={'Retry-After': str(seconds)})
            db.commit()

    def user(self, token):
        if not token or not re.fullmatch('[a-f0-9]{64}', token):
            return None
        with Session(self.engine) as db:
            row = db.scalar(select(AccountRow).join(LoginRow, LoginRow.account_id == AccountRow.id).where(
                LoginRow.token_hash == hashlib.sha256(token.encode()).hexdigest(),
                LoginRow.expires_at > time.time()))
            return {'id': row.id, 'username': row.username} if row else None

    def register(self, body):
        if not self.config.registration_enabled:
            raise HTTPException(403, '暂未开放新账号注册。')
        row = AccountRow(id=secrets.token_hex(32), username=body.username,
                         password_hash=password_hash(body.password.get_secret_value()))
        try:
            with Session(self.engine) as db:
                db.add(row)
                db.commit()
                return {'id': row.id, 'username': row.username}
        except IntegrityError:
            raise HTTPException(409, '该用户名不可用，请换一个。') from None

    def login(self, body):
        with Session(self.engine) as db:
            row = db.scalar(select(AccountRow).where(AccountRow.username == body.username))
            valid = password_matches(body.password.get_secret_value(), row.password_hash if row else self.dummy_hash)
            if not row or not valid:
                raise HTTPException(401, '用户名或密码不正确。')
            return {'id': row.id, 'username': row.username}

    def start(self, user, old_token=None):
        token = secrets.token_hex(32)
        with Session(self.engine) as db:
            if old_token:
                db.execute(delete(LoginRow).where(LoginRow.token_hash == hashlib.sha256(old_token.encode()).hexdigest()))
            db.execute(delete(LoginRow).where(LoginRow.expires_at < time.time()))
            db.add(LoginRow(token_hash=hashlib.sha256(token.encode()).hexdigest(),
                            account_id=user['id'], expires_at=time.time()+SESSION_SECONDS))
            db.commit()
        return token

    def logout(self, token):
        with Session(self.engine) as db:
            db.execute(delete(LoginRow).where(LoginRow.token_hash == hashlib.sha256((token or '').encode()).hexdigest()))
            db.commit()

    def consume(self):
        owner = current_owner.get()
        if not owner:
            raise AIUnavailable('请先登录，再使用 AI 对话。')
        day = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        insert = sqlite_insert if self.engine.dialect.name == 'sqlite' else postgres_insert
        with Session(self.engine) as db:
            for scope, limit in [('global', self.config.ai_daily_calls_total), (owner, self.config.ai_daily_calls_per_user)]:
                statement = insert(UsageRow).values(day=day, scope=scope, calls=1)
                statement = statement.on_conflict_do_update(
                    index_elements=['day', 'scope'], set_={'calls': UsageRow.calls+1},
                    where=UsageRow.calls < limit).returning(UsageRow.calls)
                if db.scalar(statement) is None:
                    raise QuotaExceeded('今日 AI 调用额度已用完，请明天再来。')
            db.commit()


class LimitedProvider:
    """Count actual upstream attempts, including streaming and automatic support."""
    def __init__(self, provider, accounts):
        self.provider, self.accounts = provider, accounts

    @property
    def configured(self):
        return self.provider.configured

    async def complete_json(self, system, payload):
        if self.configured:
            self.accounts.consume()
        return await self.provider.complete_json(system, payload)

    def __getattr__(self, name):
        if name != 'stream_json':
            raise AttributeError(name)
        stream = getattr(self.provider, name)  # Preserve non-streaming provider behavior.
        async def limited(system, payload):
            if self.configured:
                self.accounts.consume()
            async for chunk in stream(system, payload):
                yield chunk
        return limited
