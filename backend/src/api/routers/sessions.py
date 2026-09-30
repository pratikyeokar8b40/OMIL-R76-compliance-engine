"""Sessions & observations endpoints (architecture.md §6.3)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..audit_helpers import audit
from ..deps import AnyUser, DbDep
from ...db.audit_models import AuditAction
from ...core.config import settings
from ...db.models import TestSession
from ...engine import EngineValueError
from ...report import service as report_service
from ...services import session_service
from ...services.instrument_service import drift_watchdog
from ...services.session_service import DuplicateObservationError, SessionStateError
from ..schemas import (
    BatchSyncRequest,
    BatchSyncResponse,
    DriftReport,
    EvaluationSummaryOut,
    ObservationCreate,
    ObservationCreatedResponse,
    ObservationOut,
    SessionCreate,
    SessionOut,
    SessionPage,
    SessionPatch,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_session_or_404(db_session, session_id: uuid.UUID) -> TestSession:
    session = session_service.get_session(db_session, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    return session


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(body: SessionCreate, request: Request, db: DbDep, user: AnyUser) -> SessionOut:
    """Start a new evaluation campaign (technician workflow)."""
    if user.role.value == "approving_officer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "officers may not open sessions")
    from ...services.instrument_service import get_instrument

    instrument = get_instrument(db, body.instrument_id)
    if instrument is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "instrument not found")
    session = session_service.create_session(
        db,
        instrument_id=body.instrument_id,
        created_by=user.id,
        evaluation_mode=body.evaluation_mode,
        start_temp_c=body.start_temp_c,
        humidity_pct=body.humidity_pct,
        pressure_hpa=body.pressure_hpa,
    )
    audit(
        db, request, user, AuditAction.CREATE, "session.create",
        object_ref=f"TestSession:{session.id}",
        detail={"instrument_id": str(body.instrument_id),
                "evaluation_mode": body.evaluation_mode},
    )
    return SessionOut.model_validate(session)


@router.get("", response_model=SessionPage)
def list_sessions(
    db: DbDep,
    _user: AnyUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> SessionPage:
    """Paginated session list (dashboard feed)."""
    from sqlalchemy import func, select

    from ...db.models import TestSession as TS

    total = db.scalar(select(func.count()).select_from(TS)) or 0
    rows = db.scalars(select(TS).order_by(TS.created_at.desc()).offset(skip).limit(limit)).all()
    return SessionPage(
        total=int(total),
        skip=skip,
        limit=limit,
        items=[SessionOut.model_validate(r) for r in rows],
    )


@router.get("/{session_id}", response_model=SessionOut)
def read_session(session_id: uuid.UUID, db: DbDep, _user: AnyUser) -> SessionOut:
    """Fetch one session."""
    return SessionOut.model_validate(_get_session_or_404(db, session_id))


@router.patch("/{session_id}", response_model=SessionOut)
def patch_session(
    session_id: uuid.UUID, body: SessionPatch, request: Request, db: DbDep, user: AnyUser
) -> SessionOut:
    """Update environmental conditions (open sessions, technician/admin)."""
    if user.role.value == "approving_officer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "officers may not edit session conditions")
    session = _get_session_or_404(db, session_id)
    try:
        session = session_service.update_environment(
            db,
            session,
            start_temp_c=body.start_temp_c,
            end_temp_c=body.end_temp_c,
            humidity_pct=body.humidity_pct,
            pressure_hpa=body.pressure_hpa,
        )
    except SessionStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    audit(
        db, request, user, AuditAction.UPDATE, "session.patch_env",
        object_ref=f"TestSession:{session.id}",
        detail={
            field: str(value)
            for field, value in body.model_dump(exclude_none=True).items()
        },
    )
    return SessionOut.model_validate(session)


@router.get("/{session_id}/summary", response_model=EvaluationSummaryOut)
def read_summary(session_id: uuid.UUID, db: DbDep, _user: AnyUser) -> EvaluationSummaryOut:
    """Server-side overall verdict, the reasons for it, and completeness.

    The Verdict screen shows this instead of recomputing a verdict in the
    browser (rules.md INV-8)."""
    from ...services.evaluation_summary import evaluation_summary

    session = _get_session_or_404(db, session_id)
    return EvaluationSummaryOut.model_validate(evaluation_summary(db, session))


@router.get("/{session_id}/drift", response_model=DriftReport | None)
def read_drift(session_id: uuid.UUID, db: DbDep, _user: AnyUser) -> DriftReport | None:
    """Drift-watchdog verdict for the recorded ambient delta (D-14)."""
    session = _get_session_or_404(db, session_id)
    report = drift_watchdog(
        session.instrument,
        start_temp_c=session.start_temp_c,
        end_temp_c=session.end_temp_c,
    )
    return DriftReport.model_validate(report) if report else None


@router.post(
    "/{session_id}/observations",
    response_model=ObservationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_observation(
    session_id: uuid.UUID,
    body: ObservationCreate,
    request: Request,
    db: DbDep,
    user: AnyUser,
) -> ObservationCreatedResponse:
    """Submit one reading — engine evaluates at insert (§6.4 canonical)."""
    if user.role.value == "approving_officer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "officers may not enter observations")
    session = _get_session_or_404(db, session_id)
    try:
        row, evaluation = session_service.add_observation(
            db,
            session,
            entered_by=user.id,
            test_type=body.test_type,
            position=body.position,
            sequence_no=body.sequence_no,
            applied_load=body.applied_load,
            indication=body.indication,
            additional_load=body.additional_load,
            zero_error=body.zero_error,
            chamber_temperature_c=body.chamber_temperature_c,
            source=body.source,
            second_indication=body.second_indication,
        )
    except SessionStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except DuplicateObservationError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except EngineValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    audit(
        db, request, user, AuditAction.CREATE, "observation.create",
        object_ref=f"Observation:{row.id}",
        detail={"session": str(session_id), "test": body.test_type,
                "verdict": evaluation["verdict"] if isinstance(evaluation, dict) else evaluation.verdict},
    )
    report = drift_watchdog(
        session.instrument,
        start_temp_c=session.start_temp_c,
        end_temp_c=session.end_temp_c,
    )
    return ObservationCreatedResponse(
        observation=ObservationOut.model_validate(row),
        evaluation=evaluation,
        drift=DriftReport.model_validate(report) if report else None,
    )


@router.get("/{session_id}/observations", response_model=list[ObservationOut])
def list_observations(
    session_id: uuid.UUID, db: DbDep, _user: AnyUser
) -> list[ObservationOut]:
    """Latest-wins observation view for the session."""
    _get_session_or_404(db, session_id)
    rows = session_service.latest_observations(db, session_id)
    return [ObservationOut.model_validate(r) for r in rows]


@router.post(
    "/{session_id}/observations:batch",
    response_model=BatchSyncResponse,
)
def sync_batch(
    session_id: uuid.UUID,
    body: BatchSyncRequest,
    request: Request,
    db: DbDep,
    user: AnyUser,
) -> BatchSyncResponse:
    """Offline batch sync — server re-evaluates every item (INV-6)."""
    if user.role.value == "approving_officer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "officers may not sync observations")
    session = _get_session_or_404(db, session_id)
    try:
        result = session_service.sync_observation_batch(
            db, session, entered_by=user.id, items=body.items
        )
    except SessionStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    audit(
        db, request, user, AuditAction.CREATE, "observation.batch_sync",
        object_ref=f"TestSession:{session_id}",
        detail={"accepted": result.get("accepted"), "rejected": result.get("rejected")},
    )
    return BatchSyncResponse(**result)


@router.post("/{session_id}/finalize", response_model=SessionOut)
def finalize_session(session_id: uuid.UUID, request: Request, db: DbDep, user: AnyUser) -> SessionOut:
    """Mark the session complete and generate the sealed report (P5-2/P5-3,
    architecture.md §7.3): report bytes exist before the response returns."""
    if user.role.value == "approving_officer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "officers may not finalize")
    session = _get_session_or_404(db, session_id)
    try:
        session = session_service.finalize_session(db, session)
    except SessionStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    try:
        report_service.generate_report(
            db, session.id, verify_base_url=settings.report_verify_base_url
        )
    except Exception:
        # The completed session remains recoverable; the archive endpoint will
        # retry report generation when storage or rendering is available.
        db.rollback()
        audit(
            db, request, user, AuditAction.TRANSITION, "session.finalize_report_failed",
            object_ref=f"TestSession:{session.id}",
        )
    audit(
        db, request, user, AuditAction.TRANSITION, "session.finalize",
        object_ref=f"TestSession:{session.id}",
    )
    return SessionOut.model_validate(session)
