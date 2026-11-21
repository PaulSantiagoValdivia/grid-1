/**
 * ARE-5: rooms on one floor that cover the same floor (`overlaps.ts`). A room whose wall list
 * names one wrong wall grows over its neighbours, and a room pasted in twice covers the floor of
 * the first; both used to be counted twice with no word (lab entries AR-4, E-15, A-14, C-9, O-4).
 * Rooms that only meet, face to face across a wall or along a dividing line, never overlap.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan, Room, Wall } from '../plan'
import { MAX_CUTS, roomOverlaps } from '../overlaps'
import { validatePlan } from '../validate'
import { outline, turn, type Point } from '../../test-support/outline'

const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

const wall = (id: string, start: Point, end: Point, extra: Partial<Wall> = {}): Wall => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 2.7,
  kind: 'exterior',
  ...extra
})
const room = (id: string, boundary: string[], extra: Partial<Room> = {}): Room => ({ id, name: id, boundary, use: 'living', ...extra })
const planOf = (walls: Wall[], rooms: Room[]): FloorPlan => ({ version: '1', units: 'm', walls, rooms, openings: [] })
const overlapIssues = (plan: FloorPlan) => validatePlan(plan).issues.filter((i) => i.code.startsWith('room/overlap'))

/**
 * Two rooms side by side in a box 10 × 4 m on axes, walls 0.2 m, with a middle wall on x = 5:
 * each room 4.8 × 3.8 m inside. `middle` is the middle wall, solid or a dividing line.
 */
function twoRooms(middle: Partial<Wall> = { kind: 'interior' }, degrees = 0, shift: Point = [0, 0]): FloorPlan {
  const at = (p: Point): Point => {
    const [x, y] = turn(p, degrees)
    return [x + shift[0], y + shift[1]]
  }
  const walls = [
    wall('s1', at([0, 0]), at([5, 0])),
    wall('s2', at([5, 0]), at([10, 0])),
    wall('e', at([10, 0]), at([10, 4])),
    wall('n2', at([10, 4]), at([5, 4])),
    wall('n1', at([5, 4]), at([0, 4])),
    wall('w', at([0, 4]), at([0, 0])),
    wall('m', at([5, 0]), at([5, 4]), middle)
  ]
  return planOf(walls, [room('a', ['s1', 'm', 'n1', 'w']), room('b', ['s2', 'e', 'n2', 'm'])])
}

describe('rooms that only meet', () => {
  it('across a wall, do not overlap', () => {
    expect(roomOverlaps(twoRooms()).overlaps).toEqual([])
  })

  it('along a dividing line, do not overlap: they share an edge, no floor', () => {
    expect(roomOverlaps(twoRooms({ virtual: true, thickness: 0, height: 0 })).overlaps).toEqual([])
  })

  it.each([7, 15, 33, 45, 90, 137.5])('turned by %s°, along a dividing line or across a wall, do not overlap', (degrees) => {
    expect(roomOverlaps(twoRooms({ virtual: true, thickness: 0, height: 0 }, degrees)).overlaps).toEqual([])
    expect(roomOverlaps(twoRooms({ kind: 'interior' }, degrees)).overlaps).toEqual([])
  })

  it('a thousand kilometres from the origin, do not overlap either', () => {
    expect(roomOverlaps(twoRooms({ virtual: true, thickness: 0, height: 0 }, 15, [1e6, 1e6])).overlaps).toEqual([])
  })

  it('on two floors, one above the other, do not overlap', () => {
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const upstairs = walls.map((w) => ({ ...w, id: `${w.id}-up`, floor: 'first' }))
    const plan = planOf([...walls, ...upstairs], [r, { ...r, id: 'up', floor: 'first', boundary: upstairs.map((w) => w.id) }])
    expect(roomOverlaps(plan).overlaps).toEqual([])
  })

  it('in the villa and the shared fixture, none overlap', () => {
    for (const name of ['villa.json', 'floor-plan.json', 'three-bed-house.json', 'madrid-flat.json', 'berlin-flat.json']) {
      expect(roomOverlaps(fixture(name)).overlaps, name).toEqual([])
    }
  })

  it('in a grid of 900 rooms divided by lines, none overlap, and finding that is quick', () => {
    const n = 30
    const walls: Wall[] = []
    for (let i = 0; i <= n; i++) {
      const edge = i === 0 || i === n
      const extra: Partial<Wall> = edge ? {} : { virtual: true, thickness: 0, height: 0 }
      walls.push(wall(`h${i}`, [0, i * 4], [n * 4, i * 4], extra), wall(`v${i}`, [i * 4, 0], [i * 4, n * 4], extra))
    }
    const rooms: Room[] = []
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) rooms.push(room(`r${x}-${y}`, [`h${y}`, `v${x + 1}`, `h${y + 1}`, `v${x}`]))
    }
    const started = performance.now()
    expect(roomOverlaps(planOf(walls, rooms)).overlaps).toEqual([])
    expect(performance.now() - started).toBeLessThan(5000)
  })
})

