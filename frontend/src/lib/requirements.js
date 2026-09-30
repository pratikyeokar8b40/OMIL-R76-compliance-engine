// The 17 R 76-2 test modules in workflow order. `need` must match the
// backend finalize gate (backend/src/services/test_plan_service.py MIN_READINGS).
export const TEST_MODULES = [
  { testType: 'weighing_performance', label: 'Weighing performance', clause: 'R 76-1 A.4.4', core: true, need: 5,
    hint: 'Increasing and decreasing loads from Min to Max, including the 500e and 2000e changeover points.' },
  { testType: 'temperature_no_load', label: 'Temperature effect on no-load', clause: 'R 76-1 3.9.2.3 / A.5.3.2', need: 1,
    hint: 'Zero indication at each chamber temperature.' },
  { testType: 'eccentricity', label: 'Eccentricity', clause: 'R 76-1 3.6.2 / A.4.7.1', core: true, need: 4,
    positions: ['1', '2', '3', '4'], hint: 'One-third of Max on each quarter segment.' },
  { testType: 'discrimination', label: 'Discrimination', clause: 'R 76-1 3.8 / A.4.8.2', need: 1,
    hint: 'Add 1.4 d; the indication must rise by one interval.' },
  { testType: 'repeatability', label: 'Repeatability', clause: 'R 76-1 3.6.1 / A.4.10', core: true, need: 10,
    hint: 'Weigh the same load 10 times; the spread must not exceed the MPE.' },
  { testType: 'zero_check', label: 'Zero check', clause: 'R 76-1 A.4.2.3.2', core: true, need: 1,
    hint: 'Use the 10e break-out load to check initial zero tracking.' },
  { testType: 'creep', label: 'Creep / return to zero', clause: 'R 76-1 3.9.4 / A.4.11', core: true, need: 4,
    positions: ['1', '2', '3', '4'], hint: 'Readings at 0, 5, 15 and 30 minutes under constant load.' },
  { testType: 'tare', label: 'Tare', clause: 'R 76-1 A.4.6.1', core: true, need: 5,
    hint: 'At least five net weighings after taring, including Min.' },
  { testType: 'damp_heat', label: 'Damp heat', clause: 'R 76-1 B.2', need: 1, hint: 'Indications within MPE under damp heat.' },
  { testType: 'voltage_variations', label: 'Voltage variations', clause: 'R 76-1 A.5.4', need: 1, hint: 'Indications within MPE at supply limits.' },
  { testType: 'sensitivity', label: 'Sensitivity', clause: 'R 76-1 A.4.9', need: 1, hint: 'Non-self-indicating instruments only.' },
  { testType: 'equilibrium', label: 'Stability of equilibrium', clause: 'R 76-1 4.4.2 / A.4.12', need: 1, hint: 'Printed/stored values within 1e under disturbance.' },
  { testType: 'tilting', label: 'Tilting', clause: 'R 76-1 3.9.1 / A.5.1', need: 1, hint: 'Zero shift within 2e; loaded readings within MPE.' },
  { testType: 'warm_up', label: 'Warm-up time', clause: 'R 76-1 A.5.2', need: 1, hint: 'Readings after power-on and after warm-up.' },
  { testType: 'span_stability', label: 'Span stability', clause: 'R 76-1 B.4', need: 1, hint: 'Span within MPE over the test period.' },
  { testType: 'endurance', label: 'Endurance', clause: 'R 76-1 A.6', need: 1, hint: 'Within MPE after the endurance cycle.' },
  { testType: 'emc_disturbances', label: 'EMC disturbances', clause: 'R 76-1 B.3', need: 1, hint: 'Deviation within 1e or a detected significant fault.' },
];

const BY_TYPE = new Map(TEST_MODULES.map((m) => [m.testType, m]));

export function labelForTestType(testType) {
  return BY_TYPE.get(testType)?.label || String(testType || '').replace(/_/g, ' ');
}

function defaultStatus(module) {
  return module.core ? 'required' : 'optional';
}

// Plan status the workflow acts on. An N/A without a rationale (legacy rows,
// before the server required one) falls back to the default instead of
// silently hiding a test; the server repairs such rows the same way.
export function effectivePlanStatus(module, planItem) {
  if (planItem?.status === 'not_applicable') {
    return (planItem.rationale || '').trim() ? 'not_applicable' : defaultStatus(module);
  }
  if (planItem?.status === 'required' || planItem?.status === 'optional') return planItem.status;
  return defaultStatus(module);
}

// Readings captured for a module: distinct positions for positional tests.
function countFor(module, observations) {
  const own = (observations || []).filter((o) => o.test_type === module.testType);
  if (module.positions) {
    return new Set(own.map((o) => String(o.position ?? '')).filter((p) => module.positions.includes(p))).size;
  }
  return own.length;
}

// { have, need, complete }. Optional / N/A tests never block the workflow.
export function moduleStatus(module, observations = [], planItem) {
  if (!module) return { have: 0, need: 1, complete: false };
  const status = effectivePlanStatus(module, planItem);
  const have = countFor(module, observations);
  return { have, need: module.need, complete: status !== 'required' || have >= module.need };
}

export function computeTestPlanCompletion(planItems = [], observations = []) {
  const planMap = new Map((planItems || []).map((p) => [p.test_type, p]));
  const statusOf = (m) => effectivePlanStatus(m, planMap.get(m.testType));
  const applicable = TEST_MODULES.filter((m) => statusOf(m) !== 'not_applicable');
  const started = applicable.filter((m) => countFor(m, observations) > 0);
  const missingRequired = applicable.filter(
    (m) => statusOf(m) === 'required' && countFor(m, observations) < m.need
  );
  return {
    applicableTotal: applicable.length,
    applicableCompleted: started.length,
    applicableProgress: applicable.length ? Math.round((started.length / applicable.length) * 100) : 0,
    missingRequired: missingRequired.map((m) => m.testType),
    ready: (observations || []).length > 0 && missingRequired.length === 0,
  };
}
