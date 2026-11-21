/**
 * ARE-5: a room inside a room. A plan marks a wardrobe pod, a lift shaft or an en-suite drawn
 * inside another room with `inside: true`; the room it sits in is found from the outlines, and
 * the inner room's floor, with its walls, is taken off it (`nesting.ts`). Lab entries AR-3, B-13
 * and D-17: a bedroom 19.7% too large, a hall 18.2%, and doors that "lead to a space that is not
 * drawn" when they open into the room around them.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, safeParseFloorPlan } from '../../types/floorplan'
import type { FloorPlan, Opening, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomArea, roomNesting, roomPolygon } from '../room'
import { area } from '../vec2'
import { MAX_HOST_CUTS } from '../nesting'
import { floorSpaces, spacesKnown } from '../spaces'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { checkLocalRules } from '../rules/check'
import { floorGraph, openingSides, roomOutlines } from '../rules/graph'
import { diffPlans } from '../diff'
import { outline, type Point } from '../../test-support/outline'

const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

/** The lab's room-in-room plan (B-13) as the lab wrote it: no room marked `inside`. */
const unmarked = (plan: FloorPlan): FloorPlan => ({
  ...plan,
  rooms: plan.rooms.map((room) => {
    const copy = { ...room }
    delete copy.inside
    return copy
  })
})

const areas = (plan: FloorPlan): Record<string, number> => {
  const index = indexPlan(plan)
  return Object.fromEntries(plan.rooms.map((room) => [room.id, Math.round(roomArea(room, index) * 1e6) / 1e6]))
}

const wall = (id: string, start: Point, end: Point, extra: Partial<Wall> = {}): Wall => ({
  id,
  start,
  end,
  thickness: 0.1,
  height: 2.7,
  kind: 'partition',
  ...extra
})

/** A free-standing square of partitions 0.1 m thick, its axes from `a` to `b`, and its room. */
function square(id: string, a: number, b: number, extra: Partial<Room> = {}): { walls: Wall[]; room: Room } {
  const corners: Point[] = [[a, a], [b, a], [b, b], [a, b]]
  const walls = corners.map((p, i) => wall(`${id}-${i}`, p, corners[(i + 1) % 4]!))
  return { walls, room: { id, name: id, boundary: walls.map((w) => w.id), use: 'storage', ...extra } }
}

const planOf = (walls: Wall[], rooms: Room[], openings: Opening[] = []): FloorPlan => ({
  version: '1',
  units: 'm',
  walls,
  rooms,
  openings
})

describe('the plan format', () => {
  it('reads `inside: true` and keeps it', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    expect(parseFloorPlan({ walls, rooms: [{ ...room, inside: true }] }).rooms[0]!.inside).toBe(true)
  })

  it('adds no key to a room that does not say it, so a version 1 plan reads as before', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    expect('inside' in parseFloorPlan({ walls, rooms: [room] }).rooms[0]!).toBe(false)
  })

  it('refuses anything but true or false, naming the place', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    expect(safeParseFloorPlan({ walls, rooms: [{ ...room, inside: 'bedroom' }] })).toBeNull()
  })
})

