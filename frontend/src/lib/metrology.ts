/**
 * TypeScript mirror of the Python metrology engine (memory.md D-12).
 *
 * OFFLINE PROVISIONAL VERDICTS ONLY. The authoritative verdict is always
 * recomputed by the backend engine at insert (architecture.md §4.3 rule 3);
 * this module exists so a basement lab with no connectivity still sees a
 * verdict the instant a reading is typed (design.md personas).
 *
 * Mirror discipline: golden_vectors.json (backend/tests) is the shared
 * single source of truth; frontend/tests consume it directly so the two
 * engines can never drift. All math uses decimal.js — never JS numbers.
 *
 * Bands: OIML R 76-1 (2006) §3.5.1 Table 6, initial verification,
 * (lo, hi] edges. Verified 2026-09-15 against the official PDF (D-20);
 * in-service values (§3.5.2, 2×) are out of scope for v1 (D-19).
 */
import Decimal from 'decimal.js'

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type AccuracyClass = 'I' | 'II' | 'III' | 'IIII'
export type Verdict = 'PASS' | 'FAIL'

export interface ScaleParameters {
  accuracy_class: AccuracyClass
  max_capacity: string
  min_capacity: string
  verification_scale_interval: string
  display_interval?: string | null
  /** Declared unit of every quantity (Table 3 e-ranges are gram-denominated). */
  base_unit?: 'kg' | 'g'
}

/** Which Table 6 column set applies (R 76-1 §3.5). IN_SERVICE = 2× per
 * §3.5.2 — must always be passed explicitly (decision D-19); the default
 * stays INITIAL_VERIFICATION so existing call sites are unchanged. */
export type EvaluationMode = 'initial_verification' | 'in_service'

const MODE_MULTIPLIER: Record<EvaluationMode, string> = {
  initial_verification: '1',
  in_service: '2',
}

export interface Observation {
  applied_load: string
  indication: string
  additional_load?: string
  zero_error?: string
  /** Discrimination only (A.4.8.2): indication I2 after the 1.4 d extra load. */
  second_indication?: string
}

export interface EvaluationResult {
  error_prior: string
  corrected_error: string
  mpe_limit: string
  mpe_in_e: string
  load_in_e: string
  verdict: Verdict
  message: string
}

export class EngineValueError extends Error {}

/** MPE band: [lo, hi) in units of e... documented as (lo, hi]; rows carry hi=null for unbounded. */
interface Band {
  lo: string
  hi: string | null
  mpe_in_e: string
}

const BANDS: Record<AccuracyClass, Band[]> = {
  I: [
    { lo: '0', hi: '50000', mpe_in_e: '0.5' },
    { lo: '50000', hi: '200000', mpe_in_e: '1.0' },
    { lo: '200000', hi: null, mpe_in_e: '1.5' },
  ],
  II: [
    { lo: '0', hi: '5000', mpe_in_e: '0.5' },
    { lo: '5000', hi: '20000', mpe_in_e: '1.0' },
    { lo: '20000', hi: '100000', mpe_in_e: '1.5' },
  ],
  III: [
    { lo: '0', hi: '500', mpe_in_e: '0.5' },
    { lo: '500', hi: '2000', mpe_in_e: '1.0' },
    { lo: '2000', hi: '10000', mpe_in_e: '1.5' },
  ],
  IIII: [
    { lo: '0', hi: '50', mpe_in_e: '0.5' },
    { lo: '50', hi: '200', mpe_in_e: '1.0' },
    { lo: '200', hi: '1000', mpe_in_e: '1.5' },
  ],
}

/**
 * Table 3 rows (R 76-1 (2006) p. 27, verbatim 2026-09-17 re-extraction —
 * mirrors _TABLE_3 in engine/class_rules.py): each row is an `e` range in
 * GRAMS with its n bounds and the §3.4.3 Min factor expressed in d.
 * An e between two rows is not permitted (the ranges are the standard's
 * own partition of e space).
 */
interface ClassErow {
  eMinG: string
  eMaxG: string | null
  nMin: string
  nMax: string | null
  minInD: string | null
}

