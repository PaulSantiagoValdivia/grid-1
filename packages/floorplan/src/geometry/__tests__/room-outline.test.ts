import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { indexPlan } from '../plan'
import { RoomOutlineError, roomArea, roomOutline, roomPolygon, tryRoomPolygon } from '../room'
import { wallExposure } from '../exposure'
import { validatePlan } from '../validate'

/**
 * Rooms whose outline cannot be read off one point in the middle: inside
 * corners, dividing lines, walls in a row that differ, walls thicker than the
 * room, and wall lists in the wrong order. Every expected area below is worked
 * out by hand from the wall faces.
 */

type P = [number, number]

const wall = (id: string, start: P, end: P, thickness = 0.2, extra: Partial<Wall> = {}): Wall => ({
  id,
  start,
  end,
  thickness,
  height: 2.7,
  kind: 'exterior',
  ...extra
})

const planOf = (walls: Wall[], rooms: [string, string[]][]): FloorPlan => ({
  version: '1',
  units: 'm',
  walls,
  openings: [],
  rooms: rooms.map(([id, boundary]) => ({ id, name: id, boundary }))
})

const turned = (plan: FloorPlan, degrees: number): FloorPlan => {
  const a = (degrees * Math.PI) / 180
  const turn = ([x, y]: P): P => [x * Math.cos(a) - y * Math.sin(a) + 3, x * Math.sin(a) + y * Math.cos(a) - 2]
  return { ...plan, walls: plan.walls.map((w) => ({ ...w, start: turn(w.start as P), end: turn(w.end as P) })) }
}

const areaOf = (plan: FloorPlan, id = plan.rooms[0]!.id): number =>
  roomArea(plan.rooms.find((room) => room.id === id)!, indexPlan(plan))

/** A closed loop of walls through `points`, one thickness, one room over all of it. */
const loop = (points: P[], thickness = 0.2, order?: number[]): FloorPlan =>
  planOf(
    points.map((p, i) => wall(`w${i + 1}`, p, points[(i + 1) % points.length]!, thickness)),
    [['room', (order ?? points.map((_, i) => i)).map((i) => `w${i + 1}`)]]
  )

// 6 x 6 m on the axes with a 3 x 3 m bite out of the north-east corner.
const L: P[] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]
// Inside: 5.8 x 5.8 less the 3.0 x 3.0 the two inner walls stand in front of.
const L_AREA = 5.8 * 5.8 - 3 * 3

describe('a room with an inside corner', () => {
  it('measures an L between its wall faces', () => {
    expect(areaOf(loop(L))).toBeCloseTo(L_AREA, 9)
  })

  it.each([0.001, 1, 45, 90, 180, 270, 333])('measures the same L turned by %s degrees', (degrees) => {
    expect(areaOf(turned(loop(L), degrees))).toBeCloseTo(L_AREA, 9)
  })

  it('does not care which way the walls were drawn or the list runs', () => {
    const plan = loop(L)
    const flipped = { ...plan, walls: plan.walls.map((w, i) => (i % 2 ? { ...w, start: w.end, end: w.start } : w)) }
    expect(areaOf(flipped)).toBeCloseTo(L_AREA, 9)
    const reversed = { ...plan, rooms: [{ ...plan.rooms[0]!, boundary: [...plan.rooms[0]!.boundary].reverse() }] }
    expect(areaOf(reversed)).toBeCloseTo(L_AREA, 9)
    expect(roomPolygon(reversed.rooms[0]!, indexPlan(reversed))).toHaveLength(6)
  })

  it('measures a thin-armed L, where the old reference point fell outside the room', () => {
    // Arms 1 m wide on the axes, 0.9 m walls: each arm is 0.1 m wide inside.
    const thin: P[] = [[0, 0], [6, 0], [6, 1], [1, 1], [1, 6], [0, 6]]
    expect(areaOf(loop(thin, 0.9))).toBeCloseTo(5.1 * 0.1 + 5.1 * 0.1 - 0.1 * 0.1, 9)
  })

  it('measures a U, a T and a Z', () => {
    const U: P[] = [[0, 0], [9, 0], [9, 6], [6, 6], [6, 2], [3, 2], [3, 6], [0, 6]]
    expect(areaOf(loop(U))).toBeCloseTo(8.8 * 1.8 + 2 * (2.8 * 4), 9)
    const T: P[] = [[0, 4], [3, 4], [3, 0], [6, 0], [6, 4], [9, 4], [9, 6], [0, 6]]
    expect(areaOf(loop(T))).toBeCloseTo(8.8 * 1.8 + 2.8 * 4, 9)
    const Z: P[] = [[0, 3], [3, 3], [3, 0], [9, 0], [9, 3], [6, 3], [6, 6], [0, 6]]
    expect(areaOf(loop(Z))).toBeCloseTo(5.8 * 2.8 + 5.8 * 2.8 + 2.8 * 0.2, 9)
  })

  it('reads a partition in the notch of an L as interior', () => {
    // A bedroom fills the bite of the L. The two partitions have a room on each side.
    const walls = [
      wall('s', [0, 0], [6, 0]),
      wall('e', [6, 0], [6, 6]),
      wall('n', [6, 6], [0, 6]),
      wall('w', [0, 6], [0, 0]),
      wall('p1', [6, 3], [3, 3], 0.1, { kind: 'partition' }),
      wall('p2', [3, 3], [3, 6], 0.1, { kind: 'partition' })
    ]
    const plan = planOf(walls, [
      ['living', ['s', 'e', 'p1', 'p2', 'n', 'w']],
      ['bed', ['p1', 'e', 'n', 'p2']]
    ])
    const index = indexPlan(plan)
    expect(wallExposure(index, 'p1')).toBe('interior')
    expect(wallExposure(index, 'p2')).toBe('interior')
    expect(wallExposure(index, 's')).toBe('exterior')
    expect(areaOf(plan, 'living') + areaOf(plan, 'bed')).toBeCloseTo(5.8 * 5.8 - 0.1 * 2.9 - 0.1 * 2.85 - 0.1 * 0.05, 9)
  })
})