describe("the lab's room-in-room plan (B-13), with the pod and the lift shaft marked inside", () => {
  const plan = fixture('room-in-room.json')

  it('takes each one off the room around it, as the lab measured them by hand', () => {
    // The lab's expected figures: the bedroom 22.38 m² with the pod taken off (26.79 before),
    // the hall 17.85 m² with the shaft taken off (21.09 before).
    expect(areas(plan)).toEqual({ bed: 22.38, ward: 3.61, hall: 17.85, lift: 1.96, bed2: 23.18, ward2: 3.24 })
    expect(areas(unmarked(plan))).toMatchObject({ bed: 26.79, hall: 21.09 })
  })

  it('finds each host from the outlines, and what it takes off: the pod with its walls', () => {
    const nesting = roomNesting(indexPlan(plan))
    expect([...nesting.inner.values()].map((i) => [i.room, i.host, Math.round(i.taken * 1e6) / 1e6])).toEqual([
      ['ward', 'bed', 4.41],
      ['lift', 'hall', 3.24]
    ])
    expect([...nesting.hosts.keys()]).toEqual(['bed', 'hall'])
  })

  it('reports nothing: no overlap, and every room matches the space its walls enclose', () => {
    expect(validatePlan(plan).issues).toEqual([])
    const spaces = floorSpaces(plan, 'ground')
    if (!spacesKnown(spaces)) throw new Error(spaces.reason)
    expect(spaces.mismatches).toEqual([])
    expect(spaces.unclaimed).toEqual([])
    // The books still balance: net room area + walls + unclaimed floor = the outline.
    expect(spaces.roomArea + spaces.wallArea + spaces.unclaimedArea).toBeCloseTo(spaces.outlineArea, 6)
    expect(spaces.roomArea).toBeCloseTo(72.22, 6)
  })

  it('without the marks, reports each pod as an overlap that says how to mark it', () => {
    const issues = validatePlan(unmarked(plan)).issues.filter((i) => i.code === 'room/overlap')
    expect(issues.map((i) => i.id)).toEqual(['bed', 'hall'])
    expect(issues[0]!.message).toBe(
      'Room "ward" (3.61 m²) lies wholly inside room "bed" (26.79 m²), so 3.61 m² of floor around ' +
        '(3.00, 2.50) is counted twice, once in each. If "ward" sits inside "bed", as a wardrobe pod or ' +
        'an en-suite does, mark "ward" with "inside": true and its floor is taken off "bed". If not, ' +
        'check the wall list of "bed": it most likely names a wall it should not.'
    )
  })

  it('gives the 2D drawing the same areas', () => {
    const drawn = Object.fromEntries(buildFloorPlan(plan).rooms.map((r) => [r.id, Math.round(r.area * 100) / 100]))
    expect(drawn).toMatchObject({ bed: 22.38, ward: 3.61, hall: 17.85, lift: 1.96 })
  })

  it('opens the pod door into the bedroom and the lift door into the hall', () => {
    const graph = floorGraph(plan)
    expect(graph.links).toEqual([
      { rooms: ['bed', 'ward'], via: 'pod-door' },
      // The corner wardrobe is drawn beside its bedroom, as an L, and was always linked.
      { rooms: ['bed2', 'ward2'], via: 'w2-door' },
      { rooms: ['hall', 'lift'], via: 'lift-door' }
    ])
    expect(graph.undrawn).toEqual([])
  })

  it('no longer says a door leads to a space that is not drawn, nor that the lift has no way out', () => {
    expect(checkLocalRules(plan).findings).toEqual([])
    // As the lab saw it, unmarked: both inner rooms' doors lead "nowhere".
    const before = checkLocalRules(unmarked(plan)).findings.map((f) => [f.code, f.rooms.join()])
    expect(before).toContainEqual(['door_to_undrawn_space', 'ward'])
    expect(before).toContainEqual(['door_to_undrawn_space', 'lift'])
  })
})

describe('an en-suite in the corner of a bedroom, sharing its outer walls', () => {
  // The bedroom 5 × 4 m on axes, walls 0.2 m: 4.8 × 3.8 m inside. The en-suite takes the
  // north-east corner behind two partitions 0.1 m thick, on axes x = 3 and y = 2.
  const { walls, room: bedroom } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
  const partitions = [wall('p1', [3, 2], [5, 2]), wall('p2', [3, 4], [3, 2])]
  const ensuite: Room = { id: 'ens', name: 'En-suite', boundary: ['p1', 'w2', 'w3', 'p2'], use: 'bathroom', inside: true }
  const window: Opening = { id: 'win', wall: 'w3', type: 'window', offset: 0.5, width: 1, height: 1.2, sill: 0.9 }
  const plan = planOf([...walls, ...partitions], [bedroom, ensuite], [window])

  it('takes off only the part of the en-suite and its partitions inside the bedroom', () => {
    // The en-suite: 1.85 × 1.85 m. With its partitions, inside the bedroom: 1.95 × 1.95 m.
    // The outer walls the two rooms share are the bedroom's own, and are not taken off again.
    const got = areas(plan)
    expect(got.ens).toBeCloseTo(1.85 * 1.85, 9)
    expect(got.r1).toBeCloseTo(4.8 * 3.8 - 1.95 * 1.95, 9)
    expect(validatePlan(plan).issues).toEqual([])
  })

  it("gives the window in the shared outer wall to the en-suite, not to the bedroom listed first", () => {
    const index = indexPlan(plan)
    const sides = openingSides(window, index, roomOutlines(plan, index))
    expect(sides.filter((s) => s !== null)).toEqual(['ens'])
  })
})

