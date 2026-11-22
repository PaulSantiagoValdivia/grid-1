/**
 * LVL-5 (lab WR-9, D-7, E-9): floors, stair rooms and lift shafts that stop lining up from one floor
 * to the next are said, where and by how much, unless the plan marks the overhang as meant.
 */
import { describe, expect, it } from 'vitest'
import { labPlan } from '../../test-support/lab'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { validatePlan } from '../validate'
import { checkPlanSanity } from '../rules/check'

/** The lab's D2 block with its stair and lift moved 1.2 m east on floor 3 only (lab D-7). */
const shifted = (): FloorPlan => labPlan('D/scenarios/d2-stair-shifted-floor3.json')

/** A plan with some rooms or floors marked `overhang: "meant"`. */
function marked(plan: FloorPlan, rooms: readonly string[], floors: readonly string[] = []): FloorPlan {
  const raw = JSON.parse(JSON.stringify(plan)) as FloorPlan
  return parseFloorPlan({
    ...raw,
    rooms: raw.rooms.map((r) => (rooms.includes(r.id) ? { ...r, overhang: 'meant' } : r)),
    floors: (raw.floors ?? []).map((f) => (floors.includes(f.id) ? { ...f, overhang: 'meant' } : f))
  })
}

describe('a stair moved 1.2 m on one floor (lab WR-9, D-7)', () => {
  it('is said, with where it stands and by how much', () => {
    const report = checkPlanSanity(shifted())
    const stairs = report.findings.filter((f) => f.code === 'stair_shifted')
    const moved = stairs.find((f) => f.rooms[0] === 'L3-stair')!
    expect(moved.rooms).toEqual(['L3-stair', 'L2-stair'])
    expect(moved.floor).toBe('L3')
    expect(moved.shift?.east).toBe(1.2)
    expect(moved.shift?.north).toBe(0)
    expect(moved.message).toMatch(/^The stair "[^"]+" on "Floor 3" is 1\.20 m east of "[^"]+" on "Floor 2" below it: it stands from \(/)
    expect(moved.ruleId).toBe('stairs-line-up')
  })

  it('says the same of a lift shaft moved on one floor (lab H-5, h06b)', () => {
    // The lab wrote its shafts before Grid had a lift use: here they say they are lifts.
    const raw = JSON.parse(JSON.stringify(labPlan('H/scenarios/h06b-lift-shaft-shifted.json'))) as FloorPlan
    const plan = parseFloorPlan({ ...raw, rooms: raw.rooms.map((r) => (r.name === 'Lift shaft' ? { ...r, use: 'lift' } : r)) })
    const lift = checkPlanSanity(plan).findings.filter((f) => f.code.startsWith('lift_'))
    // The second floor's shaft has its west wall 0.6 m in; the third floor's is back in its place.
    expect(lift.map((f) => [f.code, f.floor])).toEqual([['lift_shifted', 'second'], ['lift_shifted', 'third']])
    expect(lift[0]!.shift?.sides).toEqual([{ side: 'west', by: 0.6 }])
    expect(lift[0]!.message).toBe(
      'The lift shaft "Lift shaft" on "Second floor" has its west side 0.60 m east of that of "Lift shaft" on "First floor" below it: it stands from (6.70, 3.70) to (7.85, 5.85), the one below from (6.10, 3.70) to (7.85, 5.85)'
    )
  })

  it('is not said where the plan marks the moved stair as meant, on the floor moved and the one over it', () => {
    const report = checkPlanSanity(marked(shifted(), ['L3-stair', 'L4-stair']))
    expect(report.findings.filter((f) => f.code === 'stair_shifted' || f.code === 'lift_shifted')).toEqual([])
  })

  it('is not said of stairs that line up', () => {
    const report = checkPlanSanity(labPlan('D/scenarios/d2-stair-shifted-floor3.json'))
    const floors = report.findings.filter((f) => f.code === 'stair_shifted').map((f) => f.floor)
    // Only the floor moved and the floor over it, whose stair is back in its place.
    expect([...new Set(floors)].sort()).toEqual(['L3', 'L4'])
  })
})

/** Two boxes, one over the other, the ground floor `extra` m wider to the east (lab E-9: "30 cm wider"). */
function house(extra: number, meant = false): FloorPlan {
  const box = (floor: string, east: number) => [
    { id: `${floor}-s`, start: [0, 0], end: [east, 0], thickness: 0.3, kind: 'exterior', height: 2.7, floor },
    { id: `${floor}-e`, start: [east, 0], end: [east, 6], thickness: 0.3, kind: 'exterior', height: 2.7, floor },
    { id: `${floor}-n`, start: [east, 6], end: [0, 6], thickness: 0.3, kind: 'exterior', height: 2.7, floor },
    { id: `${floor}-w`, start: [0, 6], end: [0, 0], thickness: 0.3, kind: 'exterior', height: 2.7, floor }
  ]
  return parseFloorPlan({
    floors: [
      { id: 'g', name: 'Ground floor', level: 0 },
      { id: 'f', name: 'First floor', level: 1, ...(meant ? { overhang: 'meant' } : {}) }
    ],
    walls: [...box('g', 8 + extra), ...box('f', 8)],
    rooms: [
      { id: 'g-r', name: 'Living', floor: 'g', boundary: ['g-s', 'g-e', 'g-n', 'g-w'], use: 'living' },
      { id: 'f-r', name: 'Bedroom', floor: 'f', boundary: ['f-s', 'f-e', 'f-n', 'f-w'], use: 'bedroom' }
    ],
    openings: [{ id: 'door', wall: 'g-s', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
  })
}

describe('a floor that no longer lies over the floor below (lab WR-9, E-9)', () => {
  it('is said, with the side and by how much, when the ground floor is widened 30 cm', () => {
    const issue = validatePlan(house(0.3)).issues.find((i) => i.code === 'floor/out-of-line')!
    expect(issue.severity).toBe('warning')
    expect(issue.id).toBe('f')
    expect(issue.message).toBe(
      'Floor "First floor" does not line up with "Ground floor" below it: it sits back from it by 0.30 m on the east, from (8.15, -0.15) to (8.45, 6.15). ' +
        'If that is meant, mark the floor with overhang "meant"; if not, move its outside walls over the floor below, or make a wall that both floors share rise through them (through).'
    )
  })

  it('is said when the floor above reaches past the floor below', () => {
    const issue = validatePlan(house(-0.5)).issues.find((i) => i.code === 'floor/out-of-line')!
    expect(issue.message).toContain('it reaches past it by 0.50 m on the east, from (7.65, -0.15) to (8.15, 6.15)')
  })

  it('is not said when the overhang is marked as meant, nor when the floors line up', () => {
    expect(validatePlan(house(0.3, true)).issues.map((i) => i.code)).not.toContain('floor/out-of-line')
    expect(validatePlan(house(0)).issues.map((i) => i.code)).not.toContain('floor/out-of-line')
    // Wall faces a few centimetres apart line up.
    expect(validatePlan(house(0.03)).issues.map((i) => i.code)).not.toContain('floor/out-of-line')
  })
})
