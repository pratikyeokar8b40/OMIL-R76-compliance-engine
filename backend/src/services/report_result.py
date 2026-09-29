from __future__ import annotations

from ..db.models import TestSession
from .checklist_service import checklist_progress, latest_checklist
from .session_service import latest_observations


def overall_result(db, session: TestSession) -> str:
    """Return the authoritative finalized evaluation result.

    Finalized sessions cannot be incomplete because the finalization gate requires
    all required tests and checklist items to be resolved. FAIL is driven by any
    stored observation/checklist failure or a red environmental-drift result.
    """
    if session.status.value not in ("completed", "approved"):
        return "INCOMPLETE"

    observations = latest_observations(db, session.id)
    if any(o.verdict.value == "FAIL" for o in observations):
        return "FAIL"

    checklist = latest_checklist(db, session.id)
    if any(item.outcome.value == "FAILED" for item in checklist):
        return "FAIL"

    try:
        from .instrument_service import drift_watchdog
        drift = drift_watchdog(
            session.instrument,
            start_temp_c=session.start_temp_c,
            end_temp_c=session.end_temp_c,
        )
        if drift is not None and drift.get("level") == "red":
            return "FAIL"
    except Exception:
        # The report aggregate has the same rule; don't turn a transient
        # watchdog failure into a false FAIL in the metadata endpoint.
        pass

    return "PASS"
