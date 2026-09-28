"""Database engine/session management (Phase 2).

SQLite for dev/demo (zero setup); PostgreSQL in production via
``DATABASE_URL``. Sessions are provided as a FastAPI dependency.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from ..core.config import settings

_IS_SQLITE = settings.database_url.startswith("sqlite")

# SQLite needs check_same_thread=False under FastAPI's threadpool; the longer
# timeout makes concurrent writers wait for the lock instead of failing with
# "database is locked" (seen at ~25 concurrent users in load tests).
_connect_args = {"check_same_thread": False, "timeout": 30} if _IS_SQLITE else {}

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    future=True,
)

if _IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record) -> None:  # pragma: no cover - driver hook
        """WAL lets readers proceed during a write; enforce foreign keys."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

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
