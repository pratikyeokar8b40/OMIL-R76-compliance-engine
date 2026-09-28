from __future__ import annotations

from ..db.models import TestSession


def overall_result(db, session: TestSession | None) -> str:
    """Return the authoritative finalized evaluation result.

    Sessions that are not finalized report INCOMPLETE here (archive/report
    contract). The verdict itself comes from ``evaluation_summary`` so the
    report cover, archive, verify page and workspace never disagree.
    """
    if session is None or session.status.value not in ("completed", "approved"):
        return "INCOMPLETE"
    from .evaluation_summary import evaluation_summary

    return str(evaluation_summary(db, session)["result"])
