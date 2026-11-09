from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Literal

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    ai_provider: Literal['none', 'openai', 'deeptutor'] = 'none'
    ai_base_url: str = 'https://api.openai.com/v1'
    ai_api_key: str = ''
    ai_model: str = ''
    ai_timeout_seconds: float = 45
    ai_config_path: str = './data/ai-connection.json'
    ai_settings_enabled: bool = True
    deeptutor_ws_url: str = 'ws://127.0.0.1:8001/ws'
    deeptutor_token: str = ''
    database_url: str = 'sqlite:///./data/study.db'
    allowed_origins: str = 'http://localhost:3000,http://127.0.0.1:3000'
    cookie_secure: bool = False
    vision_enabled: bool = True
    vision_calibration_cache_seconds: int = Field(default=900,ge=0,le=900)
    support_wait_seconds: int = 30
    support_max_states_per_turn: int = Field(default=3,ge=1,le=3)
    support_retry_seconds: int = 30
    # Legacy environment keys remain readable, but no longer gate new support states.
    support_cooldown_seconds: int = 0
    support_max_episodes: int = 0
    support_refresh_seconds: int = 0
    support_state_stable_seconds: int = 6
    support_error_threshold: int = 2

settings = Settings()