const TABLE_3: Record<AccuracyClass, ClassErow[]> = {
  I: [{ eMinG: '0.001', eMaxG: null, nMin: '50000', nMax: null, minInD: '100' }],
  II: [
    { eMinG: '0.001', eMaxG: '0.05', nMin: '100', nMax: '100000', minInD: '20' },
    { eMinG: '0.1', eMaxG: null, nMin: '5000', nMax: '100000', minInD: '50' },
  ],
  III: [
    { eMinG: '0.1', eMaxG: '2', nMin: '100', nMax: '10000', minInD: '20' },
    { eMinG: '5', eMaxG: null, nMin: '500', nMax: '10000', minInD: '20' },
  ],
  IIII: [{ eMinG: '5', eMaxG: null, nMin: '100', nMax: '1000', minInD: '10' }],
}

const TO_GRAMS: Record<string, Decimal> = { kg: new Decimal(1000), g: new Decimal(1) }

function fixed6(d: Decimal): string {
  return d.toFixed(6, Decimal.ROUND_HALF_UP)
}

/** Minimal plain-decimal string (Python str(Decimal) equivalent, never exponential). */
function plain(d: Decimal): string {
  return d.toFixed()
}

/** Parse a metrology value; JS numbers are rejected like the Python engine rejects floats. */
function dec(value: string | number, field: string): Decimal {
  if (typeof value === 'number') {
    throw new EngineValueError(
      `${field}: binary float is forbidden on metrology values (INV-4); send a string.`,
    )
  }
  const cleaned = value.trim()
  if (!cleaned) throw new EngineValueError(`${field}: empty string is not a number.`)
  let d: Decimal
  try {
    d = new Decimal(cleaned)
  } catch {
    throw new EngineValueError(`${field}: not a valid decimal number: '${value}'.`)
  }
  if (!d.isFinite()) throw new EngineValueError(`${field}: NaN/Infinity is not allowed.`)
  return d
}

/** R 76-1 Table 3 gate — mirrors engine/class_rules.py (e-row semantics). */
export function validate_instrument_spec(scale: ScaleParameters): void {
  const e = dec(scale.verification_scale_interval, 'verification_scale_interval')
  const max = dec(scale.max_capacity, 'max_capacity')
  const min = dec(scale.min_capacity, 'min_capacity')
  const unit = scale.base_unit ?? 'kg'
  if (e.lte(0)) throw new EngineValueError(`verification_scale_interval (e) must be > 0; got ${e}.`)
  if (max.lte(0)) throw new EngineValueError(`max_capacity (Max) must be > 0; got ${max}.`)
  if (min.gt(max))
    throw new EngineValueError(`min_capacity (Min) ${min} exceeds max_capacity (Max) ${max}.`)
  const n = max.div(e)
  if (!n.isInteger())
    throw new EngineValueError('max_capacity (Max) must be an integer multiple of e.')
  const eG = e.mul(TO_GRAMS[unit] ?? TO_GRAMS.kg)
  const row = TABLE_3[scale.accuracy_class].find(
    (r) => eG.gte(new Decimal(r.eMinG)) && (r.eMaxG === null || eG.lte(new Decimal(r.eMaxG))),
  )
  if (!row)
    throw new EngineValueError(
      `Class ${scale.accuracy_class} does not permit e = ${e} ${unit} (${eG} g) under R 76-1 Table 3.`,
    )
  if (n.lt(new Decimal(row.nMin)))
    throw new EngineValueError(`n = Max/e >= ${row.nMin} for class ${scale.accuracy_class}.`)
  if (row.nMax !== null && n.gt(new Decimal(row.nMax)))
    throw new EngineValueError(`n = Max/e <= ${row.nMax} for class ${scale.accuracy_class}.`)
  const dRaw = scale.display_interval !== undefined && scale.display_interval !== null
    ? dec(scale.display_interval, 'display_interval')
    : null
  if (dRaw !== null && dRaw.lte(0)) {
    throw new EngineValueError(`display_interval (d) must be > 0 when supplied; got ${dRaw}.`)
  }
  const d = dRaw && dRaw.gt(0) ? dRaw : e
  const dSymbol = dRaw && dRaw.gt(0) ? 'd' : 'e'
  if (row.minInD !== null) {
    const floor = new Decimal(row.minInD).mul(d)
    if (min.lt(floor))
      throw new EngineValueError(
        `min_capacity (Min) must be >= ${row.minInD}${dSymbol} = ${floor} (R 76-1 Section 3.4.3: the Table 3 minimum capacity is expressed in the effective interval for the row).`,
      )
  }
  if (dRaw !== null && dRaw.gt(e)) throw new EngineValueError('display_interval (d) must not exceed e (3.2.2).')
}