describe('a dividing line has no width', () => {
  const walls = [
    wall('s', [0, 0], [8, 0]),
    wall('e', [8, 0], [8, 4]),
    wall('n', [8, 4], [0, 4]),
    wall('w', [0, 4], [0, 0]),
    wall('line', [4, 0], [4, 4], 0.2, { virtual: true, kind: 'interior' })
  ]
  const plan = planOf(walls, [
    ['kitchen', ['s', 'line', 'n', 'w']],
    ['dining', ['s', 'e', 'n', 'line']],
    ['both', ['s', 'e', 'n', 'w']]
  ])

  it('gives the two rooms either side all of the floor between them', () => {
    expect(areaOf(plan, 'kitchen')).toBeCloseTo(3.9 * 3.8, 9)
    expect(areaOf(plan, 'kitchen') + areaOf(plan, 'dining')).toBeCloseTo(areaOf(plan, 'both'), 9)
  })

  it('does not depend on the thickness written on the line', () => {
    const thick = { ...plan, walls: walls.map((w) => (w.virtual ? { ...w, thickness: 0.6 } : w)) }
    expect(areaOf(thick, 'kitchen')).toBeCloseTo(3.9 * 3.8, 9)
  })

  it('steps where a solid stub carries on as a line', () => {
    // The first 1.5 m of the divider is a 0.2 m wall; the rest is open.
    const stub = planOf(
      [
        ...walls.slice(0, 4),
        wall('stub', [4, 0], [4, 1.5], 0.2, { kind: 'interior' }),
        wall('open', [4, 1.5], [4, 4], 0.2, { virtual: true, kind: 'interior' })
      ],
      [
        ['kitchen', ['s', 'stub', 'open', 'n', 'w']],
        ['dining', ['s', 'e', 'n', 'open', 'stub']]
      ]
    )
    // Each room loses half the stub: 0.1 m wide, from the south face (y = 0.1) to its end.
    expect(areaOf(stub, 'kitchen')).toBeCloseTo(3.9 * 3.8 - 0.1 * 1.4, 9)
    expect(areaOf(stub, 'dining')).toBeCloseTo(3.9 * 3.8 - 0.1 * 1.4, 9)
    expect(validatePlan(stub).issues).toEqual([])
  })
})

describe('walls in a row with different thickness', () => {
  const sides = [wall('e', [8, 0], [8, 4]), wall('n', [8, 4], [0, 4]), wall('w', [0, 4], [0, 0])]
  // South side: 0.4 m for the first 5 m, then 0.1 m.
  const row = planOf([wall('thick', [0, 0], [5, 0], 0.4), wall('thin', [5, 0], [8, 0], 0.1), ...sides], [
    ['r', ['thick', 'thin', 'e', 'n', 'w']]
  ])
  // 7.8 m between the side walls; 3.7 m from the thick wall's face (y = 0.2) to the north face.
  const AREA = 7.8 * 3.7 + 2.9 * 0.15 // the thin stretch gives back 0.15 m over 2.9 m

  it('is one side with a step at the end of the thicker wall', () => {
    expect(areaOf(row)).toBeCloseTo(AREA, 9)
    expect(roomPolygon(row.rooms[0]!, indexPlan(row))).toHaveLength(6)
    expect(validatePlan(row).issues).toEqual([])
  })

  it('is the same turned, listed backwards, and starting mid-row', () => {
    expect(areaOf(turned(row, 37))).toBeCloseTo(AREA, 9)
    for (const boundary of [['w', 'n', 'e', 'thin', 'thick'], ['thin', 'e', 'n', 'w', 'thick']]) {
      expect(areaOf({ ...row, rooms: [{ ...row.rooms[0]!, boundary }] })).toBeCloseTo(AREA, 9)
    }
  })

  it('works with the outer faces flush instead of the axes in line', () => {
    // Thin wall moved out so both outer faces sit at y = -0.2: its axis is at y = -0.15.
    const flush = planOf(
      [wall('thick', [0, 0], [5, 0], 0.4), wall('thin', [5, -0.15], [8, -0.15], 0.1), wall('e', [8, -0.15], [8, 4]), ...sides.slice(1)],
      [['r', ['thick', 'thin', 'e', 'n', 'w']]]
    )
    expect(areaOf(flush)).toBeCloseTo(7.8 * 3.7 + 2.9 * 0.3, 9)
  })

  it('works when a surveyed row is a few millimetres off straight', () => {
    // The same room with the junction 8 mm off the line: the two walls are no longer parallel.
    const bent = planOf(
      [wall('thick', [0, 0], [5, 0.008], 0.4), wall('thin', [5, 0.008], [8, 0], 0.1), ...sides],
      [['r', ['thick', 'thin', 'e', 'n', 'w']]]
    )
    expect(Math.abs(areaOf(bent) - AREA)).toBeLessThan(0.05)
  })

  it('still rejects parallel walls that sit apart', () => {
    const apart = planOf(
      [wall('a', [0, 0], [5, 0]), wall('b', [5, 0.5], [8, 0.5]), wall('e', [8, 0.5], [8, 4]), ...sides.slice(1)],
      [['r', ['a', 'b', 'e', 'n', 'w']]]
    )
    expect(() => roomPolygon(apart.rooms[0]!, indexPlan(apart))).toThrow(/walls a and b are parallel/)
  })
})

