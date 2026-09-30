// The workspace's completion rules must match the server's finalize gate
// (backend/src/services/test_plan_service.py), or the UI would let a
// technician reach "Finalize" only for the server to refuse it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEST_MODULES, computeTestPlanCompletion, moduleStatus } from '../src/lib/requirements.js';

const gate = readFileSync(new URL('../../backend/src/services/test_plan_service.py', import.meta.url), 'utf8');
const block = (name) => gate.slice(gate.indexOf(`${name}`), gate.indexOf('}', gate.indexOf(name)));
const enumToValue = (member) => member.toLowerCase();

test('core tests and minimum readings match the backend gate', () => {
  const serverCore = [...block('CORE_REQUIRED =').matchAll(/ObservationTestType\.(\w+)/g)].map((m) => enumToValue(m[1]));
  const serverMin = Object.fromEntries(
    [...block('MIN_READINGS:').matchAll(/ObservationTestType\.(\w+):\s*(\d+)/g)].map((m) => [enumToValue(m[1]), Number(m[2])])
  );
  assert.deepEqual(TEST_MODULES.filter((m) => m.core).map((m) => m.testType).sort(), [...serverCore].sort());
  for (const m of TEST_MODULES) assert.equal(m.need, serverMin[m.testType] ?? 1, m.testType);
});

test('every backend test type has a workspace module', () => {
  const models = readFileSync(new URL('../../backend/src/db/models.py', import.meta.url), 'utf8');
  const enumBody = models.slice(models.indexOf('class ObservationTestType'), models.indexOf('class User('));
  const serverTypes = [...enumBody.matchAll(/=\s*"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(TEST_MODULES.map((m) => m.testType).sort(), serverTypes.sort());
});

const obs = (testType, n, position = () => null) =>
  Array.from({ length: n }, (_, i) => ({ test_type: testType, position: position(i), sequence_no: i }));

test('positional tests count distinct positions', () => {
  const ecc = TEST_MODULES.find((m) => m.testType === 'eccentricity');
  assert.equal(moduleStatus(ecc, obs('eccentricity', 4, () => '1')).have, 1);
  assert.equal(moduleStatus(ecc, obs('eccentricity', 4, (i) => String(i + 1))).complete, true);
});

test('optional and N/A tests never block; required ones do', () => {
  const allCore = TEST_MODULES.filter((m) => m.core).flatMap((m) =>
    obs(m.testType, m.need, m.positions ? (i) => m.positions[i] : () => null)
  );
  assert.equal(computeTestPlanCompletion([], allCore).ready, true);
  const missingTare = allCore.filter((o) => o.test_type !== 'tare');
  assert.deepEqual(computeTestPlanCompletion([], missingTare).missingRequired, ['tare']);
  const tareNa = [{ test_type: 'tare', status: 'not_applicable', rationale: 'No tare device fitted' }];
  assert.equal(computeTestPlanCompletion(tareNa, missingTare).ready, true);
  // N/A without a rationale is not honoured (the server repairs such rows too).
  const tareNaNoReason = [{ test_type: 'tare', status: 'not_applicable', rationale: '  ' }];
  assert.deepEqual(computeTestPlanCompletion(tareNaNoReason, missingTare).missingRequired, ['tare']);
  assert.equal(computeTestPlanCompletion([], []).ready, false);
});
