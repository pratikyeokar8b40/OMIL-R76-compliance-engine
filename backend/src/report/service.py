"""Report orchestration service (P5-2/P5-3, architecture.md §7.3).

One entry point — ``generate_report`` — runs on the finalize transition:

1. aggregate the session into an immutable snapshot (``aggregate.py``);
2. render DOCX first, PDF second (authoritative);
3. seal: the QR embeds a *content* digest (canonical JSON of the snapshot +
   template version), while the ``Report.sha256`` column stores the SHA-256
   of the delivered PDF bytes. Two layers: byte-level tamper evidence plus
   meaning-level verification that survives reprints;
4. store the artifact bytes on the report row (plus a local copy under
   ``settings.reports_dir`` where the disk is writable) and return the row.

Regeneration policy: finalize is the only trigger and sessions transition
``in_progress → completed`` exactly once (atomic compare-and-set), and
``generate_report`` returns the existing row if one is already there, so one
report per session holds even under concurrent requests.

The QR code encodes ``{verify_base_url}/{report.id}#{content digest}``; the
report id is allocated BEFORE rendering so the printed QR, the printed
"Report ID" and ``GET /public/verify/{report_id}`` all agree.
``reverify_bytes`` lets the verify endpoint prove a stored file still
matches its seal.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

from sqlalchemy import select

from sqlalchemy.orm import Session as OrmSession

from ..core.config import settings
from ..db.models import Report
from .aggregate import ReportData, aggregate_session
from .docx import render_docx
from .pdf import render_pdf
from .seal import sha256_hex


def content_digest(data: ReportData) -> str:
    """SHA-256 over the canonical JSON of the render snapshot + template.

    This is the digest embedded in the QR payload: it verifies the report's
    *meaning* (all aggregated values), not one particular byte stream, so a
    re-rendered or printed copy still verifies.
    """
    canonical = {
        "template_version": data.template_version,
        "session_id": str(data.session_id),
        "instrument": data.instrument,
        "conditions": data.conditions,
        "observations": data.observations,
        "overall": data.overall,
        "tested_by": data.tested_by,
        "approved_by": data.approved_by,
        "session_state": data.session_state,
        "checklist": data.checklist,
        "checklist_progress": data.checklist_progress,
    }
    blob = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return sha256_hex(blob.encode("utf-8"))


#: Serializes report creation within the process (single-worker deployment):
#: the existence check and the insert must not interleave.
_GENERATE_LOCK = threading.Lock()


def latest_report_for(db: OrmSession, session_id: uuid.UUID) -> Report | None:
    """Most recent report row for a session, if any."""
    return db.scalar(
        select(Report)
        .where(Report.session_id == session_id)
        .order_by(Report.created_at.desc())
        .limit(1)
    )


def generate_report(
    db: OrmSession,
    session_id: uuid.UUID,
    *,
    verify_base_url: str,
) -> Report:
    """Render + seal + persist the report for a finalized session.

    Idempotent: if the session already has a report, that row is returned.

    Raises ``ValueError`` from ``aggregate_session`` if the session is not
    in a completed/approved state.
    """
    with _GENERATE_LOCK:
        existing = latest_report_for(db, session_id)
        if existing is not None:
            return existing

        data = aggregate_session(db, session_id)
        digest = content_digest(data)
        report_id = uuid.uuid4()

        docx_bytes = render_docx(data, verify_base_url=verify_base_url, sha256=digest, report_id=str(report_id))
        pdf_bytes = render_pdf(data, verify_base_url=verify_base_url, sha256=digest, report_id=str(report_id))

        pdf_path, docx_path = _local_copy(session_id, pdf_bytes, docx_bytes)

        report = Report(
            id=report_id,
            session_id=session_id,
            file_path=str(pdf_path),
            docx_path=str(docx_path),
            pdf_bytes=pdf_bytes,
            docx_bytes=docx_bytes,
            sha256=sha256_hex(pdf_bytes),  # byte-level seal of the delivered file
            qr_payload=f"{verify_base_url.rstrip('/')}/{report_id}#{digest}",
            template_version=data.template_version,
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report


def _local_copy(session_id: uuid.UUID, pdf_bytes: bytes, docx_bytes: bytes) -> tuple[Path, Path]:
    """Write a local copy of the artifacts; the database holds the originals.

    Best effort: on a host without a writable disk the report is still
    complete, because downloads and verification read the stored bytes.
    """
    root = Path(settings.reports_dir)
    pdf_path = root / f"{session_id}.pdf"
    docx_path = root / f"{session_id}.docx"
    try:
        root.mkdir(parents=True, exist_ok=True)
        pdf_path.write_bytes(pdf_bytes)
        docx_path.write_bytes(docx_bytes)
    except OSError:
        pass
    return pdf_path, docx_path


def _read_file(path: str | None) -> bytes | None:
    if not path:
        return None
    try:
        return Path(path).read_bytes()
    except OSError:
        return None


def pdf_artifact(report: Report) -> bytes | None:
    """The sealed PDF: stored bytes, or the file of a report created before
    artifacts were stored in the database."""
    return report.pdf_bytes if report.pdf_bytes is not None else _read_file(report.file_path)


def docx_artifact(report: Report) -> bytes | None:
    """The DOCX twin, same lookup order as :func:`pdf_artifact`."""
    return report.docx_bytes if report.docx_bytes is not None else _read_file(report.docx_path)


def reverify_bytes(report: Report) -> bool:
    """True if the stored PDF still hashes to its recorded seal."""
    stored = pdf_artifact(report)
    return stored is not None and sha256_hex(stored) == report.sha256


def _replace_with_retry(src: Path, dst: Path, attempts: int = 20) -> None:
    """os.replace, tolerating brief Windows file locks.

    Sync clients (OneDrive) and antivirus scanners briefly open freshly
    written files; on Windows a replace then fails with PermissionError and
    officer sign-off returned 503 intermittently.
    """
    for attempt in range(attempts):
        try:
            src.replace(dst)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.1)


def _replace_local_copy(report: Report, pdf_bytes: bytes, docx_bytes: bytes) -> None:
    """Atomically refresh the local copies; best effort like ``_local_copy``."""
    pdf_path = Path(report.file_path)
    docx_path = Path(report.docx_path) if report.docx_path is not None else None
    pdf_tmp = pdf_path.with_suffix(pdf_path.suffix + ".tmp")
    docx_tmp = docx_path.with_suffix(docx_path.suffix + ".tmp") if docx_path else None
    try:
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        pdf_tmp.write_bytes(pdf_bytes)
        if docx_tmp is not None:
            docx_tmp.write_bytes(docx_bytes)
        _replace_with_retry(pdf_tmp, pdf_path)
        if docx_tmp is not None:
            _replace_with_retry(docx_tmp, docx_path)
    except OSError:
        pass
    finally:
        for temporary in (pdf_tmp, docx_tmp):
            if temporary is not None:
                try:
                    temporary.unlink()
                except OSError:
                    pass


def regenerate_artifacts(
    db: OrmSession, report: Report, *, commit: bool = True
) -> Report:
    """Re-render + re-seal an existing report row (P5-6 signed-state rendering).

    Called after officer sign-off: the aggregate now carries the signatory,
    so the printed signature lines fill in and the seal is recomputed over
    the new content. Same file paths, updated digests.
    """
    data = aggregate_session(db, report.session_id)
    digest = content_digest(data)
    base = settings.report_verify_base_url
    docx_bytes = render_docx(data, verify_base_url=base, sha256=digest, report_id=str(report.id))
    pdf_bytes = render_pdf(data, verify_base_url=base, sha256=digest, report_id=str(report.id))
    _replace_local_copy(report, pdf_bytes, docx_bytes)
    report.pdf_bytes = pdf_bytes
    report.docx_bytes = docx_bytes
    report.sha256 = sha256_hex(pdf_bytes)
    report.qr_payload = f"{base.rstrip('/')}/{report.id}#{digest}"
    if commit:
        db.commit()
        db.refresh(report)
    return report
