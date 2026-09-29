"""Data contracts for the OIML R-76 metrology engine.

These are stdlib dataclasses, NOT Pydantic models. Binding rule (rules.md
INV-2): the pure domain layer must not import frameworks. Pydantic request
schemas that cast JSON -> Decimal live at the API boundary (Phase 2,
``src.api.schemas``) and construct these dataclasses.

Precision policy (rules.md INV-4):

- Every metrology field is :class:`decimal.Decimal` -- never ``float``.
- Construction is fail-fast: a ``float`` passed anywhere raises
  :class:`PrecisionError` immediately rather than silently contaminating a
  computation with IEEE 754 artifacts.
- The one and only sanctioned escape hatch is :func:`engine.mpe_rules.dec`,
  which casts a float through ``str`` at a documented precision.

Domain units: every quantity on a contract is expressed in the instrument's
declared base unit (e.g. kg). Unit conversion is an API-layer concern and
must happen before an :class:`Observation` is built.
"""

from __future__ import annotations

import enum
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Final, Tuple

__all__ = [
    "AccuracyClass",
    "EngineValueError",
    "EvaluationResult",
    "Observation",
    "PrecisionError",
    "ScaleParameters",
    "Verdict",
    "coerce_decimal",
]

# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------


class EngineValueError(ValueError):
    """A domain rule was violated by the supplied values."""


class PrecisionError(TypeError, EngineValueError):
    """A binary float was supplied where only Decimal is permitted.

    Raised eagerly at contract construction so that IEEE 754 contamination
    can never reach the calculation core (rules.md INV-4).
    """


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------


class AccuracyClass(str, enum.Enum):
    """OIML R-76-1 accuracy classes (Section 3.2 / Table 3)."""

    SPECIAL_I = "I"
    HIGH_II = "II"
    MEDIUM_III = "III"
    ORDINARY_IIII = "IIII"


class Verdict(str, enum.Enum):
    """Deterministic evaluation outcome for a single observation."""

    PASS = "PASS"
    FAIL = "FAIL"


# --------------------------------------------------------------------------
# Decimal coercion helpers
# --------------------------------------------------------------------------

_DECIMAL_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^[+-]?(?:\d+\.?\d*|\.\d+)$"
)


def coerce_decimal(
    value: Decimal | int | str,
    field_name: str,
    *,
    allow_negative: bool = True,
) -> Decimal:
    """Coerce a JSON-domain value to :class:`Decimal` with fail-fast rules.

    This is the ONLY value-ingest path in the engine. It accepts exactly the
    types a strict JSON layer can hand over after schema validation:

    - ``Decimal`` -- passed through (must not be NaN/Infinity)
    - ``int`` -- exact conversion
    - ``str`` -- decimal-scientific notation (``"1.5e-3"`` accepted)

    Args:
        value: The value to coerce.
        field_name: Field label used in error messages (auditor-friendly).
        allow_negative: Whether negative results are domain-valid. Mass
            quantities (loads, indications) are not; difference quantities
            (errors, zero error) are.

    Returns:
        The coerced, validated :class:`Decimal`.

    Raises:
        PrecisionError: If a binary ``float`` is supplied.
        EngineValueError: If the value is empty, non-numeric, NaN/Infinity,
            or negative when disallowed.
    """
    if isinstance(value, float):
        raise PrecisionError(
            f"{field_name}: binary float is forbidden on metrology values "
            f"(rules.md INV-4). Use decimal-safe input: got {value!r}."
        )
    if isinstance(value, bool) or not isinstance(value, (Decimal, int, str)):
        raise EngineValueError(
            f"{field_name}: expected Decimal, int, or numeric string; "
            f"got {type(value).__name__}."
        )
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned or not _DECIMAL_PATTERN.match(cleaned):
            # Retry with Decimal itself so scientific notation is accepted.
            try:
                candidate = Decimal(cleaned)
            except InvalidOperation as exc:
                raise EngineValueError(
                    f"{field_name}: not a valid decimal number: {value!r}."
                ) from exc
            if not candidate.is_finite():
                raise EngineValueError(
                    f"{field_name}: NaN/Infinity is not a physical quantity."
                )
            if not allow_negative and candidate < 0:
                raise EngineValueError(f"{field_name}: must be >= 0.")
            return candidate
        candidate = Decimal(cleaned)
        if not candidate.is_finite():
            raise EngineValueError(
                f"{field_name}: NaN/Infinity is not a physical quantity."
            )
        if not allow_negative and candidate < 0:
            raise EngineValueError(f"{field_name}: must be >= 0.")
        return candidate
    if isinstance(value, int):
        candidate = Decimal(value)
        if not allow_negative and candidate < 0:
            raise EngineValueError(f"{field_name}: must be >= 0.")
        return candidate
    # isinstance(value, Decimal)
    if not value.is_finite():
        raise EngineValueError(
            f"{field_name}: NaN/Infinity is not a physical quantity."
        )
    if not allow_negative and value < 0:
        raise EngineValueError(f"{field_name}: must be >= 0.")
    return value


