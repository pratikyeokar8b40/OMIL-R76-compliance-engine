"""Report endpoints (P5-2…P5-6, architecture.md §6.5/§7.3).

- ``POST /sessions/{id}/finalize`` (sessions router) now generates the
  report as part of the transition — the PDF bytes exist before the
  response returns.
- ``GET /reports/{id}/download``     → PDF bytes (any authenticated user).
- ``GET /reports/{id}/docx``         → DOCX twin bytes.
- ``GET /public/verify/{report_id}`` → unauthenticated QR target: existence,
  content-digest match, stored-file integrity, session state and signer.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse

from ..audit_helpers import audit
from ...db.audit_models import AuditAction
from ..deps import AnyUser, DbDep, OfficerOnly
from ...core.config import settings
from ...db.models import Report, TestSession, User
from ...services.session_service import SessionStateError, mark_approved
from ...services.report_result import overall_result
from ...report import reverify_bytes, regenerate_artifacts
from ..schemas import ReportArchiveOut, ReportOut, SessionOut

router = APIRouter(prefix="/reports", tags=["reports"])
public_router = APIRouter(prefix="/public", tags=["public-verify"])


def _get_report_or_404(db: Any, report_id: uuid.UUID) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    return report


@router.get("", response_model=list[ReportArchiveOut])
def list_reports(db: DbDep, _user: AnyUser) -> list[ReportArchiveOut]:
    """All generated reports (archive view S6; small dataset — no paging yet)."""
    # A completed session can survive a renderer outage because finalization is
    # committed first; repair the missing artifact on the next archive read.
    for session in db.query(TestSession).all():
        if session.status.value not in ("completed", "approved"):
            continue
        if not db.query(Report).filter(Report.session_id == session.id).first():
            try:
                from ...report.service import generate_report

                generate_report(db, session.id, verify_base_url=settings.report_verify_base_url)
            except Exception:
                db.rollback()
    reports = db.query(Report).order_by(Report.created_at.desc()).all()
    return [
        ReportArchiveOut.model_validate({
            **r.__dict__,
            "signed_by_name": db.get(User, r.signed_by).full_name if r.signed_by and db.get(User, r.signed_by) else None,
            "overall_result": overall_result(db, db.get(TestSession, r.session_id)),
        })
        for r in reports
    ]


@router.get("/{report_id}", response_model=ReportOut)
def read_report(report_id: uuid.UUID, db: DbDep, _user: AnyUser) -> ReportOut:
    """Fetch a report record."""
    report = _get_report_or_404(db, report_id)
    session = db.get(TestSession, report.session_id)
    signer = db.get(User, report.signed_by) if report.signed_by else None
    payload = {
        **report.__dict__,
        "signed_by_name": signer.full_name if signer else None,
        "overall_result": overall_result(db, session),
    }
    return ReportOut.model_validate(payload)


@router.get("/{report_id}/download")
def download_pdf(report_id: uuid.UUID, db: DbDep, _user: AnyUser) -> FileResponse:
    """Authoritative sealed PDF bytes."""
    report = _get_report_or_404(db, report_id)
    path = Path(report.file_path)
    if not path.is_file():
        raise HTTPException(status.HTTP_410_GONE, "report file missing from storage")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"pattern-evaluation-report-{report.session_id}.pdf",
    )


@router.get("/{report_id}/docx")
def download_docx(report_id: uuid.UUID, db: DbDep, _user: AnyUser) -> FileResponse:
    """Editable DOCX twin bytes."""
    report = _get_report_or_404(db, report_id)
    if report.docx_path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no DOCX twin for this report")
    path = Path(report.docx_path)
    if not path.is_file():
        raise HTTPException(status.HTTP_410_GONE, "DOCX file missing from storage")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"pattern-evaluation-report-{report.session_id}.docx",
    )


@public_router.get("/verify/{report_id}")
def public_verify(report_id: uuid.UUID, db: DbDep) -> dict[str, Any]:
    """Unauthenticated QR target (S8): report authenticity check.

    Returns existence, the content digest embedded in the QR, stored-file
    integrity (``file_intact``), session state and signer identity — enough
    for a third party to confirm the artifact without an account.
    """
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    session = db.get(TestSession, report.session_id)
    signer = db.get(User, report.signed_by) if report.signed_by else None
    digest = report.qr_payload.rsplit("#", 1)[-1]
    return {
        "report_id": str(report.id),
        "session_id": str(report.session_id),
        "template_version": report.template_version,
        "content_digest": digest,
        "file_sha256": report.sha256,
        "file_intact": reverify_bytes(report),
        "session_status": session.status.value if session else "unknown",
        "signed": report.signed_by is not None,
        "signed_by": signer.full_name if signer else None,
        "signed_at": report.signed_at.isoformat() if report.signed_at else None,
        "overall_result": overall_result(db, session),
        "verify_base_url": settings.report_verify_base_url,
    }


@router.post("/sessions/{session_id}/sign", response_model=SessionOut)
def sign_session(
    session_id: uuid.UUID,
    request: Request,
    db: DbDep,
    officer: OfficerOnly,
    report_id: uuid.UUID | None = None,
) -> SessionOut:
    """Officer sign-off: completed → approved; stamps the report's seal row.

    ``report_id`` is optional; when omitted the session's latest report is
    signed. Sign-off requires a generated report (there is nothing to sign
    otherwise).
    """
    session = db.get(TestSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    report = (
        db.get(Report, report_id)
        if report_id is not None
        else (
            db.query(Report)
            .filter(Report.session_id == session_id)
            .order_by(Report.created_at.desc())
            .first()
        )
    )
    if report is None or report.session_id != session_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "no report generated for this session yet")
    try:
        session = mark_approved(db, session, commit=False)
    except SessionStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    report.signed_by = officer.id
    report.signed_at = datetime.now(tz=timezone.utc)
    # P5-6 signed-state rendering: re-render with the signatory filled in
    # and re-seal over the new content (files rewritten in place).
    try:
        regenerate_artifacts(db, report, commit=False)
        db.commit()
        db.refresh(session)
        db.refresh(report)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "report sign-off artifacts could not be stored",
        ) from exc
    audit(
        db, request, officer, AuditAction.TRANSITION, "report.sign",
        object_ref=f"Report:{report.id}",
        detail={"session": str(session_id), "sha256": report.sha256},
    )
    return SessionOut.model_validate(session)
