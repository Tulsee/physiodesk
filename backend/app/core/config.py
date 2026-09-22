"""Application settings, loaded from the environment (or the repo-root .env)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Every value has a working default, so the API boots without a .env."""

    model_config = SettingsConfigDict(
        # The repo-root .env is shared by the backend, the frontend and compose;
        # a backend/.env may override it for local experiments.
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "PhysioDesk API"
    debug: bool = False

    database_url: str = Field(
        default="postgresql+psycopg://physiodesk:physiodesk@localhost:5432/physiodesk",
        description="SQLAlchemy connection URL.",
    )

    jwt_secret: str = Field(default="change-me-in-production")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    upload_dir: str = "uploads"
    max_upload_mb: int = 10

    cors_origins: str = "http://localhost:3000"

    seed_admin_username: str = "frontdesk"
    seed_admin_password: str = "physiodesk123"

    @field_validator("database_url")
    @classmethod
    def _normalize_driver(cls, v: str) -> str:
        """Accept a plain postgres:// URL and point SQLAlchemy at the psycopg 3 driver.

        Hosting providers hand out `postgres://...`, which SQLAlchemy rejects, and a
        bare `postgresql://` would pick the psycopg2 dialect we do not install.
        """
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upload_path(self) -> Path:
        """Absolute upload directory, created on first access."""
        p = Path(self.upload_dir)
        if not p.is_absolute():
            p = BACKEND_DIR / p
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env is parsed once per process."""
    return Settings()


settings = get_settings()
