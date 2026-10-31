"""Local administrator connection settings; secrets never appear in public views."""
import asyncio
import ipaddress
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit, urlunsplit
from pydantic import Field, SecretStr, field_validator
from .contracts import Contract
from .ai import make_provider


def is_loopback(host: str | None) -> bool:
    if host == 'localhost':
        return True
    try:
        return ipaddress.ip_address(host or '').is_loopback
    except ValueError:
        return False


class AIConnectionUpdate(Contract):
    provider: Literal['none', 'openai'] = 'openai'
    base_url: str = Field(default='https://api.openai.com/v1', max_length=2048)
    model: str = Field(default='', max_length=200)
    api_key: SecretStr | None = None
    clear_api_key: bool = False
    timeout_seconds: float = Field(default=45, ge=1, le=120)

    @field_validator('base_url')
    @classmethod
    def validate_url(cls, value):
        value = value.strip().rstrip('/')
        url = urlsplit(value)
        if any(c.isspace() or ord(c) < 32 for c in value):
            raise ValueError('API 地址不能包含空白或控制字符。')
        if not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError('API 地址需为完整地址，不能包含账号、密钥、查询参数或片段。')
        if url.scheme != 'https' and not (url.scheme == 'http' and is_loopback(url.hostname)):
            raise ValueError('API 地址需使用 HTTPS；本机开发服务可使用 HTTP。')
        try:
            url.port
        except ValueError:
            raise ValueError('API 端口无效。') from None
        path = url.path.removesuffix('/chat/completions').rstrip('/')
        return urlunsplit((url.scheme, url.netloc, path, '', ''))

    @field_validator('model')
    @classmethod
    def clean_model(cls, value):
        return value.strip()

    @field_validator('api_key')
    @classmethod
    def clean_key(cls, value):
        if value is not None:
            text = value.get_secret_value().strip()
            if len(text) > 4096 or any(c.isspace() for c in text):
                raise ValueError('密钥格式无效。')
            return SecretStr(text)
        return None


class ConnectionSettingsError(Exception):
    pass


class AIConnection:
    def __init__(self, config, load_saved=True):
        self.current = config.model_copy(deep=True)
        self.path = Path(config.ai_config_path)
        self.lock = asyncio.Lock()
        self.load_error = False
        if load_saved and self.path.exists():
            try:
                saved = AIConnectionUpdate.model_validate_json(self.path.read_text())
                saved.clear_api_key = not bool(saved.api_key and saved.api_key.get_secret_value())
                self.current = self._candidate(saved)
            except (OSError, ValueError, ConnectionSettingsError):
                self.load_error = True

    def public(self):
        return {
            'provider': self.current.ai_provider,
            'base_url': self.current.ai_base_url,
            'model': self.current.ai_model,
            'has_api_key': bool(self.current.ai_api_key),
            'timeout_seconds': self.current.ai_timeout_seconds,
            'configured': make_provider(self.current).configured,
            'load_error': self.load_error,
        }

    def _candidate(self, body):
        key = self.current.ai_api_key
        if body.clear_api_key:
            key = ''
        elif body.api_key is not None and body.api_key.get_secret_value():
            key = body.api_key.get_secret_value()
        elif body.base_url != self.current.ai_base_url and key:
            raise ConnectionSettingsError('更换 API 地址时，请重新填写密钥。')
        if body.provider == 'openai' and (not key or not body.model):
            raise ConnectionSettingsError('请填写 API 密钥和模型名。')
        return self.current.model_copy(update={
            'ai_provider': body.provider, 'ai_base_url': body.base_url,
            'ai_api_key': key, 'ai_model': body.model,
            'ai_timeout_seconds': body.timeout_seconds,
        })

    async def save(self, body):
        async with self.lock:
            candidate = self._candidate(body)
            # Private atomic file; never change the user's existing .env or records.
            payload = {
                'provider': candidate.ai_provider, 'base_url': candidate.ai_base_url,
                'model': candidate.ai_model, 'api_key': candidate.ai_api_key,
                'timeout_seconds': candidate.ai_timeout_seconds,
            }
            temporary = None
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                fd, temporary = tempfile.mkstemp(prefix='.ai-connection-', dir=self.path.parent)
                with os.fdopen(fd, 'w') as file:
                    os.chmod(temporary, 0o600)
                    json.dump(payload, file, ensure_ascii=False)
                    file.flush()
                    os.fsync(file.fileno())
                os.replace(temporary, self.path)
            except OSError:
                raise ConnectionSettingsError('配置保存失败，请检查项目数据目录的写入权限。') from None
            finally:
                if temporary and os.path.exists(temporary):
                    os.unlink(temporary)
            self.current = candidate
            self.load_error = False
            return make_provider(candidate)

    async def test(self, body):
        # Tests the entered draft without saving it or sending any learning records.
        candidate = self._candidate(body)
        if candidate.ai_provider == 'none':
            raise ConnectionSettingsError('请先选择 OpenAI 兼容接口。')
        start = time.perf_counter()
        try:
            result = await make_provider(candidate).complete_json(
                '这是接口连接测试。只输出 JSON 对象 {"ok":true}，不要添加其他内容。',
                {'connection_test': True},
            )
        except Exception:
            raise ConnectionSettingsError('连接测试失败。请核对地址、密钥、模型名及 JSON 输出支持。') from None
        if result.get('ok') is not True:
            raise ConnectionSettingsError('服务已响应，但未返回约定的 JSON，请检查模型的结构化输出支持。')
        return {'ok': True, 'latency_ms': round((time.perf_counter()-start)*1000),
                'message': '连接成功，模型已返回有效 JSON。'}