describe('rooms that overlap', () => {
  it('a room listed twice: the whole room, once, on the copy', () => {
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const found = roomOverlaps(planOf(walls, [r, { ...r, id: 'copy' }])).overlaps
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ rooms: ['r1', 'copy'], kind: 'same', sameWalls: true })
    expect(found[0]!.shared).toBeCloseTo(4.8 * 3.8, 9)
  })

  it('a room listed twice far from the origin still shares exactly its own area', () => {
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const far = walls.map((w) => ({ ...w, start: [w.start[0] + 2e6, w.start[1] - 3e6] as Point, end: [w.end[0] + 2e6, w.end[1] - 3e6] as Point }))
    const found = roomOverlaps(planOf(far, [r, { ...r, id: 'copy' }])).overlaps
    expect(found).toHaveLength(1)
    expect(found[0]!.shared).toBeCloseTo(4.8 * 3.8, 6)
  })

  it('a room that names one wrong wall grows over its neighbour, which lies wholly inside it', () => {
    // Room a lists the far east wall instead of the middle one: 9.8 × 3.8 m, over all of b.
    const plan = twoRooms()
    plan.rooms[0] = room('a', ['s1', 'e', 'n1', 'w'])
    const issues = overlapIssues(plan)
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([['room/overlap', 'a', 'warning']])
    expect(issues[0]!.message).toMatch(/^Room "b" \(18\.24 m²\) lies wholly inside room "a" \(37\.24 m²\), so 18\.24 m² of floor around/)
    expect(issues[0]!.message).toMatch(/If not, check the wall list of "a": it most likely names a wall it should not\.$/)
  })

  it('a room drawn across two others: one line for each, naming both rooms and the floor they share', () => {
    // A room on axes 3..7 × 1..3, partitions 0.1 m: 3.9 × 1.9 m inside, 1.85 m of it each side.
    const plan = twoRooms()
    const corners: Point[] = [[3, 1], [7, 1], [7, 3], [3, 3]]
    const cross = corners.map((p, i) => wall(`c${i}`, p, corners[(i + 1) % 4]!, { thickness: 0.1, kind: 'partition' }))
    plan.walls.push(...cross)
    plan.rooms.push(room('c', cross.map((w) => w.id)))
    const found = roomOverlaps(plan).overlaps
    expect(found.map((o) => [o.rooms, o.kind])).toEqual([[['a', 'c'], 'part'], [['b', 'c'], 'part']])
    for (const o of found) expect(o.shared).toBeCloseTo(1.85 * 1.9, 9)
    const issues = overlapIssues(plan)
    expect(issues.map((i) => i.id)).toEqual(['a', 'b'])
    expect(issues[0]!.message).toMatch(/^Rooms "a" \(18\.24 m²\) and "c" \(7\.41 m²\) overlap: 3\.52 m² of floor around \(\d+\.\d\d, \d+\.\d\d\) lies in both, so it is counted twice\./)
    // The point lies in the floor both cover.
    expect(found[0]!.at.x).toBeGreaterThan(3.05)
    expect(found[0]!.at.x).toBeLessThan(4.9)
  })

  it('below 0.01 m² of shared floor, says nothing', () => {
    // Room b's west face pulled 1 mm into room a: 1 mm × 3.8 m = 0.0038 m².
    const plan = twoRooms({ kind: 'interior', thickness: 0.2 })
    plan.walls.push(wall('m2', [4.799, 0], [4.799, 4], { kind: 'interior', thickness: 0.2 }))
    plan.rooms[1] = room('b', ['s2', 'e', 'n2', 'm2'])
    expect(roomOverlaps(plan).overlaps).toEqual([])
  })

  it('leaves out rooms the drawing refuses', () => {
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const plan = planOf(walls, [r, { ...r, id: 'copy' }])
    expect(roomOverlaps(plan, { broken: new Set(['copy']) }).overlaps).toEqual([])
  })
})

