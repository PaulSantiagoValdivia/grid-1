import { describe, expect, it } from 'vitest'
import type { FloorPlan, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { enclosedArea } from '../../test-support/referee'
import { outline, turn, type Point } from '../../test-support/outline'

/**
 * Rooms whose areas were worked out by hand, measured two ways: by Grid (`roomArea`) and by
 * the independent referee in `test-support/referee.ts`, which shares no code with Grid. Each
 * plan is also turned by 1, 45 and 180 degrees about `PIVOT`, which must not change its area.
 *
 * Every area is the floor between the inner faces of the walls (C3). Walls are 0.2 m thick
 * unless a case says otherwise, so an inner face sits 0.1 m inside the centre line.
 *
 * The referee must agree with the hand figure everywhere: if it does not, the referee is
 * wrong. Where Grid disagrees today, the case is listed in GRID_DISAGREES with the lab entry
 * it shows, and runs as an expected failure until that fix lands.
 */

interface Space {
  readonly room: Room
  /** A point inside the room, before turning. */
  readonly seed: Point
  readonly area: number
}

interface Case {
  readonly name: string
  readonly walls: (deg: number) => Wall[]
  readonly spaces: readonly Space[]
}

/**
 * Every plan is turned about this point, away from the origin and from every room, so that a
 * turn also moves the plan.
 */
const PIVOT: Point = [3.7, -2.3]
const spin = ([x, y]: Point, deg: number): Point => {
  const [dx, dy] = turn([x - PIVOT[0], y - PIVOT[1]], deg)
  return [dx + PIVOT[0], dy + PIVOT[1]]
}
const ring = (points: Point[], thickness?: number[]) => (deg: number) =>
  outline(points, { thickness }).walls.map((w) => ({ ...w, start: spin(w.start, deg), end: spin(w.end, deg) }))
const r1 = (points: Point[]) => outline(points).room

const L: Point[] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]
const T: Point[] = [[2, 0], [4, 0], [4, 3], [6, 3], [6, 5], [0, 5], [0, 3], [2, 3]]
const U: Point[] = [[0, 0], [6, 0], [6, 5], [4, 5], [4, 2], [2, 2], [2, 5], [0, 5]]
const Z: Point[] = [[0, 0], [4, 0], [4, 2], [6, 2], [6, 5], [2, 5], [2, 3], [0, 3]]
const RECT: Point[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
const RUN: Point[] = [[0, 0], [2.5, 0], [5, 0], [5, 4], [0, 4]]

/**
 * A house round a courtyard. Outer walls on the 8 x 8 square, the courtyard's walls on the
 * square from (3, 3) to (5, 5), and two 0.1 m partitions on x = 4 that split the house into a
 * west and an east room, each shaped like a C around the courtyard.
 */
function courtyard(deg: number): Wall[] {
  const w = (id: string, start: Point, end: Point, thickness = 0.2): Wall => ({
    id, start: spin(start, deg), end: spin(end, deg), thickness, height: 2.7, kind: 'exterior'
  })
  return [
    w('o1', [0, 0], [8, 0]), w('o2', [8, 0], [8, 8]), w('o3', [8, 8], [0, 8]), w('o4', [0, 8], [0, 0]),
    w('c1', [3, 3], [5, 3]), w('c2', [5, 3], [5, 5]), w('c3', [5, 5], [3, 5]), w('c4', [3, 5], [3, 3]),
    w('p1', [4, 0], [4, 3], 0.1), w('p2', [4, 5], [4, 8], 0.1)
  ]
}
const room = (id: string, boundary: string[]): Room => ({ id, name: id, boundary })

const CROSS: Point[] = [
  [2, 0], [4, 0], [4, 2], [6, 2], [6, 4], [4, 4], [4, 6], [2, 6], [2, 4], [0, 4], [0, 2], [2, 2]
]
const H: Point[] = [
  [0, 0], [2, 0], [2, 2], [4, 2], [4, 0], [6, 0], [6, 6], [4, 6], [4, 4], [2, 4], [2, 6], [0, 6]
]
const STEPS: Point[] = [[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [2, 4], [2, 6], [0, 6]]

/**
 * The lab's listing flat (AU2-3), whose plan keeps every room size. The outside walls are
 * 0.3 m on centre lines 0.15 m outside the floor, so the floor starts at x = 0 and y = 0.
 * Bedroom 1, the kitchen and the bathroom sit along the south side, the hall runs east to
 * west above them, and the lounge and bedroom 2 sit along the north. The east side steps in
 * above the hall, and the north side steps up over the lounge.
 *
 * The hall's outline, along the inner faces, has nine walls and three inside corners:
 * y 3.30 above bedroom 1 to x 4.20, down to y 3.10 above the kitchen to x 6.70, down to
 * y 2.10 above the bathroom to the east wall at x 8.40, up to y 4.40 and back west to x 0.
 * The rectangle x 0 to 8.40 by y 2.10 to 4.40 is 19.32, less x 0 to 4.20 by y 2.10 to 3.30
 * (5.04) and x 4.20 to 6.70 by y 2.10 to 3.10 (2.50): 11.78. Before ARE-1 Grid read 12.54.
 * The six rooms add up to 60.07.
 */
function listingFlat(deg: number): Wall[] {
  const w = (id: string, start: Point, end: Point, thickness: number): Wall => ({
    id, start: spin(start, deg), end: spin(end, deg), thickness, height: 2.7, kind: thickness > 0.2 ? 'exterior' : 'partition'
  })
  return [
    w('ext-s', [-0.15, -0.15], [8.55, -0.15], 0.3),
    w('ext-e1', [8.55, -0.15], [8.55, 4.55], 0.3),
    w('ext-step-e', [8.55, 4.55], [7.45, 4.55], 0.3),
    w('ext-e2', [7.45, 4.55], [7.45, 7.75], 0.3),
    w('ext-n2', [7.45, 7.75], [4.65, 7.75], 0.3),
    w('ext-e3', [4.65, 7.75], [4.65, 8.25], 0.3),
    w('ext-n1', [4.65, 8.25], [-0.15, 8.25], 0.3),
    w('ext-w', [-0.15, 8.25], [-0.15, -0.15], 0.3),
    w('bed1-n', [-0.15, 3.25], [4.15, 3.25], 0.1),
    w('bed1-e', [4.15, -0.15], [4.15, 3.25], 0.1),
    w('kit-n', [4.15, 3.05], [6.65, 3.05], 0.1),
    w('kit-e', [6.65, -0.15], [6.65, 3.05], 0.1),
    w('bath-n', [6.65, 2.05], [8.55, 2.05], 0.1),
    w('hall-n', [-0.15, 4.45], [7.45, 4.45], 0.1),
    w('lounge-e', [4.55, 4.45], [4.55, 7.75], 0.1)
  ]
}
const LISTING_ROOMS: readonly Space[] = [
  // x 0 to 4.10 by y 0 to 3.20.
  { room: room('bed1', ['ext-s', 'bed1-e', 'bed1-n', 'ext-w']), seed: [2, 1.5], area: 13.12 },
  // x 4.20 to 6.60 by y 0 to 3.00.
  { room: room('kitchen', ['ext-s', 'kit-e', 'kit-n', 'bed1-e']), seed: [5.4, 1.5], area: 7.2 },
  // x 6.70 to 8.40 by y 0 to 2.00.
  { room: room('bath', ['ext-s', 'ext-e1', 'bath-n', 'kit-e']), seed: [7.5, 1], area: 3.4 },
  {
    room: room('hall', ['bed1-n', 'bed1-e', 'kit-n', 'kit-e', 'bath-n', 'ext-e1', 'ext-step-e', 'hall-n', 'ext-w']),
    seed: [2, 3.9],
    area: 11.78
  },
  // x 0 to 4.50 by y 4.50 to 8.10. The partition and the stepped outside wall share the face x = 4.50.
  { room: room('lounge', ['hall-n', 'lounge-e', 'ext-e3', 'ext-n1', 'ext-w']), seed: [2, 6], area: 16.2 },
  // x 4.60 to 7.30 by y 4.50 to 7.60.
  { room: room('bed2', ['hall-n', 'ext-e2', 'ext-n2', 'lounge-e']), seed: [6, 6], area: 8.37 }
]

const CASES: readonly Case[] = [
  {
    // Inner outline 0.1 m in. The 5.8 x 2.8 band along the bottom, plus the 2.8 x 3.0 arm
    // above it: 16.24 + 8.40 = 24.64.
    name: 'L',
    walls: ring(L),
    spaces: [{ room: r1(L), seed: [1, 1], area: 24.64 }]
  },
  {
    // The bar on top, x 0.1 to 5.9 by y 3.1 to 4.9: 5.8 x 1.8 = 10.44. The stem below it,
    // x 2.1 to 3.9 by y 0.1 to 3.1: 1.8 x 3.0 = 5.40. Together 15.84.
    name: 'T',
    walls: ring(T),
    spaces: [{ room: r1(T), seed: [3, 1], area: 15.84 }]
  },
  {
    // The base, x 0.1 to 5.9 by y 0.1 to 1.9: 5.8 x 1.8 = 10.44. Each arm, 1.8 wide from
    // y 1.9 to 4.9: 1.8 x 3.0 = 5.40, twice. Together 21.24.
    name: 'U',
    walls: ring(U),
    spaces: [{ room: r1(U), seed: [1, 1], area: 21.24 }]
  },
  {
    // In bands of y: 0.1 to 2.1 runs x 0.1 to 3.9, 3.8 x 2.0 = 7.60; 2.1 to 2.9 runs the full
    // x 0.1 to 5.9, 5.8 x 0.8 = 4.64; 2.9 to 4.9 runs x 2.1 to 5.9, 3.8 x 2.0 = 7.60.
    // Together 19.84.
    name: 'Z',
    walls: ring(Z),
    spaces: [{ room: r1(Z), seed: [1, 1], area: 19.84 }]
  },
  {
    // West room: x 0.1 to 3.95 (the partition's face) by y 0.1 to 7.9 is 3.85 x 7.8 = 30.03,
    // less the courtyard block that reaches into it, x 2.9 to 3.95 by y 2.9 to 5.1,
    // 1.05 x 2.2 = 2.31. That leaves 27.72, and the east room is its mirror image.
    // The courtyard itself, x and y 3.1 to 4.9: 1.8 x 1.8 = 3.24.
    name: 'courtyard',
    walls: courtyard,
    spaces: [
      { room: room('west', ['o1', 'p1', 'c1', 'c4', 'c3', 'p2', 'o3', 'o4']), seed: [1, 4], area: 27.72 },
      { room: room('east', ['o1', 'o2', 'o3', 'p2', 'c3', 'c2', 'c1', 'p1']), seed: [7, 4], area: 27.72 },
      { room: room('open', ['c1', 'c2', 'c3', 'c4']), seed: [4, 4], area: 3.24 }
    ]
  },
  {
    // 0.5 m walls, so the faces sit 0.25 m in: 4.5 x 3.5 = 15.75.
    name: 'thick-walled rectangle',
    walls: ring(RECT, [0.5, 0.5, 0.5, 0.5]),
    spaces: [{ room: r1(RECT), seed: [1, 1], area: 15.75 }]
  },
  {
    // The L with 0.5 m walls. The band along the bottom, x 0.25 to 5.75 by y 0.25 to 2.75:
    // 5.5 x 2.5 = 13.75. The arm, x 0.25 to 2.75 by y 2.75 to 5.75: 2.5 x 3.0 = 7.50.
    // Together 21.25.
    name: 'thick-walled L',
    walls: ring(L, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    spaces: [{ room: r1(L), seed: [1, 1], area: 21.25 }]
  },
  {
    // Bottom 0.3, right 0.1, top 0.2, left 0.4: x 0.2 to 4.95 by y 0.15 to 3.9,
    // 4.75 x 3.75 = 17.8125.
    name: 'rectangle with four wall thicknesses',
    walls: ring(RECT, [0.3, 0.1, 0.2, 0.4]),
    spaces: [{ room: r1(RECT), seed: [1, 1], area: 17.8125 }]
  },
  {
    // The L with 0.3 m outer walls and 0.1 m walls on the two sides of the inside corner.
    // The band along the bottom, x 0.15 to 5.85 by y 0.15 to 2.95: 5.7 x 2.8 = 15.96.
    // The arm, x 0.15 to 2.95 by y 2.95 to 5.85: 2.8 x 2.9 = 8.12. Together 24.08.
    name: 'L with two wall thicknesses',
    walls: ring(L, [0.3, 0.3, 0.1, 0.1, 0.3, 0.3]),
    spaces: [{ room: r1(L), seed: [1, 1], area: 24.08 }]
  },
  {
    // The bottom side is two walls in line, 0.3 m then 0.1 m, so its face steps from
    // y 0.15 to y 0.05 at x 2.5. Others 0.2. West half, x 0.1 to 2.5 by y 0.15 to 3.9:
    // 2.4 x 3.75 = 9.00. East half, x 2.5 to 4.9 by y 0.05 to 3.9: 2.4 x 3.85 = 9.24.
    // Together 18.24.
    name: 'rectangle with a stepped side',
    walls: ring(RUN, [0.3, 0.1, 0.2, 0.2, 0.2]),
    spaces: [{ room: r1(RUN), seed: [1, 1], area: 18.24 }]
  },
  {
    // Four inside corners. The bar across, x 0.1 to 5.9 by y 2.1 to 3.9: 5.8 x 1.8 = 10.44.
    // The bar up and down, x 2.1 to 3.9 by y 0.1 to 5.9, the same 10.44. They share the
    // 1.8 x 1.8 = 3.24 in the middle. Together 17.64.
    name: 'cross',
    walls: ring(CROSS),
    spaces: [{ room: r1(CROSS), seed: [3, 1], area: 17.64 }]
  },
  {
    // Four inside corners. Each leg, x 0.1 to 1.9 (or 4.1 to 5.9) by y 0.1 to 5.9:
    // 1.8 x 5.8 = 10.44, twice. The bar between them, x 1.9 to 4.1 by y 2.1 to 3.9:
    // 2.2 x 1.8 = 3.96. Together 24.84.
    name: 'H',
    walls: ring(H),
    spaces: [{ room: r1(H), seed: [1, 1], area: 24.84 }]
  },
  {
    // Two inside corners, as a flight of steps. In bands of y: 0.1 to 1.9 runs x 0.1 to 5.9,
    // 5.8 x 1.8 = 10.44; 1.9 to 3.9 runs x 0.1 to 3.9, 3.8 x 2.0 = 7.60; 3.9 to 5.9 runs
    // x 0.1 to 1.9, 1.8 x 2.0 = 3.60. Together 21.64.
    name: 'steps',
    walls: ring(STEPS),
    spaces: [{ room: r1(STEPS), seed: [1, 1], area: 21.64 }]
  },
  {
    // A flat of six rooms whose hall has nine sides and three inside corners (lab AU2-3).
    // Outside walls 0.3 m on their centre lines; partitions 0.1 m. See `listingFlat`.
    name: 'flat with a nine-sided hall',
    walls: listingFlat,
    spaces: LISTING_ROOMS
  }
]

const TURNS = [0, 1, 45, 180] as const

/**
 * Where Grid's area disagrees with the hand figure today, and the lab entry it shows, keyed
 * "case / room / turn". Such a case runs as an expected failure. Remove its line when its
 * fix lands: the test then runs as a normal test.
 *
 * Empty since ARE-1. It listed 29 cases of AR-1 (a room with an inside corner took the
 * outer face of some walls and read too large), AR-14 (how far off it read depended on how
 * the plan was turned) and MS-7 (two walls in line with different thicknesses made no
 * corner). Each wall's face is now chosen from the outline.
 */
const GRID_DISAGREES: Readonly<Record<string, string>> = {}

describe.each(CASES)('$name', ({ name, walls, spaces }) => {
  describe.each(spaces)('room $room.id, $area m² by hand', ({ room, seed, area }) => {
    it.each(TURNS)('the referee agrees, turned %i°', (deg) => {
      expect(enclosedArea(walls(deg), spin(seed, deg))).toBeCloseTo(area, 6)
    })

    for (const deg of TURNS) {
      const key = `${name} / ${room.id} / ${deg}`
      const title = `Grid agrees, turned ${deg}°`
      const run = () => {
        const plan: FloorPlan = { version: '1', units: 'm', walls: walls(deg), rooms: spaces.map((s) => s.room), openings: [] }
        expect(roomArea(room, indexPlan(plan))).toBeCloseTo(area, 4)
      }
      if (GRID_DISAGREES[key]) it.fails(`${title} (expected failure, ${GRID_DISAGREES[key]})`, run)
      else it(title, run)
    }
  })
})