describe('rooms inside rooms inside rooms', () => {
  // A bedroom 10 × 8 m on axes (9.8 × 7.8 m inside), an en-suite free-standing in it, and a
  // cupboard free-standing in the en-suite.
  const { walls, room: bedroom } = outline([[0, 0], [10, 0], [10, 8], [0, 8]])
  const ensuite = square('ens', 2, 6, { inside: true, use: 'bathroom' })
  const cupboard = square('cup', 3, 4, { inside: true })
  const plan = planOf([...walls, ...ensuite.walls, ...cupboard.walls], [bedroom, ensuite.room, cupboard.room])

  it('takes each room off the room right around it, so every square metre counts once', () => {
    const got = areas(plan)
    expect(got.cup).toBeCloseTo(0.9 * 0.9, 9)
    expect(got.ens).toBeCloseTo(3.9 * 3.9 - 1.1 * 1.1, 9)
    expect(got.r1).toBeCloseTo(9.8 * 7.8 - 4.1 * 4.1, 9)
    const nesting = roomNesting(indexPlan(plan))
    expect([...nesting.inner.values()].map((i) => [i.room, i.host])).toEqual([['ens', 'r1'], ['cup', 'ens']])
    expect(validatePlan(plan).issues).toEqual([])
  })

  it('with the en-suite unmarked, reports both it and the cupboard as lying in the bedroom', () => {
    const issues = validatePlan(planOf(plan.walls, plan.rooms.map((r) => (r.id === 'ens' ? { ...r, inside: undefined } : r)))).issues
    // The cupboard is still taken off the en-suite, but the bedroom now counts the floor of both.
    const overlaps = issues.filter((i) => i.code === 'room/overlap')
    expect(overlaps.map((i) => i.id)).toEqual(['r1', 'r1'])
    expect(overlaps[0]!.message).toMatch(/^Room "ens" \(14\.00 m²\) lies wholly inside room "r1" \(76\.44 m²\)/)
    expect(overlaps[1]!.message).toMatch(/^Room "cup" \(0\.81 m²\) lies wholly inside room "r1" \(76\.44 m²\)/)
  })
})

describe('two pods in one room that overlap each other', () => {
  const { walls, room: bedroom } = outline([[0, 0], [10, 0], [10, 8], [0, 8]])
  const a = square('a', 2, 4, { inside: true })
  const b = square('b', 3, 5, { inside: true })
  const plan = planOf([...walls, ...a.walls, ...b.walls], [bedroom, a.room, b.room])

  it('takes the floor they cover off the room once, and reports the two pods', () => {
    // Each footprint 2.1 × 2.1 m; they share 1.1 × 1.1 m.
    expect(areas(plan).r1).toBeCloseTo(9.8 * 7.8 - (2 * 2.1 * 2.1 - 1.1 * 1.1), 9)
    const overlaps = validatePlan(plan).issues.filter((i) => i.code === 'room/overlap')
    expect(overlaps.map((i) => i.id)).toEqual(['b'])
    expect(overlaps[0]!.message).toMatch(/^Rooms "a" \(3\.61 m²\) and "b" \(3\.61 m²\) overlap: 0\.81 m² of floor around/)
  })
})

