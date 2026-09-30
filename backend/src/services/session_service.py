"""Test-session lifecycle + observation ingestion (P2-4, P2-5, P2-6, P2-8).

Core rule (architecture.md §4.3 rule 3, rules.md INV-8): every observation
is evaluated by the pure engine AT INSERT and the verdict is persisted;
the UI never re-derives verdicts. The ``observations`` table is append-only:
this module never issues UPDATE/DELETE on it (INV-3).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db.models import (
    Observation,
    ObservationSource,
    ObservationTestType,
    ObservationVerdict,
    SessionStatus,
    TestSession,
)
from ..engine import (
    AccuracyClass,
    EngineValueError,
    EvaluationMode,
    PrecisionError,
    ScaleParameters,
    evaluate,
)
from ..engine.models import _numeric_string_to_decimal


class SessionStateError(Exception):
    """Raised when an operation violates the session lifecycle."""


class SupersededError(Exception):
    """Raised when a batch row supersedes a nonexistent observation."""


class DuplicateObservationError(Exception):
    """Raised when a revision-0 row already exists for a logical identity.

    DB unique constraints cannot catch this when ``position`` is NULL
    (NULLs are distinct in unique indexes), so the service enforces it."""


def create_session(
    db: Session,
    *,
    instrument_id: uuid.UUID,
    created_by: uuid.UUID,
    evaluation_mode: str = "initial_verification",
    start_temp_c: Decimal | None = None,
    humidity_pct: Decimal | None = None,
    pressure_hpa: Decimal | None = None,
) -> TestSession:
    """Open a new evaluation campaign in ``in_progress`` state.

    ``evaluation_mode`` pins the MPE regime for the whole campaign
    (R 76-1 §3.5): ``initial_verification`` (1× Table 6, the default and
    the scope of PS 26035) or ``in_service`` (2×, §3.5.2, for
    re-verification of an instrument already in use).
    """
    session = TestSession(
        instrument_id=instrument_id,
        status=SessionStatus.IN_PROGRESS,
        evaluation_mode=EvaluationMode(evaluation_mode),
        start_temp_c=start_temp_c,
        humidity_pct=humidity_pct,
        pressure_hpa=pressure_hpa,
        started_at=datetime.now(timezone.utc),
        created_by=created_by,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    from .test_plan_service import ensure_plan
    from .checklist_service import seed_checklist
    ensure_plan(db, session, created_by)
    seed_checklist(db, session, entered_by=created_by)
    return session


def get_session(db: Session, session_id: uuid.UUID) -> TestSession | None:
    """Fetch one session by id."""
    return db.get(TestSession, session_id)


def update_environment(
    db: Session,
    session: TestSession,
    *,
    start_temp_c: Decimal | None = None,
    end_temp_c: Decimal | None = None,
    humidity_pct: Decimal | None = None,
    pressure_hpa: Decimal | None = None,
) -> TestSession:
    """Patch environmental conditions (never metrology values).

    Only open sessions accept changes: once finalized, the conditions are
    part of the sealed report and editing them would silently change it.
    The start temperature is the drift baseline, so it can be recorded once
    (for a session opened without it) but never rewritten; resending the
    same value is a no-op so a replayed offline update does not fail.
    """
    if session.status not in (SessionStatus.DRAFT, SessionStatus.IN_PROGRESS):
        raise SessionStateError(
            f"session is {session.status.value}; environmental conditions are "
            "sealed with the report and can no longer change"
        )
    if start_temp_c is not None:
        if session.start_temp_c is None:
            session.start_temp_c = start_temp_c
        elif Decimal(session.start_temp_c) != start_temp_c:
            raise SessionStateError(
                f"the start temperature is already recorded ({session.start_temp_c} degC) "
                "and is the drift baseline; it cannot be changed"
            )
    if end_temp_c is not None:
        session.end_temp_c = end_temp_c
    if humidity_pct is not None:
        session.humidity_pct = humidity_pct
    if pressure_hpa is not None:
        session.pressure_hpa = pressure_hpa
    db.commit()
    db.refresh(session)
    return session


def _scale_params_for(session: TestSession) -> ScaleParameters:
    """Build the engine contract from the session's instrument."""
    instrument = session.instrument
    return ScaleParameters(
        accuracy_class=AccuracyClass(instrument.accuracy_class.value),
        max_capacity=instrument.max_capacity,
        min_capacity=instrument.min_capacity,
        verification_scale_interval=instrument.verification_scale_interval,
        display_interval=instrument.display_interval,
        base_unit=instrument.base_unit,
    )


