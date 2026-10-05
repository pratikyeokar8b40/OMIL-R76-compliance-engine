"""Judge access (TEMPORARY, SIH evaluation): password-less sign-in as a demo
role, only while DEMO_ROLE_LOGIN is on."""

from __future__ import annotations

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="oiml-demo-access-test-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP}/demo_access.db")
os.environ.setdefault("UPLOADS_DIR", f"{_TMP}/uploads")
os.environ.setdefault("REPORTS_DIR", f"{_TMP}/reports")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-for-production-0123456789abcdef")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.api.main import app  # noqa: E402
from src.core.config import settings  # noqa: E402
from src.db.database import SessionLocal, create_all  # noqa: E402

create_all()
client = TestClient(app)
ROLES = ("lab_technician", "approving_officer", "admin")


@pytest.fixture(scope="module", autouse=True)
def demo_users() -> None:
    from src.services.user_service import seed_demo_users

    db = SessionLocal()
    try:
        seed_demo_users(db, password="demo-password-2026")
    finally:
        db.close()


@pytest.fixture()
def enabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "demo_role_login", True)


def test_off_by_default() -> None:
    assert settings.demo_role_login is False
    assert client.get("/api/v1/auth/demo").json() == {"enabled": False, "roles": []}
    r = client.post("/api/v1/auth/demo/login", json={"role": "lab_technician"})
    assert r.status_code == 404


@pytest.mark.parametrize("role", ROLES)
def test_each_role_signs_in_as_its_demo_account(enabled, role) -> None:
    assert client.get("/api/v1/auth/demo").json() == {"enabled": True, "roles": list(ROLES)}
    r = client.post("/api/v1/auth/demo/login", json={"role": role})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == role
    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {body['access_token']}"}).json()
    assert me["role"] == role and me["email"].endswith("@lab.gov.in")


def test_tokens_carry_the_role_permissions(enabled) -> None:
    """A judge as officer is still an officer: no observations, but can read."""
    token = client.post("/api/v1/auth/demo/login", json={"role": "approving_officer"}).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/instruments", headers=h).status_code == 200
    r = client.post(
        "/api/v1/instruments",
        headers=h,
        json=dict(manufacturer="X", model="Y", serial_number="JUDGE-1", accuracy_class="III",
                  max_capacity="15", min_capacity="0.1", verification_scale_interval="0.005"),
    )
    assert r.status_code == 403


def test_unknown_role_rejected(enabled) -> None:
    assert client.post("/api/v1/auth/demo/login", json={"role": "superuser"}).status_code == 422


def test_deactivated_demo_account_is_not_offered(enabled) -> None:
    from src.db.models import User

    db = SessionLocal()
    try:
        admin = db.query(User).filter_by(email="admin@lab.gov.in").one()
        admin.is_active = False
        db.commit()
        assert "admin" not in client.get("/api/v1/auth/demo").json()["roles"]
        assert client.post("/api/v1/auth/demo/login", json={"role": "admin"}).status_code == 404
    finally:
        admin.is_active = True
        db.commit()
        db.close()


def test_demo_sign_in_is_audited(enabled) -> None:
    client.post("/api/v1/auth/demo/login", json={"role": "lab_technician"})
    admin = client.post("/api/v1/auth/demo/login", json={"role": "admin"}).json()["access_token"]
    rows = client.get("/api/v1/users/audit?limit=5", headers={"Authorization": f"Bearer {admin}"}).json()
    assert any(r["action_detail"] == "auth.demo_login" and r["actor_email"] == "tech@lab.gov.in" for r in rows)
