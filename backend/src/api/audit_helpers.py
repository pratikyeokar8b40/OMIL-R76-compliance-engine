"""Audit glue for routers (P7-1): client IP extraction + one-call record.

Keeps the per-endpoint diff to a single line:
``audit(db, request, user, AuditAction.CREATE, "instrument.create", object_ref=...)``.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from ..db.models import User
from ..services.audit_service import record
from ..db.audit_models import AuditAction


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