def _insert_observation(
    db: Session,
    session: TestSession,
    *,
    entered_by: uuid.UUID,
    test_type: ObservationTestType,
    position: str | None,
    sequence_no: int,
    revision_no: int,
    supersedes_id: uuid.UUID | None,
    applied_load: Decimal,
    indication: Decimal,
    additional_load: Decimal,
    zero_error: Decimal,
    chamber_temperature_c: Decimal | None = None,
    source: ObservationSource,
    second_indication: Decimal | None = None,
) -> Observation:
    """Shared insert path: engine evaluation then append-only persistence."""
    # Revision-0 uniqueness (NULL-safe: DB unique indexes treat NULL
    # positions as distinct, so enforce here instead).
    identity_filters = [
        Observation.session_id == session.id,
        Observation.test_type == test_type,
        Observation.sequence_no == sequence_no,
        Observation.revision_no == revision_no,
        (
            Observation.position.is_(None)
            if position is None
            else Observation.position == position
        ),
    ]
    if db.scalar(select(Observation.id).where(*identity_filters)) is not None:
        raise DuplicateObservationError(
            "an observation with this logical identity and revision already "
            "exists; submit a higher revision via batch sync to supersede it"
        )
    if test_type == ObservationTestType.TEMPERATURE_NO_LOAD:
        if applied_load != Decimal("0"):
            raise EngineValueError("temperature_no_load rows are no-load zero determinations (3.9.2.3); applied_load must be 0.")
        if chamber_temperature_c is None:
            raise EngineValueError("temperature_no_load requires chamber_temperature_c in °C.")
        from ..core.config import settings
        temp_min = Decimal(str(settings.default_temp_min_c))
        temp_max = Decimal(str(settings.default_temp_max_c))
        if chamber_temperature_c < temp_min or chamber_temperature_c > temp_max:
            raise EngineValueError(
                f"chamber_temperature_c must be within the configured static range {temp_min} °C to {temp_max} °C for this test."
            )

    result = evaluate(
        _scale_params_for(session),
        _observation_from(
            applied_load, indication, additional_load, zero_error,
            chamber_temperature_c, second_indication,
        ),
        mode=session.evaluation_mode,
        test_type=test_type.value,
    )
    row = Observation(
        session_id=session.id,
        test_type=test_type,
        position=position,
        sequence_no=sequence_no,
        revision_no=revision_no,
        supersedes_id=supersedes_id,
        applied_load=applied_load,
        indication=indication,
        additional_load=additional_load,
        zero_error=zero_error,
        chamber_temperature_c=chamber_temperature_c,
        second_indication=second_indication,
        error_prior=result.error_prior,
        corrected_error=result.corrected_error,
        mpe_limit=result.mpe_limit,
        verdict=ObservationVerdict(result.verdict.value),
        entered_by=entered_by,
        source=source,
    )
    db.add(row)
    return row


def _observation_from(
    applied_load: Decimal,
    indication: Decimal,
    additional_load: Decimal,
    zero_error: Decimal,
    chamber_temperature_c: Decimal | None = None,
    second_indication: Decimal | None = None,
) -> Any:
    """Lightweight adapter into the engine's Observation contract."""
    from ..engine import Observation

    return Observation(
        applied_load=applied_load,
        indication=indication,
        additional_load=additional_load,
        zero_error=zero_error,
        chamber_temperature_c=chamber_temperature_c,
        second_indication=second_indication,
    )


