// Provisional client-side mirror of the backend engine (backend/src/engine/
// mpe_rules.py), used only for the live preview while typing. The stored
// verdict always comes from the server. tests/metrology.test.js runs this
// file against backend/tests/golden_vectors.json so the two cannot drift.
import Decimal from 'decimal.js';

// R 76-1 Table 6: [upper edge of the band in e (inclusive), MPE in e].
const MPE_BANDS = {
  I: [[50000, 0.5], [200000, 1], [Infinity, 1.5]],
  II: [[5000, 0.5], [20000, 1], [100000, 1.5]],
  III: [[500, 0.5], [2000, 1], [10000, 1.5]],
  IIII: [[50, 0.5], [200, 1], [1000, 1.5]],
};

// Tests judged against a FIXED multiple of e instead of the Table 6 band
// (equilibrium 4.4.2 / A.4.12, EMC B.3.x). Tilting at no load is 2e (3.9.1.1)
// and temperature effect on no-load is 1e (3.9.2.3); both handled below.
const FIXED_LIMITS_IN_E = { equilibrium: 1, emc_disturbances: 1 };

const TO_GRAMS = { g: 1, kg: 1000 };

// Fixed notation: decimal.js would print Class I values as "5e-7".
const plain = (d) => d.toFixed();

const invalid = (message) => ({ invalid: true, message });

export function evaluateObservation({
  appliedLoad,
  indication,
  additionalLoad = '0',
  zeroError = '0',
  secondIndication = null,
  verificationScaleInterval,
  displayInterval = null,
  maxCapacity = null,
  accuracyClass,
  evaluationMode = 'initial_verification',
  testType = null,
}) {
  try {
    const L = new Decimal(appliedLoad);
    const I = new Decimal(indication);
    const dL = new Decimal(additionalLoad || '0');
    const E0 = new Decimal(zeroError || '0');
    const e = new Decimal(verificationScaleInterval);
    if (e.lte(0) || L.isNegative() || I.isNegative() || dL.isNegative()) return null;

    // Same domain guards as the server, so the preview warns before a 422.
    if (dL.gt(e)) {
      return invalid(`ΔL ${plain(dL)} exceeds e ${plain(e)}: the changeover point lies within one interval — the server will reject this reading.`);
    }
    if (maxCapacity !== null && maxCapacity !== '' && L.gt(new Decimal(maxCapacity))) {
      return invalid(`Applied load ${plain(L)} exceeds Max ${maxCapacity} — the server will reject this reading.`);
    }
    const m = L.div(e);
    const base = { loadInE: m.toFixed(6), intervals: m.toDecimalPlaces(2).toString() };

    // Discrimination (3.8.2.2 / A.4.8.2): a response test, I2 - I1 >= d.
    if (testType === 'discrimination') {
      if (secondIndication === null || secondIndication === undefined || secondIndication === '') return null;
      const d = new Decimal(displayInterval || verificationScaleInterval);
      const delta = new Decimal(secondIndication).minus(I);
      if (delta.isNegative()) return invalid('I₂ is below I₁: the indication must increase after the 1.4 d extra load.');
      const pass = delta.gte(d);
      return {
        ...base,
        errorPrior: '0',
        correctedError: plain(delta),
        mpeLimit: plain(d),
        mpeInE: d.div(e).toFixed(6),
        mpeLabel: '≥ d',
        verdict: pass ? 'PASS' : 'FAIL',
        message: `Preview: I₂ − I₁ = ${plain(delta)} ${pass ? '≥' : '<'} d = ${plain(d)}. The server records the official verdict.`,
      };
    }

    // A.4.4.3: E = I + e/2 - dL - L ; Ec = E - E0
    const E = I.plus(e.div(2)).minus(dL).minus(L);
    const Ec = E.minus(E0);

    let factor;
    if (testType === 'temperature_no_load') {
      if (!L.isZero()) return invalid('Temperature effect on no-load rows are zero determinations: the applied load must be 0.');
      factor = new Decimal(1);
    } else if (testType === 'tilting' && L.isZero()) {
      factor = new Decimal(2);
    } else if (testType in FIXED_LIMITS_IN_E) {
      factor = new Decimal(FIXED_LIMITS_IN_E[testType]);
    } else {
      const band = (MPE_BANDS[accuracyClass] || MPE_BANDS.III).find(([hi]) => m.lte(hi));
      if (!band) return invalid(`No Table 6 band covers ${m.toDecimalPlaces(2)}e for Class ${accuracyClass}.`);
      factor = new Decimal(band[1]).mul(evaluationMode === 'in_service' ? 2 : 1);
    }
    const mpe = e.mul(factor);
    const pass = Ec.abs().lte(mpe);
    return {
      ...base,
      errorPrior: plain(E),
      correctedError: plain(Ec),
      mpeLimit: plain(mpe),
      mpeInE: factor.toFixed(6),
      mpeLabel: `±${factor.toString()}e`,
      verdict: pass ? 'PASS' : 'FAIL',
      message: `Preview: |Ec| ${plain(Ec.abs())} ${pass ? '≤' : '>'} MPE ${plain(mpe)}. The server records the official verdict.`,
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