# --------------------------------------------------------------------------
# Contracts
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ScaleParameters:
    """The metrological identity of the instrument under test.

    Mirrors the ``instruments`` table (architecture.md section 4.2) and is
    validated for R 76-1 Table 3 consistency by
    :func:`engine.mpe_rules.validate_instrument_spec`.

    Attributes:
        accuracy_class: One of the four legal accuracy classes.
        max_capacity: Maximum capacity (Max), base unit.
        min_capacity: Minimum capacity (Min), base unit.
        verification_scale_interval: The legal interval ``e`` (base unit).
        display_interval: The display resolution ``d`` (base unit). Optional
            at construction (kept ``None`` until provided); validated when
            present. API schemas may materialize it as ``Decimal("0")``
            when unknown -- validation then skips the d/e consistency rule.
        base_unit: The declared unit of every quantity on this contract
            (``"kg"`` default, ``"g"``). Table 3's e-range rows are
            gram-denominated (R 76-1 2006, p. 27), so class validation
            converts ``e`` to grams using this unit; every other engine
            computation is unit-agnostic.
    """

    accuracy_class: AccuracyClass
    max_capacity: Decimal
    min_capacity: Decimal
    verification_scale_interval: Decimal
    display_interval: Decimal | None = None
    base_unit: str = "kg"

    def __post_init__(self) -> None:
        if not isinstance(self.accuracy_class, AccuracyClass):
            raise EngineValueError(
                "accuracy_class: must be an AccuracyClass member; "
                f"got {self.accuracy_class!r}."
            )
        object.__setattr__(
            self,
            "max_capacity",
            coerce_decimal(self.max_capacity, "max_capacity", allow_negative=False),
        )
        object.__setattr__(
            self,
            "min_capacity",
            coerce_decimal(self.min_capacity, "min_capacity", allow_negative=False),
        )
        object.__setattr__(
            self,
            "verification_scale_interval",
            coerce_decimal(
                self.verification_scale_interval,
                "verification_scale_interval (e)",
                allow_negative=False,
            ),
        )
        if self.display_interval is not None:
            object.__setattr__(
                self,
                "display_interval",
                coerce_decimal(
                    self.display_interval, "display_interval (d)", allow_negative=False
                ),
            )
        if self.base_unit not in ("kg", "g"):
            raise EngineValueError(
                f"base_unit: must be 'kg' or 'g'; got {self.base_unit!r}."
            )

    # -- Derived quantities ------------------------------------------------

    @property
    def n_max(self) -> Decimal:
        """Number of verification scale intervals ``n = Max / e``.

        Exact division: Decimal division is inexact only when the mathematical
        result cannot be represented; ``validate_instrument_spec`` enforces
        that Max is an integer multiple of e, so this is always exact.
        """
        return self.max_capacity / self.verification_scale_interval


