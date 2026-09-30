"""Session aggregation for report rendering (P5-2, architecture.md §7.3).

Pulls the session, instrument, latest-wins observations and ambient
conditions into one immutable ``ReportData`` value object that both the
PDF and DOCX renderers consume verbatim — the two formats can never drift
because they render the same snapshot.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from ..db.models import Instrument, Observation, ObservationTestType, Report, TestSession, User
from ..engine import EvaluationMode
from ..engine.ruleset import RULESET_VERSION
from ..services.instrument_service import drift_watchdog
from ..services.session_service import latest_observations

#: Display order of test sections in the report (R 76-2 layout order).
TEST_ORDER: tuple[str, ...] = (
    # R 76-2 summary-of-type-evaluation order (official numbering).
    "weighing_performance",     # 1
    "temperature_no_load",      # 2  (3.9.2.3 / A.5.3.2)
    "eccentricity",             # 3
    "discrimination",           # 4  (3.8 / A.4.8)
    "repeatability",            # 5
    "zero_check",               # 6.1 zero-tracking break-out
    "creep",                    # 6.2 creep / return to zero
    "tare",                     # 9
    "damp_heat",                # B.2 (electronic instruments)
    "voltage_variations",       # 11 (A.5.4)
    "sensitivity",              # 4.2 (A.4.9, non-self-indicating)
    "equilibrium",              # 7  (4.4.2 / A.4.12)
    "tilting",                  # 8  (3.9.1 / A.5.1)
    "warm_up",                  # 10 (A.5.2)
    "span_stability",           # 14 (B.4)
    "endurance",                # 15 (A.6)
    "emc_disturbances",         # 12 (B.3.x)
)

_TEST_TITLES: dict[str, str] = {
    "weighing_performance": "Weighing performance",
    "eccentricity": "Eccentricity test",
    "repeatability": "Repeatability",
    "tare": "Tare",
    "creep": "Creep / return to zero",
    "zero_check": "Zero check (initial zero-tracking break-out)",
    "temperature_no_load": "Temperature effect on no-load indication (3.9.2.3)",
    "damp_heat": "Damp heat, steady state (B.2)",
    "voltage_variations": "Voltage variations (A.5.4)",
    "discrimination": "Discrimination (3.8 / A.4.8.2)",
    "sensitivity": "Sensitivity (A.4.9, non-self-indicating)",
    "equilibrium": "Stability of equilibrium (4.4.2 / A.4.12)",
    "tilting": "Tilting (3.9.1 / A.5.1)",
    "warm_up": "Warm-up time (A.5.2)",
    "span_stability": "Span stability (B.4)",
    "endurance": "Endurance (A.6)",
    "emc_disturbances": "EMC disturbances (B.3.x)",
}


def test_title(test_type: str) -> str:
    """Human title for a test type key."""
    return _TEST_TITLES.get(test_type, test_type.replace("_", " ").title())


@dataclass(frozen=True, slots=True)
class ReportData:
    """Immutable render snapshot — one session's complete evaluation."""

    session_id: uuid.UUID
    instrument: dict[str, str]
    conditions: dict[str, str]
    session_state: str  # completed | approved
    observations: dict[str, list[dict[str, str]]] = field(default_factory=dict)
    overall: dict[str, Any] = field(default_factory=dict)
    lab: dict[str, str] = field(default_factory=dict)
    tested_by: str = ""
    approved_by: str = ""
    template_version: str = "r76-2-v1"
    # R 76-2 sheet 17 (checklist): rendered as PASSED/FAILED/NA + remarks.
    checklist: list[dict[str, str]] = field(default_factory=list)
    checklist_progress: dict[str, int] = field(default_factory=dict)

    def test_rows(self, test_type: str) -> list[dict[str, str]]:
        """Rows for one test section in render order."""
        return self.observations.get(test_type, [])


def _fmt(value: Decimal | None, places: int = 6) -> str:
    """Fixed-point string (never scientific notation). ASCII dash for None —
    the standard PDF fonts are Latin-1 and cannot render '—'."""
    if value is None:
        return "-"
    return f"{Decimal(str(value)):.{places}f}"


