"""One authoritative evaluation summary per session.

The report cover, the archive list, the public verify page and the UI's
Verdict screen all read the overall result from here, so they can never
disagree. Inputs are stored engine verdicts (INV-8) plus the cross-reading
criteria of ``engine.session_checks`` (repeatability spread, creep drift).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from ..db.models import Observation, ObservationTestType, SessionStatus, TestSession
from ..engine.session_checks import SessionCheck, creep_check, repeatability_checks
from .checklist_service import checklist_progress, latest_checklist
from .instrument_service import drift_watchdog
from .session_service import _scale_params_for, latest_observations

_FINAL_STATES = (SessionStatus.COMPLETED, SessionStatus.APPROVED)


def session_checks(
    session: TestSession, observations: list[Observation]
) -> list[SessionCheck]:
    """Cross-reading criteria for the session's latest-wins observations."""
    scale = _scale_params_for(session)
    repeat_rows = [
        (Decimal(o.applied_load), Decimal(o.error_prior))
        for o in observations
        if o.test_type is ObservationTestType.REPEATABILITY
    ]
    creep_rows = {
        o.position: Decimal(o.error_prior)
        for o in observations
        if o.test_type is ObservationTestType.CREEP and o.position
    }
    checks = repeatability_checks(scale, repeat_rows, session.evaluation_mode)
    creep = creep_check(scale, creep_rows)
    if creep is not None:
        checks.append(creep)
    return checks


def evaluation_summary(db: Session, session: TestSession) -> dict[str, Any]:
    """Overall verdict with the reasons behind it.

    ``result`` is FAIL as soon as any stored reading, cross-reading check,
    checklist item or the ambient-drift watchdog fails; otherwise PASS once
    the session is finalized (or would pass the finalize gate), else
    INCOMPLETE.
    """
    from .test_plan_service import completion

    observations = latest_observations(db, session.id)
    fails = [o for o in observations if o.verdict.value == "FAIL"]
    checks = session_checks(session, observations)
    checklist = latest_checklist(db, session.id)
    progress = checklist_progress(checklist)
    drift = drift_watchdog(
        session.instrument,
        start_temp_c=session.start_temp_c,
        end_temp_c=session.end_temp_c,
    )
    final = session.status in _FINAL_STATES
    # A finalized session already passed the completeness gate.
    plan = {"ready": True} if final else completion(db, session, observations)

    reasons: list[str] = []
    if fails:
        reasons.append(f"{len(fails)} reading(s) exceed the MPE")
    reasons += [f"{c.title}: {c.detail}" for c in checks if c.verdict == "FAIL"]
    if progress["failed"]:
        reasons.append(f"{progress['failed']} checklist item(s) failed")
    if drift is not None and drift["level"] == "red":
        reasons.append(
            f"ambient temperature changed {drift['delta_c']} degC or left the static range; readings void"
        )

    ready = (
        plan["ready"]
        and progress["total"] > 0
        and progress["open"] == 0
        and session.start_temp_c is not None
        and session.end_temp_c is not None
    )
    if reasons:
        result = "FAIL"
    elif final or ready:
        result = "PASS"
    else:
        result = "INCOMPLETE"

    return {
        "session_id": str(session.id),
        "session_status": session.status.value,
        "final": final,
        "result": result,
        "reasons": reasons,
        "counts": {
            "total": len(observations),
            "pass": len(observations) - len(fails),
            "fail": len(fails),
        },
        "checks": [c.to_dict() for c in checks],
        "checklist": progress,
        "drift": drift,
        "completion": plan,
    }