@dataclass(frozen=True, slots=True)
class Observation:
    """One raw test reading exactly as captured at the bench.

    Field semantics per OIML R-76-1 A.4.4.3 (weighing test):

    - ``applied_load`` (L): certified mass placed on the load receptor.
    - ``indication`` (I): the instrument's displayed value.
    - ``additional_load`` (dL): extra mass added to pin down the exact
      digital changeover point (flashing-to-steady transition).
    - ``zero_error`` (E0): error computed at zero prior to loading,
      accounting for zero-setting initial drift.

    All quantities share the instrument's base unit. ``None`` means "not yet
    captured" for optional sequence fields; the four metrology inputs are
    always required.

    Attributes:
        applied_load: L (>= 0).
        indication: I (>= 0).
        additional_load: dL (>= 0); the dL-does-not-exceed-e rule is
            enforced by :func:`engine.mpe_rules.evaluate`.
        zero_error: E0 (may be negative).
    """

    applied_load: Decimal
    indication: Decimal
    additional_load: Decimal = field(default_factory=lambda: Decimal("0"))
    zero_error: Decimal = field(default_factory=lambda: Decimal("0"))
    chamber_temperature_c: Decimal | None = None
    # Discrimination only (A.4.8.2 / R 76-2 sheet 4.1.1): indication after
    # the extra load of 1.4 d. ``None`` for every other test type.
    second_indication: Decimal | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "applied_load",
            coerce_decimal(self.applied_load, "applied_load (L)", allow_negative=False),
        )
        object.__setattr__(
            self, "indication",
            coerce_decimal(self.indication, "indication (I)", allow_negative=False),
        )
        object.__setattr__(
            self, "additional_load",
            coerce_decimal(
                self.additional_load, "additional_load (dL)", allow_negative=False
            ),
        )
        object.__setattr__(
            self, "zero_error",
            coerce_decimal(self.zero_error, "zero_error (E0)", allow_negative=True),
        )
        if self.chamber_temperature_c is not None:
            object.__setattr__(
                self, "chamber_temperature_c",
                coerce_decimal(
                    self.chamber_temperature_c,
                    "chamber_temperature_c (°C)",
                    allow_negative=True,
                ),
            )
        if self.second_indication is not None:
            object.__setattr__(
                self, "second_indication",
                coerce_decimal(
                    self.second_indication, "second_indication (I2)",
                    allow_negative=False,
                ),
            )


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    """Immutable, serializable outcome bundle for one evaluation.

    The service layer persists every member verbatim (architecture.md
    section 4.2, ``observations`` table); the UI renders them as-is and is
    forbidden from re-deriving verdicts (rules.md INV-8).

    Attributes:
        error_prior: E = I + 0.5e - dL - L (prior to rounding).
        corrected_error: Ec = E - E0 (the legally judged quantity).
        mpe_limit: Positive MPE magnitude for the applied load, e.g. 0.5e.
        mpe_in_e: The same limit expressed in units of e (0.5, 1.0, 1.5).
        load_in_e: Applied load expressed in verification scale intervals.
        verdict: PASS iff |Ec| <= mpe_limit.
        message: Human-readable verdict rationale; rendered verbatim.
    """

    error_prior: Decimal
    corrected_error: Decimal
    mpe_limit: Decimal
    mpe_in_e: str
    load_in_e: str
    verdict: Verdict
    message: str

    def to_dict(self) -> dict[str, str]:
        """Serialize for JSON persistence (API layer re-wraps as needed)."""
        return {
            "error_prior": str(self.error_prior),
            "corrected_error": str(self.corrected_error),
            "mpe_limit": str(self.mpe_limit),
            "mpe_in_e": self.mpe_in_e,
            "load_in_e": self.load_in_e,
            "verdict": self.verdict.value,
            "message": self.message,
        }
