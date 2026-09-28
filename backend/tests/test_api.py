"""API tests (P2-9): happy paths, validation failures, RBAC denials.

Runs against a throwaway SQLite DB + uploads dir created per module run.
Metrology values travel as JSON strings end-to-end; a raw JSON float must
be rejected (INV-4) — that behavior is asserted explicitly below.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

# Configure BEFORE importing anything that reads settings.
_TMP = tempfile.mkdtemp(prefix="oiml_api_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOADS_DIR"] = _TMP
os.environ["JWT_SECRET_KEY"] = "test-secret-not-for-production-0123456789abcdef"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.api.main import app  # noqa: E402
from src.db.database import create_all  # noqa: E402
from src.db.models import Observation  # noqa: E402
from src.db.database import SessionLocal  # noqa: E402
from tests._helpers import make_ready  # noqa: E402

create_all()

client = TestClient(app)


@pytest.fixture(scope="module")
def tokens() -> dict[str, str]:
    """Seed users via the service layer and log in through the API."""
    from src.db.database import SessionLocal
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
def instrument_id(tokens) -> str:
    """One Table-3-valid Class III instrument (15 kg / 5 g / d 1 g)."""
    r = client.post(
        "/api/v1/instruments",
        headers=_auth(tokens["tech"]),
        json={
            "manufacturer": "Essae Digitronics",
            "model": "DS-415",
            "serial_number": "API-TST-001",
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


@pytest.fixture(scope="module")
def session_id(tokens, instrument_id) -> str:
    r = client.post(
        "/api/v1/sessions",
        headers=_auth(tokens["tech"]),
        json={
            "instrument_id": instrument_id,
            "start_temp_c": "21.5",
            "humidity_pct": "48.0",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestAuth:
    def test_login_wrong_password_401(self, tokens) -> None:
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "tech@lab.gov.in", "password": "wrong"},
        )
        assert r.status_code == 401

    def test_me_requires_token(self) -> None:
        assert client.get("/api/v1/users/me").status_code == 401

    def test_me_returns_profile(self, tokens) -> None:
        r = client.get("/api/v1/users/me", headers=_auth(tokens["tech"]))
        assert r.status_code == 200
        assert r.json()["email"] == "tech@lab.gov.in"
        assert "password_hash" not in r.json()

    def test_admin_creates_user(self, tokens) -> None:
        r = client.post(
            "/api/v1/users",
            headers=_auth(tokens["admin"]),
            json={
                "full_name": "New Tech",
                "email": "new.tech@lab.gov.in",
                "password": "a-strong-password",
                "role": "lab_technician",
            },
        )
        assert r.status_code == 201
        # duplicate email -> 409
        r2 = client.post(
            "/api/v1/users",
            headers=_auth(tokens["admin"]),
            json={
                "full_name": "New Tech",
                "email": "new.tech@lab.gov.in",
                "password": "a-strong-password",
                "role": "lab_technician",
            },
        )
        assert r2.status_code == 409

    def test_refresh_flow(self, tokens) -> None:
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "tech@lab.gov.in", "password": "demo-password-2026"},
        )
        refresh = r.json()["refresh_token"]
        r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert r2.status_code == 200
        assert "access_token" in r2.json()

    def test_access_token_cannot_refresh(self, tokens) -> None:
        r2 = client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["tech"]}
        )
        assert r2.status_code == 401


# ---------------------------------------------------------------------------
# Instruments
# ---------------------------------------------------------------------------


class TestInstruments:
    def test_create_rejects_table3_violation(self, tokens) -> None:
        # Class III requires 100 <= n <= 10000; here n = 15/0.0001 = 150000.
        r = client.post(
            "/api/v1/instruments",
            headers=_auth(tokens["tech"]),
            json={
                "manufacturer": "X",
                "model": "Bad",
                "serial_number": "BAD-1",
                "accuracy_class": "III",
                "max_capacity": "15",
                "min_capacity": "0.1",
                "verification_scale_interval": "0.0001",
                "base_unit": "kg",
            },
        )
        assert r.status_code == 422
        assert "n" in r.json()["detail"].lower() or "interval" in r.json()["detail"].lower()

    def test_officer_cannot_create(self, tokens) -> None:
        r = client.post(
            "/api/v1/instruments",
            headers=_auth(tokens["officer"]),
            json={
                "manufacturer": "X",
                "model": "Y",
                "serial_number": "OFF-1",
                "accuracy_class": "III",
                "max_capacity": "15",
                "min_capacity": "0.1",
                "verification_scale_interval": "0.005",
                "base_unit": "kg",
            },
        )
        assert r.status_code == 403

    def test_search_and_get(self, tokens, instrument_id) -> None:
        r = client.get(
            "/api/v1/instruments?q=API-TST", headers=_auth(tokens["tech"])
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1
        assert any(i["id"] == instrument_id for i in body["items"])

        r2 = client.get(
            f"/api/v1/instruments/{instrument_id}", headers=_auth(tokens["tech"])
        )
        assert r2.status_code == 200
        assert r2.json()["n_max"] == "3000.000000"

    def test_get_missing_404(self, tokens) -> None:
        r = client.get(
            "/api/v1/instruments/00000000-0000-0000-0000-000000000000",
            headers=_auth(tokens["tech"]),
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Observations (canonical §6.4 flow)
# ---------------------------------------------------------------------------


class TestObservations:
    def test_submit_and_engine_verdict(self, tokens, session_id) -> None:
        # e = 5 g; L = 5 kg = 1000e -> band (500, 2000] -> MPE = 1.0e = 5 g.
        # I = 5.006 kg -> E = 5.006 + 0.0025 - 5 = +0.0085 -> FAIL (demo case).
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "weighing_performance",
                "sequence_no": 1,
                "applied_load": "5",
                "indication": "5.006",
                "additional_load": "0",
                "zero_error": "0",
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["evaluation"]["verdict"] == "FAIL"
        assert body["evaluation"]["corrected_error"] == "0.008500"
        assert body["observation"]["mpe_limit"] == "0.005000"

    def test_dl_method_inclusive_edge_pass(self, tokens, session_id) -> None:
        # L=5kg, dL = e = 0.005: E = I + 0.5e - dL - L = I - 5 + 0.0025 - 0.005
        # I = 5.0025 -> E = 0 exactly -> PASS (edge inclusive).
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "weighing_performance",
                "sequence_no": 2,
                "applied_load": "5",
                "indication": "5.0025",
                "additional_load": "0.005",
                "zero_error": "0",
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["evaluation"]["verdict"] == "PASS"
        assert r.json()["evaluation"]["corrected_error"] == "0.000000"

    def test_json_float_rejected(self, tokens, session_id) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "weighing_performance",
                "sequence_no": 3,
                "applied_load": 5.0,
                "indication": "5.0",
            },
        )
        assert r.status_code == 422

    def test_load_over_max_rejected(self, tokens, session_id) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "weighing_performance",
                "sequence_no": 4,
                "applied_load": "16",
                "indication": "16",
            },
        )
        assert r.status_code == 422

    def test_officer_cannot_enter_observation(self, tokens, session_id) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["officer"]),
            json={
                "test_type": "tare",
                "sequence_no": 1,
                "applied_load": "1",
                "indication": "1",
            },
        )
        assert r.status_code == 403

    def test_drift_report_after_patch(self, tokens, session_id) -> None:
        r = client.patch(
            f"/api/v1/sessions/{session_id}",
            headers=_auth(tokens["tech"]),
            json={"end_temp_c": "23.5"},
        )
        assert r.status_code == 200
        assert r.json()["end_temp_c"] == "23.50"

        d = client.get(f"/api/v1/sessions/{session_id}/drift", headers=_auth(tokens["tech"]))
        assert d.status_code == 200
        body = d.json()
        assert body is not None
        assert body["delta_c"] == "2.00"
        # Class III: 1e per 5 degC -> 2 degC = 0.4e = 0.002 kg allowed.
        assert body["allowed_drift_in_unit"] == "0.002000"
        assert body["level"] == "ok"

    def test_drift_red_state_static_range(self, tokens, session_id) -> None:
        """P6-3: end temp outside the static range (§3.9.2) → level=red."""
        r = client.patch(
            f"/api/v1/sessions/{session_id}",
            headers=_auth(tokens["tech"]),
            json={"end_temp_c": "45"},
        )
        assert r.status_code == 200
        d = client.get(f"/api/v1/sessions/{session_id}/drift", headers=_auth(tokens["tech"]))
        assert d.status_code == 200
        body = d.json()
        assert body is not None
        assert body["level"] == "red"


class TestDriftLevelsUnit:
    """P6-3: level thresholds, tested directly on the service function —
    start_temp is set at creation (PATCH is end-only by design), so the
    warn/large-delta branches are not reachable through the API."""

    from types import SimpleNamespace

    def _instrument(self):
        from decimal import Decimal as D

        return self.SimpleNamespace(
            accuracy_class=self.SimpleNamespace(value="III"),
            verification_scale_interval=D("0.005"),
        )

    def test_large_delta_is_red(self) -> None:
        from decimal import Decimal as D

        from src.services.instrument_service import drift_watchdog

        report = drift_watchdog(
            self._instrument(), start_temp_c=D("5"), end_temp_c=D("40")
        )
        assert report is not None
        assert report["level"] == "red"

    def test_mid_delta_is_warn(self) -> None:
        """Above the 2 degC creep allowance but within the 5 degC steady limit."""
        from decimal import Decimal as D

        from src.services.instrument_service import drift_watchdog

        report = drift_watchdog(
            self._instrument(), start_temp_c=D("20"), end_temp_c=D("23.5")
        )
        assert report is not None
        assert report["level"] == "warn"

    def test_unsteady_temperature_is_red(self) -> None:
        """More than 5 degC change during the tests voids the readings."""
        from decimal import Decimal as D

        from src.services.instrument_service import drift_watchdog

        report = drift_watchdog(
            self._instrument(), start_temp_c=D("20"), end_temp_c=D("26")
        )
        assert report is not None
        assert report["level"] == "red"

    def test_small_delta_is_ok(self) -> None:
        from decimal import Decimal as D

        from src.services.instrument_service import drift_watchdog

        report = drift_watchdog(
            self._instrument(), start_temp_c=D("22"), end_temp_c=D("23.5")
        )
        assert report is not None
        assert report["level"] == "ok"

    def test_outside_static_range_is_red_even_if_delta_small(self) -> None:
        from decimal import Decimal as D

        from src.services.instrument_service import drift_watchdog

        report = drift_watchdog(
            self._instrument(), start_temp_c=D("20"), end_temp_c=D("45")
        )
        assert report is not None
        assert report["level"] == "red"


# ---------------------------------------------------------------------------
# Append-only + supersession + batch sync
# ---------------------------------------------------------------------------


class TestAppendOnlyAndSync:
    def test_supersession_latest_wins(self, tokens, session_id) -> None:
        # First entry (revision 0).
        r1 = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "repeatability",
                "sequence_no": 1,
                "applied_load": "10",
                "indication": "10.0",
            },
        )
        assert r1.status_code == 201
        original_id = r1.json()["observation"]["id"]

        # Superseding entry: same logical identity, revision 1.
        r2 = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "repeatability",
                "sequence_no": 1,
                "applied_load": "10",
                "indication": "10.0",
            },
        )
        assert r2.status_code == 409  # unique constraint blocks same revision

        # Use batch sync with revision 1 + supersedes_id (offline pattern).
        r3 = client.post(
            f"/api/v1/sessions/{session_id}/observations:batch",
            headers=_auth(tokens["tech"]),
            json={
                "items": [
                    {
                        "test_type": "repeatability",
                        "sequence_no": 1,
                        "revision_no": 1,
                        "supersedes_id": original_id,
                        "applied_load": "10",
                        "indication": "10.001",
                    }
                ]
            },
        )
        assert r3.status_code == 200, r3.text
        assert len(r3.json()["accepted"]) == 1

        listed = client.get(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
        ).json()
        reps = [o for o in listed if o["test_type"] == "repeatability"]
        assert len(reps) == 1  # latest-wins
        assert reps[0]["revision_no"] == 1
        assert reps[0]["indication"] == "10.001000"

        # The original row still exists physically (append-only).
        import uuid as _uuid

        db = SessionLocal()
        try:
            count = (
                db.query(Observation)
                .filter(
                    Observation.session_id == _uuid.UUID(session_id),
                    Observation.test_type == "repeatability",
                )
                .count()
            )
            assert count == 2
        finally:
            db.close()

    def test_batch_rejects_bad_row_without_losing_good_row(
        self, tokens, session_id
    ) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations:batch",
            headers=_auth(tokens["tech"]),
            json={
                "items": [
                    {
                        "test_type": "eccentricity",
                        "position": "1",
                        "sequence_no": 1,
                        "applied_load": "5",
                        "indication": "5.001",
                    },
                    {
                        "test_type": "eccentricity",
                        "position": "2",
                        "sequence_no": 1,
                        "applied_load": "99",
                        "indication": "99",  # L > Max -> engine reject
                    },
                ]
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["accepted"]) == 1
        assert len(body["rejected"]) == 1
        assert "max" in body["rejected"][0]["reason"].lower()

    def test_batch_rejects_malformed_decimal_without_500(
        self, tokens, session_id
    ) -> None:
        """Regression: 'bad-number' raised decimal.InvalidOperation, which
        escaped the per-row SAVEPOINT and 500'd the whole batch. It must be
        a per-row rejection with a readable reason instead."""
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations:batch",
            headers=_auth(tokens["tech"]),
            json={
                "items": [
                    {
                        "test_type": "weighing_performance",
                        "sequence_no": 1,
                        "applied_load": "1",
                        "indication": "bad-number",
                    }
                ]
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] == []
        assert len(body["rejected"]) == 1
        assert "indication" in body["rejected"][0]["reason"]

    def test_batch_rejects_duplicate_identity(self, tokens, session_id) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations:batch",
            headers=_auth(tokens["tech"]),
            json={
                "items": [
                    {
                        "test_type": "tare",
                        "sequence_no": 9,
                        "applied_load": "1",
                        "indication": "1",
                    },
                    {
                        "test_type": "tare",
                        "sequence_no": 9,
                        "applied_load": "1",
                        "indication": "1",
                    },
                ]
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["accepted"]) == 1
        assert len(body["rejected"]) == 1
        assert "duplicate" in body["rejected"][0]["reason"]

    def test_officer_cannot_sync(self, tokens, session_id) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations:batch",
            headers=_auth(tokens["officer"]),
            json={"items": [{"test_type": "tare", "sequence_no": 1, "applied_load": "1", "indication": "1"}]},
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Lifecycle + attachments
# ---------------------------------------------------------------------------


class TestLifecycle:
    def test_full_lifecycle_and_closed_session_rejection(
        self, tokens, instrument_id
    ) -> None:
        r = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": instrument_id, "start_temp_c": "22"},
        )
        sid = r.json()["id"]
        assert r.json()["status"] == "in_progress"

        obs = client.post(
            f"/api/v1/sessions/{sid}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "weighing_performance",
                "sequence_no": 1,
                "applied_load": "5",
                "indication": "5.001",
            },
        )
        assert obs.status_code == 201

        # One reading is not a complete R 76 evaluation.
        early = client.post(f"/api/v1/sessions/{sid}/finalize", headers=_auth(tokens["tech"]))
        assert early.status_code == 409
        assert "need more readings" in early.json()["detail"]

        make_ready(client, _auth(tokens["tech"]), sid, seq_start=200)
        fin = client.post(f"/api/v1/sessions/{sid}/finalize", headers=_auth(tokens["tech"]))
        assert fin.status_code == 200, fin.text
        assert fin.json()["status"] == "completed"

        # Conditions are sealed once finalized (officer or technician).
        sealed = client.patch(
            f"/api/v1/sessions/{sid}", headers=_auth(tokens["tech"]), json={"end_temp_c": "99"}
        )
        assert sealed.status_code == 409
        officer_patch = client.patch(
            f"/api/v1/sessions/{sid}", headers=_auth(tokens["officer"]), json={"end_temp_c": "22"}
        )
        assert officer_patch.status_code == 403

        # Closed session refuses new observations.
        closed = client.post(
            f"/api/v1/sessions/{sid}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "tare",
                "sequence_no": 2,
                "applied_load": "1",
                "indication": "1",
            },
        )
        assert closed.status_code == 409

        # Double finalize rejected.
        fin2 = client.post(f"/api/v1/sessions/{sid}/finalize", headers=_auth(tokens["tech"]))
        assert fin2.status_code == 409

        # Technician cannot sign; officer signs -> approved.
        deny = client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=_auth(tokens["tech"]))
        assert deny.status_code == 403
        sign = client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=_auth(tokens["officer"]))
        assert sign.status_code == 200
        assert sign.json()["status"] == "approved"

    def test_attachment_upload_and_restrictions(self, tokens, instrument_id) -> None:
        r = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": instrument_id},
        )
        sid = r.json()["id"]

        ok = client.post(
            f"/api/v1/sessions/{sid}/attachments",
            headers=_auth(tokens["tech"]),
            files={"file": ("pan.jpg", b"\xff\xd8\xff\xe0FAKEJPEG", "image/jpeg")},
        )
        assert ok.status_code == 201
        assert ok.json()["size_bytes"] == "12"

        bad_type = client.post(
            f"/api/v1/sessions/{sid}/attachments",
            headers=_auth(tokens["tech"]),
            files={"file": ("evil.exe", b"MZ...", "application/x-msdownload")},
        )
        assert bad_type.status_code == 415

        big = client.post(
            f"/api/v1/sessions/{sid}/attachments",
            headers=_auth(tokens["tech"]),
            files={"file": ("big.bin", b"x" * (10 * 1024 * 1024 + 1), "image/png")},
        )
        assert big.status_code == 413

        missing = client.post(
            "/api/v1/sessions/00000000-0000-0000-0000-000000000000/attachments",
            headers=_auth(tokens["tech"]),
            files={"file": ("x.jpg", b"x", "image/jpeg")},
        )
        assert missing.status_code == 404


def _unused(*args: Any) -> None:  # pragma: no cover
    """Keep typing imports referenced for linters without runtime use."""
    _ = args


# ---------------------------------------------------------------------------
# In-service MPE mode end-to-end (Section 3.5.2 - 2x limits, session-pinned)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def mode_instrument_id(tokens) -> str:
    """Table-3-valid Class III instrument (coarse-e row: 5 g <= e), distinct
    from other tests' fixtures: n = 15000/0.005 = 3000 >= 500, Min = 20*d."""
    r = client.post(
        "/api/v1/instruments",
        headers=_auth(tokens["tech"]),
        json={
            "manufacturer": "Essae Digitronics",
            "model": "DS-215",
            "serial_number": "API-TST-MODE",
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


@pytest.fixture(scope="module")
def in_service_session_id(tokens, mode_instrument_id) -> str:
    r = client.post(
        "/api/v1/sessions",
        headers=_auth(tokens["tech"]),
        json={"instrument_id": mode_instrument_id, "evaluation_mode": "in_service"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["evaluation_mode"] == "in_service"
    return body["id"]


class TestInServiceMode:
    def test_default_is_initial_verification(self, tokens, mode_instrument_id) -> None:
        r = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": mode_instrument_id},
        )
        assert r.status_code == 201
        assert r.json()["evaluation_mode"] == "initial_verification"

    def test_invalid_mode_rejected(self, tokens, mode_instrument_id) -> None:
        r = client.post(
            "/api/v1/sessions",
            headers=_auth(tokens["tech"]),
            json={"instrument_id": mode_instrument_id, "evaluation_mode": "double"},
        )
        assert r.status_code == 422

    def test_in_service_doubles_mpe(
        self, tokens, in_service_session_id, session_id
    ) -> None:
        """Same reading into both modes: in-service MPE is exactly 2x and a
        borderline reading (Ec = 1.3e) FAILS initial but PASSES in-service."""
        obs = {
            "test_type": "weighing_performance",
            "sequence_no": 90,
            "applied_load": "7.5",
            "indication": "7.5065",
        }
        r_init = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json=obs,
        )
        assert r_init.status_code == 201, r_init.text
        init_eval = r_init.json()["evaluation"]

        r_serv = client.post(
            f"/api/v1/sessions/{in_service_session_id}/observations",
            headers=_auth(tokens["tech"]),
            json=obs,
        )
        assert r_serv.status_code == 201, r_serv.text
        serv_eval = r_serv.json()["evaluation"]

        from decimal import Decimal

        assert Decimal(serv_eval["mpe_limit"]) == 2 * Decimal(init_eval["mpe_limit"])
        # Ec = +0.0065 kg = 1.3e > 1.0e (initial MPE) but <= 2.0e (in service).
        assert init_eval["verdict"] == "FAIL"
        assert serv_eval["verdict"] == "PASS"



# ---------------------------------------------------------------------------
# Influence-factor modules (P4b): temperature no-load, damp heat, voltage,
# discrimination - end-to-end over HTTP.
# ---------------------------------------------------------------------------


class TestInfluenceFactorModules:
    def test_temperature_no_load_fixed_1e_limit(
        self, tokens, session_id
    ) -> None:
        """Zero drift is judged against 1 e (3.9.2.3), NOT the 0.5 e band.

        e = 5 g; dL = 0.001 -> E = +0.0025 - 0.001 = +0.0015... with
        I = 0.006: E = 0.006 + 0.0025 - 0.001 = +0.0075 = 1.5e > 1e -> FAIL.
        The asserted MPE limit is exactly 1 e = 5 g.
        """
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "temperature_no_load",
                "sequence_no": 60,
                "applied_load": "0",
                "indication": "0.006",
                "additional_load": "0.001",
                "zero_error": "0",
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["evaluation"]["verdict"] == "FAIL"  # 7.5 g > 5 g
        assert body["observation"]["mpe_limit"] == "0.005000"  # = 1 e

    def test_temperature_no_load_pass_at_half_e(
        self, tokens, session_id
    ) -> None:
        """A +2.5 g (0.5 e) zero drift passes the 1 e rule (3.9.2.3)."""
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "temperature_no_load",
                "sequence_no": 61,
                "applied_load": "0",
                "indication": "0",
                "additional_load": "0.0025",
                "zero_error": "0",
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["evaluation"]["verdict"] == "PASS"  # 0.5e <= 1e
        assert body["observation"]["mpe_limit"] == "0.005000"

    def test_temperature_row_rejects_nonzero_load(
        self, tokens, session_id
    ) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "temperature_no_load",
                "sequence_no": 62,
                "applied_load": "1",
                "indication": "1",
            },
        )
        assert r.status_code == 422
        assert "no-load" in r.json()["detail"]

    def test_damp_heat_and_voltage_use_standard_band(
        self, tokens, session_id
    ) -> None:
        """B.2 / A.5.4: all indications within MPE - the class band path.

        L = 5 kg = 1000e, I = 5.002 -> E = +0.0045 = 0.9e <= 1.0e -> PASS
        under the (500, 2000] band. The 1 e no-load rule must NOT apply.
        """
        for tt, seq in (("damp_heat", 70), ("voltage_variations", 71)):
            r = client.post(
                f"/api/v1/sessions/{session_id}/observations",
                headers=_auth(tokens["tech"]),
                json={
                    "test_type": tt,
                    "sequence_no": seq,
                    "applied_load": "5",
                    "indication": "5.002",
                    "zero_error": "0",
                },
            )
            assert r.status_code == 201, r.text
            body = r.json()
            assert body["evaluation"]["verdict"] == "PASS"
            # 1.0e band limit at 1000e; a 0.9e error would FAIL the 0.5e
            # band, so a PASS proves the (500, 2000] band was applied.
            assert body["observation"]["mpe_limit"] == "0.005000"

    def test_discrimination_pass_and_persistence(
        self, tokens, session_id
    ) -> None:
        """A.4.8.2: I1 = 5.000 (with 1/10 d extra), add 1.4 d = 1.4 g ->
        I2 = 5.002; I2 - I1 = 2 g >= d = 1 g -> PASS."""
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "discrimination",
                "sequence_no": 80,
                "applied_load": "5",
                "indication": "5.000",
                "additional_load": "0.001",
                "second_indication": "5.002",
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["evaluation"]["verdict"] == "PASS"
        assert body["observation"]["second_indication"] == "5.002000"
        assert body["evaluation"]["corrected_error"] == "0.002000"
        assert body["observation"]["mpe_limit"] == "0.001000"  # = d

    def test_discrimination_fail_below_d(self, tokens, session_id) -> None:
        """I2 rises by only 0.5 d: not an unambiguous shift."""
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "discrimination",
                "sequence_no": 81,
                "applied_load": "5",
                "indication": "5.000",
                "additional_load": "0.0005",
                "second_indication": "5.0005",
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["evaluation"]["verdict"] == "FAIL"

    def test_discrimination_rejects_backwards_indication(
        self, tokens, session_id
    ) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "discrimination",
                "sequence_no": 82,
                "applied_load": "5",
                "indication": "5.000",
                "second_indication": "4.999",
            },
        )
        assert r.status_code == 422
        assert "INCREASE" in r.json()["detail"]

    def test_discrimination_batch_sync_carries_i2(
        self, tokens, session_id
    ) -> None:
        """Offline batch path must carry second_indication end-to-end."""
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations:batch",
            headers=_auth(tokens["tech"]),
            json={
                "items": [
                    {
                        "test_type": "discrimination",
                        "sequence_no": 83,
                        "applied_load": "10",
                        "indication": "10.000",
                        "additional_load": "0.001",
                        "second_indication": "10.001",
                        "revision_no": 0,
                    }
                ]
            },
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert len(out["accepted"]) == 1, out


