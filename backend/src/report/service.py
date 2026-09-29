"""Report orchestration service (P5-2/P5-3, architecture.md §7.3).

One entry point — ``generate_report`` — runs on the finalize transition:

1. aggregate the session into an immutable snapshot (``aggregate.py``);
2. render DOCX first, PDF second (authoritative);
3. seal: the QR embeds a *content* digest (canonical JSON of the snapshot +
   template version), while the ``Report.sha256`` column stores the SHA-256
   of the delivered PDF bytes. Two layers: byte-level tamper evidence plus
   meaning-level verification that survives reprints;
4. persist the artifacts under ``settings.reports_dir`` and return the row.

Regeneration policy: finalize is the only trigger and sessions transition
``in_progress → completed`` exactly once, so one report per session holds.
``reverify_bytes`` lets the verify endpoint prove a stored file still
matches its seal.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

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


def _reports_root() -> Path:
    root = Path(settings.reports_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def generate_report(
    db: OrmSession,
    session_id: uuid.UUID,
    *,
    verify_base_url: str,
) -> Report:
    """Render + seal + persist the report for a finalized session.

    Raises ``ValueError`` from ``aggregate_session`` if the session is not
    in a completed/approved state.
    """
    data = aggregate_session(db, session_id)
    digest = content_digest(data)

    docx_bytes = render_docx(data, verify_base_url=verify_base_url, sha256=digest, report_id=str(session_id))
    pdf_bytes = render_pdf(data, verify_base_url=verify_base_url, sha256=digest, report_id=str(session_id))

    root = _reports_root()
    pdf_path = root / f"{session_id}.pdf"
    docx_path = root / f"{session_id}.docx"
    pdf_path.write_bytes(pdf_bytes)
    docx_path.write_bytes(docx_bytes)

    report = Report(
        session_id=session_id,
        file_path=str(pdf_path),
        docx_path=str(docx_path),
        sha256=sha256_hex(pdf_bytes),  # byte-level seal of the delivered file
        qr_payload=f"{verify_base_url.rstrip('/')}/{session_id}#{digest}",
        template_version=data.template_version,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def reverify_bytes(report: Report) -> bool:
    """True if the stored PDF on disk still hashes to its recorded seal."""
    try:
        stored = Path(report.file_path).read_bytes()
    except OSError:
        return False
    return sha256_hex(stored) == report.sha256


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
    docx_bytes = render_docx(data, verify_base_url=base, sha256=digest, report_id=str(report.session_id))
    pdf_bytes = render_pdf(data, verify_base_url=base, sha256=digest, report_id=str(report.session_id))
    pdf_path = Path(report.file_path)
    docx_path = Path(report.docx_path) if report.docx_path is not None else None
    pdf_tmp = pdf_path.with_suffix(pdf_path.suffix + ".tmp")
    docx_tmp = docx_path.with_suffix(docx_path.suffix + ".tmp") if docx_path else None
    try:
        pdf_tmp.write_bytes(pdf_bytes)
        if docx_tmp is not None:
            docx_tmp.write_bytes(docx_bytes)
        pdf_tmp.replace(pdf_path)
        if docx_tmp is not None:
            docx_tmp.replace(docx_path)
    finally:
        for temporary in (pdf_tmp, docx_tmp):
            if temporary is not None:
                try:
                    temporary.unlink()
                except FileNotFoundError:
                    pass
    report.sha256 = sha256_hex(pdf_bytes)
    report.qr_payload = f"{base.rstrip('/')}/{report.session_id}#{digest}"
    if commit:
        db.commit()
        db.refresh(report)
    return report
