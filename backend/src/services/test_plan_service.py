"""R-76 test plan: applicability per test type + the finalize completeness gate.

The gate is enforced HERE (server side), not only in the UI: a session can
only finalize when every REQUIRED test has the minimum number of readings
below. The minimums are the ones the workspace already asks for (memory.md
D-24): weighing >= 5 loads (A.4.4), eccentricity 4 quarter segments
(A.4.7.1), repeatability 10 readings (A.4.10), tare >= 5 steps (A.4.6.1),
creep checkpoints at 0/5/15/30 min (A.4.11.1), zero check 1 (A.4.2.3.2).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.models import ObservationTestType, SessionStatus, TestPlanItem, TestPlanStatus, TestSession

CORE_REQUIRED = {
    ObservationTestType.WEIGHING_PERFORMANCE,
    ObservationTestType.ECCENTRICITY,
    ObservationTestType.REPEATABILITY,
    ObservationTestType.TARE,
    ObservationTestType.CREEP,
    ObservationTestType.ZERO_CHECK,
}

#: Minimum latest-wins readings for a REQUIRED test (default 1).
MIN_READINGS: dict[ObservationTestType, int] = {
    ObservationTestType.WEIGHING_PERFORMANCE: 5,
    ObservationTestType.ECCENTRICITY: 4,
    ObservationTestType.REPEATABILITY: 10,
    ObservationTestType.TARE: 5,
    ObservationTestType.CREEP: 4,
    ObservationTestType.ZERO_CHECK: 1,
}

#: Tests counted by DISTINCT position rather than by number of rows.
POSITIONAL = {ObservationTestType.ECCENTRICITY, ObservationTestType.CREEP}


class TestPlanStateError(Exception):
    pass


def ensure_plan(db: Session, session: TestSession, user_id: uuid.UUID) -> list[TestPlanItem]:
    existing = {r.test_type: r for r in db.scalars(select(TestPlanItem).where(TestPlanItem.session_id == session.id)).all()}
    missing = [tt for tt in ObservationTestType if tt not in existing]
    for tt in missing:
        db.add(TestPlanItem(session_id=session.id, test_type=tt,
            status=TestPlanStatus.REQUIRED if tt in CORE_REQUIRED else TestPlanStatus.OPTIONAL,
            updated_by=user_id))
    if missing:
        db.commit()
    return list_plan(db, session.id)


def list_plan(db: Session, session_id: uuid.UUID) -> list[TestPlanItem]:
    return db.scalars(select(TestPlanItem).where(TestPlanItem.session_id == session_id).order_by(TestPlanItem.test_type)).all()


def set_status(db: Session, session: TestSession, *, test_type: str, status: str, rationale: str | None, user_id: uuid.UUID) -> TestPlanItem:
    if session.status in {SessionStatus.COMPLETED, SessionStatus.APPROVED}:
        raise TestPlanStateError("finalized evaluations cannot modify the test plan")
    tt = ObservationTestType(test_type)
    has_reason = bool((rationale or "").strip())
    if status == TestPlanStatus.NOT_APPLICABLE.value and not has_reason:
        raise TestPlanStateError("a rationale is required when a test is not applicable")
    if tt in CORE_REQUIRED and status != TestPlanStatus.REQUIRED.value and not has_reason:
        raise TestPlanStateError(
            f"{tt.value} is a core R-76 test; a rationale is required to make it {status.replace('_', ' ')}"
        )
    row = db.scalar(select(TestPlanItem).where(TestPlanItem.session_id == session.id, TestPlanItem.test_type == tt))
    if row is None:
        raise TestPlanStateError("test plan has not been initialized")
    row.status = TestPlanStatus(status)
    row.rationale = rationale
    row.updated_by = user_id
    row.updated_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(row)
    return row


def reading_counts(observations) -> dict[ObservationTestType, int]:
    """Readings per test type (distinct positions for positional tests)."""
    rows: dict[ObservationTestType, int] = {}
    positions: dict[ObservationTestType, set[str | None]] = {}
    for o in observations:
        rows[o.test_type] = rows.get(o.test_type, 0) + 1
        positions.setdefault(o.test_type, set()).add(o.position)
    return {
        tt: (len(positions[tt] - {None}) if tt in POSITIONAL else count)
        for tt, count in rows.items()
    }


def completion(db: Session, session: TestSession, observations=None) -> dict[str, object]:
    rows = list_plan(db, session.id)
    if observations is None:
        from .session_service import latest_observations
        observations = latest_observations(db, session.id)
    counts = reading_counts(observations)
    required = [r for r in rows if r.status is TestPlanStatus.REQUIRED]
    progress = {
        r.test_type.value: {
            "have": counts.get(r.test_type, 0),
            "need": MIN_READINGS.get(r.test_type, 1),
            "status": r.status.value,
        }
        for r in rows
    }
    missing = [
        f"{r.test_type.value} ({counts.get(r.test_type, 0)}/{MIN_READINGS.get(r.test_type, 1)})"
        for r in required
        if counts.get(r.test_type, 0) < MIN_READINGS.get(r.test_type, 1)
    ]
    return {
        "required": len(required),
        "required_completed": len(required) - len(missing),
        "missing_required": missing,
        "progress": progress,
        "observation_count": len(observations),
        "ready": bool(rows) and not missing and len(observations) > 0,
    }
