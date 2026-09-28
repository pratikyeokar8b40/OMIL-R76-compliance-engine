// Provisional client-side mirror of the backend engine, used only for the
// live preview while typing. The stored verdict always comes from the server.
import Decimal from 'decimal.js';

// R 76-1 Table 6: [upper edge of the band in e (inclusive), MPE in e].
const MPE_BANDS = {
  I: [[50000, 0.5], [200000, 1], [Infinity, 1.5]],
  II: [[5000, 0.5], [20000, 1], [100000, 1.5]],
  III: [[500, 0.5], [2000, 1], [10000, 1.5]],
  IIII: [[50, 0.5], [200, 1], [1000, 1.5]],
};

const TO_GRAMS = { g: 1, kg: 1000 };

export function evaluateObservation({
  appliedLoad,
  indication,
  additionalLoad = '0',
  zeroError = '0',
  verificationScaleInterval,
  accuracyClass,
  evaluationMode = 'initial_verification',
}) {
  try {
    const L = new Decimal(appliedLoad);
    const I = new Decimal(indication);
    const dL = new Decimal(additionalLoad || '0');
    const E0 = new Decimal(zeroError || '0');
    const e = new Decimal(verificationScaleInterval);
    if (e.lte(0) || L.isNegative()) return null;

    // A.4.4.3: E = I + e/2 - dL - L ; Ec = E - E0
    const E = I.plus(e.div(2)).minus(dL).minus(L);
    const Ec = E.minus(E0);
    const m = L.div(e);
    const band = (MPE_BANDS[accuracyClass] || MPE_BANDS.III).find(([hi]) => m.lte(hi));
    if (!band) return null;
    const factor = new Decimal(band[1]).mul(evaluationMode === 'in_service' ? 2 : 1);
    const mpe = e.mul(factor);
    const pass = Ec.abs().lte(mpe);
    return {
      errorPrior: E.toString(),
      correctedError: Ec.toString(),
      mpeLimit: mpe.toString(),
      mpeLabel: `±${factor.toString()}e`,
      intervals: m.toDecimalPlaces(2).toString(),
      verdict: pass ? 'PASS' : 'FAIL',
      message: `Preview: |Ec| ${Ec.abs().toString()} ${pass ? '≤' : '>'} MPE ${mpe.toString()}. The server records the official verdict.`,
    };
  } catch {
    return null;
  }
}

export function convertValue(value, fromUnit, toUnit) {
  if (value === '' || value === null || value === undefined) return value;
  try {
    return new Decimal(String(value)).mul(TO_GRAMS[fromUnit]).div(TO_GRAMS[toUnit]).toString();
  } catch {
    return value;
  }
}

// R 76-1 Table 3 minimum capacity, expressed in d (§3.4.3); falls back to e.
export function calculateMinCapacity(accuracyClass, e, d, unit = 'g') {
  try {
    const eValue = new Decimal(String(e || 0));
    const interval = new Decimal(String(d || e || 0));
    const eGrams = eValue.mul(TO_GRAMS[unit] || 1);
    let factor = 20;
    if (accuracyClass === 'I') factor = 100;
    else if (accuracyClass === 'II') factor = eGrams.lte(0.05) ? 20 : 50;
    else if (accuracyClass === 'IIII') factor = 10;
    return interval.mul(factor).toString();
  } catch {
    return '0';
  }
}
