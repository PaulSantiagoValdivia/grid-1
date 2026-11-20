import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { planFloors, planForFloor } from '../floors'
import { buildFloorPlan } from '../floorplan'
import { buildScene } from '../scene3d'
import { validatePlan } from '../validate'
import { parseFloorPlan } from '../../types/floorplan'
import { outline } from '../../test-support/outline'

/**
 * What the AI is going to get wrong.
 *
 * Producing valid plans consistently is the project's number one risk, so a
 * malformed plan is the normal case, not an edge case. The renderer must draw
 * what it can and report the rest — never break.
 */

/** A 4×4 room with a door that fits. */
function basePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w2', start: [4, 0], end: [4, 4], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w3', start: [4, 4], end: [0, 4], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, height: 2.1, sill: 0 }
    ]
  }
}

const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((i) => i.code)

describe('a sound plan passes clean', () => {
  it('reports nothing', () => {
    expect(codes(basePlan())).toEqual([])
  })
})

describe('geometrically impossible plans', () => {
  it('catches a door wider than its wall', () => {
    const plan = basePlan()
    plan.openings[0]!.width = 5
    expect(codes(plan)).toContain('opening/out-of-wall')
  })

  it('catches a door running past the far end', () => {
    const plan = basePlan()
    plan.openings[0]!.offset = 3.8
    expect(codes(plan)).toContain('opening/out-of-wall')
  })

  it('catches a window poking through the ceiling', () => {
    const plan = basePlan()
    plan.openings[0] = { ...plan.openings[0]!, type: 'window', sill: 1.8, height: 1.2 }
    expect(codes(plan)).toContain('opening/too-tall')
  })

  it('catches an opening on a wall that does not exist', () => {
    const plan = basePlan()
    plan.openings[0]!.wall = 'w99'
    expect(codes(plan)).toContain('opening/missing-wall')
  })

  it('catches two overlapping openings on the same wall', () => {
    const plan = basePlan()
    plan.openings.push({
      id: 'o2',
      wall: 'w1',
      type: 'window',
      offset: 1.9,
      width: 1,
      height: 1,
      sill: 0.9
    })
    expect(codes(plan)).toContain('opening/overlap')
  })

  it('skips an overlapping opening instead of drawing two holes in one place', () => {
    const plan = basePlan()
    plan.openings.push({ id: 'o2', wall: 'w1', type: 'window', offset: 1.9, width: 1, height: 1, sill: 0.9 })
    const { broken } = validatePlan(plan)
    // The opening nearer wall.start is kept; the one running into it is skipped.
    expect(broken.has('o1')).toBe(false)
    expect(broken.has('o2')).toBe(true)
    expect(buildFloorPlan(plan).openings.map((o) => o.id)).toEqual(['o1'])
    expect(buildScene(plan).issues.some((i) => i.code === 'opening/overlap')).toBe(true)
  })

  it('catches an opening that sits inside a wider one, not just its neighbour', () => {
    // A = [0.2, 3.2], B = [0.3, 0.7], C = [2.0, 2.4]: B and C both sit inside A.
    const plan = basePlan()
    plan.openings = [
      { id: 'A', wall: 'w1', type: 'window', offset: 0.2, width: 3, height: 1, sill: 0.9 },
      { id: 'B', wall: 'w1', type: 'window', offset: 0.3, width: 0.4, height: 1, sill: 0.9 },
      { id: 'C', wall: 'w1', type: 'window', offset: 2.0, width: 0.4, height: 1, sill: 0.9 }
    ]
    const { issues, broken } = validatePlan(plan)
    const flagged = issues.filter((i) => i.code === 'opening/overlap').map((i) => i.id)
    expect(flagged.sort()).toEqual(['B', 'C'])
    expect([...broken].filter((id) => ['A', 'B', 'C'].includes(id)).sort()).toEqual(['B', 'C'])
  })

  it('never draws two openings that overlap on one wall (invariant)', () => {
    // Every pair of drawn openings on a wall is disjoint, whatever the spans.
    const spans: Array<[number, number]> = [
      [0.1, 1], [0.5, 0.5], [1.2, 0.3], [1.4, 1.2], [2.5, 0.4], [2.6, 0.2], [3, 0.8]
    ]
    for (let mask = 1; mask < 1 << spans.length; mask++) {
      const plan = basePlan()
      plan.openings = spans
        .filter((_, i) => mask & (1 << i))
        .map(([offset, width], i) => ({ id: `o${i}`, wall: 'w1', type: 'window' as const, offset, width, height: 1, sill: 0.9 }))
      const drawn = buildFloorPlan(plan).openings
      const byId = new Map(plan.openings.map((o) => [o.id, o]))
      for (let i = 0; i < drawn.length; i++) {
        for (let j = i + 1; j < drawn.length; j++) {
          const a = byId.get(drawn[i]!.id)!
          const b = byId.get(drawn[j]!.id)!
          const disjoint = a.offset + a.width <= b.offset + 1e-9 || b.offset + b.width <= a.offset + 1e-9
          expect(disjoint, `${a.id} and ${b.id} overlap`).toBe(true)
        }
      }
    }
  })

  it('catches a zero-length wall', () => {
    const plan = basePlan()
    plan.walls[0]!.end = [0, 0]
    expect(codes(plan)).toContain('wall/zero-length')
  })

  it('catches a wall with no thickness that is not marked virtual', () => {
    const plan = basePlan()
    plan.walls[0]!.thickness = 0
    expect(codes(plan)).toContain('wall/no-thickness')
  })

  it('catches a room referencing a missing wall', () => {
    const plan = basePlan()
    plan.rooms[0]!.boundary = ['w1', 'w2', 'w3', 'w99']
    expect(codes(plan)).toContain('room/unclosed')
  })

  it('catches a boundary with consecutive parallel walls', () => {
    const plan = basePlan()
    plan.rooms[0]!.boundary = ['w1', 'w3', 'w2', 'w4']
    expect(codes(plan)).toContain('room/unclosed')
  })
})

