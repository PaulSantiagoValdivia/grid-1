/**
 * MSG-4 (lab W-5): of the 338 lab plans that passed with 0 issues, 19 had a room use Grid does
 * not know and 14 a field it drops, and nothing said so. Each now gets a line that names it.
 * Two plans are in both lists, so they are 31 plans. The names are where the plans sat in the
 * lab (`scoreboard/data/lab-plans.ndjson.gz`), listed by the lab's own layer.
 */
import { describe, expect, it } from 'vitest'
import { inspectPlan } from '@ongrid/rules'
import * as data from '../src/data'

/** The plans the lab found a room use Grid does not know in (W-5: 19). */
const UNKNOWN_USE = [
  'A/scenarios/probes/studio-one-room.json',
  'C/scenarios/cafe.json',
  'C/scenarios/clinic.json',
  'C/scenarios/gym.json',
  'C/scenarios/office-v2-bigger-meeting.json',
  'C/scenarios/office.json',
  'C/scenarios/school-2storey.json',
  'C/scenarios/school.json',
  'C/scenarios/shop.json',
  'C/scenarios/warehouse-columns.json',
  'C/scenarios/warehouse-split.json',
  'C/scenarios/warehouse.json',
  'G/scenarios/s02b-terrace-porch-words.json',
  'G/scenarios/s03b-flat-balcony-words.json',
  'G/scenarios/s04a-garage-carport.json',
  'K/scenarios/c-clinic.json',
  'K/scenarios/c-school-2storey.json',
  'K/scenarios/c-warehouse-columns.json',
  'Q/scenarios/part1/orig/office.json',
]
/** The plans the lab found a field Grid drops in (W-5: 14). */
const DROPPED_FIELD = [
  'B/scenarios/s05b-arc-field.json',
  'G/scenarios/s01b-site-fields.json',
  'G/scenarios/s01g-fence-gate-path-trees.json',
  'G/scenarios/s02b-terrace-porch-words.json',
  'G/scenarios/s03b-flat-balcony-words.json',
  'G/scenarios/s05a-pool-shed.json',
  'G/scenarios/s06c-slope-site-fields.json',
  'H/scenarios/h01a-stair-guessed-keys.json',
  'H/scenarios/h07-ramp.json',
  'H/scenarios/h12-roof-gable-stepped.json',
  'J/scenarios/1-homeowner/t5c-bifold-made-up-fields.json',
  'J/scenarios/3-estate-agent/t4-made-up-title-logo-fixtures.json',
  'J/scenarios/5-interior-designer/t2x-furniture-made-up-field.json',
  'J/scenarios/7-wheelchair-user/t9-made-up-access-fields.json',
]

describe('the W-5 plans', () => {
  const plans = new Map(data.labPlans().map((plan) => [plan.name, plan.text]))
  const codes = (name: string): string[] => {
    const text = plans.get(name)
    expect(text, name).toBeDefined()
    const result = inspectPlan(text)
    expect(result.read, name).toBe(true)
    return result.lines.map((line) => line.code)
  }

  it('are 19 and 14, 31 plans in all', () => {
    expect(UNKNOWN_USE).toHaveLength(19)
    expect(DROPPED_FIELD).toHaveLength(14)
    expect(new Set([...UNKNOWN_USE, ...DROPPED_FIELD]).size).toBe(31)
  })

  it('each with a use Grid does not know gets a line that names it', () => {
    for (const name of UNKNOWN_USE) expect(codes(name), name).toContain('plan/unknown-use')
  })

  it('each with a field Grid drops gets a line that names it', () => {
    for (const name of DROPPED_FIELD) expect(codes(name), name).toContain('plan/unknown-field')
  })
})
