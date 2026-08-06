from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://momentum:momentum@localhost:5432/momentum"
    session_days: int = 7
    demo_mode: bool = True
    price_refresh_enabled: bool = True
    price_refresh_interval_seconds: int = 60
    support_email: str = "support@momentum.local"
    support_telegram: str = "@momentum_support"
    frontend_origin: str = "http://localhost:5173"
    upload_dir: Path = Path(__file__).resolve().parent.parent / "uploads"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
