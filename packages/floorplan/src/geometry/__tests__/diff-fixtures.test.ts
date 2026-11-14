import { describe, expect, it } from 'vitest'
import { planRevision } from '../revision'
import { validatePlan } from '../validate'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { sixRoomHouse, shuffled, twoFloorPlan, twoRoomBox } from './diff-fixtures'

const fixtures = [
  ['the two-room box', twoRoomBox],
  ['the six-room house', sixRoomHouse],
  ['the two-floor plan', twoFloorPlan]
] as const

describe.each(fixtures)('%s', (_name, build) => {
  it('validates with no issues at all', () => {
    const result = validatePlan(build())
    expect(result.issues).toEqual([])
    expect(result.broken.size).toBe(0)
  })

  it('keeps its revision when shuffled, but not its order', () => {
    const plan = build()
    const other = shuffled(plan, 7)
    expect(planRevision(other)).toBe(planRevision(plan))
    expect(other.walls.map((w) => w.id)).not.toEqual(plan.walls.map((w) => w.id))
  })

  it('is not changed by shuffling it', () => {
    const plan = build()
    const before = JSON.stringify(plan)
    shuffled(plan, 3)
    expect(JSON.stringify(plan)).toBe(before)
  })

  it('shuffles the same way for the same seed', () => {
    expect(JSON.stringify(shuffled(build(), 5))).toBe(JSON.stringify(shuffled(build(), 5)))
  })

  it('never reorders a room boundary, which C3 makes meaningful', () => {
    const plan = build()
    const other = shuffled(plan, 11)
    for (const room of plan.rooms) {
      expect(other.rooms.find((r) => r.id === room.id)?.boundary).toEqual(room.boundary)
    }
  })
})

describe('the fixtures draw the rooms they say they do', () => {
  it('splits the box into two rooms of 14.63 m² and 14.63 m²', () => {
    const plan = twoRoomBox()
    const index = indexPlan(plan)
    // Left: x from 0.1 to 3.95, y from 0.1 to 3.9. Right: x from 4.05 to 7.9.
    expect(roomArea(plan.rooms[0]!, index)).toBeCloseTo(3.85 * 3.8, 6)
    expect(roomArea(plan.rooms[1]!, index)).toBeCloseTo(3.85 * 3.8, 6)
  })

  it('has six rooms in the house, all closable', () => {
    const plan = sixRoomHouse()
    expect(plan.rooms).toHaveLength(6)
    const index = indexPlan(plan)
    for (const room of plan.rooms) expect(roomArea(room, index)).toBeGreaterThan(10)
  })
})