/** MPE lookup: band edges (lo, hi] in units of e, scaled by the evaluation
 * mode (§3.5.2: in-service limits are 2× Table 6). */
export function mpe_for_load(
  accuracy_class: AccuracyClass,
  load: string,
  e: string,
  mode: EvaluationMode = 'initial_verification',
): { mpe_limit: string; mpe_in_e: string; load_in_e: string } {
  const eDec = dec(e, 'e')
  const loadDec = dec(load, 'applied_load')
  const loadInE = loadDec.div(eDec)
  const multiplier = new Decimal(MODE_MULTIPLIER[mode])
  for (const band of BANDS[accuracy_class]) {
    const lo = new Decimal(band.lo)
    const aboveLo = loadInE.gt(lo)
    const belowHi = band.hi === null || loadInE.lte(new Decimal(band.hi))
    if (aboveLo && belowHi) {
      return {
        mpe_limit: plain(new Decimal(band.mpe_in_e).mul(multiplier).mul(eDec)),
        mpe_in_e: fixed6(new Decimal(band.mpe_in_e).mul(multiplier)),
        load_in_e: fixed6(loadInE),
      }
    }
  }
  throw new EngineValueError(
    `applied load ${load} (${fixed6(loadInE)}e) exceeds the class ${accuracy_class} range.`,
  )
}

