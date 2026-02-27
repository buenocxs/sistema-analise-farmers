from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/mave_monitoring"
    SECRET_KEY: str = "change-me-to-a-random-string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ZAPI_CLIENT_TOKEN: str = ""
    OPENAI_API_KEY: str = ""
    APP_ENV: str = "development"
    CORS_ORIGINS: str = "*"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
