"""Checklist endpoints (P4c, R 76-2 sheet 17 / test 17).

- ``POST /sessions/{id}/checklist/seed``  -> create the full sheet unchecked
- ``GET  /sessions/{id}/checklist``       -> latest-wins items + progress
- ``PUT  /sessions/{id}/checklist/items`` -> record one PASSED/FAILED/NA
  outcome (append-only supersession, audited).
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..audit_helpers import audit
from ..deps import AnyUser, DbDep
from ...db.audit_models import AuditAction
from ...db.models import TestSession
from ...services import checklist_service
from ...services.checklist_service import (
    ChecklistConflictError,
    ChecklistStateError,
    UnknownChecklistItemError,
)
from ...services.session_service import get_session

router = APIRouter(prefix="/sessions", tags=["checklist"])


class ChecklistItemOut(BaseModel):
    """One latest-wins checklist row."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    clause: str
    item_key: str
    requirement: str
    test_procedure: str
    outcome: str
    remarks: str | None
    revision_no: int


class ChecklistOut(BaseModel):
    """Sheet-17 projection: items in catalog order + progress counters."""

    items: list[ChecklistItemOut]
    progress: dict[str, int]


class ChecklistUpdate(BaseModel):
    """PUT body: one outcome."""

    clause: str = Field(min_length=1, max_length=16)
    item_key: str = Field(min_length=1, max_length=64)
    outcome: Literal["PASSED", "FAILED", "UNCHECKED", "NA"]
    remarks: str | None = Field(default=None, max_length=2000)


def _get(db, session_id: uuid.UUID) -> TestSession:
    session = get_session(db, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    return session


@router.post("/{session_id}/checklist/seed", status_code=status.HTTP_200_OK)
def seed(
    session_id: uuid.UUID,
    request: Request,
    db: DbDep,
    user: AnyUser,
) -> dict[str, int]:
    """Create every sheet-17 item unchecked (idempotent). Technicians/admins."""
    if user.role.value == "approving_officer":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "officers may not modify the checklist"
        )
    session = _get(db, session_id)
    try:
        created = checklist_service.seed_checklist(db, session, entered_by=user.id)
    except ChecklistStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ChecklistConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    audit(
        db, request, user, AuditAction.UPDATE, "checklist.seed",
        object_ref=f"TestSession:{session_id}",
        detail={"created": created},
    )
    db.commit()
    return {"created": created}


@router.get("/{session_id}/checklist", response_model=ChecklistOut)
def read_checklist(session_id: uuid.UUID, db: DbDep, user: AnyUser) -> ChecklistOut:
    """Latest-wins checklist items in official sheet order + progress."""
    session = _get(db, session_id)
    items = checklist_service.latest_checklist(db, session.id)
    return ChecklistOut(
        items=[ChecklistItemOut.model_validate(i) for i in items],
        progress=checklist_service.checklist_progress(items),
    )


@router.put("/{session_id}/checklist/items", response_model=ChecklistItemOut)
def update_item(
    session_id: uuid.UUID,
    body: ChecklistUpdate,
    request: Request,
    db: DbDep,
    user: AnyUser,
) -> ChecklistItemOut:
    """Record one PASSED / FAILED / NA outcome with optional remarks."""
    if user.role.value == "approving_officer":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "officers may not modify the checklist"
        )
    session = _get(db, session_id)
    try:
        row = checklist_service.submit_checklist_item(
            db,
            session,
            entered_by=user.id,
            clause=body.clause,
            item_key=body.item_key,
            outcome=body.outcome,
            remarks=body.remarks,
        )
    except UnknownChecklistItemError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ChecklistStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ChecklistConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    audit(
        db, request, user, AuditAction.UPDATE, "checklist.item",
        object_ref=f"ChecklistItem:{row.id}",
        detail={"session": str(session_id), "clause": body.clause,
                "item": body.item_key, "outcome": body.outcome},
    )
    db.commit()
    return ChecklistItemOut.model_validate(row)
