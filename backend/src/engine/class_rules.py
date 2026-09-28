"""Instrument specification validation — OIML R 76-1 Table 3 (pure domain).

An instrument's parameters must be mutually consistent BEFORE any test data
is evaluated. This module is the single gate for that validation
(phases.md P1-5, ``engine/class_rules.py``).

Table 3 data (R 76-1 (2006) p. 27) is structured by accuracy class AND by
the row's permitted ``e`` range — the ranges are gram-denominated, so
validation converts ``e`` to grams using the contract's ``base_unit``::

    Class   e range (grams)         n = Max/e            Min (in d!)
    I       e >= 0.001 g *          n >= 50 000 **       100 d
    II      0.001 g <= e <= 0.05 g  100   .. 100 000     20 d
    II      0.1 g <= e              5 000 .. 100 000     50 d
    III     0.1 g <= e <= 2 g       100   .. 10 000      20 d
    III     5 g <= e                500   .. 10 000      20 d
    IIII    5 g <= e                100   .. 1 000       10 d

    * It is not normally feasible to test and verify an instrument to
      e < 1 mg, due to the uncertainty of the test loads.
    ** See exception in 3.4.4 (class I with d < 0.1 mg may have n < 50 000).

An ``e`` that falls between two rows (e.g. 2 g < e < 5 g for class III, or
0.05 g < e < 0.1 g for class II) is NOT PERMITTED by Table 3 and is
rejected — the row ranges are the standard's own partition of ``e`` space.

Minimum capacity (Section 3.4.3, verbatim): "The minimum capacity of the
instrument is determined in conformity with the requirements in Table 3.
However, in the last column of this Table, the verification scale interval,
e, is replaced by the actual scale interval, d." — i.e. Min >= (row factor)
× d when a positive actual interval is declared. If ``d`` is omitted or not
positive, the gate falls back to the Table 3 interval ``e`` for the row so
that the section 3.4.3 floor is still enforced.

Additional structural rules enforced here:

- ``Max`` must be a positive integer multiple of ``e`` (n integral).
- ``Min <= Max``.
- ``d <= e`` when ``d`` is known (R 76-1 Section 3.2.2; the standard may
  additionally require ``e > d`` for Classes I/II — confirm at the P1-2
  verification gate before tightening).

VERIFICATION RECORD (rules.md INV-5 / phases.md P1-2)
-----------------------------------------------------
- 2026-09-15: Table 6 (MPE bands, all four classes) verified against the
  official PDF — see ``mpe_rules.py`` (decision D-20).
- 2026-09-17: Table 3 re-extracted verbatim from
  ``docs/r076-1-e06.pdf`` page 27 (both default and layout extraction
  modes, double-transcribed). Corrections applied versus the prior draft
  model: Class III coarse-e floor is n >= 500 (was 100); Class IIII floor
  is n >= 100 (was 10 — the draft had drifted); II/III/IIII Min bounds are
  expressed in **d** (Section 3.4.3), not e; e-gap rejection added. This
  resolves parking-lot items "Class III n-floor nuance" and
  "Section 3.4.3 Min column compares against d".
``VERIFIED_CLASSES`` lists the classes whose Table 3 / Table 6 constants
have been human-checked against the official R 76-1 PDF. Never remove a
class from this set without a new verification record.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, localcontext
from typing import Final

from .contracts import AccuracyClass, EngineValueError, ScaleParameters
from .rounding import INTERNAL_PRECISION

__all__ = ["VERIFIED_CLASSES", "validate_instrument_spec"]

#: Classes whose regulatory constants are human-verified (P1-2 gate).
#: Table 6 verified 2026-09-15; Table 3 re-verified 2026-09-17 — both
#: against the official R 76-1 (2006) PDF.
VERIFIED_CLASSES: Final[frozenset[AccuracyClass]] = frozenset(
    {
        AccuracyClass.SPECIAL_I,
        AccuracyClass.HIGH_II,
        AccuracyClass.MEDIUM_III,
        AccuracyClass.ORDINARY_IIII,
    }
)

#: Multiplier converting a contract quantity (base unit) to grams.
_TO_GRAMS: Final[dict[str, Decimal]] = {
    "kg": Decimal("1000"),
    "g": Decimal("1"),
}


@dataclass(frozen=True, slots=True)
class _ClassErow:
    """One Table 3 row: an ``e`` range with its n bounds and Min factor.

    Attributes:
        e_min_g: Permitted minimum of ``e`` in grams (inclusive).
        e_max_g: Permitted maximum of ``e`` in grams (inclusive);
            ``None`` = unbounded above.
        n_min: Minimum of ``n = Max/e`` (inclusive).
        n_max: Maximum of ``n`` (inclusive); ``None`` = unbounded above.
        min_in_d: The Min lower-limit factor per Section 3.4.3 (Min must
            be >= ``min_in_d`` × ``d``); ``None`` = unconstrained.
    """

    e_min_g: Decimal
    e_max_g: Decimal | None
    n_min: Decimal
    n_max: Decimal | None
    min_in_d: Decimal | None


#: The single source of truth for Table 3 (rules.md INV-3). Row ranges are
#: VERBATIM from R 76-1 (2006) p. 27 (2026-09-17 re-extraction record above).
_TABLE_3: Final[dict[AccuracyClass, tuple[_ClassErow, ...]]] = {
    AccuracyClass.SPECIAL_I: (
        _ClassErow(
            e_min_g=Decimal("0.001"),
            e_max_g=None,
            n_min=Decimal("50000"),
            n_max=None,
            min_in_d=Decimal("100"),
        ),
    ),
    AccuracyClass.HIGH_II: (
        _ClassErow(
            e_min_g=Decimal("0.001"),
            e_max_g=Decimal("0.05"),
            n_min=Decimal("100"),
            n_max=Decimal("100000"),
            min_in_d=Decimal("20"),
        ),
        _ClassErow(
            e_min_g=Decimal("0.1"),
            e_max_g=None,
            n_min=Decimal("5000"),
            n_max=Decimal("100000"),
            min_in_d=Decimal("50"),
        ),
    ),
    AccuracyClass.MEDIUM_III: (
        _ClassErow(
            e_min_g=Decimal("0.1"),
            e_max_g=Decimal("2"),
            n_min=Decimal("100"),
            n_max=Decimal("10000"),
            min_in_d=Decimal("20"),
        ),
        _ClassErow(
            e_min_g=Decimal("5"),
            e_max_g=None,
            n_min=Decimal("500"),
            n_max=Decimal("10000"),
            min_in_d=Decimal("20"),
        ),
    ),
    AccuracyClass.ORDINARY_IIII: (
        _ClassErow(
            e_min_g=Decimal("5"),
            e_max_g=None,
            n_min=Decimal("100"),
            n_max=Decimal("1000"),
            min_in_d=Decimal("10"),
        ),
    ),
}


def _is_1_2_5_form(value: Decimal) -> bool:
    """True if ``value`` is 1, 2 or 5 times a power of ten."""
    return value.normalize().as_tuple().digits in ((1,), (2,), (5,))


def _fmt(value: Decimal | None) -> str:
    """Compact fixed-point rendering for error messages."""
    if value is None:
        return "unbounded"
    return format(value, "f")


def validate_instrument_spec(scale: ScaleParameters) -> None:
    """Validate an instrument's parameters against R 76-1 Table 3.

    Args:
        scale: The instrument parameters to validate.

    Raises:
        EngineValueError: With a specific, auditor-readable message on the
            first violated rule. A compliant spec returns ``None``.
    """
    e = scale.verification_scale_interval
    if e <= 0:
        raise EngineValueError(
            f"verification_scale_interval (e) must be > 0; got {e}."
        )
    if scale.max_capacity <= 0:
        raise EngineValueError(
            f"max_capacity (Max) must be > 0; got {scale.max_capacity}."
        )
    if scale.min_capacity > scale.max_capacity:
        raise EngineValueError(
            f"min_capacity (Min) {scale.min_capacity} exceeds "
            f"max_capacity (Max) {scale.max_capacity}."
        )

    with localcontext() as ctx:
        ctx.prec = INTERNAL_PRECISION
        n = scale.max_capacity / e
        e_g = e * _TO_GRAMS[scale.base_unit]

    if n != n.to_integral_value():
        raise EngineValueError(
            "max_capacity (Max) must be an integer multiple of "
            f"verification_scale_interval (e): n = Max/e = {_fmt(n)}."
        )

    # --- Table 3: find the row whose e range contains this instrument ----
    row = None
    for candidate in _TABLE_3[scale.accuracy_class]:
        above_min = e_g >= candidate.e_min_g
        below_max = candidate.e_max_g is None or e_g <= candidate.e_max_g
        if above_min and below_max:
            row = candidate
            break
    if row is None:
        ranges = " or ".join(
            f"e >= {_fmt(c.e_min_g)} g" if c.e_max_g is None
            else f"{_fmt(c.e_min_g)} g <= e <= {_fmt(c.e_max_g)} g"
            for c in _TABLE_3[scale.accuracy_class]
        )
        raise EngineValueError(
            f"Class {scale.accuracy_class.value} does not permit "
            f"e = {e} {scale.base_unit} ({e_g} g) under R 76-1 Table 3; "
            f"permitted range(s): {ranges}."
        )

    # --- Form of the interval: R 76-1 requires scale intervals of the form
    # 1 × 10^k, 2 × 10^k or 5 × 10^k (k a whole number). Checked after the
    # Table 3 row lookup so e-gap rejections keep their specific message.
    for label, interval in (("e", e), ("d", scale.display_interval)):
        if interval is not None and interval > 0 and not _is_1_2_5_form(interval):
            raise EngineValueError(
                f"scale interval {label} = {_fmt(interval)} is not of the form "
                "1, 2 or 5 × 10^k required by R 76-1 (e.g. 0.001, 0.002, 0.005)."
            )

    if n < row.n_min:
        raise EngineValueError(
            f"Class {scale.accuracy_class.value} requires n = Max/e >= "
            f"{_fmt(row.n_min)}; got n = {_fmt(n)}."
        )
    if row.n_max is not None and n > row.n_max:
        raise EngineValueError(
            f"Class {scale.accuracy_class.value} requires n = Max/e <= "
            f"{_fmt(row.n_max)}; got n = {_fmt(n)}."
        )

    # --- Minimum capacity (Section 3.4.3): Table 3 expresses the lower bound
    # in the effective interval for the selected row. Use the declared d when
    # it is positive; otherwise use the row's Table 3 interval e.
    d = scale.display_interval
    if row.min_in_d is not None:
        effective_interval = d if d is not None and d > 0 else e
        effective_unit = "d" if d is not None and d > 0 else "e"
        min_floor = row.min_in_d * effective_interval
        if scale.min_capacity < min_floor:
            raise EngineValueError(
                f"Class {scale.accuracy_class.value} requires "
                f"min_capacity (Min) >= {format(row.min_in_d, 'f')}{effective_unit} = "
                f"{min_floor} (R 76-1 Section 3.4.3: the Table 3 minimum "
                f"capacity is expressed in the effective interval for the row); "
                f"got {scale.min_capacity}."
            )

    if d is not None and d > 0 and d > e:
        raise EngineValueError(
            f"display_interval (d) {d} must not exceed "
            f"verification_scale_interval (e) {e} (R 76-1 3.2.2; "
            "Classes I/II may require e > d — confirm at P1-2 gate)."
        )
