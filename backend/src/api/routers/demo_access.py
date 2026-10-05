"""Judge access (TEMPORARY, for SIH evaluation): sign in as a demo role
without a password.

Off unless ``DEMO_ROLE_LOGIN=true``. When off, the status endpoint says so
and the login endpoint answers 404, so the frontend hides its role picker.

To remove after judging: set ``DEMO_ROLE_LOGIN=false`` (or unset it) and
redeploy. To delete the feature entirely: remove this file, its
``include_router`` line in ``main.py``, the ``demo_role_login`` setting and
``frontend/src/components/JudgeAccess.jsx`` with its one line in ``App.jsx``.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from ..audit_helpers import audit
from ..deps import DbDep, token_pair_response
from ..schemas import TokenResponse
from ...core.config import settings
from ...db.audit_models import AuditAction
from ...db.models import User

router = APIRouter(prefix="/auth/demo", tags=["judge-access"])

#: The seeded demo account behind each role (scripts/seed_finale.py).
DEMO_ACCOUNTS: dict[str, str] = {
    "lab_technician": "tech@lab.gov.in",
    "approving_officer": "officer@lab.gov.in",
    "admin": "admin@lab.gov.in",
}


class DemoLoginRequest(BaseModel):
    role: Literal["lab_technician", "approving_officer", "admin"]


def _demo_user(db, role: str) -> User | None:
    user = db.scalar(select(User).where(User.email == DEMO_ACCOUNTS[role]))
    if user is None or not user.is_active or user.role.value != role:
        return None
    return user


@router.get("")
def demo_access_status(db: DbDep) -> dict[str, object]:
    """Whether judge access is on, and which roles can be entered."""
    if not settings.demo_role_login:
        return {"enabled": False, "roles": []}
    roles = [role for role in DEMO_ACCOUNTS if _demo_user(db, role) is not None]
    return {"enabled": bool(roles), "roles": roles}


@router.post("/login", response_model=TokenResponse)
def demo_login(body: DemoLoginRequest, request: Request, db: DbDep) -> TokenResponse:
    """Issue a normal token pair for the demo account of ``role``."""
    if not settings.demo_role_login:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    user = _demo_user(db, body.role)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no demo account for this role")
    # Recorded like any sign-in, so the audit trail shows judge sessions.
    audit(db, request, user, AuditAction.LOGIN, "auth.demo_login", detail={"role": body.role})
    return token_pair_response(user)
