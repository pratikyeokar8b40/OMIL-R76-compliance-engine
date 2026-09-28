"""Regression tests for the pre-demo audit (2026-09-28).

Each test pins one defect that a black-box test found: QR/verify id
mismatch, sealed-session edits, repeatability/creep criteria, 500s on
malformed input, batch-sync gaps, attachment checks, sign-off RBAC,
Class I precision, and the Table 3 / 1-2-5 interval rules.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from decimal import Decimal

_TMP = tempfile.mkdtemp(prefix="oiml-hardening-test-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP}/hardening.db")
os.environ.setdefault("UPLOADS_DIR", f"{_TMP}/uploads")
os.environ.setdefault("REPORTS_DIR", f"{_TMP}/reports")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-for-production-0123456789abcdef")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.api.main import app  # noqa: E402
from src.db.database import SessionLocal, create_all  # noqa: E402
from src.engine import AccuracyClass, EngineValueError, ScaleParameters, validate_instrument_spec  # noqa: E402
from src.engine.rounding import format_stored  # noqa: E402
from src.engine.session_checks import creep_check, repeatability_checks  # noqa: E402
from tests._helpers import make_ready, pass_checklist, set_end_temperature  # noqa: E402

create_all()
client = TestClient(app)
PW = "demo-password-2026"


@pytest.fixture(scope="module")
def tokens() -> dict[str, str]:
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


def _instrument(h, **kw) -> dict:
    body = dict(manufacturer="Hard", model="H-1", serial_number=f"HX-{uuid.uuid4().hex[:8]}",
                accuracy_class="III", max_capacity="15", min_capacity="0.1",
                verification_scale_interval="0.005", display_interval="0.005")
    body.update(kw)
    return client.post("/api/v1/instruments", headers=h, json=body)


def _session(h, instrument_id: str) -> str:
    r = client.post("/api/v1/sessions", headers=h, json={"instrument_id": instrument_id, "start_temp_c": "22"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _obs(h, sid, **kw):
    body = dict(test_type="weighing_performance", sequence_no=kw.pop("sequence_no", 0), applied_load="5", indication="5")
    body.update(kw)
    return client.post(f"/api/v1/sessions/{sid}/observations", headers=h, json=body)


@pytest.fixture(scope="module")
def finalized(tokens) -> dict[str, str]:
    inst = _instrument(tokens["tech"]).json()
    sid = _session(tokens["tech"], inst["id"])
    make_ready(client, tokens["tech"], sid)
    assert client.post(f"/api/v1/sessions/{sid}/finalize", headers=tokens["tech"]).status_code == 200
    report = next(r for r in client.get("/api/v1/reports", headers=tokens["tech"]).json() if r["session_id"] == sid)
    return {"session_id": sid, "report_id": report["id"], "qr": report["qr_payload"]}


# ------------------------------------------------------------- QR / verify
class TestVerificationChain:
    def test_qr_encodes_report_id_and_verifies(self, finalized) -> None:
        qr_id = finalized["qr"].split("/verify/")[1].split("#")[0]
        assert qr_id == finalized["report_id"]
        r = client.get(f"/api/v1/public/verify/{qr_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["file_intact"] is True
        assert body["instrument"]["model"] == "H-1"
        assert body["overall_result"] == "PASS"

    def test_legacy_session_id_qr_still_resolves(self, finalized) -> None:
        r = client.get(f"/api/v1/public/verify/{finalized['session_id']}")
        assert r.status_code == 200
        assert r.json()["report_id"] == finalized["report_id"]

    def test_second_finalize_does_not_duplicate_report(self, tokens, finalized) -> None:
        r = client.post(f"/api/v1/sessions/{finalized['session_id']}/finalize", headers=tokens["tech"])
        assert r.status_code == 409
        from src.report.service import generate_report

        db = SessionLocal()
        try:
            again = generate_report(db, uuid.UUID(finalized["session_id"]), verify_base_url="http://x/verify")
            assert str(again.id) == finalized["report_id"]
        finally:
            db.close()
        mine = [r for r in client.get("/api/v1/reports", headers=tokens["tech"]).json() if r["session_id"] == finalized["session_id"]]
        assert len(mine) == 1

    def test_only_officers_sign(self, tokens, finalized) -> None:
        sid = finalized["session_id"]
        assert client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=tokens["admin"]).status_code == 403
        assert client.post(f"/api/v1/reports/sessions/{sid}/sign", headers=tokens["officer"]).status_code == 200

    def test_summary_endpoint(self, tokens, finalized) -> None:
        r = client.get(f"/api/v1/sessions/{finalized['session_id']}/summary", headers=tokens["tech"])
        assert r.status_code == 200
        body = r.json()
        assert body["result"] == "PASS" and body["final"] is True
        assert {c["key"] for c in body["checks"]} >= {"creep"}


# ------------------------------------------------------------- domain rules
class TestCrossReadingCriteria:
    def test_repeatability_spread_fails_even_when_rows_pass(self, tokens) -> None:
        inst = _instrument(tokens["tech"]).json()
        sid = _session(tokens["tech"], inst["id"])
        # e = 0.005: E = I + 0.0025 - 5 -> -0.004 / +0.004; each |E| <= MPE 0.005
        # but the spread 0.008 > MPE -> R 76-1 3.6.1 FAIL.
        for i in range(10):
            r = _obs(tokens["tech"], sid, test_type="repeatability", sequence_no=i,
                     indication="4.9935" if i % 2 == 0 else "5.0015")
            assert r.json()["evaluation"]["verdict"] == "PASS"
        make_ready(client, tokens["tech"], sid, skip=("repeatability",))
        summary = client.get(f"/api/v1/sessions/{sid}/summary", headers=tokens["tech"]).json()
        assert summary["result"] == "FAIL"
        assert any(c["key"].startswith("repeatability") and c["verdict"] == "FAIL" for c in summary["checks"])

    def test_creep_drift_over_half_e_fails(self, tokens) -> None:
        scale = ScaleParameters(accuracy_class=AccuracyClass.MEDIUM_III, max_capacity=Decimal("15"),
                                min_capacity=Decimal("0.1"), verification_scale_interval=Decimal("0.005"))
        ok = creep_check(scale, {"1": Decimal("0"), "2": Decimal("0.001"), "3": Decimal("0.002"), "4": Decimal("0.002")})
        assert ok is not None and ok.verdict == "PASS"
        drift = creep_check(scale, {"1": Decimal("0"), "2": Decimal("0.001"), "3": Decimal("0.002"), "4": Decimal("0.003")})
        assert drift is not None and drift.verdict == "FAIL"  # 0.003 > 0.5e = 0.0025
        partial = creep_check(scale, {"1": Decimal("0")})
        assert partial is not None and partial.verdict == "INCOMPLETE"

    def test_repeatability_single_reading_per_load_has_no_check(self) -> None:
        scale = ScaleParameters(accuracy_class=AccuracyClass.MEDIUM_III, max_capacity=Decimal("15"),
                                min_capacity=Decimal("0.1"), verification_scale_interval=Decimal("0.005"))
        assert repeatability_checks(scale, [(Decimal("5"), Decimal("0.001"))]) == []

    def test_interval_must_be_1_2_5_form(self) -> None:
        with pytest.raises(EngineValueError, match="1, 2 or 5"):
            validate_instrument_spec(ScaleParameters(
                accuracy_class=AccuracyClass.MEDIUM_III, max_capacity=Decimal("300"),
                min_capacity=Decimal("6"), verification_scale_interval=Decimal("0.3"),
                display_interval=Decimal("0.3"), base_unit="g"))

    def test_class_i_precision_is_kept(self, tokens) -> None:
        inst = _instrument(tokens["tech"], accuracy_class="I", max_capacity="0.22", min_capacity="0.01",
                           verification_scale_interval="0.000001", display_interval="0.000001").json()
        sid = _session(tokens["tech"], inst["id"])
        # L = 0.01 kg = 10 000e -> 0.5e band; E = +0.5e = 0.0000005 kg (7 dp).
        # NUMERIC(18, 6) stored E as 0.000000 before the column was widened.
        r = _obs(tokens["tech"], sid, applied_load="0.01", indication="0.01")
        assert r.status_code == 201, r.text
        row = r.json()["observation"]
        assert row["error_prior"] == "0.0000005"
        assert row["mpe_limit"] == "0.0000005"

    def test_format_stored(self) -> None:
        assert format_stored(Decimal("0.0085000000")) == "0.008500"
        assert format_stored(Decimal("0E-10")) == "0.000000"
        assert format_stored(Decimal("0.0000005")) == "0.0000005"
        assert format_stored(Decimal("15")) == "15.000000"


# ------------------------------------------------------------- input robustness
class TestInputRobustness:
    @pytest.mark.parametrize("bad", ["NaN", "Infinity", "-Infinity", "1e999999", "0.00000000001"])
    def test_non_physical_numbers_are_422(self, tokens, bad) -> None:
        r = _instrument(tokens["tech"], max_capacity=bad)
        assert r.status_code == 422, r.text

    def test_huge_class_i_is_422(self, tokens) -> None:
        r = _instrument(tokens["tech"], accuracy_class="I", max_capacity="100000000000000000000",
                        min_capacity="1", verification_scale_interval="0.000001", display_interval="0.000001")
        assert r.status_code == 422

    def test_observation_nan_is_422(self, tokens) -> None:
        inst = _instrument(tokens["tech"]).json()
        sid = _session(tokens["tech"], inst["id"])
        assert _obs(tokens["tech"], sid, indication="NaN").status_code == 422

    def test_duplicate_serial_is_case_insensitive(self, tokens) -> None:
        serial = f"Case-{uuid.uuid4().hex[:6]}"
        assert _instrument(tokens["tech"], serial_number=serial).status_code == 201
        assert _instrument(tokens["tech"], serial_number=serial.upper()).status_code == 422

    def test_environment_bounds(self, tokens) -> None:
        inst = _instrument(tokens["tech"]).json()
        for field, value in (("start_temp_c", "-5000"), ("humidity_pct", "900"), ("pressure_hpa", "-1")):
            r = client.post("/api/v1/sessions", headers=tokens["tech"], json={"instrument_id": inst["id"], field: value})
            assert r.status_code == 422, (field, r.text)

    def test_user_email_validated(self, tokens) -> None:
        r = client.post("/api/v1/users", headers=tokens["admin"], json={
            "full_name": "X", "email": "not-an-email", "password": "12345678", "role": "lab_technician"})
        assert r.status_code == 422

    def test_batch_sync_rejects_per_row_instead_of_crashing(self, tokens) -> None:
        inst = _instrument(tokens["tech"]).json()
        sid = _session(tokens["tech"], inst["id"])
        base = dict(test_type="weighing_performance", applied_load="1", indication="1")
        items = [
            dict(base, sequence_no="abc"),
            dict(base, sequence_no=1, position={"a": 1}),
            dict(base, sequence_no=2, revision_no="x"),
            dict(base, sequence_no=3, revision_no=1, supersedes_id=str(uuid.uuid4())),
            dict(base, sequence_no=4, position="p" * 300),
            dict(base, sequence_no=5, applied_load=1.1, indication=1.1),
            dict(base, sequence_no=6),
        ]
        r = client.post(f"/api/v1/sessions/{sid}/observations:batch", headers=tokens["tech"], json={"items": items})
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["accepted"]) == 1
        assert {x["index"] for x in body["rejected"]} == {"0", "1", "2", "3", "4", "5"}

    def test_batch_supersession_of_real_row(self, tokens) -> None:
        inst = _instrument(tokens["tech"]).json()
        sid = _session(tokens["tech"], inst["id"])
        first = _obs(tokens["tech"], sid, sequence_no=7).json()["observation"]
        r = client.post(f"/api/v1/sessions/{sid}/observations:batch", headers=tokens["tech"], json={"items": [
            dict(test_type="weighing_performance", sequence_no=7, revision_no=1, supersedes_id=first["id"],
                 applied_load="5", indication="5.001")]})
        assert len(r.json()["accepted"]) == 1
        rows = client.get(f"/api/v1/sessions/{sid}/observations", headers=tokens["tech"]).json()
        assert [x["revision_no"] for x in rows if x["sequence_no"] == 7] == [1]


# ------------------------------------------------------------- attachments / auth
class TestAttachmentsAndAuth:
    def test_attachment_rules(self, tokens, finalized) -> None:
        inst = _instrument(tokens["tech"]).json()
        sid = _session(tokens["tech"], inst["id"])
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 16
        url = f"/api/v1/sessions/{sid}/attachments"
        assert client.post(url, headers=tokens["tech"], files={"file": ("a.png", png, "image/png")}).status_code == 201
        assert client.post(url, headers=tokens["tech"], files={"file": ("a.png", b"not a png", "image/png")}).status_code == 415
        assert client.post(url, headers=tokens["officer"], files={"file": ("a.png", png, "image/png")}).status_code == 403
        listed = client.get(url, headers=tokens["tech"]).json()
        assert len(listed) == 1 and listed[0]["stored_as"].endswith(".png")
        closed = f"/api/v1/sessions/{finalized['session_id']}/attachments"
        assert client.post(closed, headers=tokens["tech"], files={"file": ("a.png", png, "image/png")}).status_code == 409

    def test_login_rate_limited(self, tokens) -> None:
        email = "officer@lab.gov.in"
        codes = [client.post("/api/v1/auth/login", json={"email": email, "password": "wrong"}).status_code for _ in range(11)]
        assert codes[:10] == [401] * 10
        assert codes[10] == 429
        # the correct password is also refused while the window is closed
        assert client.post("/api/v1/auth/login", json={"email": email, "password": PW}).status_code == 429
        from src.api.routers import auth as auth_router

        auth_router._failed_logins.clear()
        assert client.post("/api/v1/auth/login", json={"email": email, "password": PW}).status_code == 200

    def test_env_patch_requires_open_session(self, tokens) -> None:
        inst = _instrument(tokens["tech"]).json()
        sid = _session(tokens["tech"], inst["id"])
        set_end_temperature(client, tokens["tech"], sid)
        pass_checklist(client, tokens["tech"], sid)
        assert client.patch(f"/api/v1/sessions/{sid}", headers=tokens["officer"], json={"end_temp_c": "23"}).status_code == 403
