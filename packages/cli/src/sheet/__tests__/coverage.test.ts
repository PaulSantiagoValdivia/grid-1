import { describe, expect, it } from 'vitest'
import { FloorPlanFieldsSchema } from '@ongrid/floorplan/types/floorplan'
import { SHEET_COVERAGE } from '../coverage'

describe('the sheet covers every part of a plan (VEW-7)', () => {
  it('has one entry for each top-level part of the schema, and no other', () => {
    expect(Object.keys(SHEET_COVERAGE).sort()).toEqual(Object.keys(FloorPlanFieldsSchema.shape).sort())
  })
  it('says why a part is not shown', () => {
    for (const [part, coverage] of Object.entries(SHEET_COVERAGE)) {
      if (coverage.shown === 'not shown') expect(coverage.why.length, part).toBeGreaterThan(10)
    }
  })
})
