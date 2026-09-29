"""Database engine/session management (Phase 2).

SQLite for dev/demo (zero setup); PostgreSQL in production via
``DATABASE_URL``. Sessions are provided as a FastAPI dependency.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ..core.config import settings

# SQLite needs check_same_thread=False under FastAPI's threadpool.
_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    """Create tables (dev/demo convenience; production uses Alembic)."""
    from . import audit_models  # noqa: F401 - register the audit table
    from .models import Base  # noqa: F401 - ensure metadata is loaded

    Base.metadata.create_all(bind=engine)