// The villa is the lab's AR-15 villa (`fixtures/villa.json`); lab entry A-14 made both of these
// mistakes on purpose, and each added floor with 0 issues.
describe("the lab's villa with one wrong wall, and with a room listed twice (A-14)", () => {
  const villa = fixture('villa.json')

  it('a wrong wall: the master bedroom grows over the en-suite, and the overlap names both', () => {
    // The lab named wall s8 instead of n5: 55.59 m² against 34.14, +21.45 m². 20.74 m² of that
    // is the en-suite's floor, named here; the other 0.72 m² is wall n5, which ARE-4 names.
    const plan: FloorPlan = {
      ...villa,
      rooms: villa.rooms.map((r) => (r.id === 'master' ? { ...r, boundary: r.boundary.map((w) => (w === 'n5' ? 's8' : w)) } : r))
    }
    const issues = overlapIssues(plan)
    expect(issues.map((i) => [i.code, i.id])).toEqual([['room/overlap', 'master']])
    expect(issues[0]!.message).toMatch(/^Room "ensuite" \(20\.74 m²\) lies wholly inside room "master" \(55\.59 m²\), so 20\.74 m² of floor/)
  })

  it('a room listed twice: 34.14 m², once, on the copy', () => {
    const master = villa.rooms.find((r) => r.id === 'master')!
    const plan: FloorPlan = { ...villa, rooms: [...villa.rooms, { ...master, id: 'master-dup', name: 'Master bedroom copy' }] }
    const issues = overlapIssues(plan)
    expect(issues.map((i) => [i.code, i.id])).toEqual([['room/overlap', 'master-dup']])
    expect(issues[0]!.message).toMatch(/^Rooms "master" and "master-dup" cover the same 34\.14 m² of floor and list the same walls/)
  })
})

describe('rooms piled in one place', () => {
  it('stop being compared after MAX_CUTS pairs, within seconds, and say so for the floor', () => {
    // 700 copies of one room: 244,650 pairs, more than MAX_CUTS. Uncapped, the pairs grow with
    // the square of the copies, and 5,000 copies would take most of an hour.
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const plan = planOf(walls, Array.from({ length: 700 }, (_, i) => ({ ...r, id: `copy-${i}` })))
    const started = performance.now()
    const found = roomOverlaps(plan)
    expect(performance.now() - started).toBeLessThan(30_000)
    expect(found.overlaps).toHaveLength(MAX_CUTS)
    expect(found.stopped).toEqual(['ground'])
    const said = validatePlan(plan).issues.filter((i) => i.code === 'floor/overlaps-unknown')
    expect(said.map((i) => [i.entity, i.id, i.severity])).toEqual([['floor', 'ground', 'warning']])
    expect(said[0]!.message).toMatch(/more than 200,000 pairs of rooms lying over each other, and Grid stopped there/)
  }, 120_000)
})
