/**
 * ARE-14: the area measures that need the later parts of the plan. A flat's area to the middle of
 * its party walls (lab R-1), on the four-flat floor, beside a neighbour the plan does not draw and
 * on a duplex; and a balcony left out of every figure, or counted by a rule the caller states,
 * flat by flat (CNT-7).
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { MEASURES, planAreaFigures } from '../areas'
import { duplexHouse, edit } from '../../test-support/plans'
import { twoFlats } from '../../test-support/largerBuilding'
import { labPlanText } from '../../test-support/lab'
import type { FloorPlan } from '../plan'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')
const fourFlats = (): FloorPlan => {
  const result = compileRoomsText(readFileSync(join(FIXTURES, 'four-flats.rooms'), 'utf8'))
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

describe('ARE-14 the four-flat floor, each flat to the middle of its party walls (lab R-1)', () => {
  const plan = fourFlats()
  const areas = planAreaFigures(plan)

  it('measures flat A from the outer walls to the middle of the walls it shares with the stair and the corridor', () => {
    // Flat A's rooms reach to x 10 and y 7.6 at the middle of the 0.3 m stair wall and the 0.25 m
    // corridor wall; the 0.35 m outer walls have their middle on x 0 and y 0.
    const a = areas.flats.find((f) => f.id === 'A')!
    expect(a.toPartyWalls!.grossInternal).toBeCloseTo((10 - 0.175) * (7.6 - 0.175), 6)
    expect(a.toPartyWalls!.grossExternal).toBeCloseTo((10 + 0.175) * (7.6 + 0.175), 6)
    // Larger than its net, which stops at the faces of its rooms.
    expect(a.toPartyWalls!.grossInternal - a.net).toBeGreaterThan(4)
  })

  it('gives a mirrored flat the same figure as its type, and C and D, which share a wall, meet on its middle', () => {
    const by = new Map(areas.flats.map((f) => [f.id, f.toPartyWalls!] as const))
    expect(by.get('B')!.grossInternal).toBeCloseTo(by.get('A')!.grossInternal, 6)
    expect(by.get('D')!.grossExternal).toBeCloseTo(by.get('C')!.grossExternal, 6)
  })

  it('adds up, with the common parts measured the same way, to the floor\'s gross internal and gross external areas', () => {
    const common = areas.notInFlatsToPartyWalls!
    const floor = areas.floors[0]!
    expect(sum(areas.flats.map((f) => f.toPartyWalls!.grossInternal)) + common.grossInternal + floor.unclaimed!).toBeCloseTo(areas.grossInternal.area!, 6)
    expect(sum(areas.flats.map((f) => f.toPartyWalls!.grossExternal)) + common.grossExternal + floor.unclaimed!).toBeCloseTo(areas.grossExternal.area!, 6)
  })

  it('has its rule in Grid\'s own words, naming the party walls and both faces of the outer walls', () => {
    const rule = MEASURES.partyWall
    expect(rule.name).toBe('Area to the party walls')
    for (const sentence of [rule.measures, rule.notTakenOff, rule.cannotSay]) expect(sentence).toMatch(/^[A-Z].{20,}\.$/)
    expect(rule.measures).toContain('middle of each wall it shares with another flat, the common parts or a neighbour')
    expect(rule.measures).toContain('inside face')
    expect(rule.measures).toContain('outside face')
  })

  it('gives none on a plan that lists no flats', () => {
    const lab = parseFloorPlan({ ...plan, flats: undefined, flatTypes: undefined })
    expect(planAreaFigures(lab).flats).toEqual([])
    expect(planAreaFigures(lab).notInFlatsToPartyWalls).toBeNull()
  })
})

describe('ARE-14 a wall to a neighbour the plan does not draw (CNT-6)', () => {
  const listed = (plan: FloorPlan): FloorPlan => ({
    ...plan,
    flats: [{ id: 'A', rooms: ['A-hall', 'A-living'] }, { id: 'B', rooms: ['B-hall', 'B-living'] }],
  })

  it('counts to the middle of a wall marked separating, and to its inside face when it faces outside', () => {
    // Flat A's hall is 2.9 m wide to the middle of the wall to the living room, and its 0.2 m wall to
    // the landing is marked separating: the hall's figure runs 0.1 m into it.
    const separating = planAreaFigures(listed(twoFlats())).flats.find((f) => f.id === 'A')!.toPartyWalls!
    const outside = edit(listed(twoFlats()), (copy) => {
      copy.walls.find((w) => w.id === 's_a1')!.kind = 'exterior'
    })
    const faced = planAreaFigures(outside).flats.find((f) => f.id === 'A')!.toPartyWalls!
    expect(separating.grossInternal - faced.grossInternal).toBeCloseTo(2.9 * 0.1, 6)
    // The hall to x 3 and y 0, the living room from x 3 to the middle of the party wall, x 6.
    expect(separating.grossInternal).toBeCloseTo(2.9 * 5.9 + 3 * 5.8, 6)
  })
})

describe('ARE-14 a duplex, floor by floor', () => {
  it('adds its floors, each measured on its own', () => {
    const plan = duplexHouse()
    const whole = planAreaFigures(plan).flats.find((f) => f.id === 'D1')!.toPartyWalls!
    const ground = planAreaFigures(plan, { floors: ['ground'] }).flats.find((f) => f.id === 'D1')!.toPartyWalls!
    const first = planAreaFigures(plan, { floors: ['first'] }).flats.find((f) => f.id === 'D1')!.toPartyWalls!
    expect(whole.grossInternal).toBeCloseTo(ground.grossInternal + first.grossInternal, 9)
    expect(whole.grossExternal).toBeCloseTo(ground.grossExternal + first.grossExternal, 9)
    expect(ground.grossInternal).toBeGreaterThan(0)
    expect(first.grossInternal).toBeGreaterThan(0)
  })
})

describe('ARE-14 a balcony, left out or counted by a stated rule (CNT-7)', () => {
  const RULE = 'Half of each balcony, as the person\'s lender counts it.'
  const balconyFlat = (): FloorPlan => {
    const raw = JSON.parse(labPlanText('G/scenarios/s03a-flat-balcony.json')) as FloorPlan & { rooms: { id: string }[] }
    const rooms = raw.rooms.map((room) => (room.id === 'balcony' ? { ...room, outdoor: 'balcony' } : room))
    return parseFloorPlan({ ...raw, rooms, flats: [{ id: 'F', name: 'Flat 3A', rooms: rooms.map((room) => room.id) }] })
  }

  it('leaves the balcony out of the flat\'s net and its area to the party walls, and lists it with the flat', () => {
    const areas = planAreaFigures(balconyFlat())
    const flat = areas.flats[0]!
    expect(flat.net).toBeCloseTo(areas.net.area!, 9)
    expect(flat.notCounted).toEqual([{ id: 'balcony', why: 'outdoor' }])
    expect(flat.outdoor).toEqual({ area: areas.outdoor!.area, weighted: null })
    // The lab's 1.5 × 3 m balcony, less the 5 mm its railing's face takes.
    expect(flat.outdoor!.area).toBeCloseTo(4.495, 6)
    expect(areas.outdoor!.weighted).toBeNull()
    // The balcony is the outside to the flat: its figure stops at the inside face of the wall to it.
    expect(flat.toPartyWalls!.grossInternal).toBeCloseTo(areas.grossInternal.area!, 6)
  })

  it('counts the share the caller\'s rule states, beside the net and never in it, and says which rule', () => {
    const plain = planAreaFigures(balconyFlat())
    const areas = planAreaFigures(balconyFlat(), { outdoorWeights: { balcony: { weight: 0.5, rule: RULE } } })
    expect(areas.net.area).toBe(plain.net.area)
    expect(areas.grossInternal.area).toBe(plain.grossInternal.area)
    const balcony = plain.outdoor!.area
    expect(areas.outdoor!.weighted).toEqual({
      area: balcony / 2,
      rules: [RULE],
      kinds: [{ kind: 'balcony', area: balcony, share: 0.5, counted: balcony / 2, rule: RULE }],
      withNet: plain.net.area! + balcony / 2,
    })
    expect(areas.flats[0]!.outdoor).toEqual({ area: balcony, weighted: balcony / 2 })
    expect(areas.flats[0]!.net).toBe(plain.flats[0]!.net)
  })
})
