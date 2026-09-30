"""Regression tests for the 2026-09-29 review.

- API timestamps carry a UTC offset (SQLite dropped it; browsers then showed
  UTC as local time).
- A session opened without a start temperature can record it once via PATCH
  (it could never finalize before); a recorded start temperature never changes.
- Officer sign-off is a compare-and-set: a second sign-off of the same session
  is refused even when both requests saw it as ``completed``.
- The report's worst-utilization figure is Decimal-formatted.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime
from decimal import Decimal

_TMP = tempfile.mkdtemp(prefix="oiml-0929-test-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP}/regressions.db")
os.environ.setdefault("UPLOADS_DIR", f"{_TMP}/uploads")
os.environ.setdefault("REPORTS_DIR", f"{_TMP}/reports")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-for-production-0123456789abcdef")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.api.main import app  # noqa: E402
from src.db.database import SessionLocal, create_all  # noqa: E402
from src.db.models import SessionStatus, TestSession  # noqa: E402
from src.services.session_service import SessionStateError, mark_approved  # noqa: E402
from tests._helpers import make_ready  # noqa: E402

create_all()
client = TestClient(app)
PW = "demo-password-2026"


@pytest.fixture(scope="module")
def tokens() -> dict[str, dict[str, str]]:
    from src.services.user_service import seed_demo_users

    db = SessionLocal()
    try:
        seed_demo_users(db, password=PW)
    finally:
        db.close()
    out = {}
    for name, email in (("tech", "tech@lab.gov.in"), ("officer", "officer@lab.gov.in"), ("admin", "admin@lab.gov.in")):
        r = client.post("/api/v1/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200, r.text
        out[name] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


def _instrument(h: dict[str, str]) -> str:
    r = client.post(
        "/api/v1/instruments",
        headers=h,
        json=dict(
            manufacturer="Reg", model="R-1", serial_number=f"RG-{uuid.uuid4().hex[:8]}",
            accuracy_class="III", max_capacity="15", min_capacity="0.1",
            verification_scale_interval="0.005", display_interval="0.005",
        ),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _session(h: dict[str, str], **fields: str) -> str:
    r = client.post("/api/v1/sessions", headers=h, json={"instrument_id": _instrument(h), **fields})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _aware(text: str) -> bool:
    return datetime.fromisoformat(text.replace("Z", "+00:00")).utcoffset() is not None


class TestTimestamps:
    def test_session_and_observation_times_carry_utc_offset(self, tokens) -> None:
        sid = _session(tokens["tech"], start_temp_c="22")
        session = client.get(f"/api/v1/sessions/{sid}", headers=tokens["tech"]).json()
        assert _aware(session["created_at"]) and _aware(session["started_at"])
        r = client.post(
            f"/api/v1/sessions/{sid}/observations",
            headers=tokens["tech"],
            json={"test_type": "weighing_performance", "sequence_no": 0, "applied_load": "5", "indication": "5"},
        )
        assert r.status_code == 201, r.text
        listed = client.get(f"/api/v1/sessions/{sid}/observations", headers=tokens["tech"]).json()
        assert all(_aware(o["entered_at"]) for o in listed)

    def test_audit_times_carry_utc_offset_and_rows_still_verify(self, tokens) -> None:
        import hashlib

        from src.db.audit_models import AuditLog
        from src.services.audit_service import _row_payload

        rows = client.get("/api/v1/users/audit?limit=5", headers=tokens["admin"]).json()
        assert rows and all(_aware(row["at"]) for row in rows)
        # Hashed at write time, re-read as an aware datetime: same hash. (The
        # whole chain is not checked here: test_audit tampers with the shared DB.)
        db = SessionLocal()
        try:
            for entry in db.query(AuditLog).filter(AuditLog.id.in_([r["id"] for r in rows])):
                assert entry.at.utcoffset() is not None
                assert hashlib.sha256(_row_payload(entry).encode("utf-8")).hexdigest() == entry.row_hash
        finally:
            db.close()


class TestStartTemperature:
    def test_missing_start_temperature_can_be_recorded_once(self, tokens) -> None:
        h = tokens["tech"]
        sid = _session(h)  # opened without a start temperature
        assert client.get(f"/api/v1/sessions/{sid}", headers=h).json()["start_temp_c"] is None

        r = client.patch(f"/api/v1/sessions/{sid}", headers=h, json={"start_temp_c": "21.5"})
        assert r.status_code == 200, r.text
        assert Decimal(r.json()["start_temp_c"]) == Decimal("21.5")

        # Same value again (an offline replay) is accepted; a different one is not.
        assert client.patch(f"/api/v1/sessions/{sid}", headers=h, json={"start_temp_c": "21.50"}).status_code == 200
        changed = client.patch(f"/api/v1/sessions/{sid}", headers=h, json={"start_temp_c": "25"})
        assert changed.status_code == 409
        assert "cannot be changed" in changed.json()["detail"]

        # ...and the session can now be finalized.
        make_ready(client, h, sid)
        assert client.post(f"/api/v1/sessions/{sid}/finalize", headers=h).status_code == 200

    def test_recorded_start_temperature_is_immutable(self, tokens) -> None:
        h = tokens["tech"]
        sid = _session(h, start_temp_c="22")
        r = client.patch(f"/api/v1/sessions/{sid}", headers=h, json={"start_temp_c": "18", "end_temp_c": "22.4"})
        assert r.status_code == 409
        session = client.get(f"/api/v1/sessions/{sid}", headers=h).json()
        assert Decimal(session["start_temp_c"]) == Decimal("22")
        assert session["end_temp_c"] is None  # the whole patch was refused

    def test_start_temperature_patch_is_audited(self, tokens) -> None:
        h = tokens["tech"]
        sid = _session(h)
        assert client.patch(f"/api/v1/sessions/{sid}", headers=h, json={"start_temp_c": "20"}).status_code == 200
        rows = client.get("/api/v1/users/audit?limit=5", headers=tokens["admin"]).json()
        patch = next(r for r in rows if r["action_detail"] == "session.patch_env" and r["object_ref"] == f"TestSession:{sid}")
        assert '"start_temp_c":"20"' in patch["detail_json"]


class TestSignOff:
    @pytest.fixture()
    def completed_session(self, tokens) -> str:
        h = tokens["tech"]
        sid = _session(h, start_temp_c="22")
        make_ready(client, h, sid)
        assert client.post(f"/api/v1/sessions/{sid}/finalize", headers=h).status_code == 200
        return sid

    def test_second_sign_is_refused(self, tokens, completed_session) -> None:
        url = f"/api/v1/reports/sessions/{completed_session}/sign"
        assert client.post(url, headers=tokens["officer"]).status_code == 200
        assert client.post(url, headers=tokens["officer"]).status_code == 409

    def test_approval_is_compare_and_set(self, completed_session) -> None:
        # Two requests that both loaded the session while it was 'completed'.
        first, second = SessionLocal(), SessionLocal()
        try:
            s1 = first.get(TestSession, uuid.UUID(completed_session))
            s2 = second.get(TestSession, uuid.UUID(completed_session))
            assert s1.status is SessionStatus.COMPLETED and s2.status is SessionStatus.COMPLETED
            mark_approved(first, s1)
            with pytest.raises(SessionStateError):
                mark_approved(second, s2)
        finally:
            first.close()
            second.close()


def test_worst_utilization_is_decimal_percentage(tokens) -> None:
    from src.report.aggregate import aggregate_session

    h = tokens["tech"]
    sid = _session(h, start_temp_c="22")
    make_ready(client, h, sid)  # L = I = 5 kg: |Ec| = 0.0025, MPE 0.005 -> 50.0 %
    assert client.post(f"/api/v1/sessions/{sid}/finalize", headers=h).status_code == 200
    db = SessionLocal()
    try:
        data = aggregate_session(db, uuid.UUID(sid))
    finally:
        db.close()
    assert data.overall["worst_utilization"] == "50.0%"


class TestNoPersistentDisk:
    """Hosted functions (Vercel) have no persistent, writable disk: sealed
    artifacts and evidence must come back from the database."""

    def test_report_is_complete_without_a_writable_reports_dir(self, tokens, monkeypatch, tmp_path) -> None:
        from src.core.config import settings

        blocker = tmp_path / "not-a-directory"
        blocker.write_text("x")
        monkeypatch.setattr(settings, "reports_dir", str(blocker / "reports"))
        h = tokens["tech"]
        sid = _session(h, start_temp_c="22")
        make_ready(client, h, sid)
        assert client.post(f"/api/v1/sessions/{sid}/finalize", headers=h).status_code == 200
        report = next(r for r in client.get("/api/v1/reports", headers=h).json() if r["session_id"] == sid)
        pdf = client.get(f"/api/v1/reports/{report['id']}/download", headers=h)
        docx = client.get(f"/api/v1/reports/{report['id']}/docx", headers=h)
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
        assert docx.status_code == 200 and docx.content.startswith(b"PK")
        assert client.get(f"/api/v1/public/verify/{report['id']}").json()["file_intact"] is True
        # Officer sign-off re-seals the stored bytes too.
        assert client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=tokens["officer"]).status_code == 200
        signed = client.get(f"/api/v1/public/verify/{report['id']}").json()
        assert signed["signed"] is True and signed["file_intact"] is True

    def test_attachments_are_stored_in_the_database(self, tokens, monkeypatch, tmp_path) -> None:
        from src.core.config import settings

        h = tokens["tech"]
        sid = _session(h, start_temp_c="22")
        monkeypatch.setattr(settings, "uploads_dir", str(tmp_path / "never-created"))
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
        r = client.post(
            f"/api/v1/sessions/{sid}/attachments",
            headers=h,
            files={"file": ("display.png", png, "image/png")},
        )
        assert r.status_code == 201, r.text
        assert not (tmp_path / "never-created").exists()
        listed = client.get(f"/api/v1/sessions/{sid}/attachments", headers=h).json()
        assert [a["stored_as"] for a in listed] == [r.json()["stored_as"]]
        assert listed[0]["size_bytes"] == str(len(png))


def test_login_rate_limit_uses_forwarded_ip_behind_trusted_proxy(monkeypatch) -> None:
    """Behind Vercel every request arrives from the proxy's address; keying the
    limit on it would let one attacker lock the demo account for everyone."""
    from src.api.routers import auth
    from src.core.config import settings

    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    email = f"nobody-{uuid.uuid4().hex[:6]}@lab.gov.in"
    wrong = {"email": email, "password": "wrong-password"}
    for _ in range(auth._MAX_FAILED_LOGINS):
        client.post("/api/v1/auth/login", json=wrong, headers={"X-Forwarded-For": "203.0.113.7"})
    blocked = client.post("/api/v1/auth/login", json=wrong, headers={"X-Forwarded-For": "203.0.113.7"})
    other = client.post("/api/v1/auth/login", json=wrong, headers={"X-Forwarded-For": "198.51.100.9"})
    assert blocked.status_code == 429
    assert other.status_code == 401  # a different visitor is not locked out