describe('a broken plan still gets drawn, minus what fails', () => {
  it('skips the impossible opening but keeps wall and room', () => {
    const plan = basePlan()
    plan.openings[0]!.width = 5

    const drawing = buildFloorPlan(plan)

    expect(drawing.issues.length).toBeGreaterThan(0)
    expect(drawing.openings).toHaveLength(0)
    // The wall stays whole, without the opening that could not be cut.
    expect(drawing.walls.find((w) => w.id === 'w1')!.slices).toHaveLength(1)
    expect(drawing.rooms).toHaveLength(1)
  })

  it('skips the broken room but keeps the walls', () => {
    const plan = basePlan()
    plan.rooms[0]!.boundary = ['w1', 'w3', 'w2', 'w4']

    const drawing = buildFloorPlan(plan)

    expect(drawing.rooms).toHaveLength(0)
    expect(drawing.walls).toHaveLength(4)
  })

  it('never throws, however broken the plan is', () => {
    const plan = basePlan()
    plan.walls[1]!.end = [4, 0]
    plan.openings[0]!.offset = -10
    plan.rooms[0]!.boundary = ['w99']

    expect(() => buildFloorPlan(plan)).not.toThrow()
    expect(() => buildScene(plan)).not.toThrow()
  })
})

/**
 * Floors (C5).
 *
 * The flat `floor` field keeps ids globally unique, which the 3D mesh cache
 * depends on — but it also means nothing structurally stops a room on one
 * storey from naming a wall on another. These checks are that missing wall.
 */

/** The same 4×4 room, lifted onto a named floor, plus a second storey. */
function twoFloorPlan(): FloorPlan {
  const plan = basePlan()
  return {
    ...plan,
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls: [
      ...plan.walls.map((wall) => ({ ...wall, floor: 'ground' })),
      { id: 'f1', start: [0, 0] as [number, number], end: [4, 0] as [number, number], thickness: 0.2, height: 2.5, kind: 'exterior' as const, floor: 'first' }
    ],
    rooms: plan.rooms.map((room) => ({ ...room, floor: 'ground' }))
  }
}

describe('a room reaching onto another floor', () => {
  it('is reported once, as an error', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'first' // w1 leaves the ground floor, r1 still names it

    const crossFloor = validatePlan(plan).issues.filter((i) => i.code === 'room/cross-floor')

    expect(crossFloor).toHaveLength(1)
    expect(crossFloor[0]!.entity).toBe('room')
    expect(crossFloor[0]!.id).toBe('r1')
    expect(crossFloor[0]!.severity).toBe('error')
  })

  it('marks the room broken so the drawing skips it', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'first'

    expect(validatePlan(plan).broken.has('r1')).toBe(true)
    expect(buildFloorPlan(plan).rooms).toHaveLength(0)
  })

  it('does not also report it as unclosed — one fault, one issue', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'first'

    expect(codes(plan).filter((c) => c.startsWith('room/'))).toEqual(['room/cross-floor'])
  })
})

