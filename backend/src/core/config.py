"""Application configuration — environment-sourced, secrets never committed.

All settings come from environment variables (rules.md §5; a ``.env`` file
is loaded if present — ``.env`` is already git-ignored).
"""

from __future__ import annotations

import os
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Annotated

# Load a .env from backend/ if python-dotenv is available (optional dep).
try:  # pragma: no cover - trivial env loading
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:  # pragma: no cover
    pass

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _parse_string_list(value: object) -> list[str]:
    """Parse a string-list env var without crashing on plain-URL values.

    pydantic-settings defaults to JSON decoding for complex fields, so the
    shell-style form ``CORS_ALLOW_ORIGINS=http://localhost:8080`` (documented
    in deploy/.env.example and used by docker-compose.yml) previously aborted
    settings parsing and killed the app at import time. Accept both the JSON
    list form and a comma/whitespace separated URL list.
    """
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    if text.startswith("["):
        try:
            import json

            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except (ValueError, TypeError):
            pass  # fall through to the lenient URL-list form
    return [item.strip() for item in text.replace(",", " ").split() if item.strip()]


class Settings(BaseSettings):
    """Strongly-typed application settings."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # --- App -----------------------------------------------------------
    app_name: str = "OIML R-76 Compliance Engine"
    environment: str = Field(default="development")  # development|production

    # --- Database --------------------------------------------------------
    # Default: local SQLite for development/demo (zero setup). Production
    # swaps to PostgreSQL via DATABASE_URL (NUMERIC columns work in both).
    database_url: str = Field(
        default="sqlite:///./oiml_dev.db",
        description="SQLAlchemy URL. Production: postgresql+psycopg://...",
    )

    # --- Auth ------------------------------------------------------------
    jwt_secret_key: str = Field(
        default="dev-only-secret-change-me",
        description="MUST be overridden in production via JWT_SECRET_KEY.",
    )
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7

    # --- Uploads ---------------------------------------------------------
    uploads_dir: str = Field(default="./uploads")
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB
    allowed_upload_mimetypes: frozenset[str] = frozenset(
        {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    )

    # --- CORS ------------------------------------------------------------
    #: Loopback dev origins by default (Vite dev 5173/5174, preview 4173,
    #: Docker frontend 8080). Pin exact origins in production via
    #: CORS_ALLOW_ORIGINS='https://pwa.example.gov.in' (single URL or
    #: comma-separated list or JSON array are all accepted).
    cors_allow_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://[::1]:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://[::1]:5174",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://[::1]:4173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ],
        description="Browser origins allowed to call this API.",
    )

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _decode_cors_origins(cls, value: object) -> list[str]:
        return _parse_string_list(value)

    # --- Reports (Phase 5) ------------------------------------------------
    reports_dir: str = Field(default="./reports")
    #: Base URL of the public verification page the QR code points at.
    #: Dev: Vite serves /verify/:reportId. Production: pin via env.
    report_verify_base_url: str = Field(default="http://localhost:5173/verify")

    # --- Drift watchdog (D-14, verified from R 76-1 §3.9.2.3) ------------
    #: Zero-indication drift allowance: 1e per 1 degC (class I),
    #: 1e per 5 degC (classes II/III/IIII).
    drift_scale_intervals_per_degree: dict[str, int] = Field(
        default_factory=lambda: {"I": 1, "II": 5, "III": 5, "IIII": 5}
    )
    #: Default static temperature limits when none are marked (§3.9.2.1).
    default_temp_min_c: float = -10.0
    default_temp_max_c: float = 40.0


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (FastAPI dependency-friendly)."""
    return Settings()


settings = get_settings()
