import Decimal from 'decimal.js'
import type { ScaleParameters } from '@/lib/metrology'

export interface RowShape {
  test_type: string
  position: string | null
  sequence_no: number
}

export interface TestModule {
  testType: string
  /** Display name used by the existing JSX UI. */
  label: string
  /** Backward-compatible semantic title. */
  title: string
  clause: string
  hint: string
  need: number
  core?: boolean
  positions?: readonly string[]
  requiredPositions?: boolean
  suggestedLoads: (scale: ScaleParameters) => string[]
}

function decimal(value: string): Decimal {
  return new Decimal(value)
}

const loads = {
  weighing: (scale: ScaleParameters) => {
    const max = decimal(scale.max_capacity)
    const min = decimal(scale.min_capacity)
    const e = decimal(scale.verification_scale_interval)
    return [min, e.mul(500), e.mul(2000), max.div(2), max].map((v) => v.toString())
  },
  thirdMax: (scale: ScaleParameters) => [decimal(scale.max_capacity).div(3).toString()],
  repeatability: (scale: ScaleParameters) => {
    const max = decimal(scale.max_capacity)
    return [max.div(2), max].map((v) => v.toString())
  },
  zero: (scale: ScaleParameters) => [decimal(scale.verification_scale_interval).mul(10).toString()],
  tare: (scale: ScaleParameters) => [decimal(scale.min_capacity), decimal(scale.verification_scale_interval).mul(500)].map((v) => v.toString()),
  creep: (scale: ScaleParameters) => [decimal(scale.max_capacity).toString()],
  generic: (scale: ScaleParameters) => [decimal(scale.max_capacity).toString()],
}

const module = (
  testType: string,
  label: string,
  clause: string,
  hint: string,
  need: number,
  suggestedLoads: (scale: ScaleParameters) => string[],
  extra: Partial<Pick<TestModule, 'core' | 'positions' | 'requiredPositions'>> = {},
): TestModule => ({
  testType,
  label,
  title: label,
  clause,
  hint,
  need,
  suggestedLoads,
  ...extra,
})

/**
 * The complete 17-test R-76 suite used by the existing evaluation workspace.
 * Keep this registry aligned with backend ObservationTestType and the report
 * order; the backend remains authoritative for legal evaluation.
 */
