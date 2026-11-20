import { describe, expect, it } from 'vitest'
import type { FloorPlan, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { enclosedArea } from '../../test-support/referee'
import { outline, turn, type Point } from '../../test-support/outline'

/**
 * Rooms whose areas were worked out by hand, measured two ways: by Grid (`roomArea`) and by
 * the independent referee in `test-support/referee.ts`, which shares no code with Grid. Each
 * room is also turned by 1, 45 and 180 degrees, which must not change its area.
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

const ring = (points: Point[], thickness?: number[]) => (deg: number) => outline(points, { thickness, rotate: deg }).walls
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
    id, start: turn(start, deg), end: turn(end, deg), thickness, height: 2.7, kind: 'exterior'
  })
  return [
    w('o1', [0, 0], [8, 0]), w('o2', [8, 0], [8, 8]), w('o3', [8, 8], [0, 8]), w('o4', [0, 8], [0, 0]),
    w('c1', [3, 3], [5, 3]), w('c2', [5, 3], [5, 5]), w('c3', [5, 5], [3, 5]), w('c4', [3, 5], [3, 3]),
    w('p1', [4, 0], [4, 3], 0.1), w('p2', [4, 5], [4, 8], 0.1)
  ]
}
const room = (id: string, boundary: string[]): Room => ({ id, name: id, boundary })

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
  }
]

const TURNS = [0, 1, 45, 180] as const

/**
 * Where Grid's area disagrees with the hand figure today, and the lab entry it shows.
 * Remove a line when its fix lands: the test then runs as a normal test.
 *
 * AR-1: a room with an inside corner takes the outer face of some walls, so it reads too
 * large (the L 25.80, the T 16.64, the U 22.80, each courtyard room 28.14).
 * AR-14: how far off it reads depends on how the plan is turned (the L 25.80 as drawn,
 * 25.24 at 1° and 180°, right only at 45°).
 * MS-7: two walls in line with different thicknesses make no corner, so the room cannot be
 * measured at all.
 */
const disagree = (name: string, room: string, turns: readonly number[], entry: string) =>
  turns.map((deg) => [`${name} / ${room} / ${deg}`, entry] as const)
const GRID_DISAGREES: Readonly<Record<string, string>> = Object.fromEntries([
  ...disagree('L', 'r1', [0, 1, 180], 'AR-1, AR-14'),
  ...disagree('T', 'r1', [0, 1, 45, 180], 'AR-1'),
  ...disagree('U', 'r1', [0, 1, 45, 180], 'AR-1'),
  ...disagree('courtyard', 'west', [0, 1, 45, 180], 'AR-1'),
  ...disagree('courtyard', 'east', [0, 1, 45, 180], 'AR-1'),
  ...disagree('thick-walled L', 'r1', [0, 1, 180], 'AR-1, AR-14'),
  ...disagree('L with two wall thicknesses', 'r1', [0, 1, 180], 'AR-1, AR-14'),
  ...disagree('rectangle with a stepped side', 'r1', [0, 1, 45, 180], 'MS-7')
])

describe.each(CASES)('$name', ({ name, walls, spaces }) => {
  describe.each(spaces)('room $room.id, $area m² by hand', ({ room, seed, area }) => {
    it.each(TURNS)('the referee agrees, turned %i°', (deg) => {
      expect(enclosedArea(walls(deg), turn(seed, deg))).toBeCloseTo(area, 6)
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
