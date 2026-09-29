"""P7-1 audit log tests: records on writes, RBAC on reads, chain integrity.

Isolation mirrors test_api.py's env-setup pattern: throwaway SQLite DB +
uploads dir configured BEFORE importing anything that reads settings.
"""

from __future__ import annotations

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="oiml-audit-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/audit.db"
os.environ["UPLOADS_DIR"] = f"{_TMP}/uploads"
os.environ["REPORTS_DIR"] = f"{_TMP}/reports"

from fastapi.testclient import TestClient  # noqa: E402

from src.api.main import app  # noqa: E402
from src.db.database import create_all  # noqa: E402
from src.db.audit_models import AuditLog  # noqa: E402
from src.db.database import SessionLocal  # noqa: E402

create_all()


def _seed() -> None:
    from src.services.user_service import seed_demo_users

    db = SessionLocal()
    try:
        seed_demo_users(db, password="demo-password-2026")
    finally:
        db.close()


_seed()

client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(email: str, password: str) -> str:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


import pytest  # noqa: E402


@pytest.fixture(scope="module")
def tokens() -> dict[str, str]:
    return {
        "tech": _login("tech@lab.gov.in", "demo-password-2026"),
        "officer": _login("officer@lab.gov.in", "demo-password-2026"),
        "admin": _login("admin@lab.gov.in", "demo-password-2026"),
    }


def _make_instrument(token: str) -> str:
    r = client.post(
        "/api/v1/instruments",
        headers=_auth(token),
        json={
            "manufacturer": "Audit Works",
            "model": "AW-1",
            "serial_number": "AUD-001",
            "accuracy_class": "III",
            "max_capacity": "15",
            "min_capacity": "0.1",
            "verification_scale_interval": "0.005",
            "display_interval": "0.001",
            "base_unit": "kg",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestAuditTrail:
    def test_writes_are_recorded(self, tokens) -> None:
        instrument_id = _make_instrument(tokens["tech"])

        r = client.get("/api/v1/users/audit", headers=_auth(tokens["admin"]))
        assert r.status_code == 200
        rows = r.json()
        assert rows, "audit trail must not be empty"
        entry = next(
            (row for row in rows if row["action_detail"] == "instrument.create"),
            None,
        )
        assert entry is not None
        assert entry["actor_email"] == "tech@lab.gov.in"
        assert instrument_id in (entry["object_ref"] or "")
        assert entry["source_ip"]

    def test_admin_only_read(self, tokens) -> None:
        assert client.get("/api/v1/users/audit", headers=_auth(tokens["tech"])).status_code == 403
        assert client.get("/api/v1/users/audit", headers=_auth(tokens["officer"])).status_code == 403
        assert client.get("/api/v1/users/audit", headers=_auth(tokens["admin"])).status_code == 200

    def test_failed_login_is_audited(self, tokens) -> None:
        client.post(
            "/api/v1/auth/login",
            json={"email": "tech@lab.gov.in", "password": "wrong-password"},
        )
        r = client.get("/api/v1/users/audit", headers=_auth(tokens["admin"]))
        rows = r.json()
        assert any(row["action_detail"] == "auth.login_failed" for row in rows)

    def test_chain_verifies_intact(self, tokens) -> None:
        _make_instrument(tokens["tech"])
        r = client.get("/api/v1/users/audit/verify", headers=_auth(tokens["admin"]))
        assert r.status_code == 200
        body = r.json()
        assert body["intact"] is True
        assert body["rows"] >= 2

    def test_chain_detects_tamper(self, tokens) -> None:
        _make_instrument(tokens["tech"])
        db = SessionLocal()
        try:
            row = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
            assert row is not None
            row.action_detail = "tampered.entry"
            db.commit()
        finally:
            db.close()

        r = client.get("/api/v1/users/audit/verify", headers=_auth(tokens["admin"]))
        body = r.json()
        assert body["intact"] is False
        assert "row_hash" in body["reason"]

    def test_session_lifecycle_audited(self, tokens) -> None:
        instrument_id = _make_instrument(tokens["tech"])
        r = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": instrument_id, "start_temp_c": "22"},
        )
        assert r.status_code == 201
        r = client.get("/api/v1/users/audit", headers=_auth(tokens["admin"]))
        details = [row["action_detail"] for row in r.json()]
        assert "session.create" in details
        assert "instrument.create" in details
