import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { indexPlan } from '../plan'
import { area } from '../vec2'
import { roomPolygon, tryRoomPolygon } from '../room'
import { validatePlan } from '../validate'
import { buildScene } from '../scene3d'

/**
 * One straight wall split in two: the assistant does this at junctions,
 * and both pieces end up back to back in a room's `boundary`. Their inner faces
 * are the same line, which is not a corner and not an error.
 */

const wall = (id: string, start: [number, number], end: [number, number]): Wall => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 2.7,
  kind: 'exterior'
})

const planOf = (walls: Wall[], boundary: string[]): FloorPlan => ({
  version: '1',
  units: 'm',
  walls,
  openings: [],
  rooms: [{ id: 'r', name: 'Room', boundary }]
})

// A 4 x 3 room whose bottom edge is one wall.
const whole = planOf(
  [
    wall('ab', [0, 0], [4, 0]),
    wall('c', [4, 0], [4, 3]),
    wall('d', [4, 3], [0, 3]),
    wall('e', [0, 3], [0, 0])
  ],
  ['ab', 'c', 'd', 'e']
)

const sides = [
  wall('c', [4, 0], [4, 3]),
  wall('d', [4, 3], [0, 3]),
  wall('e', [0, 3], [0, 0])
]

const polygonOf = (plan: FloorPlan) => roomPolygon(plan.rooms[0]!, indexPlan(plan))

describe('a straight wall split in two, back to back in a room', () => {
  const expected = polygonOf(whole)

  it('gives the same outline as the unsplit wall', () => {
    const split = planOf(
      [wall('a', [0, 0], [2, 0]), wall('b', [2, 0], [4, 0]), ...sides],
      ['a', 'b', 'c', 'd', 'e']
    )
    const polygon = polygonOf(split)

    expect(polygon).toHaveLength(4)
    expect(area(polygon)).toBeCloseTo(area(expected))
    for (const corner of expected) {
      expect(polygon.some((p) => Math.hypot(p.x - corner.x, p.y - corner.y) < 1e-9)).toBe(true)
    }
  })

  it('also works when the pair wraps around the end of the boundary', () => {
    const split = planOf(
      [wall('a', [0, 0], [2, 0]), wall('b', [2, 0], [4, 0]), ...sides],
      ['b', 'c', 'd', 'e', 'a']
    )
    expect(polygonOf(split)).toHaveLength(4)
    expect(area(polygonOf(split))).toBeCloseTo(area(expected))
  })

  it('does not care which way a piece was drawn', () => {
    const split = planOf(
      [wall('a', [0, 0], [2, 0]), wall('b', [4, 0], [2, 0]), ...sides],
      ['a', 'b', 'c', 'd', 'e']
    )
    expect(polygonOf(split)).toHaveLength(4)
    expect(area(polygonOf(split))).toBeCloseTo(area(expected))
  })

  it('merges a run of three pieces', () => {
    const split = planOf(
      [
        wall('a', [0, 0], [1, 0]),
        wall('b', [1, 0], [3, 0]),
        wall('f', [3, 0], [4, 0]),
        ...sides
      ],
      ['a', 'b', 'f', 'c', 'd', 'e']
    )
    expect(polygonOf(split)).toHaveLength(4)
  })

  it('merges pieces on more than one side of the same room', () => {
    const split = planOf(
      [
        wall('a', [0, 0], [2, 0]),
        wall('b', [2, 0], [4, 0]),
        wall('c', [4, 0], [4, 3]),
        wall('d1', [4, 3], [2, 3]),
        wall('d2', [2, 3], [0, 3]),
        wall('e', [0, 3], [0, 0])
      ],
      ['a', 'b', 'c', 'd1', 'd2', 'e']
    )
    expect(polygonOf(split)).toHaveLength(4)
    expect(area(polygonOf(split))).toBeCloseTo(area(expected))
  })

  it('gives the room a slab and keeps its walls out of the freestanding state', () => {
    const split = planOf(
      [wall('a', [0, 0], [2, 0]), wall('b', [2, 0], [4, 0]), ...sides],
      ['a', 'b', 'c', 'd', 'e']
    )
    const scene = buildScene(split)

    expect(scene.slabs).toHaveLength(1)
    expect(scene.walls.map((w) => w.exposure)).toEqual(Array(5).fill('exterior'))
    expect(validatePlan(split).issues).toEqual([])
  })
})

describe('boundaries that are still wrong', () => {
  it('rejects two parallel walls that sit apart, naming both', () => {
    const stepped = planOf(
      [
        wall('a', [0, 0], [2, 0]),
        wall('b', [2, 0.5], [4, 0.5]),
        wall('c', [4, 0.5], [4, 3]),
        wall('d', [4, 3], [0, 3]),
        wall('e', [0, 3], [0, 0])
      ],
      ['a', 'b', 'c', 'd', 'e']
    )
    expect(() => polygonOf(stepped)).toThrow(/walls a and b are parallel/)
    expect(tryRoomPolygon(stepped.rooms[0]!, indexPlan(stepped))).toBeNull()
  })

  it('reports the right walls when a merge came before the failure', () => {
    // a and b merge; the failure is later, between d and e (parallel, apart).
    const broken = planOf(
      [
        wall('a', [0, 0], [2, 0]),
        wall('b', [2, 0], [4, 0]),
        wall('c', [4, 0], [4, 3]),
        wall('d', [4, 3], [2, 3]),
        wall('e', [2, 3.5], [0, 3.5])
      ],
      ['a', 'b', 'c', 'd', 'e']
    )
    expect(() => polygonOf(broken)).toThrow(/walls d and e are parallel/)
  })

  it('rejects walls that all lie on one line', () => {
    const flat = planOf(
      [wall('a', [0, 0], [1, 0]), wall('b', [1, 0], [2, 0]), wall('c', [2, 0], [3, 0])],
      ['a', 'b', 'c']
    )
    expect(() => polygonOf(flat)).toThrow()
  })
})