describe('a floor nobody declared', () => {
  it('warns on the wall that names it, without breaking it', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'attic'

    const unknown = validatePlan(plan).issues.filter((i) => i.code === 'wall/unknown-floor')

    expect(unknown).toHaveLength(1)
    expect(unknown[0]!.severity).toBe('warning')
    expect(validatePlan(plan).broken.has('w1')).toBe(false)
  })

  it('warns on a room that names it', () => {
    const plan = twoFloorPlan()
    plan.rooms[0]!.floor = 'attic'

    expect(codes(plan)).toContain('room/unknown-floor')
  })

  it('stays quiet when there is no registry to be absent from', () => {
    const plan = basePlan()
    plan.walls[0]!.floor = 'wherever'
    plan.rooms[0]!.floor = 'wherever'

    expect(codes(plan).filter((c) => c.endsWith('unknown-floor'))).toEqual([])
  })

  it('stays quiet when the registry is empty', () => {
    const plan = { ...basePlan(), floors: [] }
    plan.walls[0]!.floor = 'wherever'

    expect(codes(plan).filter((c) => c.endsWith('unknown-floor'))).toEqual([])
  })
})

describe('a registry that lists the same floor twice', () => {
  it('warns once, and the first entry is the one that counts', () => {
    const plan = {
      ...twoFloorPlan(),
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'ground', name: 'Duplicate', level: 9 }
      ]
    }

    const dupes = validatePlan(plan).issues.filter((i) => i.code === 'plan/duplicate-floor')

    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.entity).toBe('plan')
    expect(dupes[0]!.severity).toBe('warning')
  })
})

describe('floors do not disturb a sound plan', () => {
  it('leaves a well-formed two-floor plan clean', () => {
    expect(validatePlan(twoFloorPlan()).issues).toEqual([])
  })

  it('leaves a plan that never mentions floors exactly as it was', () => {
    expect(validatePlan(basePlan()).issues).toEqual([])
  })

  it('validates each floor of a sound plan clean on its own', () => {
    const plan = twoFloorPlan()

    for (const floor of planFloors(plan)) {
      expect(validatePlan(planForFloor(plan, floor.id)).issues).toEqual([])
    }
  })

  it('never throws on garbage floor values', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'nowhere'
    plan.rooms[0]!.floor = 'elsewhere'

    expect(() => validatePlan(plan)).not.toThrow()
    expect(() => buildFloorPlan(plan)).not.toThrow()
    expect(() => buildScene(plan)).not.toThrow()
  })
})

/**
 * Duplicate ids.
 *
 * Ids are the only handle anything has on anything else: `indexPlan` builds
 * `wallsById` with `set()`, so the last duplicate silently wins every lookup.
 * The assistant is told ids are unique across the whole file, but nothing
 * enforced it — and multi-floor plans make collisions easy, because the natural
 * mistake is to reuse `w1` on each storey.
 *
 * Marking them broken rather than picking a winner is the point: when two walls
 * answer to `w1`, nobody can know which one the room meant, and drawing one of
 * them is drawing something the user never described.
 */
describe('an id used twice', () => {
  /** The same plan with `w2` renamed to `w1`, so two walls answer to `w1`. */
  function duplicateWallPlan(): FloorPlan {
    const plan = basePlan()
    plan.walls[1]!.id = 'w1'
    plan.rooms[0]!.boundary = ['w1', 'w1', 'w3', 'w4']
    return plan
  }

  it('is reported once, as an error, however many entities share it', () => {
    const plan = basePlan()
    plan.walls[1]!.id = 'w1'
    plan.walls[2]!.id = 'w1'

    const dupes = validatePlan(plan).issues.filter((i) => i.code === 'plan/duplicate-id')

    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.id).toBe('w1')
    expect(dupes[0]!.severity).toBe('error')
  })

  it('marks the id broken, so nothing is drawn from a guess', () => {
    const { broken } = validatePlan(duplicateWallPlan())

    expect(broken.has('w1')).toBe(true)
    expect(buildFloorPlan(duplicateWallPlan()).walls.map((w) => w.id)).not.toContain('w1')
  })

  it('takes the room resting on it down too, rather than drawing half a room', () => {
    // A boundary that still closes perfectly: every id resolves, the polygon is
    // sound, and the only thing wrong is that `w1` names two walls. Without the
    // collision this room draws clean, so nothing but the duplicate can fault it.
    const plan = twoFloorPlan()
    plan.walls[4]!.id = 'w1'

    expect(validatePlan(plan).broken.has('r1')).toBe(true)
    expect(buildFloorPlan(plan).rooms).toHaveLength(0)
  })

  it('reports the duplicate itself, not a bogus unclosed room', () => {
    const plan = twoFloorPlan()
    plan.walls[4]!.id = 'w1'

    expect(codes(plan).filter((c) => c.startsWith('room/'))).toEqual(['room/broken-wall'])
  })

  it('catches a collision between two different kinds of entity', () => {
    // `broken` is one flat set of ids, so a room named after a wall inherits
    // that wall's fate. The namespace is the whole file, not one array.
    const plan = basePlan()
    plan.rooms[0]!.id = 'w1'

    expect(codes(plan)).toContain('plan/duplicate-id')
  })

  it('catches two openings sharing an id', () => {
    const plan = basePlan()
    plan.openings.push({ ...plan.openings[0]!, offset: 2.6 })

    expect(codes(plan)).toContain('plan/duplicate-id')
  })

  it('does not blame the cross-floor check for an ambiguous lookup', () => {
    // `wallsById` would resolve the room's `w1` to whichever came last — which
    // may sit on another floor. Reporting that as `room/cross-floor` would be a
    // coin flip dressed up as a diagnosis.
    const plan = twoFloorPlan()
    plan.walls[4]!.id = 'w1' // the first-floor wall now collides with a ground one

    expect(codes(plan)).toContain('plan/duplicate-id')
    expect(codes(plan)).not.toContain('room/cross-floor')
  })

  it('stays quiet on a plan whose ids are all distinct', () => {
    expect(codes(basePlan())).not.toContain('plan/duplicate-id')
    expect(codes(twoFloorPlan())).not.toContain('plan/duplicate-id')
  })

  it('never throws', () => {
    const plan = duplicateWallPlan()

    expect(() => validatePlan(plan)).not.toThrow()
    expect(() => buildFloorPlan(plan)).not.toThrow()
    expect(() => buildScene(plan)).not.toThrow()
  })
})

