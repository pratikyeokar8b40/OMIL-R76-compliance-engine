"""Auth & users endpoints (architecture.md §6.1)."""

from __future__ import annotations

import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..audit_helpers import audit
from ..deps import AdminOnly, AnyUser, DbDep, token_pair_response
from ...db.audit_models import AuditAction
from ...core.security import decode_token, TOKEN_TYPE_REFRESH
from ...services.user_service import AuthError, ConflictError, create_user
from ..schemas import LoginRequest, RefreshRequest, TokenResponse, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])

#: Brute-force brake: this many failed logins for one (client IP, email)
#: within the window blocks further attempts until the window rolls over.
_MAX_FAILED_LOGINS = 10
_FAILED_LOGIN_WINDOW_S = 300.0
_failed_logins: dict[tuple[str, str], list[float]] = {}
_failed_lock = threading.Lock()


def _recent_failures(key: tuple[str, str], now: float) -> list[float]:
    stamps = [t for t in _failed_logins.get(key, []) if now - t < _FAILED_LOGIN_WINDOW_S]
    if stamps:
        _failed_logins[key] = stamps
    else:
        _failed_logins.pop(key, None)
    return stamps


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: DbDep) -> TokenResponse:
    """Exchange email+password for a token pair."""
    from ...services.user_service import authenticate

    # Socket address, not X-Forwarded-For: a client could rotate that header
    # to dodge the limit.
    key = (request.client.host if request.client else "?", body.email.strip().lower())
    now = time.monotonic()
    with _failed_lock:
        recent = _recent_failures(key, now)
        if len(recent) >= _MAX_FAILED_LOGINS:
            retry_after = int(_FAILED_LOGIN_WINDOW_S - (now - recent[0])) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"too many failed sign-in attempts; try again in {retry_after} s",
                headers={"Retry-After": str(retry_after)},
            )
    try:
        _user, access, refresh = authenticate(
            db, email=body.email, password=body.password
        )
    except AuthError as exc:
        with _failed_lock:
            _failed_logins.setdefault(key, []).append(now)
        audit(
            db, request, None, AuditAction.DENIED, "auth.login_failed",
            detail={"email": body.email, "reason": str(exc)},
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    with _failed_lock:
        _failed_logins.pop(key, None)
    audit(db, request, _user, AuditAction.LOGIN, "auth.login")
    return TokenResponse(

        access_token=access,
        refresh_token=refresh,
        role=_user.role.value,
        full_name=_user.full_name,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: DbDep) -> TokenResponse:
    """Exchange a refresh token for a fresh pair."""
    import jwt as pyjwt
    import uuid as _uuid

    from ...db.models import User

    try:
        claims = decode_token(body.refresh_token, expected_type=TOKEN_TYPE_REFRESH)
    except (pyjwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token") from exc
    user = db.get(User, _uuid.UUID(str(claims["sub"])))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown or deactivated user")
    return token_pair_response(user)


@users_router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_new_user(body: UserCreate, db: DbDep, admin: AdminOnly) -> UserOut:
    """Create a user (admin only)."""
    try:
        user = create_user(
            db,
            full_name=body.full_name,
            email=body.email,
            password=body.password,
            role=body.role,
        )
    except ConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return UserOut.model_validate(user)


@users_router.get("/me", response_model=UserOut)
def read_me(user: AnyUser) -> UserOut:
    """Return the caller's profile."""
    return UserOut.model_validate(user)


@users_router.get("/audit")
def read_audit_trail(
    db: DbDep,
    _admin: AdminOnly,
    limit: int = 100,
) -> list[dict[str, object]]:
    """Admin-only audit trail (P7-1): newest-first, chain-verifiable via
    ``GET /users/audit/verify``. Actors see their actions; admins see all."""
    from ...services.audit_service import list_recent

    return [
        {
            "id": row.id,
            "at": row.at.isoformat() if row.at else None,
            "actor_email": row.actor_email,
            "action": row.action.value if row.action else None,
            "action_detail": row.action_detail,
            "object_ref": row.object_ref,
            "source_ip": row.source_ip,
            "detail_json": row.detail_json,
        }
        for row in list_recent(db, limit=limit)
    ]


@users_router.get("/audit/verify")
def verify_audit_chain(db: DbDep, _admin: AdminOnly) -> dict[str, object]:
    """Walk the hash chain and report integrity (P7-1 tamper evidence)."""
    from ...services.audit_service import verify_chain

    return verify_chain(db)
