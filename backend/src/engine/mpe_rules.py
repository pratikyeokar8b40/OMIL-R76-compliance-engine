"""MPE step tables and the deterministic evaluation core (pure domain).

This module implements the heart of the OIML R-76-1 compliance engine:

1. **MPE bands (Section 5.10 / Table 6 semantics)** — the Maximum
   Permissible Error for a load depends on the load expressed in
   verification scale intervals (``m = L / e``) and the accuracy class.
   Bands are DATA (:data:`_MPE_TABLE`), never scattered conditionals
   (rules.md INV-3). Canonical Class III bands::

       0     <= m <= 500e      -> MPE = 0.5e
       500e  <  m <= 2000e     -> MPE = 1.0e
       2000e <  m <= 10000e    -> MPE = 1.5e

2. **Evaluation core** — :func:`evaluate` runs the full chain:

       E  = I + 0.5e - dL - L          (A.4.4.3, error prior to rounding)
       Ec = E - E0                     (corrected error)
       MPE = band(class, L, e)
       verdict = PASS  iff  |Ec| <= MPE   else FAIL

   The comparison uses the *inclusive* upper bound at the band edge: an
   error exactly equal to the limit PASSES (this is the intent of
   "must not exceed the maximum permissible error").

VERIFICATION RECORD (rules.md INV-5 / phases.md P1-2) -- 2026-09-15
-------------------------------------------------------------------
All four class columns of :data:`_MPE_TABLE` were hand-checked against the
official R 76-1 (2006) PDF, Section 3.5.1, Table 6 (extracted verbatim from
``required rulebook/r076-1-e06.pdf``, page 30 of the PDF)::

    mpe      Class I              Class II             Class III            Class IIII
    0.5e     0 <= m <= 50 000     0 <= m <= 5 000      0 <= m <= 500        0 <= m <= 50
    1.0e     50 000 < m <= 200 000| 5 000 < m <= 20 000 | 500 < m <= 2 000   | 50 < m <= 200
    1.5e     200 000 < m          20 000 < m <= 100 000| 2 000 < m <= 10 000| 200 < m <= 1 000

NOTE (Section 3.5.2): the MPEs *in service* are TWICE the values above.
This engine implements INITIAL VERIFICATION (pattern evaluation) limits.
In-service mode, if ever required, must be an explicit parameter (see
memory.md parking lot) -- never a silent constant change.

The strict gate (:data:`STRICT_VERIFIED_ONLY`) remains in place as a
defense-in-depth mechanism: any future class or band added without a
:class:`Verified` provenance marker is refused automatically.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from decimal import Decimal, localcontext
from typing import Final

from .class_rules import VERIFIED_CLASSES, _TO_GRAMS
from .contracts import (
    AccuracyClass,
    EngineValueError,
    EvaluationResult,
    Observation,
    ScaleParameters,
    Verdict,
)
from .error_calc import corrected_error, error_prior_to_rounding
from .rounding import INTERNAL_PRECISION, format_quantity

__all__ = [
    "EvaluationMode",
    "STRICT_VERIFIED_ONLY",
    "Verified",
    "dec",
    "evaluate",
    "mpe_for_load",
    "quantize_to_d",
]


class EvaluationMode(str, enum.Enum):
    """Which Table 6 column set applies (R 76-1 Section 3.5).

    INITIAL_VERIFICATION (default): pattern evaluation / first verification
    limits per Section 3.5.1 — the scope of PS 26035.

    IN_SERVICE: Section 3.5.2 — "The maximum permissible error in service
    shall be twice the value in 3.5.1" — a *separate* legal regime used
    when re-verifying an instrument already in use. It must ALWAYS be an
    explicit parameter (decision D-19): silently doubling the constant
    would corrupt pattern-evaluation verdicts.
    """

    INITIAL_VERIFICATION = "initial_verification"
    IN_SERVICE = "in_service"

    @property
    def mpe_multiplier(self) -> Decimal:
        """Factor applied to the Table 6 base bands for this mode."""
        return Decimal("1") if self is EvaluationMode.INITIAL_VERIFICATION else Decimal("2")

#: When ``True`` (default), evaluating an instrument whose class has not
#: passed the P1-2 human verification gate raises :class:`EngineValueError`.
#: Flip to ``False`` only via a logged decision (memory.md section 5).
STRICT_VERIFIED_ONLY: Final[bool] = True


@dataclass(frozen=True, slots=True)
class Verified:
    """Provenance marker for a regulatory constant.

    Attributes:
        verified: Whether a human has checked the value against the
            official R 76-1 PDF (P1-2 gate).
        source: Citation, e.g. ``"R 76-1 Table 6, Class III column"``.
        checked_at_phase: Tracking identifier of the verification record.
    """

    verified: bool
    source: str
    checked_at_phase: str | None = None


@dataclass(frozen=True, slots=True)
class _MPEBand:
    """One contiguous MPE band: ``lo < m <= hi`` (``lo`` is exclusive-open)."""

    lo: Decimal | None  # None = band starts at zero (m >= 0)
    hi: Decimal | None  # None = unbounded above
    factor: Decimal  # MPE = factor * e
    provenance: Verified = field(
        default_factory=lambda: Verified(verified=False, source="pending P1-2 gate")
    )


# --------------------------------------------------------------------------
# The single source of truth for MPE bands (rules.md INV-3).
# lo is EXCLUSIVE below (bands are (lo, hi]); hi is INCLUSIVE.
# ALL FOUR CLASSES verified against R 76-1 (2006) Section 3.5.1, Table 6
# on 2026-09-15 (P1-2 record; see module docstring for the verbatim source).
# --------------------------------------------------------------------------
_MPE_TABLE: Final[dict[AccuracyClass, tuple[_MPEBand, ...]]] = {
    AccuracyClass.MEDIUM_III: (
        _MPEBand(
            lo=None,
            hi=Decimal("500"),
            factor=Decimal("0.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class III: 0 <= m <= 500 -> 0.5e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("500"),
            hi=Decimal("2000"),
            factor=Decimal("1.0"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class III: 500 < m <= 2 000 -> 1.0e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("2000"),
            hi=Decimal("10000"),
            factor=Decimal("1.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class III: 2 000 < m <= 10 000 -> 1.5e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
    ),
    AccuracyClass.SPECIAL_I: (
        _MPEBand(
            lo=None,
            hi=Decimal("50000"),
            factor=Decimal("0.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class I: 0 <= m <= 50 000 -> 0.5e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("50000"),
            hi=Decimal("200000"),
            factor=Decimal("1.0"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class I: 50 000 < m <= 200 000 -> 1.0e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("200000"),
            hi=None,
            factor=Decimal("1.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class I: 200 000 < m -> 1.5e (unbounded)",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
    ),
    AccuracyClass.HIGH_II: (
        _MPEBand(
            lo=None,
            hi=Decimal("5000"),
            factor=Decimal("0.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class II: 0 <= m <= 5 000 -> 0.5e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("5000"),
            hi=Decimal("20000"),
            factor=Decimal("1.0"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class II: 5 000 < m <= 20 000 -> 1.0e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("20000"),
            hi=Decimal("100000"),
            factor=Decimal("1.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class II: 20 000 < m <= 100 000 -> 1.5e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
    ),
    AccuracyClass.ORDINARY_IIII: (
        _MPEBand(
            lo=None,
            hi=Decimal("50"),
            factor=Decimal("0.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class IIII: 0 <= m <= 50 -> 0.5e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("50"),
            hi=Decimal("200"),
            factor=Decimal("1.0"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class IIII: 50 < m <= 200 -> 1.0e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
        _MPEBand(
            lo=Decimal("200"),
            hi=Decimal("1000"),
            factor=Decimal("1.5"),
            provenance=Verified(
                verified=True,
                source="R 76-1 (2006) Table 6, Class IIII: 200 < m <= 1 000 -> 1.5e",
                checked_at_phase="P1-2 (2026-09-15, official PDF)",
            ),
        ),
    ),
}


def _plain(value: Decimal) -> str:
    """Human-readable number for error messages ("15", not "15.0000000000")."""
    return format(value.normalize(), "f")


def dec(value: float | int | str | Decimal) -> Decimal:
    """Convert a value to :class:`Decimal` exactly, or fail loudly.

    The ONLY sanctioned float -> Decimal escape hatch (rules.md INV-4).
    Python floats are binary rationals; their ``repr`` is the shortest
    string that round-trips, so ``str(value)`` preserves the decimal value
    the user *meant* (``str(0.1) == "0.1"``) instead of the binary artifact
    (``Decimal(0.1) == 0.1000000000000000055511151231257827...``).

    Args:
        value: A float, int, numeric string, or Decimal.

    Returns:
        The exact Decimal interpretation of the value's decimal meaning.

    Raises:
        PrecisionError: If ``value`` is a non-finite float (NaN/inf).
        EngineValueError: If the value cannot be parsed as a decimal.
    """
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            from .contracts import PrecisionError

            raise PrecisionError(
                f"dec(): NaN/Infinity floats are not physical quantities: {value!r}."
            )
        return Decimal(str(value))
    from .contracts import coerce_decimal

    return coerce_decimal(value, "dec()")


# --------------------------------------------------------------------------
# MPE lookup
# --------------------------------------------------------------------------


def mpe_for_load(
    accuracy_class: AccuracyClass,
    load_in_e: Decimal,
    e: Decimal,
    mode: EvaluationMode = EvaluationMode.INITIAL_VERIFICATION,
) -> Decimal:
    """Return the MPE magnitude (in base unit) for a load on a class.

    Args:
        accuracy_class: The instrument's accuracy class.
        load_in_e: The applied load expressed in intervals (``m = L / e``).
            Must be finite and >= 0.
        e: The verification scale interval; must be > 0.
        mode: ``INITIAL_VERIFICATION`` (Table 6 as written, the default)
            or ``IN_SERVICE`` (Section 3.5.2: twice the Table 6 values).

    Returns:
        ``factor * multiplier * e`` for the band containing ``load_in_e``.

    Raises:
        EngineValueError: If the accuracy class has not passed the P1-2
            human verification gate (strict mode), if ``e <= 0``, if the
            load is negative, or if no band covers the load (possible only
            if the class's band table has a gap — a defect that must never
            be swallowed).
    """
    if STRICT_VERIFIED_ONLY and accuracy_class not in VERIFIED_CLASSES:
        raise EngineValueError(
            f"Class {accuracy_class.value} MPE constants have not passed the "
            "P1-2 human verification gate (memory.md section 7, D-09). "
            "Refusing to emit a legal verdict on unverified constants."
        )
    if e <= 0:
        raise EngineValueError(
            f"verification_scale_interval (e) must be > 0; got {e}."
        )
    if load_in_e < 0:
        raise EngineValueError(
            f"load_in_e must be >= 0; got {load_in_e}."
        )
    bands = _MPE_TABLE[accuracy_class]
    with localcontext() as ctx:
        ctx.prec = INTERNAL_PRECISION
        for band in bands:
            above_lo = band.lo is None or load_in_e > band.lo
            below_hi = band.hi is None or load_in_e <= band.hi
            if above_lo and below_hi:
                return band.factor * mode.mpe_multiplier * e
    # No covering band: table gap. Never guess — raise (rules.md section 7).
    raise EngineValueError(
        f"No MPE band covers load {load_in_e}e for class "
        f"{accuracy_class.value}; MPE table gap is a defect."
    )


# --------------------------------------------------------------------------
# Full evaluation core
# --------------------------------------------------------------------------


def evaluate(
    scale: ScaleParameters,
    observation: Observation,
    mode: EvaluationMode = EvaluationMode.INITIAL_VERIFICATION,
    test_type: str | None = None,
) -> EvaluationResult:
    """Run the full deterministic evaluation chain for one observation.

    Chain (all exact Decimal arithmetic):

        1. E  = I + 0.5e - dL - L       (A.4.4.3)
        2. Ec = E - E0                  (corrected error)
        3. MPE = band(class, L/e, e)    (P1-2 verification gate inside;
                                        multiplied per ``mode`` — in-service
                                        limits are 2× Table 6, Section 3.5.2)
        4. verdict = PASS iff |Ec| <= MPE

    The default mode is INITIAL_VERIFICATION: pattern evaluation per
    PS 26035. Callers evaluating a re-verification of an instrument already
    in use must pass ``EvaluationMode.IN_SERVICE`` explicitly.

    Domain guards enforced here (fail-fast, auditor-readable messages):

        - ``dL`` must not exceed ``e`` (the changeover point lies within
          one interval; a larger dL is a transcription error).
        - ``L`` must not exceed ``Max`` (test loads live in the legal range).

    Args:
        scale: Validated instrument parameters (call
            :func:`validate_instrument_spec` first at the service layer).
        observation: The raw reading.
        test_type: API test type when known; disambiguates the fixed 1e
            no-load zero-row limit (3.9.2.3) from a genuine weighing row at
            Min = 0. Other test types evaluate identically to None.

    Returns:
        The immutable :class:`EvaluationResult` bundle.

    Raises:
        EngineValueError: On any domain violation (unverified class via the
            gate inside ``mpe_for_load``, dL > e, L > Max, non-positive e).
    """
    if observation.additional_load > scale.verification_scale_interval:
        raise EngineValueError(
            f"additional_load (dL) {_plain(observation.additional_load)} must not "
            f"exceed verification_scale_interval (e) "
            f"{_plain(scale.verification_scale_interval)}: the changeover point lies "
            "within one interval; check the reading."
        )
    if observation.applied_load > scale.max_capacity:
        raise EngineValueError(
            f"applied_load (L) {_plain(observation.applied_load)} exceeds "
            f"max_capacity (Max) {_plain(scale.max_capacity)}: test loads must lie "
            "within the legal range."
        )

    e = scale.verification_scale_interval

    is_discrimination = test_type == "discrimination"
    if is_discrimination and observation.second_indication is None:
        raise EngineValueError(
            "discrimination rows require second_indication (I2)."
        )
    if not is_discrimination and observation.second_indication is not None:
        raise EngineValueError(
            "second_indication (I2) is only valid for discrimination rows."
        )

    # ---- Discrimination (R 76-1 3.8.2.2 digital + A.4.8.2) ----------------
    # NOT an error test: it verifies that the instrument RESPONDS to a
    # small extra load. With 1/10 d extra already on the receptor, gently
    # adding 1.4 d must shift the indication unambiguously: I2 - I1 >= d.
    # (R 76-2 sheet 4.1.1 records L, I1, dL, +1/10 d, 1.4 d, I2, I2-I1.)
    if is_discrimination:
        d = scale.display_interval
        if d is None or d <= 0:
            raise EngineValueError(
                "discrimination requires display_interval (d); the instrument "
                "record has no display resolution."
            )
        d_g = d * _TO_GRAMS[scale.base_unit]
        # Threshold is 5 mg = 0.005 g; d_g is gram-denominated.
        if d_g < Decimal("0.005"):
            raise EngineValueError(
                "discrimination (digital, A.4.8.2) applies only to "
                "instruments with d >= 5 mg; this instrument has "
                f"d = {_plain(d)} {scale.base_unit}."
            )
        delta = observation.second_indication - observation.indication
        if delta < 0:
            raise EngineValueError(
                f"second_indication (I2) {_plain(observation.second_indication)} is "
                "below the pre-extra-load indication (I1) "
                f"{_plain(observation.indication)}: the indication must INCREASE "
                "after the 1.4 d extra load; check the reading."
            )
        passed = delta >= d
        cmp_word = ">=" if passed else "<"
        verdict_word = "PASS" if passed else "FAIL"
        message = (
            f"Discrimination at L = {format_quantity(observation.applied_load)}: "
            f"I1 = {format_quantity(observation.indication)}, "
            f"I2 = {format_quantity(observation.second_indication)}, "
            f"I2 - I1 = {format_quantity(delta)} "
            f"{cmp_word} d = {format_quantity(d)} -> {verdict_word} "
            "(A.4.8.2: add 1.4 d, expect +1 interval)."
        )
        return EvaluationResult(
            error_prior=Decimal("0"),
            corrected_error=delta,
            mpe_limit=d,
            mpe_in_e=format_quantity(d / e),
            load_in_e=format_quantity(observation.applied_load / e),
            verdict=Verdict.PASS if passed else Verdict.FAIL,
            message=message,
        )

    # ---- Temperature effect on no-load (3.9.2.3 / A.5.3.2) ---------------
    # Not the class band: the limit is one full e of zero drift per 1 degC
    # (class I) or per 5 degC (other classes). Zero-error rows (L = 0,
    # I = 0, dL = measured changeover) evaluate |Ec| against that fixed e.
    # A genuine weighing row at Min = 0 keeps the 0.5 e band because the
    # fixed limit applies only when the caller identifies the test type.
    # ---- Fixed-limit family (P4c) ----------------------------------------
    # Tests whose criterion is a FIXED multiple of e — deliberately NOT the
    # 0.5e Table 6 band ("e" here means one full verification interval):
    #
    #   tilting (no load)   2 e zero shift        (3.9.1.1; loaded tilting
    #                        rows use the class band with tilted-zero E0)
    #   equilibrium         1 e print/store deviation under disturbance
    #                                             (4.4.2 / A.4.12)
    #   emc_disturbances    deviation <= e or significant fault (B.3.x)
    #
    # warm_up (A.5.2), span_stability (B.4) and endurance (3.9.4.3) say
    # "within the mpe FOR THE APPLIED LOAD" — that IS the class band, so
    # those test types evaluate on the standard path with no branch here.
    _FIXED_LIMITS_IN_E: Final[dict[str, str]] = {
        "equilibrium": "1",
        "emc_disturbances": "1",
    }
    if test_type == "tilting" and observation.applied_load == 0:
        factor = Decimal("2")
    elif test_type in _FIXED_LIMITS_IN_E:
        factor = Decimal(_FIXED_LIMITS_IN_E[test_type])
    else:
        factor = None
    if factor is not None:
        with localcontext() as ctx:
            ctx.prec = INTERNAL_PRECISION
            error_prior = error_prior_to_rounding(observation, e)
            ec = corrected_error(error_prior, observation.zero_error)
            limit = factor * e
            verdict = Verdict.PASS if abs(ec) <= limit else Verdict.FAIL
        message = (
            f"{test_type.replace('_', ' ')}: |Ec| = "
            f"{format_quantity(abs(ec))} "
            f"{'<=' if verdict is Verdict.PASS else '>'} limit {factor:f}e = "
            f"{format_quantity(limit)} -> "
            f"{'PASS' if verdict is Verdict.PASS else 'FAIL'}."
        )
        return EvaluationResult(
            error_prior=error_prior,
            corrected_error=ec,
            mpe_limit=limit,
            mpe_in_e=format_quantity(factor),
            load_in_e=format_quantity(observation.applied_load / e),
            verdict=verdict,
            message=message,
        )

    if test_type == "temperature_no_load":
        if observation.applied_load != 0:
            raise EngineValueError(
                "temperature_no_load rows are no-load zero determinations "
                "(3.9.2.3); applied_load must be 0."
            )
        with localcontext() as ctx:
            ctx.prec = INTERNAL_PRECISION
            error_prior = error_prior_to_rounding(observation, e)
            zero_ec = corrected_error(error_prior, observation.zero_error)
            verdict = Verdict.PASS if abs(zero_ec) <= e else Verdict.FAIL
        cmp_word = "<=" if verdict is Verdict.PASS else ">"
        verdict_word = "PASS" if verdict is Verdict.PASS else "FAIL"
        message = (
            "Zero-point determination at no load: |Ec| = "
            f"{format_quantity(abs(zero_ec))} {cmp_word} 1e = "
            f"{format_quantity(e)} -> {verdict_word} "
            "(3.9.2.3: zero drift <= 1e)."
        )
        return EvaluationResult(
            error_prior=error_prior,
            corrected_error=zero_ec,
            mpe_limit=e,
            mpe_in_e="1.000000",
            load_in_e="0.000000",
            verdict=verdict,
            message=message,
        )

    with localcontext() as ctx:
        ctx.prec = INTERNAL_PRECISION
        load_in_e = observation.applied_load / e
        error_prior = error_prior_to_rounding(observation, e)
        ec = corrected_error(error_prior, observation.zero_error)
        mpe_limit = mpe_for_load(scale.accuracy_class, load_in_e, e, mode)
        verdict = Verdict.PASS if abs(ec) <= mpe_limit else Verdict.FAIL

    mpe_in_e = mpe_limit / e  # exact: factor * e / e
    message = (
        f"Corrected error {format_quantity(ec)} "
        f"{'within' if verdict is Verdict.PASS else 'exceeds'} MPE "
        f"±{format_quantity(mpe_limit)} ({format_quantity(mpe_in_e)}e) at "
        f"{format_quantity(load_in_e)}e for Class {scale.accuracy_class.value}."
    )

    return EvaluationResult(
        error_prior=error_prior,
        corrected_error=ec,
        mpe_limit=mpe_limit,
        mpe_in_e=format_quantity(mpe_in_e),
        load_in_e=format_quantity(load_in_e),
        verdict=verdict,
        message=message,
    )


# Re-export so that ``engine.quantize_to_d`` resolves (presentation-only
# rounding for UI echo; never used in verdict computation).
from .rounding import quantize_to_d  # noqa: E402  (intentional re-export)
