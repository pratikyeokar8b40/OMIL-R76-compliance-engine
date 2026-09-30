"""Pydantic ingress models for the metrology engine (Phase 2 boundary).

These models are the STRICT validation contract:

- Every JSON numeric arrives as a **string** (or int) and is cast to
  :class:`decimal.Decimal` by a :class:`BeforeValidator` **before** the
  Decimal type hook sees it — never through a binary float.
- IEEE 754 contamination is structurally impossible:

    1. A ``float`` in the payload raises :class:`PrecisionError` inside the
       before-validator (a raw JSON fraction must be sent as a string);
    2. Pydantic ``strict=True`` independently rejects floats/bools at the
       type hook;
    3. ``allow_inf_nan=False`` rejects NaN/Infinity strings.

These models carry ONLY ingress/egress concerns. All domain rules (band
coverage, dL <= e, L <= Max, class verification) live in the pure engine,
so validation logic exists in exactly one place (rules.md INV-1).

Phase 2 note: the API layer will re-export these as request schemas for
``POST /api/v1/evaluate-observation`` (architecture.md section 6.4). They
are delivered now so the ingress contract is testable alongside the engine.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    field_validator,
)
from pydantic import ValidationError  # noqa: F401  (re-export convenience)

from .contracts import AccuracyClass, Observation, PrecisionError, ScaleParameters

__all__ = [
    "EvaluateRequest",
    "EvaluationResponse",
    "NonNegativeDecimal",
    "ObservationIn",
    "ScaleParametersIn",
    "StrictDecimal",
]


#: Largest magnitude accepted on any metrology field. The database stores
#: NUMERIC(28, 10), i.e. 18 integer digits; 1e12 leaves ample headroom while
#: rejecting absurd inputs before they can overflow a column or a quantize.
MAX_MAGNITUDE = Decimal("1e12")

#: Most decimal places accepted (the storage scale of every metrology column).
MAX_DECIMAL_PLACES = 10


def _numeric_string_to_decimal(value: object) -> object:
    """Before-validator: cast numeric strings to Decimal; ban floats.

    Args:
        value: Raw input for a Decimal field (str, int, Decimal expected).

    Returns:
        The value unchanged (int/Decimal) or the Decimal cast of a string.

    Raises:
        PrecisionError: If a binary float is supplied.
        ValueError: If a string is empty, not a valid decimal, not finite,
            out of range, or more precise than the storage scale.
    """
    if isinstance(value, float):
        raise PrecisionError(
            "binary float is forbidden on metrology values (rules.md INV-4); "
            f"send the JSON value as a string instead: got {value!r}."
        )
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("empty string is not a valid decimal number.")
        try:
            value = Decimal(cleaned)
        except InvalidOperation as exc:
            raise ValueError(f"not a valid decimal number: {cleaned!r}.") from exc
    if isinstance(value, Decimal):
        # Rejected HERE (not by Field(allow_inf_nan=False)) so the error
        # payload carries the original string, which is JSON-serializable.
        if not value.is_finite():
            raise ValueError("NaN/Infinity is not a physical quantity.")
        if abs(value) >= MAX_MAGNITUDE:
            raise ValueError(f"value out of range (must be below {MAX_MAGNITUDE:f}).")
        if value.as_tuple().exponent < -MAX_DECIMAL_PLACES:  # type: ignore[operator]
            raise ValueError(
                f"at most {MAX_DECIMAL_PLACES} decimal places are supported."
            )
    elif isinstance(value, int) and not isinstance(value, bool) and abs(value) >= MAX_MAGNITUDE:
        raise ValueError(f"value out of range (must be below {MAX_MAGNITUDE:f}).")
    return value


#: Confinite Decimal; accepts str/int/Decimal, rejects float, NaN, Infinity.
StrictDecimal = Annotated[
    Decimal,
    BeforeValidator(_numeric_string_to_decimal),
    Field(allow_inf_nan=False),
]

#: Confinite, non-negative Decimal (masses, loads, intervals).
NonNegativeDecimal = Annotated[
    Decimal,
    BeforeValidator(_numeric_string_to_decimal),
    Field(allow_inf_nan=False, ge=0),
]


class ScaleParametersIn(BaseModel):
    """Ingress schema for instrument identity (the 'DNA' of the scale)."""

    model_config = ConfigDict(extra="forbid", strict=True)

    accuracy_class: Literal["I", "II", "III", "IIII"]
    max_capacity: NonNegativeDecimal = Field(
        description="Max capacity, base unit. Send as string, e.g. '15.000000'."
    )
    min_capacity: NonNegativeDecimal
    verification_scale_interval: Annotated[StrictDecimal, Field(gt=0)]
    display_interval: StrictDecimal | None = None

    @field_validator("display_interval")
    @classmethod
    def _display_interval_non_negative(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("display_interval (d) must be >= 0.")
        return v

    def to_domain(self) -> ScaleParameters:
        """Build the pure-domain contract; engine errors propagate verbatim."""
        return ScaleParameters(
            accuracy_class=AccuracyClass(self.accuracy_class),
            max_capacity=self.max_capacity,
            min_capacity=self.min_capacity,
            verification_scale_interval=self.verification_scale_interval,
            display_interval=self.display_interval,
        )


class ObservationIn(BaseModel):
    """Ingress schema for one raw bench reading (L, I, dL, E0, chamber temp)."""

    model_config = ConfigDict(extra="forbid", strict=True)

    applied_load: NonNegativeDecimal = Field(description="L, base unit.")
    indication: NonNegativeDecimal = Field(description="I, base unit.")
    additional_load: NonNegativeDecimal = Field(default=Decimal("0"))
    zero_error: StrictDecimal = Field(default=Decimal("0"))
    chamber_temperature_c: StrictDecimal | None = Field(default=None, description="Chamber temperature in °C.")

    def to_domain(self) -> Observation:
        """Build the pure-domain contract; engine errors propagate verbatim."""
        return Observation(
            applied_load=self.applied_load,
            indication=self.indication,
            additional_load=self.additional_load,
            zero_error=self.zero_error,
            chamber_temperature_c=self.chamber_temperature_c,
        )


class EvaluateRequest(BaseModel):
    """Instrument parameters + one raw observation, in one request body."""

    model_config = ConfigDict(extra="forbid", strict=True)

    scale: ScaleParametersIn
    observation: ObservationIn


class EvaluationResponse(BaseModel):
    """Egress mirror of :class:`engine.contracts.EvaluationResult`."""

    model_config = ConfigDict(extra="forbid")

    error_prior: str
    corrected_error: str
    mpe_limit: str
    mpe_in_e: str
    load_in_e: str
    verdict: Literal["PASS", "FAIL"]
    message: str
