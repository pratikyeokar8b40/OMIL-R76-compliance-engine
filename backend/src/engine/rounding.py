"""Legal rounding and display quantization (pure domain module).

Precision policy (rules.md INV-4, "6 decimal places" constraint)
----------------------------------------------------------------
- INTERNAL arithmetic never rounds: the Decimal context used by the engine
  carries 28 significant digits (:data:`INTERNAL_PRECISION`), which is exact
  for every realistic metrology magnitude. Verdicts are computed on exact
  values.
- REPORTED values (message strings, UI, serialized report fields) are
  quantized to 6 decimal places (:data:`REPORT_QUANTUM`) using
  ROUND_HALF_UP (:data:`ROUNDING_MODE`).

This split guarantees that presentation rounding can never flip a verdict:
rounding happens strictly downstream of the comparison.

:func:`quantize_to_d` additionally implements rounding to the instrument's
display interval ``d`` (an arbitrary quantum, not necessarily a power of
ten) for UI echo of readings.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, localcontext
from typing import Final

from .contracts import EngineValueError

__all__ = [
    "INTERNAL_PRECISION",
    "format_stored",
    "REPORT_DECIMALS",
    "REPORT_QUANTUM",
    "ROUNDING_MODE",
    "format_quantity",
    "quantize_to_d",
]

#: Significant digits for internal engine arithmetic (exact in practice).
INTERNAL_PRECISION: Final[int] = 28

#: Number of decimal places used when rendering reported quantities.
REPORT_DECIMALS: Final[int] = 6

#: Quantum for reported quantities: 0.000001 (6 decimal places).
REPORT_QUANTUM: Final[Decimal] = Decimal("0.000001")

#: Legal rounding mode for presentation quantization.
ROUNDING_MODE: Final = ROUND_HALF_UP


def format_quantity(value: Decimal) -> str:
    """Render a quantity with exactly 6 decimal places (ROUND_HALF_UP).

    Args:
        value: Exact value to render. Must be finite.

    Returns:
        Fixed-notation string, e.g. ``Decimal("0.0085") -> "0.008500"``.

    Raises:
        EngineValueError: If ``value`` is NaN or infinite.
    """
    if not value.is_finite():
        raise EngineValueError("format_quantity: NaN/Infinity is not renderable.")
    with localcontext() as ctx:
        ctx.prec = INTERNAL_PRECISION
        quantized = value.quantize(REPORT_QUANTUM, rounding=ROUNDING_MODE)
    # ``f`` format forces fixed notation even for values with exponents.
    return f"{quantized:f}"


def format_stored(value: Decimal) -> str:
    """Render a STORED quantity for API output without losing precision.

    At least 6 decimal places (the historical API format, e.g. "0.008500"),
    more only when the value really has them (Class I: "0.0000005"), and
    never scientific notation (the database can hand back ``0E-10``).
    """
    if not value.is_finite():
        raise EngineValueError("format_stored: NaN/Infinity is not renderable.")
    text = format(value.normalize(), "f")
    whole, _, frac = text.partition(".")
    return f"{whole}.{frac.ljust(REPORT_DECIMALS, '0')}"


def quantize_to_d(value: Decimal, d: Decimal | None) -> Decimal:
    """Round ``value`` to the nearest multiple of the display interval ``d``.

    Used ONLY for display echo (e.g. showing an error on the instrument's
    own resolution). Never used for verdict computation.

    Args:
        value: Exact value to round.
        d: Display interval (quantum). ``None`` or ``Decimal("0")`` means
            "unknown" and returns ``value`` unchanged. Negative ``d`` is a
            defect and raises.

    Returns:
        ``k * d`` for integer ``k = round_half_up(value / d)``, or ``value``
        when ``d`` is ``None``/zero.

    Raises:
        EngineValueError: If ``d`` is negative, or division is impossible.
    """
    if d is None or d == 0:
        return value
    if d < 0:
        raise EngineValueError("quantize_to_d: display interval d must be > 0.")
    with localcontext() as ctx:
        ctx.prec = INTERNAL_PRECISION
        steps = (value / d).to_integral_value(rounding=ROUNDING_MODE)
    return steps * d
