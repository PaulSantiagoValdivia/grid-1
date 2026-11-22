/**
 * MSG-2: what each check looked at, and the state of every area, on the lab's own plans (read
 * from the scoreboard's data). CH-1: a report with nothing relevant checked no longer looks
 * clean. CH-4: the bedrooms above the third storey are named as not checked for escape. AC-9: a
 * total that left a room out names it.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { planFloors, planForFloor, validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { NUMBER_STATES } from '@ongrid/rules'
import { checkPlan, checkText } from '../check'
import type { LoadedPlan } from '../plan'
import { planAreas } from '../../quantities/areas'
import { stateText } from '../../quantities/state'
import { surveyPlan } from '../../quantities/survey'

const OFFICE = 'C/scenarios/office-known-uses.json'
const WORST = 'M/scenarios/worst-1-sleeping-floor-level4.json'
const WALLS_ONLY = 'M/scenarios/worst-2-walls-only.json'
const BLOCK = 'D/scenarios/d2-block-g+5.json'
const FAULTS = ['E/scenarios/faults/f05-boundary-missing-wall.json', 'E/scenarios/faults/f06-boundary-wrong-order.json', 'E/scenarios/faults/f07-room-two-walls.json']
const SOUND = ['A/scenarios/townhouse.json', 'A/scenarios/basement-flat.json', 'AU2/scenarios/H-h06-lift-four-floors/plan.json']

function labPlans(names: readonly string[]): Map<string, LoadedPlan> {
  const repo = resolve(__dirname, '../../../../..')
  const lines = gunzipSync(readFileSync(resolve(repo, 'scoreboard/data/lab-plans.ndjson.gz'))).toString('utf8').split('\n')
  const found = new Map<string, LoadedPlan>()
  for (const line of lines) {
    if (!line) continue
    const row = JSON.parse(line) as { name: string; text: string }
    if (!names.includes(row.name)) continue
    const plan = FloorPlanSchema.parse(JSON.parse(row.text))
    const { issues, broken } = validatePlan(plan)
    found.set(row.name, { file: row.name, plan, issues, broken })
  }
  expect([...found.keys()].sort()).toEqual([...names].sort())
  return found
}

const plans = labPlans([OFFICE, WORST, WALLS_ONLY, BLOCK, ...FAULTS, ...SOUND])
const plan = (name: string): LoadedPlan => plans.get(name)!
const key = (floor: string, id: string): string => `${floor}/${id}`

describe('every check says what it looked at (CH-1)', () => {
  it.each([OFFICE, WORST, BLOCK, ...SOUND])('%s: every room is under each room check, looked at or skipped with a reason, and the counts add up', (name) => {
    const loaded = plan(name)
    const rooms = planFloors(loaded.plan).flatMap((f) => planForFloor(loaded.plan, f.id).rooms.map((r) => key(f.id, r.id))).sort()
    const result = checkPlan(loaded, { country: 'US' })
    expect(result.result.coverage.map((c) => c.ruleId)).toEqual([
      'floor-has-exit', 'room-has-door', 'room-reaches-exit', 'door-leads-somewhere', 'habitable-room-area', 'escape-opening',
    ])
    for (const check of result.result.coverage) {
      const looked = check.lookedAt.flatMap((g) => g.ids.map((id) => key(g.floor, id)))
      const skipped = check.skipped.flatMap((g) => g.ids.map((id) => key(g.floor, id)))
      expect(check.lookedAtCount).toBe(looked.length)
      expect(check.skippedCount).toBe(skipped.length)
      for (const skip of check.skipped) expect(skip.why.length, `${check.ruleId} ${skip.reason}`).toBeGreaterThan(0)
      if (check.looksAt === 'room') expect([...looked, ...skipped].sort(), check.ruleId).toEqual(rooms)
    }
    // A check is listed as run only when it looked at something.
    expect(result.report.rules.map((r) => r.id)).toEqual(result.result.coverage.filter((c) => c.lookedAtCount > 0).map((c) => c.ruleId))
  })

  it('the office whose rooms are "other": the size and escape checks looked at no room, said room by room, and are not listed as run', () => {
    const result = checkPlan(plan(OFFICE), { country: 'US' })
    const size = result.result.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(size.lookedAtCount).toBe(0)
    expect(size.skipped.map((s) => [s.reason, s.ids.length])).toEqual([['use_not_covered', 7]])
    expect(result.report.rules.map((r) => r.id)).not.toContain('habitable-room-area')
    expect(result.report.rules.map((r) => r.id)).not.toContain('escape-opening')
    expect(result.report.figures).toEqual([])
    const text = checkText(result, 1)
    expect(text).toContain('Looked at by at least one check: 7 of 7 rooms.')
    expect(text).toContain('  - Rooms people live or sleep in have a minimum floor area: looked at no rooms; 0 findings.')
    expect(text).toContain('      not looked at, 7 rooms: the figure is for bedrooms, living rooms and dining rooms only: ')
    expect(text).toContain('      not looked at, 7 rooms: only bedrooms are checked: ')
  })

  it('the fifth-storey floor of eight windowless bedrooms: a line names them as not checked for escape, and the count is not 0 for it', () => {
    const result = checkPlan(plan(WORST), { country: 'US' })
    const lines = result.result.lines.filter((l) => l.code === 'floor/not-checked-above-escape-storeys')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.message).toBe('On "Fourth floor", escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: 8')
    expect(lines[0]!.also).toHaveLength(8)
    const escape = result.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    expect(escape.lookedAtCount).toBe(0)
    expect(escape.skipped.map((s) => [s.reason, s.ids.length])).toEqual([['above_escape_storeys', 8], ['use_not_covered', 1]])
  })

  it('the same walls with no rooms: one line says no check that looks at rooms ran, and no check is listed as run', () => {
    const result = checkPlan(plan(WALLS_ONLY), { country: 'US' })
    expect(result.result.lines.filter((l) => l.kind === 'not-checked').map((l) => l.code)).toEqual(['plan/not-checked-no-rooms'])
    expect(result.report.rules).toEqual([])
    expect(result.result.coverage.every((c) => c.lookedAtCount === 0)).toBe(true)
    expect(checkText(result, 1)).toContain('Looked at by at least one check: no rooms: there are none to look at.')
    // The two plans no longer give the same report (CH-1).
    expect(checkText(result, 1)).not.toBe(checkText(checkPlan(plan(WORST), { country: 'US' }), 1))
  })
})

describe('the ground-plus-five block (CH-4)', () => {
  const result = checkPlan(plan(BLOCK), { country: 'US' })
  const bedroomsAbove = planFloors(plan(BLOCK).plan)
    .filter((f) => f.level > 2)
    .flatMap((f) => planForFloor(plan(BLOCK).plan, f.id).rooms.filter((r) => r.use === 'bedroom').map((r) => key(f.id, r.id)))
    .sort()

  it('has 18 bedrooms on floors 3 to 5', () => {
    expect(bedroomsAbove).toHaveLength(18)
  })

  it('lists the 18 as not checked for escape, floor by floor, with the reason and a count', () => {
    const escape = result.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    const above = escape.skipped.filter((s) => s.reason === 'above_escape_storeys')
    expect(above.map((s) => [s.floor, s.ids.length])).toEqual([['L3', 6], ['L4', 6], ['L5', 6]])
    expect(above.flatMap((s) => s.ids.map((id) => key(s.floor, id))).sort()).toEqual(bedroomsAbove)
    // The bedrooms of floors 1 and 2 are looked at.
    expect(escape.lookedAt.map((g) => [g.floor, g.ids.length])).toEqual([['L1', 6], ['L2', 6]])
  })

  it('gives one "not checked" line on each of floors 3 to 5, 18 bedrooms in all', () => {
    const lines = result.result.lines.filter((l) => l.code === 'floor/not-checked-above-escape-storeys')
    expect(lines.map((l) => l.floor)).toEqual(['L3', 'L4', 'L5'])
    expect(lines.map((l) => l.message)).toEqual(['Floor 3', 'Floor 4', 'Floor 5'].map((f) => `On "${f}", escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: 6`))
    expect(lines.flatMap((l) => l.also.map((id) => key(l.floor!, id))).sort()).toEqual(bedroomsAbove)
  })

  it('shows a floor alone with its own lines and coverage', () => {
    const one = checkPlan(plan(BLOCK), { country: 'US', floor: 'L4' })
    expect(one.result.lines.filter((l) => l.code === 'floor/not-checked-above-escape-storeys').map((l) => l.floor)).toEqual(['L4'])
    const escape = one.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    expect(escape.skipped.filter((s) => s.reason === 'above_escape_storeys').map((s) => s.floor)).toEqual(['L4'])
    expect(escape.lookedAtCount).toBe(0)
  })
})

describe('every area and total carries a state (AC-9, AA-12)', () => {
  it.each([...FAULTS, ...SOUND, WORST, BLOCK])('%s: each room, each floor figure and each total has a state, and a proven one names no room', (name) => {
    const areas = planAreas(surveyPlan(plan(name).plan))
    const states = [
      ...Object.values(areas.states),
      ...areas.floors.flatMap((f) => [f.states.net, f.states.circulation, f.states.grossInternal, f.states.grossExternal, ...Object.values(f.states.byUse)]),
    ]
    for (const s of states) {
      expect(NUMBER_STATES).toContain(s.state)
      if (s.state === 'proven') expect([...s.leftOut, ...s.notProven]).toEqual([])
      else expect(stateText(s, true)).not.toBe('')
    }
    for (const floor of areas.floors) {
      expect(Object.keys(floor.states.byUse).sort()).toEqual(Object.keys(floor.byUse).sort())
      for (const room of floor.rooms) {
        expect(NUMBER_STATES).toContain(room.state)
        expect(room.net === null).toBe(room.state === 'not-looked-at')
        expect(room.state === 'not-proven').toBe(room.doubts.length > 0)
      }
    }
  })

  it.each([
    [FAULTS[0]!, 'kitchen'],
    [FAULTS[1]!, 'living'],
    [FAULTS[2]!, 'kitchen'],
  ])('%s: the totals are not proven and name the room left out (%s)', (name, left) => {
    const areas = planAreas(surveyPlan(plan(name).plan))
    const room = areas.floors.flatMap((f) => f.rooms).find((r) => r.id === left)!
    expect(room.net).toBeNull()
    expect(room.state).toBe('not-looked-at')
    expect(areas.states.net.state).toBe('not-proven')
    expect(areas.states.net.leftOut.map((r) => r.id)).toEqual([left])
    const floor = areas.floors.find((f) => f.floor === room.floor)!
    expect(floor.states.net.leftOut.map((r) => r.id)).toEqual([left])
    const use = room.use ?? 'not said'
    expect(floor.states.byUse[use]!.leftOut.map((r) => r.id)).toEqual([left])
    expect(areas.notes.some((n) => n.includes('Every total here leaves out a room that could not be measured') && n.includes(JSON.stringify(room.name)))).toBe(true)
    expect(stateText(areas.states.net, false)).toBe(`; not proven: leaves out ${JSON.stringify(room.name)}, which could not be measured`)
  })

  it('the same flat with its fault repaired: every total is proven', () => {
    const repaired = labPlans(['E/scenarios/faults/repairs/f05-r1.json']).get('E/scenarios/faults/repairs/f05-r1.json')!
    const areas = planAreas(surveyPlan(repaired.plan))
    expect(areas.states.net).toEqual({ state: 'proven', leftOut: [], notProven: [] })
    expect(areas.floors.every((f) => f.rooms.every((r) => r.state === 'proven'))).toBe(true)
  })
})