/**
 * Floor ids are compared exactly, so `"Ground"` and `"ground"` are two floors.
 *
 * Deliberately a warning and not a normalisation: folding them together would
 * silently merge two storeys the file keeps apart, and which name then wins is
 * unanswerable. C5 is a closed convention — changing how a floor id is matched
 * is a team decision, not a bug fix. Saying so out loud is the part that
 * belongs here.
 */
describe('floor ids that differ only by case or spacing', () => {
  it('warns, naming both, without merging them', () => {
    const plan = {
      ...twoFloorPlan(),
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'Ground ', name: 'Ground floor again', level: 1 }
      ]
    }

    const similar = validatePlan(plan).issues.filter((i) => i.code === 'plan/similar-floor-id')

    expect(similar).toHaveLength(1)
    expect(similar[0]!.severity).toBe('warning')
    expect(similar[0]!.message).toContain('Ground ')
    expect(planFloors(plan).map((f) => f.id)).toContain('Ground ')
  })

  it('says nothing when the ids are properly distinct', () => {
    expect(codes(twoFloorPlan())).not.toContain('plan/similar-floor-id')
  })
})

/**
 * Known failures from the lab (entry Z-4), as expected failures. Each states the right
 * behaviour and fails today; when its fix lands, vitest reports it, and `it.fails` becomes
 * `it`. Each title starts with its lab entry ID.
 */