def add_observation(
    db: Session,
    session: TestSession,
    *,
    entered_by: uuid.UUID,
    test_type: str,
    position: str | None,
    sequence_no: int,
    applied_load: Decimal,
    indication: Decimal,
    additional_load: Decimal = Decimal("0"),
    zero_error: Decimal = Decimal("0"),
    chamber_temperature_c: Decimal | None = None,
    source: str = "manual",
    second_indication: Decimal | None = None,
) -> tuple[Observation, dict[str, str]]:
    """Submit one reading; the engine verdict is computed and stored.

    Returns:
        The persisted row and the engine result dict (for the response).

    Raises:
        SessionStateError: if the session is completed/approved.
        EngineValueError: domain violation (L > Max, dL > e, etc.).
    """
    if session.status not in (SessionStatus.DRAFT, SessionStatus.IN_PROGRESS):
        raise SessionStateError(
            f"session is {session.status.value}; observations are append-only "
            "and closed sessions accept no new rows"
        )
    row = _insert_observation(
        db,
        session,
        entered_by=entered_by,
        test_type=ObservationTestType(test_type),
        position=position,
        sequence_no=sequence_no,
        revision_no=0,
        supersedes_id=None,
        applied_load=applied_load,
        indication=indication,
        additional_load=additional_load,
        zero_error=zero_error,
        chamber_temperature_c=chamber_temperature_c,
        source=ObservationSource(source),
        second_indication=second_indication,
    )
    db.commit()
    db.refresh(row)
    return row, _result_dict(row)


def _dec(item: dict[str, Any], key: str) -> Decimal:
    """Read a metrology quantity from a batch item with the SAME rules as the
    single-observation endpoint (strings/ints only, finite, in range), so a
    malformed row is rejected per-row instead of crashing the whole batch."""
    raw = item[key]
    if isinstance(raw, bool) or not isinstance(raw, (str, int)):
        raise ValueError(
            f"{key}: send metrology values as decimal strings (got {type(raw).__name__})"
        )
    try:
        value = _numeric_string_to_decimal(raw)
    except (PrecisionError, ValueError) as exc:
        raise ValueError(f"{key}: {exc}") from exc
    # Differences (E0) and temperatures may be negative; masses may not.
    if key not in ("zero_error", "chamber_temperature_c") and value < 0:
        raise ValueError(f"{key}: must be >= 0")
    return value  # type: ignore[return-value]


_VALID_POSITIONS = {"1", "2", "3", "4", "5"}


def _batch_int(item: dict[str, Any], key: str, default: int | None = None) -> int:
    raw = item.get(key, default)
    if isinstance(raw, bool) or not isinstance(raw, (int, str)):
        raise ValueError(f"{key}: must be a whole number")
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{key}: must be a whole number (got {raw!r})") from exc
    if value < 0:
        raise ValueError(f"{key}: must be >= 0")
    return value


def _batch_position(item: dict[str, Any]) -> str | None:
    raw = item.get("position")
    if raw is None:
        return None
    if not isinstance(raw, (str, int)) or isinstance(raw, bool) or str(raw) not in _VALID_POSITIONS:
        raise ValueError("position: must be one of '1'..'5' or null")
    return str(raw)


