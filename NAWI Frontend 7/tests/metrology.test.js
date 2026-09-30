// Mirror conformance (memory.md D-12): the live-preview engine must agree with
// the Python engine on every shared golden vector. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { evaluateObservation, calculateMinCapacity } from '../src/lib/metrology.js';

const vectors = JSON.parse(
  readFileSync(new URL('../../backend/tests/golden_vectors.json', import.meta.url), 'utf8')
);

const same = (a, b) => new Decimal(a).equals(new Decimal(b));

for (const c of vectors.evaluation_cases) {
  test(`golden vector ${c.id}`, () => {
    const inst = vectors.instruments[c.instrument];
    const o = c.observation;
    const r = evaluateObservation({
      appliedLoad: o.applied_load,
      indication: o.indication,
      additionalLoad: o.additional_load,
      zeroError: o.zero_error,
      secondIndication: o.second_indication ?? null,
      verificationScaleInterval: inst.verification_scale_interval,
      displayInterval: inst.display_interval,
      maxCapacity: inst.max_capacity,
      accuracyClass: inst.accuracy_class,
      evaluationMode: c.mode || 'initial_verification',
      testType: c.test_type || null,
    });
    assert.ok(r && !r.invalid, `no preview for ${c.id}: ${JSON.stringify(r)}`);
    const x = c.expected;
    assert.equal(r.verdict, x.verdict);
    assert.ok(same(r.errorPrior, x.error_prior), `E ${r.errorPrior} != ${x.error_prior}`);
    assert.ok(same(r.correctedError, x.corrected_error), `Ec ${r.correctedError} != ${x.corrected_error}`);
    assert.ok(same(r.mpeLimit, x.mpe_limit), `MPE ${r.mpeLimit} != ${x.mpe_limit}`);
    assert.equal(r.mpeInE, x.mpe_in_e);
    assert.equal(r.loadInE, x.load_in_e);
  });
}

const iii = { verificationScaleInterval: '0.005', accuracyClass: 'III', maxCapacity: '15' };

test('fixed-limit test types use their own limit, not the Table 6 band', () => {
  // |Ec| = 0.0065 kg: over the 0.5e band at no load, within 2e for tilting.
  const tilt = evaluateObservation({ ...iii, testType: 'tilting', appliedLoad: '0', indication: '0.004' });
  assert.equal(tilt.verdict, 'PASS');
  assert.ok(same(tilt.mpeLimit, '0.01'));
  const plainZero = evaluateObservation({ ...iii, appliedLoad: '0', indication: '0.004' });
  assert.equal(plainZero.verdict, 'FAIL');
  // Loaded tilting rows keep the class band.
  const loaded = evaluateObservation({ ...iii, testType: 'tilting', appliedLoad: '5', indication: '5' });
  assert.ok(same(loaded.mpeLimit, '0.005'));
  for (const testType of ['equilibrium', 'emc_disturbances']) {
    const r = evaluateObservation({ ...iii, testType, appliedLoad: '1', indication: '1.004' });
    assert.ok(same(r.mpeLimit, '0.005'), testType); // 1e even though 200e is in the 0.5e band
  }
});

test('domain guards mirror the server (dL > e, L > Max, loaded no-load row)', () => {
  assert.ok(evaluateObservation({ ...iii, appliedLoad: '5', indication: '5', additionalLoad: '0.006' }).invalid);
  assert.ok(evaluateObservation({ ...iii, appliedLoad: '15.005', indication: '15' }).invalid);
  assert.ok(evaluateObservation({ ...iii, testType: 'temperature_no_load', appliedLoad: '1', indication: '1' }).invalid);
});

test('Class I values print in fixed notation', () => {
  // L = 0.01 kg = 10 000e: 0.5e band.
  const r = evaluateObservation({ verificationScaleInterval: '0.000001', accuracyClass: 'I', appliedLoad: '0.01', indication: '0.01' });
  assert.equal(r.mpeLimit, '0.0000005');
  assert.equal(r.errorPrior, '0.0000005');
});

test('Table 3 minimum capacity floors (Section 3.4.3, in d)', () => {
  assert.equal(calculateMinCapacity('III', '5', '1', 'g'), '20');
  assert.equal(calculateMinCapacity('I', '0.001', '0.001', 'g'), '0.1');
  assert.equal(calculateMinCapacity('II', '0.01', '0.01', 'g'), '0.2');
  assert.equal(calculateMinCapacity('II', '0.1', '0.1', 'g'), '5');
  assert.equal(calculateMinCapacity('IIII', '100', '50', 'kg'), '500');
});
