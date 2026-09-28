"""FastAPI dependencies: DB session + JWT/RBAC guards (P2-2, §11)."""

from __future__ import annotations

import uuid
from typing import Annotated

import jwt as pyjwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..core.security import ROLE_ADMIN, ROLE_OFFICER, ROLE_TECHNICIAN, decode_token
from ..db.database import get_db
from ..db.models import User
from .schemas import TokenResponse

bearer_scheme = HTTPBearer(auto_error=False)

#: Per-request DB session (tests override via app.dependency_overrides[get_db]).
DbDep = Annotated[Session, Depends(get_db)]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(
    db: DbDep,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ],
) -> User:
    """Resolve the bearer token to an active user row."""
    if credentials is None:
        raise _unauthorized("missing bearer token")
    try:
        claims = decode_token(credentials.credentials)
    except (pyjwt.PyJWTError, ValueError) as exc:
        raise _unauthorized(f"invalid token: {exc}") from exc
    user = db.get(User, uuid.UUID(str(claims["sub"])))
    if user is None or not user.is_active:
        raise _unauthorized("unknown or deactivated user")
    return user


def require_roles(*allowed: str):
    """RBAC guard factory — use as ``Depends(require_roles(ROLE_ADMIN))``."""

    def _guard(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role.value not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"role {user.role.value!r} may not perform this action",
            )
        return user

    return _guard


#: Technician or admin — instrument/session creation (§11: officers view only).
TechnicianOnly = Annotated[
    User,
    Depends(require_roles(ROLE_TECHNICIAN, ROLE_ADMIN)),
]
#: Any authenticated user (read surfaces).
TechnicianPlus = Annotated[
    User,
    Depends(require_roles(ROLE_TECHNICIAN, ROLE_OFFICER, ROLE_ADMIN)),
]
#: Any authenticated user.
AnyUser = Annotated[User, Depends(current_user)]
#: Approving officers only — report sign-off (architecture.md §11: admins
#: manage users and the audit trail but do not sign reports).
OfficerOnly = Annotated[User, Depends(require_roles(ROLE_OFFICER))]
#: Admin only — user management.
AdminOnly = Annotated[User, Depends(require_roles(ROLE_ADMIN))]


def token_pair_response(user: User) -> TokenResponse:
    """Build the standard token response for a user."""
    from ..core.security import create_access_token, create_refresh_token

    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id), user.role.value),
        role=user.role.value,
        full_name=user.full_name,
    )