describe('known failures (expected to fail until fixed)', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const issuesOf = (plan: FloorPlan) => validatePlan(plan).issues
  const divider = { id: 'v', start: [2.5, 0] as P, end: [2.5, 4] as P, virtual: true, height: 2.7 }

  it.fails('AR-4 a room listed twice is reported', () => {
    const { walls, room } = outline(RECT)
    expect(issuesOf(planOf({ walls, rooms: [room, { ...room, id: 'r2', name: 'Again' }] })).length).toBeGreaterThan(0)
  })

  it.fails('MS-3 a wall 27 m high in a house is worth a warning', () => {
    const { walls, room } = outline(RECT)
    walls[0] = { ...walls[0]!, height: 27 }
    expect(issuesOf(planOf({ walls, rooms: [room] })).length).toBeGreaterThan(0)
  })

  it.fails('MS-8 a door on a virtual wall is reported', () => {
    const { walls, room } = outline(RECT)
    const plan = planOf({
      walls: [...walls, divider],
      rooms: [room],
      openings: [{ id: 'd', wall: 'v', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
    })
    // About the door itself. The dividing line also splits the room, which ARE-4 reports as a
    // room that does not match its space; that line is not what this probe asks for.
    expect(issuesOf(plan).some((i) => i.entity === 'opening' && i.id === 'd')).toBe(true)
  })

  it.fails('MS-9 two ids that differ only by a trailing space are reported', () => {
    const { walls, room } = outline(RECT)
    const plan = planOf({ walls: [...walls, { ...walls[0]!, id: 'w1 ', start: [10, 10], end: [12, 10] }], rooms: [room] })
    expect(issuesOf(plan).length).toBeGreaterThan(0)
  })

  // Lab MS-10 (as corrected by the lab): with a floors list the warning already fires
  // ('a floor nobody declared', above); without one it does not.
  it.fails('MS-10 a misspelt floor is reported when the plan lists no floors', () => {
    const { walls, room } = outline(RECT)
    const plan = planOf({
      walls: walls.map((w, i) => ({ ...w, floor: i === 0 ? 'frist' : 'first' })),
      rooms: [{ ...room, floor: 'first' }]
    })
    expect(issuesOf(plan).some((i) => /frist/.test(i.message))).toBe(true)
  })

  it.fails('MS-15 a copy of a wall under a new id is reported', () => {
    const { walls, room } = outline(RECT)
    expect(issuesOf(planOf({ walls: [...walls, { ...walls[0]!, id: 'copy' }], rooms: [room] })).length).toBeGreaterThan(0)
  })

  // Lab MS-16: the wall is 4.8996 m long, so the door "runs from 4.00 to 4.90" only by rounding.
  it.fails('MS-16 a door flush with the end of an angled wall is accepted', () => {
    const len = 4.8996
    const a = (33 * Math.PI) / 180
    const wall = { id: 'w', start: [0, 0], end: [len * Math.cos(a), len * Math.sin(a)], thickness: 0.2, height: 2.7, kind: 'exterior' }
    const plan = planOf({ walls: [wall], openings: [{ id: 'd', wall: 'w', type: 'door', offset: 4.0, width: 0.9, height: 2.1 }] })
    expect(issuesOf(plan)).toEqual([])
  })
})

/**
 * Known failures from the lab (entry Z-4) that ARE-4 fixed. They ran as expected failures above
 * until Grid worked out the spaces the walls enclose and set each room against them.
 */
describe('lab failures fixed by ARE-4', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const issuesOf = (plan: FloorPlan) => validatePlan(plan).issues

  it('MS-2 a 1.5 m gap in a room outline is reported', () => {
    const { walls, room } = outline(RECT)
    walls[1] = { ...walls[1]!, start: [5, 1.5] }
    const issues = issuesOf(planOf({ walls, rooms: [room] }))
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([['room/not-enclosed', 'r1', 'warning']])
    expect(issues[0]!.message).toMatch(/not enclosed by its walls/)
  })

  it('MS-17 a wall that cuts a room in two without being listed is reported', () => {
    const { walls, room } = outline(RECT)
    const cut = { id: 'cut', start: [2.5, 0], end: [2.5, 4], thickness: 0.1, height: 2.7, kind: 'partition' }
    const issues = issuesOf(planOf({ walls: [...walls, cut], rooms: [room] }))
    expect(issues.map((i) => [i.code, i.id])).toEqual([['room/space-mismatch', 'r1']])
    expect(issues[0]!.message).toMatch(/lies on wall cut, which its wall list leaves out/)
    expect(issues[0]!.message).toMatch(/covers parts of 2 enclosed spaces/)
  })
})

/**
 * Known failures from the lab (entry Z-4) that ARE-1 fixed. They ran as expected failures
 * above until each wall's face was chosen from the outline.
 */
describe('lab failures fixed by ARE-1', () => {
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const codesOf = (plan: FloorPlan) => validatePlan(plan).issues.map((i) => i.code)

  it('AR-12 a room narrower than its walls is an issue, not an area', () => {
    const { walls, room } = outline([[0, 0], [3, 0], [3, 0.3], [0, 0.3]], { thickness: [0.4, 0.4, 0.4, 0.4] })
    expect(codesOf(planOf({ walls, rooms: [room] }))).toEqual(['room/inside-out'])
  })

  // Lab AR-13: a 20 m² room read 345 m², with no issue.
  it('AR-13 two swapped boundary entries in a room 3 cm out of square are reported', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5.03, 4], [0, 4.02]])
    const plan = planOf({ walls, rooms: [{ ...room, boundary: ['w1', 'w3', 'w2', 'w4'] }] })
    expect(codesOf(plan)).toEqual(['room/out-of-order'])
  })

  it('MS-7 two walls in a row with different thickness still make a room', () => {
    const { walls, room } = outline([[0, 0], [2.5, 0], [5, 0], [5, 4], [0, 4]], { thickness: [0.3, 0.1, 0.2, 0.2, 0.2] })
    expect(validatePlan(planOf({ walls, rooms: [room] })).broken.has('r1')).toBe(false)
  })
})
