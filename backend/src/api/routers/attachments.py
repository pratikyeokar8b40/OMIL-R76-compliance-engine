"""Attachments upload (P2-7): type/size restricted, stored outside web root.

Files land under ``settings.uploads_dir`` with UUID names — the original
filename is never used in the filesystem path (path-traversal defense).
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, status

from ..audit_helpers import audit
from ..deps import AnyUser, DbDep
from ...db.audit_models import AuditAction
from ...core.config import settings
from ...db.models import TestSession
from ...services.session_service import get_session

router = APIRouter(prefix="/sessions", tags=["attachments"])


def _uploads_root() -> Path:
    root = Path(settings.uploads_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


@router.post("/{session_id}/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    session_id: uuid.UUID,
    request: Request,
    file: UploadFile,
    db: DbDep,
    user: AnyUser,
) -> dict[str, str]:
    """Upload a photo/document for a session (10 MB, jpeg/png/webp/pdf)."""
    session: TestSession | None = get_session(db, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    if file.content_type not in settings.allowed_upload_mimetypes:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"content type {file.content_type!r} is not permitted",
        )
    payload = await file.read(settings.max_upload_bytes + 1)
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file exceeds 10 MB limit"
        )
    if not payload:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "empty upload")

    suffix = Path(file.filename or "upload.bin").suffix[:8]
    dest = _uploads_root() / f"{uuid.uuid4().hex}{suffix}"
    dest.write_bytes(payload)
    try:
        audit(
            db, request, user, AuditAction.UPLOAD, "attachment.upload",
            object_ref=f"TestSession:{session_id}",
            detail={"stored_as": dest.name, "content_type": file.content_type,
                    "size": len(payload)},
        )
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return {
        "stored_as": dest.name,
        "size_bytes": str(len(payload)),
        "content_type": file.content_type or "unknown",
    }


def uploads_root() -> Path:
    """Public accessor used by tests and (Phase 5) the report builder."""
    return _uploads_root()
