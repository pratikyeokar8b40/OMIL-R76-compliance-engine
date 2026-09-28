"""Audit glue for routers (P7-1): client IP extraction + one-call record.

Keeps the per-endpoint diff to a single line:
``audit(db, request, user, AuditAction.CREATE, "instrument.create", object_ref=...)``.
"""

from __future__ import annotations

import threading
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from ..db.models import User
from ..services.audit_service import record
from ..db.audit_models import AuditAction

#: The hash chain links each row to the previous row's hash, so "read the
#: chain head, append, commit" must not interleave between requests. On
#: PostgreSQL an advisory lock inside ``record`` serializes it; SQLite has no
#: equivalent, and concurrent writers forked the chain (verify reported
#: "tampered" after 10 concurrent users). This lock covers the whole
#: read-append-commit within the (single-worker) process.
_CHAIN_LOCK = threading.Lock()


def client_ip(request: Request) -> str | None:
    """Best-effort client IP; honors the first X-Forwarded-For hop (proxy)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def audit(
    db: Session,
    request: Request,
    user: User | None,
    action: AuditAction,
    action_detail: str,
    *,
    object_ref: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """Record one audit row for this request (failure policy per service)."""
    # Check out this request's pooled connection BEFORE taking the lock. The
    # service has usually just committed, which returns the connection to the
    # pool; if the lock holder then had to wait for the pool while every
    # pooled connection belonged to a thread waiting for this lock, nothing
    # could move until the 30 s pool timeout (seen at 25 concurrent users).
    db.connection()
    with _CHAIN_LOCK:
        record(
            db,
            actor_id=user.id if user else None,
            actor_email=user.email if user else None,
            action=action,
            action_detail=action_detail,
            object_ref=object_ref,
            source_ip=client_ip(request),
            detail=detail,
        )
        db.commit()
