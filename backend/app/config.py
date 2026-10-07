"""Application settings, loaded from environment variables (and .env locally)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # The DB file lives next to the code. On Render's free plan (no persistent disk) it is
    # recreated on every deploy/restart, and AUTO_SEED refills the demo data.
    database_url: str = "sqlite:///./signal.db"
    # Comma-separated list, e.g. "http://localhost:3000,https://my-app.vercel.app"
    cors_origins: str = "http://localhost:3000"

    # Secrets: only ever read from the environment, never hardcoded.
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    session_days: int = 30
    auto_seed: bool = True
    # The OTP is mocked: every phone number accepts this code. Required, no default,
    # so the app refuses to start rather than silently using a well-known code.
    fixed_otp: str = Field(pattern=r"^\d{6}$")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cloudinary_enabled(self) -> bool:
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