export const TEST_MODULES: readonly TestModule[] = [
  module('zero_check', 'Zero check & tare zero setting', 'R 76-1 §A.4.2.3.2', 'Use the 10e break-out load to check initial zero tracking and return to zero.', 1, loads.zero, { core: true }),
  module('weighing_performance', 'Weighing performance', 'R 76-1 §A.4.4', 'Use increasing and decreasing loads, including MPE changeover points at 500e and 2000e.', 5, loads.weighing, { core: true }),
  module('repeatability', 'Repeatability', 'R 76-1 §A.4.10', 'Record the prescribed consecutive readings at the specified test loads.', 10, loads.repeatability, { core: true }),
  module('eccentricity', 'Eccentricity', 'R 76-1 §3.6.2.1 / §A.4.7.1', 'Apply the prescribed test load in each required load position.', 4, loads.thirdMax, { core: true, positions: ['1', '2', '3', '4'], requiredPositions: true }),
  module('tare', 'Tare weighing test', 'R 76-1 §A.4.6.1', 'Record the prescribed net tare steps, including Min and changeover points.', 5, loads.tare, { core: true }),
  module('creep', 'Creep & zero return', 'R 76-1 §A.4.11.1', 'Capture readings at the prescribed creep intervals and verify return to zero.', 4, loads.creep, { core: true, positions: ['1', '2', '3', '4'], requiredPositions: true }),
  module('temperature_no_load', 'Temperature effect on no-load', 'R 76-1 §3.9.2.3 / §A.5.3.2', 'Record no-load indication over the prescribed temperature conditions.', 2, loads.generic),
  module('damp_heat', 'Damp heat, steady state', 'R 76-1 §B.2', 'Record the instrument before and after the prescribed damp-heat exposure.', 3, loads.generic),
  module('voltage_variations', 'Voltage variations', 'R 76-1 §A.5.4', 'Capture observations at each prescribed supply-voltage condition.', 3, loads.generic),
  module('discrimination', 'Discrimination', 'R 76-1 §3.8 / §A.4.8.2', 'Record the indication response to the prescribed additional load.', 3, loads.generic),
  module('sensitivity', 'Sensitivity', 'R 76-1 §A.4.9', 'Record the indication or deflection produced by the prescribed additional load.', 1, loads.generic),
  module('equilibrium', 'Stability of equilibrium', 'R 76-1 §4.4.2 / §A.4.12', 'Record the indication while the instrument is in the required stable-equilibrium condition.', 1, loads.generic),
  module('tilting', 'Tilting', 'R 76-1 §3.9.1 / §A.5.1', 'Record the result at each prescribed tilt or inclination orientation.', 2, loads.generic, { positions: ['1', '2'], requiredPositions: true }),
  module('warm_up', 'Warm-up time', 'R 76-1 §A.5.2', 'Capture comparable observations immediately after power-on and after the specified warm-up period.', 2, loads.generic),
  module('span_stability', 'Span stability', 'R 76-1 §B.4', 'Record the periodic span measurements required over the stability period.', 8, loads.generic),
  module('endurance', 'Endurance', 'R 76-1 §A.6 / §3.9.4.3', 'Record the prescribed endurance verification observations before and after the endurance sequence.', 3, loads.generic),
  module('emc_disturbances', 'EMC disturbances', 'R 76-1 §B.3.x', 'Record observations associated with the prescribed electrical and electromagnetic disturbances.', 3, loads.generic),
]

export function moduleFor(testType: string): TestModule | undefined {
  return TEST_MODULES.find((m) => m.testType === testType)
}

export function labelForTestType(testType: string): string {
  return moduleFor(testType)?.label || testType.replaceAll('_', ' ')
}

/**
 * Resolve a plan row to a safe display/execution status. Legacy rows that say
 * N/A without a rationale are treated as invalid and fall back to the module
 * default rather than silently hiding a test from the workflow.
 */
export function effectivePlanStatus(moduleDef: TestModule, planItem?: { status?: string | null; rationale?: string | null } | null): string {
  if (planItem?.status === 'not_applicable' && (planItem.rationale || '').trim()) return 'not_applicable'
  if (planItem?.status === 'required' || planItem?.status === 'optional') return planItem.status
  return moduleDef.core ? 'required' : 'optional'
}

export function moduleStatus(
  moduleDef: TestModule,
  rows: readonly RowShape[],
  _plan?: unknown,
): { have: number; need: number; complete: boolean; missingPositions: string[] } {
  const ownRows = rows.filter((row) => row.test_type === moduleDef.testType)
  const missingPositions = moduleDef.requiredPositions
    ? (moduleDef.positions ?? []).filter((position) => !ownRows.some((row) => row.position === position))
    : []
  const complete = moduleDef.requiredPositions
    ? missingPositions.length === 0
    : ownRows.length >= moduleDef.need
  return { have: ownRows.length, need: moduleDef.need, complete, missingPositions }
}

export function computeTestPlanCompletion(
  modules: readonly TestModule[],
  rows: readonly RowShape[],
  planMap?: Map<string, any>,
) {
  const required = modules.filter((m) => effectivePlanStatus(m, planMap?.get(m.testType)) === 'required')
  const statuses = required.map((m) => ({ module: m, status: moduleStatus(m, rows, planMap?.get(m.testType)) }))
  return {
    required: required.length,
    completed: statuses.filter((x) => x.status.complete).length,
    complete: statuses.every((x) => x.status.complete),
    statuses,
  }
}