def _fmt_capacity(value: Decimal) -> str:
    """At least 3 decimals, more only when the value has them (Class I Min)."""
    whole, _, frac = format(Decimal(str(value)).normalize(), "f").partition(".")
    return f"{whole}.{frac.ljust(3, '0')}"


def _places_for(e: Decimal) -> int:
    """Decimal places needed to print half of ``e`` exactly (min 6).

    Class I in kg has e = 0.000001, so 0.5e = 0.0000005 needs 7 places; a
    fixed 6 would print MPE 0.000001 (i.e. 1e) for a 0.5e limit.
    """
    exponent = e.normalize().as_tuple().exponent
    decimals = -exponent if isinstance(exponent, int) and exponent < 0 else 0
    return max(6, decimals + 1)


def aggregate_session(db: OrmSession, session_id: uuid.UUID) -> ReportData:
    """Build the render snapshot for a finalized session.

    Raises ``ValueError`` if the session is not yet completed — reports are
    only generated on the finalize transition (architecture.md §7.3).
    """
    session = db.get(TestSession, session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")
    if session.status.value not in ("completed", "approved"):
        raise ValueError(
            f"session is {session.status.value}; reports are generated on finalize"
        )

    instrument = session.instrument
    e = Decimal(str(instrument.verification_scale_interval))
    places = _places_for(e)

    # --- ambient conditions -------------------------------------------
    mode_label = (
        "Initial verification (MPE = Table 6, 1×)"
        if session.evaluation_mode is EvaluationMode.INITIAL_VERIFICATION
        else "In-service re-verification (MPE = 2× Table 6, §3.5.2)"
    )
    conditions = {
        "Evaluation regime": mode_label,
        "Start temperature (°C)": _fmt(session.start_temp_c, 2),
        "End temperature (°C)": _fmt(session.end_temp_c, 2),
        "Relative humidity (%)": _fmt(session.humidity_pct, 2),
        "Barometric pressure (hPa)": _fmt(session.pressure_hpa, 2),
    }

    # --- latest-wins observations, grouped by test ---------------------
    rows_by_test: dict[str, list[dict[str, str]]] = {}
    verdict_counts = {"PASS": 0, "FAIL": 0}
    worst_ratio: Decimal | None = None  # |Ec| / MPE, 1.0 = exactly at limit

    for obs in latest_observations(db, session_id):
        mpe = Decimal(str(obs.mpe_limit))
        ec = Decimal(str(obs.corrected_error))
        if obs.test_type is not ObservationTestType.DISCRIMINATION and mpe != 0:
            ratio = abs(ec) / mpe
            worst_ratio = ratio if worst_ratio is None else max(worst_ratio, ratio)

        key = obs.test_type.value
        verdict_counts[obs.verdict.value] += 1
        mpe_mult = mpe / e if e != 0 else Decimal("0")
        rows_by_test.setdefault(key, []).append(
            {
                "position": obs.position or "-",
                # Temperature effect on no-load rows record the chamber temperature.
                "temperature_c": _fmt(obs.chamber_temperature_c, 2),
                "seq": str(obs.sequence_no),
                "L": _fmt(obs.applied_load, places),
                "I": _fmt(obs.indication, places),
                "dL": _fmt(obs.additional_load, places),
                "E": _fmt(obs.error_prior, places),
                "Ec": _fmt(obs.corrected_error, places),
                "MPE": _fmt(obs.mpe_limit, places),
                "MPE_e": f"±{mpe_mult.normalize():f}e",
                "verdict": obs.verdict.value,
                "verdict_glyph": "✓ PASS" if obs.verdict.value == "PASS" else "✗ FAIL",
            }
        )
    observations_out = {k: rows_by_test[k] for k in TEST_ORDER if k in rows_by_test}

    # --- overall verdict -----------------------------------------------
    # P6-3: ambient-drift flag rides in the snapshot so both renderers
    # annotate the report identically (red = results void, re-run).
    drift = drift_watchdog(
        instrument,
        start_temp_c=session.start_temp_c,
        end_temp_c=session.end_temp_c,
    )
    drift_note = "not evaluated (missing start/end temperature)"
    if drift is not None:
        level = str(drift["level"])
        drift_note = {
            "ok": f"OK - change of {drift['delta_c']} °C during the tests (steady conditions)",
            "warn": f"APPROACHING - change of {drift['delta_c']} °C; conditions near the steady-temperature limit",
            "red": (
                f"EXCEEDED - change of {drift['delta_c']} °C or static range violated; "
                "readings void - re-run affected tests"
            ),
        }.get(level, level)
    from ..services.evaluation_summary import evaluation_summary

    summary = evaluation_summary(db, session)
    overall = {
        "result": summary["result"],
        "checks": summary["checks"],
        "reasons": summary["reasons"],
        "pass_count": verdict_counts["PASS"],
        "fail_count": verdict_counts["FAIL"],
        "total": verdict_counts["PASS"] + verdict_counts["FAIL"],
        # Decimal all the way (rules.md INV-4), rounded half-up like every
        # other reported quantity.
        "worst_utilization": (
            f"{(worst_ratio * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP):f}%"
            if worst_ratio is not None
            else "—"
        ),
        "ruleset_version": RULESET_VERSION,
        "clause": (
            "OIML R 76-1 (2006), §3.5.2 (in-service limits) / §3.6 / §3.9 with Annex A procedures"
            if session.evaluation_mode is EvaluationMode.IN_SERVICE
            else "OIML R 76-1 (2006), §3.5.1 / §3.6 / §3.9 with Annex A procedures"
        ),
        "drift_note": drift_note,
    }

    # --- sheet-17 checklist (latest-wins, official order) ---------------
    from ..engine.checklist_catalog import CHECKLIST_CATALOG
    from ..services.checklist_service import checklist_progress, latest_checklist

    cl_rows = latest_checklist(db, session_id)
    order_index = {
        (e.clause, e.item_key): i for i, e in enumerate(CHECKLIST_CATALOG)
    }
    checklist_out = [
        {
            "clause": r.clause,
            "requirement": r.requirement,
            "test_procedure": r.test_procedure,
            "outcome": r.outcome.value,
            "remarks": r.remarks or "",
        }
        for r in sorted(
            cl_rows,
            key=lambda r: order_index.get((r.clause, r.item_key), 999),
        )
    ]

    # --- lab + identities ----------------------------------------------
    creator = db.get(User, session.created_by)
    approver: User | None = None
    latest_report = db.scalar(
        select(Report)
        .where(Report.session_id == session_id)
        .order_by(Report.created_at.desc())
        .limit(1)
    )
    if latest_report is not None and latest_report.signed_by is not None:
        approver = db.get(User, latest_report.signed_by)

    return ReportData(
        session_id=session_id,
        instrument={
            "Manufacturer": instrument.manufacturer,
            "Model": instrument.model,
            "Serial number": instrument.serial_number,
            "Accuracy class": instrument.accuracy_class.value,
            "Maximum (Max)": _fmt_capacity(instrument.max_capacity),
            "Minimum (Min)": _fmt_capacity(instrument.min_capacity),
            "Scale interval (e)": _fmt(instrument.verification_scale_interval, places),
            "Display interval (d)": _fmt(instrument.display_interval, places),
            "Unit": instrument.base_unit,
            "n (Max/e)": _fmt(Decimal(str(instrument.n_max)), 0),
        },
        conditions=conditions,
        session_state=session.status.value,
        observations=observations_out,
        overall=overall,
        checklist=checklist_out,
        checklist_progress=checklist_progress(cl_rows),
        lab={
            "name": "Legal Metrology Laboratory (demo)",
            "address": "Demo Lab, Government of India — Legal Metrology Division",
        },
        tested_by=creator.full_name if creator else "—",
        approved_by=approver.full_name if approver else "",
        template_version="r76-2-v1",
    )
