/**
 * CNT-16 (lab EL-6): the columns in the take-off and the description, and on the sheet's list of
 * what it does with each part of a plan.
 */
import { describe, expect, it } from 'vitest'
import { openOffice, warehouse } from '@ongrid/floorplan/test-support/columns'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'
import { planFacts } from '../../describe/facts'
import { describeText } from '../../describe/card'
import { SHEET_COVERAGE } from '../../sheet/coverage'

describe('columns in the quantities and the description', () => {
  it('takes off the warehouse\'s eight columns by shape and size, with the rule', () => {
    const t = planTakeoff(surveyPlan(warehouse()))
    expect(t.columns).toEqual([{ shape: 'square', width: 0.4, depth: 0.4, count: 8, length: 48, volume: expect.closeTo(7.68, 9) }])
    expect(t.rules.at(-1)).toMatch(/^A column is counted once/)
    // The room's floor is less its columns.
    expect(t.rooms[0]!.floorArea).toBeCloseTo(29.8 * 19.8 - 8 * 0.16, 9)
  })

  it('leaves the take-off as it was on a plan with no columns', () => {
    const t = planTakeoff(surveyPlan(parseFloorPlan({ ...warehouse(), columns: undefined })))
    expect('columns' in t).toBe(false)
    expect(t.rules.some((rule) => rule.includes('column'))).toBe(false)
  })

  it('says each floor\'s columns, for a person and for an agent', () => {
    const facts = planFacts(openOffice())
    const person = describeText(facts, 'rooms', 'person')
    expect(person).toContain('Open office: 10.01 × 9, 89.7 m²')
    expect(person).toContain('  Columns (3): 0.37 × 0.37 m at 3.4, 4.6, in Open office, 0.37 × 0.37 m at 6.8, 4.6, in Open office and C3, 0.37 × 0.37 m at 5.1, 7.2, in Open office.')
    const agent = describeText(facts, 'rooms', 'agent')
    expect(agent).toContain('COLUMNS c1 sq0.37x0.37 @3.4,4.6 r1; c2 sq0.37x0.37 @6.8,4.6 r1; c3 sq0.37x0.37 @5.1,7.2 r1')
  })

  it('is placed on the sheet: the columns drawn and in the room table, the grid drawn', () => {
    expect(SHEET_COVERAGE.columns).toEqual({ shown: 'drawn and tabled' })
    expect(SHEET_COVERAGE.grids).toEqual({ shown: 'drawn' })
  })
})
