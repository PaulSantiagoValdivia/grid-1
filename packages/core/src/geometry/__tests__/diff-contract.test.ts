import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import {
  AREA_TOLERANCE_M2,
  LENGTH_TOLERANCE_M,
  PLAN_DIFF_SCHEMA_VERSION,
  diffPlans
} from '../diff'

const plan: FloorPlan = {
  version: '1',
  units: 'm',
  walls: [
    { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }
  ],
  rooms: [],
  openings: []
}

describe('the diff contract', () => {
  it('is plain data: it survives JSON unchanged', () => {
    const diff = diffPlans(plan, plan)
    expect(JSON.parse(JSON.stringify(diff))).toEqual(diff)
  })

  it('carries the schema version and the tolerances it used', () => {
    const diff = diffPlans(plan, plan)
    expect(diff.schemaVersion).toBe(PLAN_DIFF_SCHEMA_VERSION)
    expect(diff.epsilon).toBe(LENGTH_TOLERANCE_M)
    expect(diff.areaEpsilon).toBe(AREA_TOLERANCE_M2)
  })

  it('uses the agreed tolerances', () => {
    expect(LENGTH_TOLERANCE_M).toBe(0.001)
    expect(AREA_TOLERANCE_M2).toBe(0.01)
  })

  it('lets the caller choose the tolerances, and says which it used', () => {
    const diff = diffPlans(plan, plan, { epsilon: 0.01, areaEpsilon: 0.1 })
    expect(diff.epsilon).toBe(0.01)
    expect(diff.areaEpsilon).toBe(0.1)
  })

  it('starts empty for two equal plans', () => {
    const diff = diffPlans(plan, plan)
    expect(diff.changes).toEqual([])
    expect(diff.areas).toEqual([])
    expect(diff.issues).toEqual([])
  })
})
