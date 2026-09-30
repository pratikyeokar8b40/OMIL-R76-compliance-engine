"""Audit log model (P7-1) — append-only record of every authenticated write.

The audit trail is metadata for accountability: actor, action, object,
timestamp, source IP, and a JSON payload summary. It is deliberately
append-only (INSERT-only, like observations) — no update/delete code paths
exist, and a future hardening step can enforce it with DB triggers.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, UTCDateTime


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuditAction(str, enum.Enum):
    """Coarse action taxonomy for filtering (§P7-1)."""

    CREATE = "create"
    UPDATE = "update"
    TRANSITION = "transition"  # status changes: finalize, sign, verify-fail
    UPLOAD = "upload"
    LOGIN = "login"
    LOGOUT = "logout"
    DENIED = "denied"  # RBAC rejection — investigations need these


class AuditLog(Base):
    """One row per authenticated state-changing request."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=_utcnow, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True, index=True
    )
    #: Denormalized actor email — survives user deletion, readable in exports.
    actor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, native_enum=False, length=16)
    )
    #: e.g. "instrument.create", "session.finalize", "report.sign"
    action_detail: Mapped[str] = mapped_column(String(64), index=True)
    #: The primary object touched, as "<Type>:<uuid>" — filterable without joins.
    object_ref: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    #: Client IP when available (behind a proxy: X-Forwarded-For first hop).
    source_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: Small JSON summary (no secrets, no payloads > 2 KB — truncated).
    detail_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Row hash for tamper-evidence (sha256 of canonical row content + prev hash).
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    row_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


__all__ = ["AuditAction", "AuditLog"]
