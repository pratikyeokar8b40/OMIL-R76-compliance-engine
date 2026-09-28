"""Session-level criteria that cannot be judged one reading at a time.

Per-reading verdicts (``mpe_rules.evaluate``) compare one error against one
limit. Two R 76-1 requirements instead compare readings WITH EACH OTHER:

- Repeatability (Section 3.6.1): "The difference between the results of
  several weighings of the same load shall not be greater than the absolute
  value of the maximum permissible error of the instrument for that load."
  -> for each applied load: max(E) - min(E) <= MPE(L).

- Creep (Section 3.9.4.1): with a constant load, the indication may change by
  at most 0.5 e during the 30 minutes after loading, and by at most 0.2 e
  between the 15 and 30 minute readings. If either condition fails, the
  standard requires an extended (4 h) observation, which this application
  does not record, so the check is reported as FAIL with that reason.
  Readings are the creep module positions 1..4 = 0, 5, 15, 30 minutes.

Differences are taken on the error prior to rounding E = I + 0.5e - dL - L,
so changeover-point (dL) readings are compared at full resolution.

Pure domain module: stdlib + engine imports only (rules.md INV-1/INV-2).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .contracts import ScaleParameters
from .mpe_rules import EvaluationMode, mpe_for_load
from .rounding import format_quantity

__all__ = [
    "CREEP_POSITIONS",
    "SessionCheck",
    "creep_check",
    "repeatability_checks",
]

#: Creep checkpoints recorded by the workspace: position -> minutes.
CREEP_POSITIONS: dict[str, int] = {"1": 0, "2": 5, "3": 15, "4": 30}


@dataclass(frozen=True, slots=True)
class SessionCheck:
    """Outcome of one cross-reading criterion."""

    key: str
    title: str
    clause: str
    verdict: str  # "PASS" | "FAIL" | "INCOMPLETE"
    detail: str

    def to_dict(self) -> dict[str, str]:
        return {
            "key": self.key,
            "title": self.title,
            "clause": self.clause,
            "verdict": self.verdict,
            "detail": self.detail,
        }


def repeatability_checks(
    scale: ScaleParameters,
    rows: list[tuple[Decimal, Decimal]],
    mode: EvaluationMode = EvaluationMode.INITIAL_VERIFICATION,
) -> list[SessionCheck]:
    """Spread-vs-MPE check for every load that was weighed more than once.

    Args:
        scale: Instrument parameters.
        rows: ``(applied_load, error_prior)`` for each repeatability reading.
        mode: MPE regime of the session.
    """
    e = scale.verification_scale_interval
    by_load: dict[Decimal, list[Decimal]] = {}
    for load, error in rows:
        by_load.setdefault(load.normalize(), []).append(error)
    checks: list[SessionCheck] = []
    for load in sorted(by_load):
        errors = by_load[load]
        if len(errors) < 2:
            continue
        spread = max(errors) - min(errors)
        limit = mpe_for_load(scale.accuracy_class, load / e, e, mode)
        passed = spread <= limit
        checks.append(
            SessionCheck(
                key=f"repeatability:{load:f}",
                title=f"Repeatability at L = {format_quantity(load)}",
                clause="R 76-1 3.6.1",
                verdict="PASS" if passed else "FAIL",
                detail=(
                    f"{len(errors)} weighings; spread max(E) - min(E) = "
                    f"{format_quantity(spread)} {'<=' if passed else '>'} "
                    f"MPE {format_quantity(limit)}"
                ),
            )
        )
    return checks


def creep_check(
    scale: ScaleParameters, rows: dict[str, Decimal]
) -> SessionCheck | None:
    """Creep drift over the 30-minute observation (positions 1..4).

    Args:
        scale: Instrument parameters.
        rows: ``position -> error_prior`` for the creep readings.

    Returns:
        ``None`` when no creep readings exist; INCOMPLETE while checkpoints
        are missing; otherwise PASS/FAIL.
    """
    if not rows:
        return None
    missing = [p for p in CREEP_POSITIONS if p not in rows]
    if missing:
        return SessionCheck(
            key="creep",
            title="Creep over 30 minutes",
            clause="R 76-1 3.9.4.1",
            verdict="INCOMPLETE",
            detail="missing checkpoint(s): "
            + ", ".join(f"{CREEP_POSITIONS[p]} min" for p in missing),
        )
    e = scale.verification_scale_interval
    start = rows["1"]
    drift_30 = max(abs(rows[p] - start) for p in ("2", "3", "4"))
    drift_15_30 = abs(rows["4"] - rows["3"])
    limit_30 = e / 2
    limit_15_30 = e / 5
    passed = drift_30 <= limit_30 and drift_15_30 <= limit_15_30
    detail = (
        f"max change over 30 min = {format_quantity(drift_30)} "
        f"(limit 0.5e = {format_quantity(limit_30)}); change 15->30 min = "
        f"{format_quantity(drift_15_30)} (limit 0.2e = {format_quantity(limit_15_30)})"
    )
    if not passed:
        detail += "; 4-hour extended creep test required and not recorded"
    return SessionCheck(
        key="creep",
        title="Creep over 30 minutes",
        clause="R 76-1 3.9.4.1",
        verdict="PASS" if passed else "FAIL",
        detail=detail,
    )