def sync_observation_batch(
    db: Session,
    session: TestSession,
    *,
    entered_by: uuid.UUID,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    """P2-6 — offline batch sync (server re-evaluates; server wins, INV-6).

    Each item: {test_type, position?, sequence_no, revision_no,
    supersedes_id?, applied_load, indication, additional_load?, zero_error?,
    source?}. Duplicate logical identity in one batch = conflict.
    """
    if session.status not in (SessionStatus.DRAFT, SessionStatus.IN_PROGRESS):
        raise SessionStateError("session is closed; sync rejected")

    accepted: list[str] = []
    rejected: list[dict[str, str]] = []
    seen: set[tuple[str, str | None, int, int]] = set()

    for idx, item in enumerate(items):
        try:
            test_type = ObservationTestType(str(item.get("test_type")))
            position = _batch_position(item)
            sequence_no = _batch_int(item, "sequence_no")
            revision_no = _batch_int(item, "revision_no", 0)
            supersedes_id = _batch_supersedes(
                db, session, item, test_type, position, sequence_no, revision_no
            )
        except (KeyError, ValueError) as exc:
            rejected.append({"index": str(idx), "reason": str(exc)})
            continue
        logical = (test_type.value, position, sequence_no, revision_no)
        if logical in seen:
            rejected.append({"index": str(idx), "reason": "duplicate logical identity in batch"})
            continue
        seen.add(logical)
        try:  # noqa: SIM105  (try/except with multiple steps inside)
            # SAVEPOINT per item: a bad row never discards earlier
            # accepted rows of the same batch.
            with db.begin_nested():
                row = _insert_observation(
                    db,
                    session,
                    entered_by=entered_by,
                    test_type=test_type,
                    position=position,
                    sequence_no=sequence_no,
                    revision_no=revision_no,
                    supersedes_id=supersedes_id,
                    applied_load=_dec(item, "applied_load"),
                    indication=_dec(item, "indication"),
                    additional_load=_dec(item, "additional_load")
                    if "additional_load" in item
                    else Decimal("0"),
                    zero_error=_dec(item, "zero_error") if "zero_error" in item else Decimal("0"),
                    chamber_temperature_c=(
                        _dec(item, "chamber_temperature_c")
                        if "chamber_temperature_c" in item and item["chamber_temperature_c"] is not None
                        else None
                    ),
                    source=ObservationSource(str(item.get("source", "manual"))),
                    second_indication=(
                        _dec(item, "second_indication")
                        if "second_indication" in item
                        else None
                    ),
                )
                db.flush()
            accepted.append(str(row.id))
        except (EngineValueError, KeyError, ValueError, DuplicateObservationError) as exc:
            rejected.append({"index": str(idx), "reason": str(exc)})
        except IntegrityError:
            rejected.append({"index": str(idx), "reason": "conflicts with an existing observation"})
    db.commit()
    return {"accepted": accepted, "rejected": rejected}


def _batch_supersedes(
    db: Session,
    session: TestSession,
    item: dict[str, Any],
    test_type: ObservationTestType,
    position: str | None,
    sequence_no: int,
    revision_no: int,
) -> uuid.UUID | None:
    """A revision > 0 must supersede a lower revision of the SAME logical
    observation in the SAME session; revision 0 supersedes nothing."""
    raw = item.get("supersedes_id")
    if revision_no == 0:
        if raw:
            raise ValueError("supersedes_id: revision 0 cannot supersede another row")
        return None
    if not raw:
        raise ValueError("supersedes_id: required when revision_no > 0")
    try:
        target_id = uuid.UUID(str(raw))
    except ValueError as exc:
        raise ValueError("supersedes_id: not a valid id") from exc
    target = db.get(Observation, target_id)
    if (
        target is None
        or target.session_id != session.id
        or target.test_type != test_type
        or target.position != position
        or target.sequence_no != sequence_no
        or target.revision_no >= revision_no
    ):
        raise ValueError(
            "supersedes_id: must reference a lower revision of the same "
            "observation in this session"
        )
    return target_id


def latest_observations(db: Session, session_id: uuid.UUID) -> list[Observation]:
    """Latest-wins view (architecture.md §4.3 rule 1): for each logical
    identity ``(test_type, position, sequence_no)``, the highest revision."""
    max_rev = (
        select(
            Observation.test_type,
            Observation.position,
            Observation.sequence_no,
            func.max(Observation.revision_no).label("max_rev"),
        )
        .where(Observation.session_id == session_id)
        .group_by(Observation.test_type, Observation.position, Observation.sequence_no)
        .subquery()
    )
    # NULL-safe equality: a NULL position matches only NULL (eccentricity
    # uses positions; other tests leave it NULL).
    position_matches = or_(
        and_(Observation.position.is_(None), max_rev.c.position.is_(None)),
        Observation.position == max_rev.c.position,
    )
    stmt = (
        select(Observation)
        .join(
            max_rev,
            and_(
                Observation.session_id == session_id,
                Observation.test_type == max_rev.c.test_type,
                position_matches,
                Observation.sequence_no == max_rev.c.sequence_no,
                Observation.revision_no == max_rev.c.max_rev,
            ),
        )
        .order_by(Observation.test_type, Observation.sequence_no)
    )
    return list(db.scalars(stmt).all())


def finalize_session(db: Session, session: TestSession) -> TestSession:
    """P2 endpoint backing ``POST /sessions/{id}/finalize`` (Phase 5 wires
    report generation onto this transition)."""
    if session.status != SessionStatus.IN_PROGRESS:
        raise SessionStateError(
            f"only in_progress sessions can finalize (session is {session.status.value})"
        )
    from .test_plan_service import completion
    plan = completion(db, session)
    if not plan["ready"]:
        if plan["missing_required"]:
            missing = ", ".join(plan["missing_required"])
            raise SessionStateError(
                f"evaluation incomplete; required tests need more readings: {missing}"
            )
        raise SessionStateError("evaluation incomplete; no observations have been recorded")
    from .checklist_service import latest_checklist, checklist_progress
    checklist = latest_checklist(db, session.id)
    if not checklist:
        raise SessionStateError("evaluation incomplete; R-76 checklist has not been seeded")
    cp = checklist_progress(checklist)
    if cp["open"] > 0:
        raise SessionStateError(f"evaluation incomplete; checklist has {cp['open']} unchecked item(s)")
    if session.start_temp_c is None or session.end_temp_c is None:
        raise SessionStateError(
            "evaluation incomplete; record the start and end temperature"
        )
    # Atomic compare-and-set: of several concurrent finalize requests (double
    # clicks), exactly one moves the row; the others get a 409 instead of
    # each generating a duplicate report.
    moved = db.execute(
        update(TestSession)
        .where(TestSession.id == session.id, TestSession.status == SessionStatus.IN_PROGRESS)
        .values(status=SessionStatus.COMPLETED, completed_at=datetime.now(timezone.utc))
    ).rowcount
    db.commit()
    db.refresh(session)
    if moved != 1:
        raise SessionStateError("session was already finalized")
    return session


def mark_approved(
    db: Session, session: TestSession, *, commit: bool = True
) -> TestSession:
    """Officer sign-off transition.

    Compare-and-set like ``finalize_session``: of two concurrent sign-offs,
    exactly one moves the row; the other waits for the write lock, matches
    nothing and gets a 409 instead of signing a second time.
    """
    if session.status != SessionStatus.COMPLETED:
        raise SessionStateError("only completed sessions can be approved")
    moved = db.execute(
        update(TestSession)
        .where(TestSession.id == session.id, TestSession.status == SessionStatus.COMPLETED)
        .values(status=SessionStatus.APPROVED)
    ).rowcount
    if moved != 1:
        db.rollback()
        raise SessionStateError("session was already approved")
    session.status = SessionStatus.APPROVED
    if commit:
        db.commit()
        db.refresh(session)
    return session


def _result_dict(row: Observation) -> dict[str, str]:
    """Response payload mirrored from the stored evaluation."""
    from ..engine.rounding import format_stored

    return {
        "error_prior": format_stored(row.error_prior),
        "corrected_error": format_stored(row.corrected_error),
        "mpe_limit": format_stored(row.mpe_limit),
        "verdict": row.verdict.value,
    }

