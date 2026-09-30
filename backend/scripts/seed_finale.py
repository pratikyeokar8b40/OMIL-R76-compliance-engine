"""P7-4 — finale demo dataset (idempotent): the full SIH story arc.

Builds a fresh-eyes-ready demo on top of `scripts/seed.py`:

  1. base seed (users + the Essae DS-415 Class III instrument);
  2. a Class I precision balance and a Class IIII weighbridge (shows the
     engine covers all four classes' band tables);
  3. one approved session with a deliberate FAIL row (the 5.006 kg golden
     vector) — but note: finalize gates on module completion, so this
     script's approved story uses the service layer directly with the
     rows the workspace would have produced;
  4. one in-progress session partway through weighing performance (the
     workspace demo: tabs, progress bar, live validation row).

Everything is keyed on stable serial numbers/state, so re-running never
duplicates. Run:
    cd backend && ./.venv/Scripts/python -m scripts.seed_finale
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal

from src.db.database import SessionLocal, create_all
from src.db.models import Instrument, Observation, TestSession
from src.services.instrument_service import create_instrument
from src.services.session_service import (
    add_observation,
    create_session,
    finalize_session,
    mark_approved,
)
from src.services.user_service import seed_demo_users

#: Demo account password. Local runs use the documented one; a public
#: deployment must set NAWI_DEMO_PASSWORD, since this default is in the repo.
PASSWORD = os.environ.get("NAWI_DEMO_PASSWORD") or "demo-password-2026"
_DEMO_LIVE_START = Decimal("22.0")
_DEMO_APPROVED_START = Decimal("22.5")

_SPECS: dict[str, dict] = {
    # Class III retail scale — the primary demo instrument.
    "EMS-9101-X": dict(
        manufacturer="Essae Digitronics", model="DS-415",
        accuracy_class="III", max_capacity=Decimal("15"),
        min_capacity=Decimal("0.1"), verification_scale_interval=Decimal("0.005"),
        display_interval=Decimal("0.001"), base_unit="kg",
    ),
    # Class I precision balance — exercises the ±0.5e band at huge m.
    # Table 3: class I needs n = Max/e >= 50 000 → 0.22 kg / 0.000001 = 220 000. ✓
    "PRC-50001-I": dict(
        manufacturer="Mettler-Toledo (demo)", model="XPE205",
        accuracy_class="I", max_capacity=Decimal("0.22"),
        min_capacity=Decimal("0.01"), verification_scale_interval=Decimal("0.000001"),
        display_interval=Decimal("0.000001"), base_unit="kg",
    ),
    # Class IIII weighbridge — Table 3: n = Max/e ≤ 1 000 → 60 t / 100 kg = 600 ✓;
    # Min ≥ 10e = 1 000 kg ✓. The validator taught us the spec — good.
    "WBR-777-4": dict(
        manufacturer="Avery (demo)", model="WS-60T",
        accuracy_class="IIII", max_capacity=Decimal("60000"),
        min_capacity=Decimal("1000"), verification_scale_interval=Decimal("100"),
        display_interval=Decimal("50"), base_unit="kg",
    ),
}


def _ensure_instruments(db: SessionLocal, admin_id) -> dict[str, Instrument]:
    out: dict[str, Instrument] = {}
    for serial, spec in _SPECS.items():
        found = db.query(Instrument).filter_by(serial_number=serial).first()
        if found is None:
            found = create_instrument(
                db, serial_number=serial, created_by=admin_id, **spec
            )
        out[serial] = found
    return out


def _add_if_missing(db, session, tech, test_type, position, seq, load, indication) -> None:
    """Idempotent add: re-running the seed never trips duplicate checks."""
    exists = (
        db.query(Observation)
        .filter_by(session_id=session.id, test_type=test_type, position=position, sequence_no=seq)
        .first()
    )
    if exists is None:
        add_observation(
            db, session, entered_by=tech.id, test_type=test_type,
            position=position, sequence_no=seq,
            applied_load=Decimal(load), indication=Decimal(indication),
            additional_load=Decimal("0"), zero_error=Decimal("0"),
        )


def _story_approved(db: SessionLocal, ds415: Instrument, tech, officer) -> None:
    """Approved, signed session containing the flagship FAIL row.

    Builds a COMPLETE evaluation (the finalize gate requires 5 weighing
    loads, 4 eccentricity positions, 10 repeatability readings, 5 tare
    steps, creep at 0/5/15/30 min, a zero check, a resolved checklist and
    start/end temperatures), then finalizes, renders the sealed report and
    signs it as the demo officer.
    """
    from src.core.config import settings
    from src.engine.checklist_catalog import CHECKLIST_CATALOG
    from src.report.service import generate_report, regenerate_artifacts
    from src.services.checklist_service import latest_checklist, submit_checklist_item
    from src.services.session_service import update_environment

    sessions = db.query(TestSession).filter_by(instrument_id=ds415.id).all()
    if any(
        s.status.value == "approved" and s.start_temp_c == _DEMO_APPROVED_START
        for s in sessions
    ):
        print("story 1 (approved + FAIL + report): already present")
        return
    # Reuse a leftover open session from an interrupted run, else create one.
    session = next(
        (
            s
            for s in sessions
            if s.status.value in ("draft", "in_progress") and s.start_temp_c == _DEMO_APPROVED_START
        ),
        None,
    )
    if session is None:
        session = create_session(
            db, instrument_id=ds415.id, created_by=tech.id,
            start_temp_c=_DEMO_APPROVED_START, humidity_pct=Decimal("48"),
            pressure_hpa=Decimal("1012"),
        )

    if session.status.value == "in_progress":
        # Weighing performance: Min, 500e, 2000e changeover, Max/2 region, Max.
        weighing = [("0.1", "0.1"), ("2.5", "2.5"), ("5.006", "5.012"), ("10", "10"), ("15", "15")]
        for seq, (load, ind) in enumerate(weighing, start=1):
            _add_if_missing(db, session, tech, "weighing_performance", None, seq, load, ind)
        for pos in ("1", "2", "3", "4"):
            _add_if_missing(db, session, tech, "eccentricity", pos, 1, "5", "5")
        for seq in range(1, 11):
            _add_if_missing(db, session, tech, "repeatability", None, seq, "7.5", "7.5")
        for seq, load in enumerate(("0.1", "1", "2.5", "5", "10"), start=1):
            _add_if_missing(db, session, tech, "tare", None, seq, load, load)
        for pos in ("1", "2", "3", "4"):
            _add_if_missing(db, session, tech, "creep", pos, 1, "15", "15")
        _add_if_missing(db, session, tech, "zero_check", None, 1, "0.05", "0.05")

        open_items = {
            (r.clause, r.item_key) for r in latest_checklist(db, session.id)
            if r.outcome.value == "UNCHECKED"
        }
        for entry in CHECKLIST_CATALOG:
            if (entry.clause, entry.item_key) in open_items:
                submit_checklist_item(
                    db, session, entered_by=tech.id, clause=entry.clause,
                    item_key=entry.item_key,
                    outcome="PASSED" if entry.mandatory else "NA",
                    remarks=None if entry.mandatory else "Not fitted on this model",
                )
        update_environment(db, session, end_temp_c=Decimal("23.0"))
        finalize_session(db, session)

    report = generate_report(db, session.id, verify_base_url=settings.report_verify_base_url)
    if report.signed_by is None:
        from datetime import datetime, timezone

        report.signed_by = officer.id
        report.signed_at = datetime.now(timezone.utc)
        mark_approved(db, session, commit=False)
        regenerate_artifacts(db, report, commit=False)
        db.commit()
    fail_row = (
        db.query(Observation)
        .filter_by(session_id=session.id, test_type="weighing_performance", sequence_no=3)
        .first()
    )
    print(
        f"story 1 (approved + FAIL + report): session {str(session.id)[:8]}... "
        f"report {str(report.id)[:8]}... flagship row verdict="
        f"{fail_row.verdict.value if fail_row else '?'}"
    )


def _story_live(db: SessionLocal, ds415: Instrument, tech) -> None:
    """In-progress session with one committed row — the workspace demo."""
    sessions = db.query(TestSession).filter_by(instrument_id=ds415.id).all()
    live = next(
        (s for s in sessions if s.status.value == "in_progress" and s.start_temp_c == _DEMO_LIVE_START),
        None,
    )
    if live is not None and db.query(Observation).filter_by(session_id=live.id).count() > 0:
        print(f"story 2 (live workspace): already present ({str(live.id)[:8]}...)")
        return
    if live is None:
        live = create_session(
            db, instrument_id=ds415.id, created_by=tech.id,
            start_temp_c=_DEMO_LIVE_START,
        )
    if live.started_at is None:
        live.started_at = datetime.now(timezone.utc)
    if db.query(Observation).filter_by(session_id=live.id).count() == 0:
        add_observation(
            db, live, entered_by=tech.id, test_type="weighing_performance",
            position=None, sequence_no=1,
            applied_load=Decimal("0.1"), indication=Decimal("0.1005"),
            additional_load=Decimal("0"), zero_error=Decimal("0"),
        )
    print(f"story 2 (live workspace): session {str(live.id)[:8]}... with 1 committed row")


def main() -> None:
    create_all()
    db = SessionLocal()
    try:
        users = seed_demo_users(db, password=PASSWORD)
        admin = next(u for u in users if u.role.value == "admin")
        tech = next(u for u in users if u.role.value == "lab_technician")
        officer = next(u for u in users if u.role.value == "approving_officer")

        instruments = _ensure_instruments(db, admin.id)
        print(f"instruments ensured: {', '.join(instruments)}")

        _story_approved(db, instruments["EMS-9101-X"], tech, officer)
        _story_live(db, instruments["EMS-9101-X"], tech)

        shown = "password from NAWI_DEMO_PASSWORD" if os.environ.get("NAWI_DEMO_PASSWORD") else PASSWORD
        print(f"finale dataset ready - users: tech@lab.gov.in / officer@lab.gov.in / "
              f"admin@lab.gov.in ({shown})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
