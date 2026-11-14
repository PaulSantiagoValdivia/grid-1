import { describe, expect, it } from 'vitest'
import type { Floor, FloorPlan, Opening, Room, Wall } from '../../plan'
import { toIfc } from '../ifc'

/**
 * IFC golden files: whole documents, compared byte for byte.
 *
 * `ifc.test.ts` checks what a file means; these pin what it is. They exist so
 * that moving code (the storey stacking rule, into `elevations.ts`) can be
 * proven to change nothing, and so that a deliberate change (slabs) shows up as
 * a reviewable diff of real files rather than a list of updated expectations.
 *
 * A difference here is a failure, never something to accept with `-u` in
 * passing: regenerate only in a commit whose purpose is to change the file, and
 * read the diff of the `.ifc` files before committing it.
 */

const OPTIONS = {
  projectId: 'golden-project',
  projectName: 'Golden plan',
  timestamp: new Date('2026-11-11T12:00:00Z')
} as const

const wall = (
  id: string,
  floor: string | undefined,
  start: [number, number],
  end: [number, number],
  height: number,
  extra: Partial<Wall> = {}
): Wall => ({
  id,
  start,
  end,
  thickness: 0.2,
  height,
  kind: 'exterior',
  ...(floor === undefined ? {} : { floor }),
  ...extra
})

/**
 * A 6 m by 4 m box on one floor, as four walls counter-clockwise, one room and
 * a door on its south wall. Ids are prefixed by the floor, so they stay unique
 * across the whole file.
 */
function box(
  floor: string | undefined,
  prefix: string,
  height: number,
  name: string
): { walls: Wall[]; rooms: Room[]; openings: Opening[] } {
  const w = (n: number): string => `${prefix}-w${n}`
  return {
    walls: [
      wall(w(1), floor, [0, 0], [6, 0], height),
      wall(w(2), floor, [6, 0], [6, 4], height),
      wall(w(3), floor, [6, 4], [0, 4], height),
      wall(w(4), floor, [0, 4], [0, 0], height)
    ],
    rooms: [{ id: `${prefix}-r1`, name, boundary: [w(1), w(2), w(3), w(4)], ...(floor ? { floor } : {}) }],
    openings: [
      { id: `${prefix}-d1`, wall: w(1), type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 },
      { id: `${prefix}-win1`, wall: w(3), type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 }
    ]
  }
}

function planOf(floors: Floor[] | undefined, parts: ReturnType<typeof box>[]): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: parts.flatMap((p) => p.walls),
    rooms: parts.flatMap((p) => p.rooms),
    openings: parts.flatMap((p) => p.openings),
    ...(floors ? { floors } : {})
  }
}

const GROUND: Floor = { id: 'ground', name: 'Ground floor', level: 0 }
const FIRST: Floor = { id: 'first', name: 'First floor', level: 1 }
const SECOND: Floor = { id: 'second', name: 'Second floor', level: 2 }
const BASEMENT: Floor = { id: 'basement', name: 'Basement', level: -1 }

function oddWalls(): FloorPlan {
  const ground = box('ground', 'g', 2.7, 'Hall')
  const first = box('first', 'f', 2.7, 'Bedroom')
  // The tallest wall on the ground floor is virtual, and the next tallest is
  // zero-length, which validation reports broken: neither may raise the storey.
  ground.walls.push(wall('g-virtual', 'ground', [3, 0], [3, 4], 9, { virtual: true, kind: 'interior' }))
  ground.walls.push(wall('g-zero', 'ground', [1, 1], [1, 1], 8, { kind: 'interior' }))
  return planOf([GROUND, FIRST], [ground, first])
}

const FIXTURES: Record<string, () => FloorPlan> = {
  'one-floor': () => planOf(undefined, [box(undefined, 'g', 2.7, 'Living room')]),
  'three-floors': () =>
    planOf(
      [GROUND, FIRST, SECOND],
      [
        box('ground', 'g', 3.0, 'Living room'),
        box('first', 'f', 2.8, 'Bedroom'),
        box('second', 's', 2.8, 'Studio')
      ]
    ),
  'basement': () =>
    planOf(
      [BASEMENT, GROUND, FIRST],
      [
        box('basement', 'b', 2.5, 'Cellar'),
        box('ground', 'g', 3.0, 'Kitchen'),
        box('first', 'f', 2.8, 'Bedroom')
      ]
    ),
  'odd-walls': oddWalls
}

describe('IFC golden files', () => {
  for (const [name, plan] of Object.entries(FIXTURES)) {
    it(`${name}.ifc is unchanged, byte for byte`, async () => {
      await expect(toIfc(plan(), OPTIONS)).toMatchFileSnapshot(`./golden/${name}.ifc`)
    })
  }
})
