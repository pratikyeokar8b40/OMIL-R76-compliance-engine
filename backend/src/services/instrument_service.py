"""Instrument registration (P2-3).

Every instrument passes the pure engine's Table 3 gate
(:func:`engine.validate_instrument_spec`) before it can be persisted —
an inconsistent Max/Min/e combination can never enter the database
(architecture.md §4.3 rule 4).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db.models import AccuracyClassEnum, Instrument
from ..engine import (
    AccuracyClass,
    EngineValueError,
    ScaleParameters,
    validate_instrument_spec,
)

_N_QUANT = Decimal("0.000001")


class InstrumentValidationError(Exception):
    """Raised when R 76-1 Table 3 rejects the specification."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def create_instrument(
    db: Session,
    *,
    manufacturer: str,
    model: str,
    serial_number: str,
    accuracy_class: str,
    max_capacity: Decimal,
    min_capacity: Decimal,
    verification_scale_interval: Decimal,
    display_interval: Decimal | None,
    base_unit: str,
    created_by: uuid.UUID,
) -> Instrument:
    """Validate against Table 3 and persist; returns the new row.

    Raises:
        InstrumentValidationError: class-rule failure (auditor-readable).
    """
    existing = db.scalar(select(Instrument).where(Instrument.serial_number == serial_number.strip()))
    if existing is not None:
        raise InstrumentValidationError(
            f"An instrument with serial number {serial_number.strip()} is already registered."
        )
    try:
        validate_instrument_spec(
            ScaleParameters(
                accuracy_class=AccuracyClass(accuracy_class),
                max_capacity=max_capacity,
                min_capacity=min_capacity,
                verification_scale_interval=verification_scale_interval,
                display_interval=display_interval,
                base_unit=base_unit if base_unit in {"kg", "g"} else "kg",
            )
        )
    except EngineValueError as exc:
        raise InstrumentValidationError(str(exc)) from exc

    n_max = (max_capacity / verification_scale_interval).quantize(_N_QUANT)
    instrument = Instrument(
        manufacturer=manufacturer.strip(),
        model=model.strip(),
        serial_number=serial_number.strip(),
        accuracy_class=AccuracyClassEnum(accuracy_class),
        max_capacity=max_capacity,
        min_capacity=min_capacity,
        verification_scale_interval=verification_scale_interval,
        display_interval=display_interval,
        base_unit=base_unit if base_unit in {"kg", "g"} else "kg",
        n_max=n_max,
        created_by=created_by,
    )
    db.add(instrument)
    db.commit()
    db.refresh(instrument)
    return instrument


def list_instruments(
    db: Session, *, q: str | None, skip: int, limit: int
) -> tuple[list[Instrument], int]:
    """Paginated search across manufacturer/model/serial."""
    stmt = select(Instrument)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Instrument.manufacturer.ilike(like),
                Instrument.model.ilike(like),
                Instrument.serial_number.ilike(like),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Instrument.created_at.desc()).offset(skip).limit(limit)
    ).all()
    return list(rows), int(total)


def get_instrument(db: Session, instrument_id: uuid.UUID) -> Instrument | None:
    """Fetch one instrument by id."""
    return db.get(Instrument, instrument_id)


def build_scale_params(instrument: Instrument) -> dict[str, object]:
    """Engine-ready kwargs mirroring an instrument row (service helper)."""
    return {
        "accuracy_class": instrument.accuracy_class.value,
        "max_capacity": instrument.max_capacity,
        "min_capacity": instrument.min_capacity,
        "verification_scale_interval": instrument.verification_scale_interval,
        "display_interval": instrument.display_interval,
    }


def drift_watchdog(instrument: Instrument, *, start_temp_c: Decimal | None, end_temp_c: Decimal | None) -> dict[str, object] | None:
    """P2-8 — evaluate ambient drift against R 76-1 §3.9.2.3 (D-14).

    The zero indication may not vary by more than one verification scale
    interval per 1 degC (class I) or per 5 degC (classes II/III/IIII).
    Returns ``None`` when either temperature reading is missing.
    """
    if start_temp_c is None or end_temp_c is None:
        return None
    start, end = Decimal(start_temp_c), Decimal(end_temp_c)
    delta_c = abs(end - start)
    per_degree = settings.drift_scale_intervals_per_degree[
        instrument.accuracy_class.value
    ]
    allowed_in_e = (delta_c / per_degree) if per_degree else Decimal(0)
    allowed_in_unit = (allowed_in_e * instrument.verification_scale_interval).quantize(
        _N_QUANT
    )
    # P6-3 red state: the test ran outside the instrument's static
    # temperature range (§3.9.2) — results are metrologically void and the
    # affected tests must be re-run. Amber is the approaching-limit proxy.
    t_min, t_max = settings.default_temp_min_c, settings.default_temp_max_c
    outside_static_range = start < Decimal(t_min) or start > Decimal(t_max) or end < Decimal(t_min) or end > Decimal(t_max)
    if outside_static_range or delta_c > Decimal(30):
        level = "red"
    elif delta_c > Decimal(15):
        level = "warn"
    else:
        level = "ok"
    return {
        "delta_c": delta_c.quantize(Decimal("0.01")),
        "allowed_drift_in_e": allowed_in_e.quantize(Decimal("0.0001")),
        "allowed_drift_in_unit": allowed_in_unit,
        "static_range_c": [t_min, t_max],
        "level": level,
    }