# ---------------------------------------------------------------------------
# P4c: remaining instrumented tests + the sheet-17 checklist API.
# ---------------------------------------------------------------------------


class TestP4cModules:
    def test_equilibrium_fixed_limit_end_to_end(
        self, tokens, session_id
    ) -> None:
        """equilibrium rows are judged against the fixed 1e limit."""
        r = client.post(
            f"/api/v1/sessions/{session_id}/observations",
            headers=_auth(tokens["tech"]),
            json={
                "test_type": "equilibrium",
                "sequence_no": 100,
                "applied_load": "0",
                "indication": "0.006",
                "additional_load": "0.001",
                "zero_error": "0",
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["evaluation"]["verdict"] == "FAIL"  # 1.5e > 1e
        assert body["observation"]["mpe_limit"] == "0.005000"  # 1e

    def test_tilting_and_band_types_accepted(
        self, tokens, session_id
    ) -> None:
        """tilting (no-load), warm_up, span_stability, endurance, emc."""
        cases = [
            ("tilting", {"applied_load": "0", "indication": "0.005", "additional_load": "0.0025"}, "PASS"),
            ("warm_up", {"applied_load": "5", "indication": "5.002", "zero_error": "0"}, "PASS"),
            ("span_stability", {"applied_load": "5", "indication": "5.002", "zero_error": "0"}, "PASS"),
            ("endurance", {"applied_load": "5", "indication": "5.002", "zero_error": "0"}, "PASS"),
            ("emc_disturbances", {"applied_load": "0", "indication": "0", "additional_load": "0.004"}, "PASS"),
            ("sensitivity", {"applied_load": "5", "indication": "5.002", "zero_error": "0"}, "PASS"),
        ]
        for i, (tt, payload, want) in enumerate(cases, start=101):
            r = client.post(
                f"/api/v1/sessions/{session_id}/observations",
                headers=_auth(tokens["tech"]),
                json={"test_type": tt, "sequence_no": i, **payload},
            )
            assert r.status_code == 201, r.text
            assert r.json()["evaluation"]["verdict"] == want, tt


class TestChecklistAPI:
    def test_seed_then_read_full_sheet(self, tokens, session_id) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/checklist/seed",
            headers=_auth(tokens["tech"]),
        )
        assert r.status_code == 200, r.text
        # Session creation already seeds the sheet; explicit seeding is idempotent.
        assert r.json()["created"] == 0

        r = client.get(
            f"/api/v1/sessions/{session_id}/checklist",
            headers=_auth(tokens["tech"]),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["progress"]["total"] >= 30  # official sheet has 30+ rows
        assert body["progress"]["open"] == body["progress"]["total"]
        mandatory = [i for i in body["items"] if i["mandatory"]]
        assert mandatory and all(i["clause"] == "7.1.1" for i in mandatory)
        # 7.1.1 mandatory block present:
        clauses = {i["clause"] for i in body["items"]}
        assert "7.1.1" in clauses

    def test_submit_outcome_and_remarks(self, tokens, session_id) -> None:
        r = client.put(
            f"/api/v1/sessions/{session_id}/checklist/items",
            headers=_auth(tokens["tech"]),
            json={
                "clause": "7.1.1",
                "item_key": "manufacturer_mark",
                "outcome": "PASSED",
                "remarks": "Etched on the front panel",
            },
        )
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["outcome"] == "PASSED"
        assert item["revision_no"] == 1

        # Supersession: second submission wins, revision increments.
        r = client.put(
            f"/api/v1/sessions/{session_id}/checklist/items",
            headers=_auth(tokens["tech"]),
            json={
                "clause": "7.1.1",
                "item_key": "manufacturer_mark",
                "outcome": "FAILED",
            },
        )
        assert r.status_code == 200
        assert r.json()["revision_no"] == 2
        assert r.json()["outcome"] == "FAILED"

        r = client.get(
            f"/api/v1/sessions/{session_id}/checklist",
            headers=_auth(tokens["tech"]),
        )
        items = {i["item_key"]: i for i in r.json()["items"]}
        assert items["manufacturer_mark"]["outcome"] == "FAILED"
        assert r.json()["progress"]["failed"] == 1

    def test_unknown_item_404(self, tokens, session_id) -> None:
        r = client.put(
            f"/api/v1/sessions/{session_id}/checklist/items",
            headers=_auth(tokens["tech"]),
            json={"clause": "9.9.9", "item_key": "nope", "outcome": "PASSED"},
        )
        assert r.status_code == 404

    def test_officer_cannot_modify(self, tokens, session_id) -> None:
        r = client.post(
            f"/api/v1/sessions/{session_id}/checklist/seed",
            headers=_auth(tokens["officer"]),
        )
        assert r.status_code == 403

    def test_checklist_flows_into_report(self, tokens, session_id) -> None:
        """Finalized report carries the sheet-17 section (PDF text)."""
        import io

        from pypdf import PdfReader

        # finalize the shared session
        make_ready(client, _auth(tokens["tech"]), session_id, seq_start=500)
        r = client.post(
            f"/api/v1/sessions/{session_id}/finalize",
            headers=_auth(tokens["tech"]),
        )
        assert r.status_code == 200, r.text
        reports = client.get(
            "/api/v1/reports", headers=_auth(tokens["tech"])
        ).json()
        reports = reports if isinstance(reports, list) else reports.get("reports", [])
        mine = [x for x in reports if x["session_id"] == session_id]
        assert mine, "report not generated"
        pdf = client.get(
            f"/api/v1/reports/{mine[0]['id']}/download",
            headers=_auth(tokens["tech"]),
        )
        text = "".join(
            p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages
        )
        assert "Checklist" in text
        assert "manufacturer" in text.lower()