/** Full evaluation chain: E → Ec → MPE → verdict. Mirrors engine/mpe_rules.py::evaluate. */
export function evaluate(
  scale: ScaleParameters,
  observation: Observation,
  mode: EvaluationMode = 'initial_verification',
  test_type?: string,
): EvaluationResult {
  validate_instrument_spec(scale)
  const e = dec(scale.verification_scale_interval, 'verification_scale_interval')
  const max = dec(scale.max_capacity, 'max_capacity')
  const L = dec(observation.applied_load, 'applied_load')
  const I = dec(observation.indication, 'indication')
  const dL = dec(observation.additional_load ?? '0', 'additional_load')
  const E0 = dec(observation.zero_error ?? '0', 'zero_error')

  if (L.gt(max)) throw new EngineValueError(`applied_load ${L} exceeds max_capacity ${max}.`)
  if (dL.gt(e))
    throw new EngineValueError(`additional_load (ΔL) ${dL} exceeds e (${e}); transcription error.`)

  const isDiscrimination = test_type === 'discrimination'
  const hasSecondIndication = observation.second_indication !== undefined && observation.second_indication !== null
  if (isDiscrimination && !hasSecondIndication)
    throw new EngineValueError('discrimination rows require second_indication (I2).')
  if (!isDiscrimination && hasSecondIndication)
    throw new EngineValueError('second_indication (I2) is only valid for discrimination rows.')

  // ---- Discrimination (R 76-1 3.8.2.2 digital + A.4.8.2) ----------------
  // With 1/10 d extra on the receptor, gently adding 1.4 d must shift the
  // indication unambiguously: I2 - I1 >= d. Applies only to d >= 5 mg.
  if (isDiscrimination) {
    if (scale.display_interval === undefined || scale.display_interval === null)
      throw new EngineValueError(
        'discrimination requires display_interval (d); the instrument record has no display resolution.',
      )
    const d = dec(scale.display_interval, 'display_interval')
    const TO_GRAMS: Record<string, string> = { kg: '1000', g: '1' }
    const dG = d.mul(TO_GRAMS[scale.base_unit ?? 'kg'])
    if (dG.lt('0.005'))
      throw new EngineValueError(
        `discrimination (digital, A.4.8.2) applies only to instruments with d >= 5 mg; this instrument has d = ${scale.display_interval} ${scale.base_unit ?? 'kg'}.`,
      )
    const I2 = dec(observation.second_indication, 'second_indication')
    const delta = I2.minus(I)
    if (delta.lt(0))
      throw new EngineValueError(
        `second_indication (I2) ${observation.second_indication} is below the pre-extra-load indication (I1) ${observation.indication}: the indication must INCREASE after the 1.4 d extra load.`,
      )
    const verdict: Verdict = delta.gte(d) ? 'PASS' : 'FAIL'
    return {
      error_prior: plain(new Decimal(0)),
      corrected_error: plain(delta),
      mpe_limit: plain(d),
      mpe_in_e: fixed6(d.div(e)),
      load_in_e: fixed6(L.div(e)),
      verdict,
      message:
        `Discrimination at L = ${fixed6(L)}: I1 = ${fixed6(I)}, I2 = ${fixed6(I2)}, ` +
        `I2 - I1 = ${fixed6(delta)} ${delta.gte(d) ? '>=' : '<'} d = ${fixed6(d)} -> ${verdict} ` +
        `(A.4.8.2: add 1.4 d, expect +1 interval)`,
    }
  }

  // ---- Fixed-limit family (P4c) ----------------------------------------
  // equilibrium / emc_disturbances: fixed 1e limit. tilting: 2e at no
  // load (loaded rows stay on the class band). warm_up / span_stability /
  // endurance use the class band ('within the mpe for the applied load').
  const FIXED_LIMITS: Record<string, string> = {
    equilibrium: '1',
    emc_disturbances: '1',
  }
  const tt = test_type ?? ''
  const fixedFactor =
    tt === 'tilting' && L.isZero()
      ? new Decimal('2')
      : tt in FIXED_LIMITS
        ? new Decimal(FIXED_LIMITS[tt])
        : null
  if (fixedFactor !== null) {
    const halfE = e.div(2)
    const errorPrior = I.plus(halfE).minus(dL).minus(L)
    const corrected = errorPrior.minus(E0)
    const limit = fixedFactor.mul(e)
    const verdict: Verdict = corrected.abs().lte(limit) ? 'PASS' : 'FAIL'
    return {
      error_prior: plain(errorPrior),
      corrected_error: plain(corrected),
      mpe_limit: plain(limit),
      mpe_in_e: fixed6(fixedFactor),
      load_in_e: fixed6(L.div(e)),
      verdict,
      message:
        `${(test_type ?? 'fixed-limit test').replace(/_/g, ' ')}: |Ec| = ${fixed6(corrected.abs())} ${corrected.abs().lte(limit) ? '<=' : '>'} limit ${fixedFactor.toString()}e = ${fixed6(limit)} -> ${verdict}`,
    }
  }

  // ---- Temperature effect on no-load (3.9.2.3 / A.5.3.2) ---------------
  // Fixed limit: one full e of zero drift per 1 degC (class I) or 5 degC
  // (others). Rows are no-load zero determinations (L must be 0).
  if (test_type === 'temperature_no_load') {
    if (!L.isZero())
      throw new EngineValueError(
        'temperature_no_load rows are no-load zero determinations (3.9.2.3); applied_load must be 0.',
      )
    const halfE = e.div(2)
    const errorPrior = I.plus(halfE).minus(dL).minus(L)
    const corrected = errorPrior.minus(E0)
    const verdict: Verdict = corrected.abs().lte(e) ? 'PASS' : 'FAIL'
    return {
      error_prior: plain(errorPrior),
      corrected_error: plain(corrected),
      mpe_limit: plain(e),
      mpe_in_e: '1.000000',
      load_in_e: '0.000000',
      verdict,
      message:
        `Zero-point determination at no load: |Ec| = ${fixed6(corrected.abs())} ` +
        `${corrected.abs().lte(e) ? '<=' : '>'} 1e = ${fixed6(e)} -> ${verdict} (3.9.2.3: zero drift <= 1e)`,
    }
  }

  // E = I + ½e − ΔL − L   (R 76-1 A.4.4.3)
  const halfE = e.div(2)
  const errorPrior = I.plus(halfE).minus(dL).minus(L)
  // Ec = E − E0
  const corrected = errorPrior.minus(E0)

  const { mpe_limit, mpe_in_e, load_in_e } = mpe_for_load(
    scale.accuracy_class,
    L.toString(),
    e.toString(),
    mode,
  )
  const mpeDec = dec(mpe_limit, 'mpe_limit')
  const verdict: Verdict = corrected.abs().lte(mpeDec) ? 'PASS' : 'FAIL'

  return {
    error_prior: plain(errorPrior),
    corrected_error: plain(corrected),
    mpe_limit,
    mpe_in_e,
    load_in_e,
    verdict,
    message:
      `Corrected error ${fixed6(corrected)} ` +
      `${verdict === 'PASS' ? 'within' : 'exceeds'} MPE ±${fixed6(mpeDec)} ` +
      `(${mpe_in_e}e) at ${load_in_e}e -> ${verdict}`,
  }
}