describe('a room marked inside that no room holds', () => {
  it('says so, and counts it on its own', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const plan = planOf(walls, [{ ...room, inside: true }])
    const issues = validatePlan(plan).issues
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([['room/inside-no-host', 'r1', 'warning']])
    expect(issues[0]!.message).toBe(
      'Room "r1" is marked as inside another room, but no room on floor "ground" holds it: no room on ' +
        'floor "ground" covers any of it. Its floor is counted on its own and taken off no room. Draw ' +
        'it within the room it sits in, or leave out "inside".'
    )
    expect(areas(plan).r1).toBeCloseTo(4.8 * 3.8, 9)
  })

  it('names the room that holds most of it when it pokes out of it', () => {
    // A pod on axes 4..6 × 1..3 straddles the bedroom's east wall on x = 5.
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const corners: Point[] = [[4, 1], [6, 1], [6, 3], [4, 3]]
    const podWalls = corners.map((p, i) => wall(`pod-${i}`, p, corners[(i + 1) % 4]!))
    const plan = planOf([...walls, ...podWalls], [room, { id: 'pod', name: 'Pod', boundary: podWalls.map((w) => w.id), inside: true }])
    const issue = validatePlan(plan).issues.find((i) => i.code === 'room/inside-no-host')
    // The pod: 1.9 × 1.9 m, of which 0.85 × 1.9 m is inside the bedroom.
    expect(issue?.message).toMatch(/: 2\.00 m² of it lies outside room "r1", the room that holds most of it\./)
    expect(areas(plan).r1).toBeCloseTo(4.8 * 3.8, 9)
    expect(validatePlan(plan).issues.some((i) => i.code === 'room/overlap' && /1\.62 m² of floor/.test(i.message))).toBe(true)
  })
})

describe('a room inside a room on another floor', () => {
  it('is not held by the room below it', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const pod = square('pod', 2, 3, { inside: true, floor: 'first' })
    const plan = planOf([...walls, ...pod.walls.map((w) => ({ ...w, floor: 'first' }))], [room, pod.room])
    expect(roomNesting(indexPlan(plan)).inner.get('pod')?.host).toBeNull()
    expect(validatePlan(plan).issues.map((i) => i.code)).toContain('room/inside-no-host')
  })
})

describe('the plan comparison', () => {
  it("reports the bedroom's area change when a pod marked inside is added, as following from it", () => {
    const head = fixture('room-in-room.json')
    const base: FloorPlan = { ...head, rooms: head.rooms.filter((r) => r.id !== 'ward') }
    const bed = diffPlans(base, head).areas.find((a) => a.roomId === 'bed')
    expect(bed?.before).toBeCloseTo(26.79, 6)
    expect(bed?.after).toBeCloseTo(22.38, 6)
    expect(bed?.dependsOn.some((id) => id.includes('ward'))).toBe(true)
  })

  it('names `inside` as a change of the room', () => {
    const head = fixture('room-in-room.json')
    const change = diffPlans(unmarked(head), head).changes.find((c) => c.entity.id === 'ward')
    expect(change?.props).toEqual([{ key: 'inside', before: false, after: true }])
  })
})

describe('the outline itself', () => {
  it('stays the whole room: only the area is net', () => {
    const plan = fixture('room-in-room.json')
    const index = indexPlan(plan)
    const bed = plan.rooms.find((r) => r.id === 'bed')!
    expect(area(roomPolygon(bed, index))).toBeCloseTo(26.79, 6)
  })
})

describe('many rooms marked inside, piled in one place', () => {
  it('stop looking for hosts after MAX_HOST_CUTS pairs, within seconds, and give the rest a reason', () => {
    // 700 copies of one room, each marked inside: 489,300 pairs of outlines to compare.
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const plan = planOf(walls, Array.from({ length: 700 }, (_, i) => ({ ...r, id: `copy-${i}`, inside: true })))
    const started = performance.now()
    const nesting = roomNesting(indexPlan(plan))
    expect(performance.now() - started).toBeLessThan(30_000)
    const unfinished = [...nesting.inner.values()].filter((i) => i.reason !== undefined)
    expect(unfinished.length).toBeGreaterThan(0)
    expect(unfinished.length).toBeLessThan(700)
    expect(unfinished[0]!.reason).toBe('the plan has more than 200,000 pairs of outlines to compare, and the rest were not compared')
    expect(MAX_HOST_CUTS).toBe(200_000)
  }, 120_000)
})
