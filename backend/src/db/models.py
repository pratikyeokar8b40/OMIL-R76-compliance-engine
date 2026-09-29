"""SQLAlchemy models — the five canonical tables (architecture.md §4.2).

Metrology numerics are stored as ``Numeric(18, 6)`` — never floats
(architecture.md §4.3 rule 2). Observations are APPEND-ONLY: the service
layer never issues UPDATE/DELETE on this table (rule 1); supersession uses
``supersedes_id`` + latest-wins queries on ``(test_type, position,
sequence_no)``.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from ..engine import EvaluationMode


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class UserRole(str, enum.Enum):
    """RBAC roles (architecture.md §11)."""

    LAB_TECHNICIAN = "lab_technician"
    APPROVING_OFFICER = "approving_officer"
    ADMIN = "admin"


class AccuracyClassEnum(str, enum.Enum):
    """OIML R-76 accuracy classes."""

    I = "I"
    II = "II"
    III = "III"
    IIII = "IIII"


class TestPlanStatus(str, enum.Enum):
    """Applicability/disposition for an R-76 test in a session plan."""

    REQUIRED = "required"
    OPTIONAL = "optional"
    NOT_APPLICABLE = "not_applicable"


class SessionStatus(str, enum.Enum):
    """Test-session lifecycle (architecture.md §4.2)."""

    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    APPROVED = "approved"


class ObservationVerdict(str, enum.Enum):
    """Engine-computed verdict stored at insert time."""

    PASS = "PASS"
    FAIL = "FAIL"


class ObservationSource(str, enum.Enum):
    """Where a reading came from (INV-6 provenance)."""

    MANUAL = "manual"
    SERIAL = "serial"
    OCR = "ocr"


class ObservationTestType(str, enum.Enum):
    """R-76 physical test types (Phase 4 modules map 1:1)."""

    WEIGHING_PERFORMANCE = "weighing_performance"
    ECCENTRICITY = "eccentricity"
    REPEATABILITY = "repeatability"
    TARE = "tare"
    CREEP = "creep"
    ZERO_CHECK = "zero_check"
    # Influence-factor modules (P4b): judged against standard MPE (B.2 /
    # A.5.4 "all indications within MPE") except no-load temperature,
    # which has its own fixed 1e/5degC limit (3.9.2.3).
    TEMPERATURE_NO_LOAD = "temperature_no_load"
    DAMP_HEAT = "damp_heat"
    VOLTAGE_VARIATIONS = "voltage_variations"
    DISCRIMINATION = "discrimination"
    # P4c: the remaining instrumented R 76-1 tests (report sheets 4.2-15).
    SENSITIVITY = "sensitivity"          # 4.2  A.4.9 (non-self-indicating)
    EQUILIBRIUM = "equilibrium"          # 7    A.4.12 / 4.4.2
    TILTING = "tilting"                  # 8    3.9.1 / A.5.1
    WARM_UP = "warm_up"                  # 10   A.5.2
    SPAN_STABILITY = "span_stability"    # 14   B.4
    ENDURANCE = "endurance"              # 15   A.6 / 3.9.4.3
    EMC_DISTURBANCES = "emc_disturbances"  # 12  B.3.x severe-fault criterion


class User(Base):
    """RBAC user account (login identifier: email)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_uuid)
    full_name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, native_enum=False, length=32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    sessions: Mapped[list[TestSession]] = relationship(back_populates="creator")
    instruments: Mapped[list[Instrument]] = relationship(back_populates="creator")


class Instrument(Base):
    """The metrological identity of a scale under test."""

    __tablename__ = "instruments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_uuid)
    manufacturer: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    serial_number: Mapped[str] = mapped_column(Text, index=True)
    accuracy_class: Mapped[AccuracyClassEnum] = mapped_column(
        Enum(AccuracyClassEnum, native_enum=False, length=8)
    )
    max_capacity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    min_capacity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    verification_scale_interval: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    display_interval: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    base_unit: Mapped[str] = mapped_column(String(8), default="kg")
    n_max: Mapped[Decimal] = mapped_column(Numeric(24, 6))  # Max / e, computed once
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    creator: Mapped[User] = relationship(back_populates="instruments")
    sessions: Mapped[list[TestSession]] = relationship(back_populates="instrument")


