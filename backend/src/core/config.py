"""Application configuration — environment-sourced, secrets never committed.

All settings come from environment variables (rules.md §5; a ``.env`` file
is loaded if present — ``.env`` is already git-ignored).
"""

from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

# Load a .env from backend/ if python-dotenv is available (optional dep).
try:  # pragma: no cover - trivial env loading
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:  # pragma: no cover
    pass

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


_DEFAULT_JWT_SECRET = "dev-only-secret-change-me"


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
        default=_DEFAULT_JWT_SECRET,
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
    #: Loopback dev origins by default (any port). Pin exact origins in
    #: production via CORS_ALLOW_ORIGINS='["https://pwa.example.gov.in"]'.
    cors_allow_origins: list[str] = Field(
        default=[
            f"http://{host}:{port}"
            for port in (5173, 5174, 4173)
            for host in ("localhost", "127.0.0.1", "[::1]")
        ],
        description="Browser origins allowed to call this API.",
    )

    # --- Reports (Phase 5) ------------------------------------------------
    reports_dir: str = Field(default="./reports")
    #: Base URL of the public verification page the QR code points at.
    #: Dev: Vite serves /verify/:reportId on port 5174 (package.json). For a
    #: phone to open the QR, set REPORT_VERIFY_BASE_URL to the laptop's LAN
    #: address, e.g. http://192.168.1.20:5174/verify (run.bat does this).
    report_verify_base_url: str = Field(default="http://localhost:5174/verify")

    # --- Drift watchdog (D-14, verified from R 76-1 §3.9.2.3) ------------
    #: Zero-indication drift allowance: 1e per 1 degC (class I),
    #: 1e per 5 degC (classes II/III/IIII).
    drift_scale_intervals_per_degree: dict[str, int] = Field(
        default_factory=lambda: {"I": 1, "II": 5, "III": 5, "IIII": 5}
    )
    #: Default static temperature limits when none are marked (§3.9.2.1).
    default_temp_min_c: float = -10.0
    default_temp_max_c: float = 40.0
    #: Temperature change during the test campaign (start -> end). R 76-1
    #: Annex A test conditions require a steady temperature: at most 1/5 of
    #: the temperature range and never more than 5 degC (2 degC for creep).
    #: Above the red threshold the readings are void; amber flags approach.
    drift_warn_delta_c: float = 2.0
    drift_red_delta_c: float = 5.0


_JWT_SECRET_FILE = Path(__file__).resolve().parents[2] / ".jwt_secret"


def _resolve_jwt_secret(configured: Settings) -> None:
    """Never sign tokens with the secret that is published in the repo.

    Production refuses to start without JWT_SECRET_KEY. Development generates
    a random secret once and keeps it in ``backend/.jwt_secret`` (git-ignored)
    so logins survive restarts.
    """
    if configured.jwt_secret_key != _DEFAULT_JWT_SECRET:
        return
    if configured.environment == "production":
        raise RuntimeError("JWT_SECRET_KEY must be set in production.")
    try:
        secret = _JWT_SECRET_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        secret = ""
    if len(secret) < 32:
        secret = secrets.token_urlsafe(48)
        try:
            _JWT_SECRET_FILE.write_text(secret, encoding="utf-8")
        except OSError:
            pass  # read-only checkout: secret lives for this process only
    configured.jwt_secret_key = secret


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (FastAPI dependency-friendly)."""
    configured = Settings()
    _resolve_jwt_secret(configured)
    return configured


settings = get_settings()