describe('a room narrower than its walls', () => {
  const box = (width: number, depth: number, thickness: number): FloorPlan =>
    loop([[0, 0], [width, 0], [width, depth], [0, depth]], thickness)

  it.each([
    ['in one direction', box(0.2, 3, 0.3)],
    ['in both directions', box(0.2, 0.2, 0.3)],
    ['a long slot between thick walls', box(25, 0.3, 0.6)]
  ])('has no floor: %s', (_name, plan) => {
    const room = plan.rooms[0]!
    expect(tryRoomPolygon(room, indexPlan(plan))).toBeNull()
    const result = validatePlan(plan)
    expect(result.issues.map((issue) => issue.code)).toEqual(['room/inside-out'])
    expect(result.issues[0]!.message).toMatch(/has no floor/)
    expect(result.broken.has(room.id)).toBe(true)
  })

  it('reports an L whose arm is narrower than its walls', () => {
    const thin: P[] = [[0, 0], [6, 0], [6, 0.5], [3, 0.5], [3, 6], [0, 6]]
    expect(validatePlan(loop(thin, 0.6)).issues.map((issue) => issue.code)).toEqual(['room/inside-out'])
  })

  it('keeps a room with a short splay hidden behind two thick walls', () => {
    // A 5 cm splay across the south-east corner of a 5 x 4 m room with 0.4 m walls.
    const splay: P[] = [[0, 0], [4.95, 0], [5, 0.05], [5, 4], [0, 4]]
    const plan = loop(splay, 0.4)
    expect(validatePlan(plan).issues).toEqual([])
    expect(Math.abs(areaOf(plan) - 4.6 * 3.6)).toBeLessThan(0.01)
  })
})

describe('a wall list out of order', () => {
  // 5 x 4 m, each corner up to 3 cm out of square, as a measured building is.
  const surveyed: P[] = [[0.01, -0.02], [5.02, 0.01], [4.99, 4.03], [-0.02, 3.98]]

  it('measures the room when the list is in order', () => {
    expect(validatePlan(loop(surveyed)).issues).toEqual([])
    expect(Math.abs(areaOf(loop(surveyed)) - 4.8 * 3.8)).toBeLessThan(0.3)
  })

  it.each([[[0, 2, 1, 3]], [[1, 0, 2, 3]], [[0, 1, 3, 2]], [[2, 0, 1, 3]]])('refuses order %j instead of measuring kilometres', (order) => {
    const plan = loop(surveyed, 0.2, order)
    const result = validatePlan(plan)
    expect(result.issues.map((issue) => issue.code)).toEqual(['room/out-of-order'])
    expect(result.issues[0]!.message).toMatch(/out of order/)
    expect(result.broken.has('room')).toBe(true)
    const outline = roomOutline(plan.rooms[0]!, indexPlan(plan))
    expect(outline.fault).toBeInstanceOf(RoomOutlineError)
  })

  it('refuses a swapped pair in an L that is out of square', () => {
    const points = L.map(([x, y], i): P => [x + (i % 2 ? 0.013 : -0.017), y + (i % 3 ? -0.011 : 0.019)])
    const result = validatePlan(loop(points, 0.2, [0, 1, 3, 2, 4, 5]))
    expect(result.issues.map((issue) => issue.code)).toEqual(['room/out-of-order'])
  })

  it('still names the walls when they are exactly parallel', () => {
    const square: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
    const result = validatePlan(loop(square, 0.2, [0, 2, 1, 3]))
    expect(result.issues.map((issue) => issue.code)).toEqual(['room/unclosed'])
    expect(result.issues[0]!.message).toMatch(/walls w1 and w3 are parallel/)
  })
})