class TestSession(Base):
    """One evaluation campaign against one instrument."""

    __tablename__ = "test_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_uuid)
    instrument_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("instruments.id"), index=True
    )
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, native_enum=False, length=16),
        default=SessionStatus.DRAFT,
    )
    #: Which MPE regime applies (R 76-1 §3.5): initial verification (1×)
    #: or in-service re-verification (2×, §3.5.2). Fixed at creation — a
    #: session never silently switches legal regimes mid-campaign.
    evaluation_mode: Mapped[EvaluationMode] = mapped_column(
        Enum(EvaluationMode, native_enum=False, length=24),
        default=EvaluationMode.INITIAL_VERIFICATION,
    )
    start_temp_c: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    end_temp_c: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    humidity_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    pressure_hpa: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    instrument: Mapped[Instrument] = relationship(back_populates="sessions")
    creator: Mapped[User] = relationship(back_populates="sessions")
    observations: Mapped[list[Observation]] = relationship(back_populates="session")
    reports: Mapped[list[Report]] = relationship(back_populates="session")
    test_plan: Mapped[list[TestPlanItem]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Observation(Base):
    """One raw bench reading + stored engine verdict. APPEND-ONLY."""

    __tablename__ = "observations"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "test_type",
            "position",
            "sequence_no",
            "revision_no",
            name="uq_observation_logical_identity",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("test_sessions.id"), index=True
    )
    test_type: Mapped[ObservationTestType] = mapped_column(
        Enum(ObservationTestType, native_enum=False, length=32)
    )
    position: Mapped[str | None] = mapped_column(String(16), nullable=True)
    sequence_no: Mapped[int] = mapped_column(Integer)
    revision_no: Mapped[int] = mapped_column(Integer, default=0)  # latest-wins key
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("observations.id"), nullable=True
    )

    applied_load: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    indication: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    additional_load: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    zero_error: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    chamber_temperature_c: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    # Discrimination only (A.4.8.2): indication I2 after the 1.4 d extra
    # load. NULL for every other test type.
    second_indication: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )

    # Engine-computed at insert (architecture.md §4.3 rule 3):
    error_prior: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    corrected_error: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    mpe_limit: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    verdict: Mapped[ObservationVerdict] = mapped_column(
        Enum(ObservationVerdict, native_enum=False, length=8)
    )

    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    entered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    source: Mapped[ObservationSource] = mapped_column(
        Enum(ObservationSource, native_enum=False, length=16),
        default=ObservationSource.MANUAL,
    )

    session: Mapped[TestSession] = relationship(back_populates="observations")


class TestPlanItem(Base):
    """Applicability and completion gate for one R-76 physical test."""

    __tablename__ = "test_plan_items"
    __table_args__ = (UniqueConstraint("session_id", "test_type", name="uq_test_plan_session_type"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("test_sessions.id"), index=True)
    test_type: Mapped[ObservationTestType] = mapped_column(Enum(ObservationTestType, native_enum=False, length=32))
    status: Mapped[TestPlanStatus] = mapped_column(Enum(TestPlanStatus, native_enum=False, length=24))
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped[TestSession] = relationship(back_populates="test_plan")


class Report(Base):
    """Generated report artifact + integrity seal."""

    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("test_sessions.id"), index=True
    )
    file_path: Mapped[str] = mapped_column(Text)
    docx_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    sha256: Mapped[str] = mapped_column(String(64))
    qr_payload: Mapped[str] = mapped_column(Text)
    signed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    template_version: Mapped[str] = mapped_column(String(32), default="r76-2-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped[TestSession] = relationship(back_populates="reports")


class ChecklistOutcome(str, enum.Enum):
    """R 76-2 checklist item outcome (sheet 17: PASSED / FAILED / Remarks)."""

    PASSED = "PASSED"
    FAILED = "FAILED"
    UNCHECKED = "UNCHECKED"
    NOT_APPLICABLE = "NA"


class ChecklistItem(Base):
    """One requirement row of the R 76-2 CHECKLIST (sheet 17).

    Test 17 covers what tests 1-15 cannot: visual/experimental checks like
    descriptive markings (7.1), device prohibitions (4.13.3.3) and the
    operating ranges of devices (e.g. tare 4.6.4). APPEND-ONLY like
    observations: corrections go through supersedes_id.
    """

    __tablename__ = "checklist_items"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "clause",
            "item_key",
            "revision_no",
            name="uq_checklist_item_revision",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("test_sessions.id"), index=True
    )
    #: Checklist clause, e.g. "7.1.1" or "4.13.3.3".
    clause: Mapped[str] = mapped_column(String(16))
    #: Stable item key within the clause, e.g. "manufacturer_mark".
    item_key: Mapped[str] = mapped_column(String(64))
    #: Requirement text as printed on the official sheet (denormalized for
    #: the report renderers; the catalog lives in the engine package).
    requirement: Mapped[str] = mapped_column(Text)
    #: Testing procedure column on the sheet (usually "A.3" or clause ref).
    test_procedure: Mapped[str] = mapped_column(String(32), default="visual")
    outcome: Mapped[ChecklistOutcome] = mapped_column(
        Enum(ChecklistOutcome, native_enum=False, length=16)
    )
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    revision_no: Mapped[int] = mapped_column(Integer, default=0)
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("checklist_items.id"), nullable=True
    )
    entered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    entered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
