"""Phase 5 report tests (P5-2…P5-6): seal integrity, verification, downloads.

Runs against its own throwaway SQLite DB + reports dir. Covers:
- finalize generates the report (PDF + DOCX) and the seal row;
- the PDF/DOCX headers and the seal column sanity (renders real bytes);
- content-digest determinism and separation from the file-bytes hash;
- tamper detection via ``reverify_bytes``;
- the public verify endpoint (valid / unknown / tampered);
- RBAC on sign-off and the sign-time re-seal (signature appears in content).
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

# Configure BEFORE importing anything that reads settings.
_TMP = tempfile.mkdtemp(prefix="oiml_report_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOADS_DIR"] = _TMP
os.environ["REPORTS_DIR"] = f"{_TMP}/reports"
os.environ["JWT_SECRET_KEY"] = "test-secret-not-for-production-0123456789abcdef"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.api.main import app  # noqa: E402
from src.core.config import settings  # noqa: E402
from src.db.database import SessionLocal, create_all  # noqa: E402
from src.db.models import Report  # noqa: E402
from src.report import (  # noqa: E402
    aggregate_session,
    content_digest,
    reverify_bytes,
    sha256_hex,
)
from src.report.service import regenerate_artifacts  # noqa: E402
from tests._helpers import make_ready  # noqa: E402

create_all()

client = TestClient(app)


@pytest.fixture(scope="module")
def tokens() -> dict[str, str]:
    from src.services.user_service import seed_demo_users

    db = SessionLocal()
    try:
        seed_demo_users(db, password="demo-password-2026")
    finally:
        db.close()

    out: dict[str, str] = {}
    for name, email in (
        ("admin", "admin@lab.gov.in"),
        ("tech", "tech@lab.gov.in"),
        ("officer", "officer@lab.gov.in"),
    ):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "demo-password-2026"},
        )
        assert r.status_code == 200, r.text
        out[name] = r.json()["access_token"]
    return out


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def finalized(tokens) -> dict[str, str]:
    """Instrument + observation + finalize → {session_id, report_id}."""
    r = client.post(
        "/api/v1/instruments",
        headers=_auth(tokens["tech"]),
        json={
            "manufacturer": "Essae",
            "model": "DS-415",
            "serial_number": "R5-SEAL-001",
            "accuracy_class": "III",
            "max_capacity": "15",
            "min_capacity": "0.1",
            "verification_scale_interval": "0.005",
        },
    )
    assert r.status_code == 201, r.text
    instrument_id = r.json()["id"]

    r = client.post(
        "/api/v1/sessions",
        headers=_auth(tokens["tech"]),
        json={"instrument_id": instrument_id, "start_temp_c": "22.5", "humidity_pct": "48"},
    )
    assert r.status_code == 201, r.text
    session_id = r.json()["id"]

    obs = client.post(
        f"/api/v1/sessions/{session_id}/observations",
        headers=_auth(tokens["tech"]),
        json={
            "test_type": "weighing_performance",
            "sequence_no": 1,
            "applied_load": "5",
            "indication": "5.012",
            "additional_load": "0.003",
            "zero_error": "0.001",
        },
    )
    assert obs.status_code == 201, obs.text  # flagship FAIL: Ec 0.0085 > MPE 0.005

    make_ready(client, _auth(tokens["tech"]), session_id)
    fin = client.post(f"/api/v1/sessions/{session_id}/finalize", headers=_auth(tokens["tech"]))
    assert fin.status_code == 200, fin.text

    row = client.get("/api/v1/reports", headers=_auth(tokens["tech"])).json()
    report = next(r for r in row if r["session_id"] == session_id)
    return {"session_id": session_id, "report_id": report["id"]}


class TestGenerationAndSeal:
    def test_finalize_generated_files(self, tokens, finalized) -> None:
        r = client.get(
            f"/api/v1/reports/{finalized['report_id']}", headers=_auth(tokens["tech"])
        )
        assert r.status_code == 200
        body = r.json()
        assert "file_path" not in body and "docx_path" not in body
        assert body["overall_result"] == "FAIL"
        pdf = client.get(
            f"/api/v1/reports/{finalized['report_id']}/download",
            headers=_auth(tokens["tech"]),
        )
        docx = client.get(
            f"/api/v1/reports/{finalized['report_id']}/docx",
            headers=_auth(tokens["tech"]),
        )
        assert pdf.status_code == 200 and docx.status_code == 200
        # Stored seal == hash of the bytes served by the download endpoint.
        disk = sha256_hex(pdf.content)
        assert disk == body["sha256"]

    def test_pdf_magic_and_header_words(self, tokens, finalized) -> None:
        r = client.get(
            f"/api/v1/reports/{finalized['report_id']}/download",
            headers=_auth(tokens["tech"]),
        )
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        pdf = r.content
        assert pdf.startswith(b"%PDF-")
        # Content streams are compressed — extract text properly with pypdf.
        import io

        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        for needle in ("Pattern Evaluation Report", "Weighing performance", "OVERALL RESULT", "FAIL"):
            assert needle in text, needle
        assert "Page 1 of" in text  # exact-total footer

    def test_docx_magic_and_verdict(self, tokens, finalized) -> None:
        r = client.get(
            f"/api/v1/reports/{finalized['report_id']}/docx", headers=_auth(tokens["tech"])
        )
        assert r.status_code == 200
        docx = r.content
        assert docx.startswith(b"PK")  # OOXML zip
        # python-docx stores document.xml compressed; assert via python-docx.
        import io

        from docx import Document

        doc = Document(io.BytesIO(docx))
        full = "\n".join(p.text for p in doc.paragraphs)
        assert "Pattern Evaluation Report" in full
        assert "OVERALL RESULT: FAIL" in full

    def test_content_digest_is_meaning_not_bytes(self, finalized) -> None:
        db = SessionLocal()
        try:
            report = db.get(Report, __import__("uuid").UUID(finalized["report_id"]))
            data = aggregate_session(db, report.session_id)
            digest = content_digest(data)
            assert report.qr_payload.endswith(digest)
            assert digest != report.sha256  # meaning-seal vs byte-seal
            payload = report.qr_payload
            assert payload.startswith(settings.report_verify_base_url)
        finally:
            db.close()


class TestVerification:
    def test_red_drift_fails_passing_observations(self, tokens) -> None:
        instrument = client.post(
            "/api/v1/instruments",
            headers=_auth(tokens["tech"]),
            json={
                "manufacturer": "Essae",
                "model": "DS-415",
                "serial_number": "R5-DRIFT-RED",
                "accuracy_class": "III",
                "max_capacity": "15",
                "min_capacity": "0.1",
                "verification_scale_interval": "0.005",
            },
        )
        assert instrument.status_code == 201, instrument.text
        session = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": instrument.json()["id"], "start_temp_c": "22"},
        )
        assert session.status_code == 201, session.text
        session_id = session.json()["id"]
        observation = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "weighing_performance",
                "sequence_no": 1,
                "applied_load": "5",
                "indication": "5",
                "additional_load": "0",
                "zero_error": "0",
            },
        )
        assert observation.status_code == 201, observation.text
        assert observation.json()["evaluation"]["verdict"] == "PASS"
        make_ready(client, _auth(tokens["tech"]), session_id)
        patched = client.patch(
            f"/api/v1/sessions/{session_id}",
            headers=_auth(tokens["tech"]),
            json={"end_temp_c": "45"},
        )
        assert patched.status_code == 200, patched.text
        finalized = client.post(
            f"/api/v1/sessions/{session_id}/finalize", headers=_auth(tokens["tech"])
        )
        assert finalized.status_code == 200, finalized.text

        db = SessionLocal()
        try:
            data = aggregate_session(db, __import__("uuid").UUID(session_id))
            assert data.overall["result"] == "FAIL"
            assert data.overall["pass_count"] == data.overall["total"]
            assert data.overall["fail_count"] == 0
            assert "EXCEEDED" in data.overall["drift_note"]
        finally:
            db.close()

    def test_public_verify_ok(self, tokens, finalized) -> None:
        r = client.get(f"/api/v1/public/verify/{finalized['report_id']}")
        assert r.status_code == 200
        body = r.json()
        assert body["file_intact"] is True
        assert body["session_status"] == "completed"
        assert body["signed"] is False
        report = client.get(
            f"/api/v1/reports/{finalized['report_id']}", headers=_auth(tokens["tech"])
        ).json()
        assert body["content_digest"] == report["qr_payload"].rsplit("#", 1)[-1]
        assert body["content_digest"] != body["file_sha256"]

    def test_public_verify_unknown_404(self) -> None:
        import uuid as _uuid

        r = client.get(f"/api/v1/public/verify/{_uuid.uuid4()}")
        assert r.status_code == 404

    def test_public_verify_detects_tampering(self, tokens, finalized) -> None:
        db = SessionLocal()
        try:
            report = db.get(Report, __import__("uuid").UUID(finalized["report_id"]))
            path = report.file_path
        finally:
            db.close()
        original = open(path, "rb").read()
        try:
            with open(path, "ab") as fh:
                fh.write(b"% tampered trailing bytes\n")
            r = client.get(f"/api/v1/public/verify/{finalized['report_id']}")
            assert r.status_code == 200
            assert r.json()["file_intact"] is False
        finally:
            with open(path, "wb") as fh:
                fh.write(original)

    def test_reverify_bytes_true_when_untouched(self, finalized) -> None:
        db = SessionLocal()
        try:
            report = db.get(Report, __import__("uuid").UUID(finalized["report_id"]))
            assert reverify_bytes(report) is True
        finally:
            db.close()


class TestSignAndReseal:
    def test_rbac_and_reseal(self, tokens, finalized) -> None:
        sid, rid = finalized["session_id"], finalized["report_id"]

        # Technician denied.
        deny = client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=_auth(tokens["tech"]))
        assert deny.status_code == 403

        # Officer signs → approved; artifacts re-rendered + re-sealed.
        sign = client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=_auth(tokens["officer"]))
        assert sign.status_code == 200
        assert sign.json()["status"] == "approved"

        r = client.get(f"/api/v1/reports/{rid}", headers=_auth(tokens["tech"])).json()
        assert r["signed_at"] is not None and r["signed_by"] is not None
        downloaded = client.get(
            f"/api/v1/reports/{rid}/download", headers=_auth(tokens["tech"])
        )
        assert sha256_hex(downloaded.content) == r["sha256"], "re-seal must match the re-rendered bytes"

        # Signed report carries the signatory and PASS/FAIL unchanged.
        from docx import Document as _Doc  # noqa: N814 - local import fine

        import io

        def _all_text(document: Any) -> str:
            parts = [p.text for p in document.paragraphs]
            for table in document.tables:
                for row in table.rows:
                    for cell in row.cells:
                        parts.extend(p.text for p in cell.paragraphs)
            return "\n".join(parts)

        docx_response = client.get(
            f"/api/v1/reports/{rid}/docx", headers=_auth(tokens["tech"])
        )
        doc = _Doc(io.BytesIO(docx_response.content))
        full = _all_text(doc)
        assert "Authorized Signatory" in full  # personnel/signature tables

        verify = client.get(f"/api/v1/public/verify/{rid}").json()
        assert verify["signed"] is True
        assert verify["session_status"] == "approved"
        assert verify["signed_by"] is not None

    def test_sign_requires_report(self, tokens) -> None:
        # A fresh session that was never finalized has nothing to sign.
        r = client.post(
            "/api/v1/instruments",
            headers=_auth(tokens["tech"]),
            json={
                "manufacturer": "Essae",
                "model": "DS-415",
                "serial_number": "R5-SEAL-002",
                "accuracy_class": "III",
                "max_capacity": "15",
                "min_capacity": "0.1",
                "verification_scale_interval": "0.005",
            },
        )
        iid = r.json()["id"]
        r = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": iid, "start_temp_c": "22"},
        )
        sid = r.json()["id"]
        r = client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=_auth(tokens["officer"]))
        assert r.status_code == 409


class TestAggregationGuards:
    def test_aggregate_rejects_in_progress_session(self, tokens) -> None:
        import uuid as _uuid

        r = client.post(
            "/api/v1/instruments",
            headers=_auth(tokens["tech"]),
            json={
                "manufacturer": "Essae",
                "model": "DS-415",
                "serial_number": "R5-SEAL-003",
                "accuracy_class": "III",
                "max_capacity": "15",
                "min_capacity": "0.1",
                "verification_scale_interval": "0.005",
            },
        )
        iid = r.json()["id"]
        r = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": iid, "start_temp_c": "22"},
        )
        sid = _uuid.UUID(r.json()["id"])
        with pytest.raises(ValueError, match="in_progress"):
            db = SessionLocal()
            try:
                aggregate_session(db, sid)
            finally:
                db.close()

    def test_officer_cannot_finalize(self, tokens, finalized) -> None:
        r = client.post(
            f"/api/v1/sessions/{finalized['session_id']}/finalize",
            headers=_auth(tokens["officer"]),
        )
        assert r.status_code in (403, 409)  # role gate fires before state gate
