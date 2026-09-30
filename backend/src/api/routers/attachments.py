"""Attachments upload (P2-7): type/size restricted, never served as web content.

Evidence is stored in the database (``attachments`` table) under a generated
UUID name — the original filename is never used (path-traversal defense) —
so it survives on hosts without a persistent disk. Files saved under
``settings.uploads_dir/<session_id>/`` by earlier versions are still listed.
The declared content type must match the file's magic bytes, and only
technicians/admins may attach evidence to an OPEN session.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, status
from sqlalchemy import select

from ..audit_helpers import audit
from ..deps import AnyUser, DbDep
from ...db.audit_models import AuditAction
from ...core.config import settings
from ...db.models import Attachment, SessionStatus, TestSession
from ...services.session_service import get_session

router = APIRouter(prefix="/sessions", tags=["attachments"])

#: Declared content type -> (file extension, magic-byte check).
_SIGNATURES: dict[str, tuple[str, object]] = {
    "image/jpeg": (".jpg", lambda b: b.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda b: b.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"),
    "application/pdf": (".pdf", lambda b: b.startswith(b"%PDF-")),
}


def _uploads_root() -> Path:
    return Path(settings.uploads_dir)


def _session_dir(session_id: uuid.UUID) -> Path:
    return _uploads_root() / str(session_id)


@router.post("/{session_id}/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    session_id: uuid.UUID,
    request: Request,
    file: UploadFile,
    db: DbDep,
    user: AnyUser,
) -> dict[str, str]:
    """Upload a photo/document for a session (jpeg/png/webp/pdf, MAX_UPLOAD_BYTES)."""
    if user.role.value == "approving_officer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "officers may not attach evidence")
    session: TestSession | None = get_session(db, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    if session.status not in (SessionStatus.DRAFT, SessionStatus.IN_PROGRESS):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"session is {session.status.value}; evidence is sealed with the report",
        )
    if file.content_type not in settings.allowed_upload_mimetypes or file.content_type not in _SIGNATURES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"content type {file.content_type!r} is not permitted",
        )
    payload = await file.read(settings.max_upload_bytes + 1)
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file exceeds the {settings.max_upload_bytes / (1024 * 1024):g} MB limit",
        )
    if not payload:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "empty upload")
    extension, matches = _SIGNATURES[file.content_type]
    if not matches(payload):  # type: ignore[operator]
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"file content is not a valid {file.content_type}",
        )

    row = Attachment(
        session_id=session_id,
        stored_as=f"{uuid.uuid4().hex}{extension}",
        content_type=file.content_type,
        size_bytes=len(payload),
        data=payload,
        uploaded_by=user.id,
    )
    db.add(row)
    db.commit()
    try:
        audit(
            db, request, user, AuditAction.UPLOAD, "attachment.upload",
            object_ref=f"TestSession:{session_id}",
            detail={"stored_as": row.stored_as, "content_type": file.content_type,
                    "size": len(payload)},
        )
    except Exception:
        # Evidence without its audit record must not remain (production raises).
        db.delete(row)
        db.commit()
        raise
    return {
        "stored_as": row.stored_as,
        "size_bytes": str(len(payload)),
        "content_type": file.content_type or "unknown",
    }


@router.get("/{session_id}/attachments")
def list_attachments(session_id: uuid.UUID, db: DbDep, _user: AnyUser) -> list[dict[str, str]]:
    """Evidence files stored for a session (newest first)."""
    if get_session(db, session_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    rows = db.scalars(select(Attachment).where(Attachment.session_id == session_id)).all()
    listed = [
        {
            "stored_as": row.stored_as,
            "size_bytes": str(row.size_bytes),
            "uploaded_at": row.uploaded_at.isoformat(),
        }
        for row in rows
    ]
    # Evidence saved to disk by earlier versions.
    folder = _session_dir(session_id)
    if folder.is_dir():
        listed += [
            {
                "stored_as": f.name,
                "size_bytes": str(f.stat().st_size),
                "uploaded_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
            }
            for f in folder.iterdir()
            if f.is_file()
        ]
    return sorted(listed, key=lambda item: item["uploaded_at"], reverse=True)


def uploads_root() -> Path:
    """Public accessor used by tests and (Phase 5) the report builder."""
    return _uploads_root()