// UI helpers. These call the same Decimal.js mirror used for provisional
// offline evaluation; the backend remains authoritative.
export function calculateMinCapacity(
  accuracyClass: AccuracyClass,
  e: string,
  d: string | null | undefined,
  unit: 'kg' | 'g' = 'g',
): string {
  const eD = dec(String(e), 'e')
  const dD = d !== undefined && d !== null && String(d).trim() !== '' ? dec(String(d), 'd') : eD
  const eG = eD.mul(TO_GRAMS[unit] ?? TO_GRAMS.g)
  const rows: Record<AccuracyClass, { min: string; max: string | null; minInD: string }[]> = {
    I: [{ min: '0.001', max: null, minInD: '100' }],
    II: [{ min: '0.001', max: '0.05', minInD: '20' }, { min: '0.1', max: null, minInD: '50' }],
    III: [{ min: '0.1', max: '2', minInD: '20' }, { min: '5', max: null, minInD: '20' }],
    IIII: [{ min: '5', max: null, minInD: '10' }],
  }
  const row = rows[accuracyClass].find((r) => eG.gte(new Decimal(r.min)) && (r.max === null || eG.lte(new Decimal(r.max))))
  return row ? new Decimal(row.minInD).mul(dD).toString() : dD.toString()
}

export function convertValue(value: string, from: 'kg' | 'g', to: 'kg' | 'g'): string {
  if (from === to) return String(value)
  const d = dec(String(value || '0'), 'value')
  const grams = d.mul(TO_GRAMS[from] ?? TO_GRAMS.g)
  return grams.div(TO_GRAMS[to] ?? TO_GRAMS.g).toString()
}

export function evaluateObservation(input: {
  appliedLoad: string
  indication: string
  verificationScaleInterval: string
  accuracyClass: AccuracyClass
  additionalLoad?: string
  zeroError?: string
  secondIndication?: string
  testType?: string
  maxCapacity?: string
  displayInterval?: string
  evaluationMode?: EvaluationMode
}): EvaluationResult {
  const defaultMaxN: Record<AccuracyClass, string> = { I: '50000', II: '100000', III: '10000', IIII: '1000' }
  const scale: ScaleParameters = {
    accuracy_class: input.accuracyClass,
    max_capacity: input.maxCapacity || dec(input.verificationScaleInterval, 'e').mul(new Decimal(defaultMaxN[input.accuracyClass] || '10000')).toString(),
    min_capacity: calculateMinCapacity(input.accuracyClass, input.verificationScaleInterval, input.displayInterval || input.verificationScaleInterval, 'g'),
    verification_scale_interval: input.verificationScaleInterval,
    display_interval: input.displayInterval || input.verificationScaleInterval,
    base_unit: 'g',
  }
  return evaluate(scale, {
    applied_load: input.appliedLoad,
    indication: input.indication,
    additional_load: input.additionalLoad || '0',
    zero_error: input.zeroError || '0',
    second_indication: input.secondIndication,
  }, input.evaluationMode || 'initial_verification', input.testType)
}
