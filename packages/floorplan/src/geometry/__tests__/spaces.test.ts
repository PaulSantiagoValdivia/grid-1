/**
 * ARE-4: the spaces the walls enclose, worked out once per floor, and every room set against
 * them (`spaces.ts`). Floor that no room claims is reported with its area and where it is, so a
 * forgotten room no longer makes the total smaller in silence (lab entries AR-15, O-6, I-2).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomArea, roomPolygon } from '../room'
import type { FloorSpaces } from '../spaces'
import { floorSpaces, planSpaces, spacesKnown } from '../spaces'
import { validatePlan } from '../validate'
import type { Vec2 } from '../vec2'
import { outline, type Point } from '../../test-support/outline'

const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

const without = (plan: FloorPlan, roomId: string): FloorPlan => ({ ...plan, rooms: plan.rooms.filter((r) => r.id !== roomId) })

const SPACE_CODES = ['floor/unclaimed', 'room/space-mismatch', 'room/not-enclosed', 'floor/spaces-unknown']
const spaceIssues = (plan: FloorPlan) => validatePlan(plan).issues.filter((i) => SPACE_CODES.includes(i.code))

const known = (plan: FloorPlan, floor = 'ground'): FloorSpaces => {
  const result = floorSpaces(plan, floor)
  if (!spacesKnown(result)) throw new Error(result.reason)
  return result
}

const totalArea = (plan: FloorPlan): number => {
  const index = indexPlan(plan)
  return plan.rooms.reduce((sum, room) => sum + Math.abs(roomArea(room, index)), 0)
}

function inside(p: Vec2, polygon: readonly Vec2[]): boolean {
  let odd = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

const wall = (id: string, start: Point, end: Point, extra: Partial<Wall> = {}): Wall => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 2.7,
  kind: 'interior',
  ...extra
})
const room = (id: string, boundary: string[]): Room => ({ id, name: id, boundary, use: 'living' })
const plan = (walls: Wall[], rooms: Room[]): FloorPlan => ({ version: '1', units: 'm', walls, rooms, openings: [] })

/** Net room area, wall area and unclaimed floor add up to the area inside the outer walls. */
function expectBalanced(result: FloorSpaces): void {
  expect(Math.abs(result.roomArea + result.wallArea + result.unclaimedArea - result.outlineArea)).toBeLessThan(1e-6)
}

describe('AR-15 a room left out of the file is reported, with its area and where it is', () => {
  it('the villa: 13.59 m² of floor no room claims, where the walk-in wardrobe was', () => {
    const villa = fixture('villa.json')
    expect(spaceIssues(villa)).toEqual([])

    const wardrobe = roomPolygon(villa.rooms.find((r) => r.id === 'wardrobe')!, indexPlan(villa))
    const missing = without(villa, 'wardrobe')
    const result = known(missing)
    expect(result.unclaimed).toHaveLength(1)
    const piece = result.unclaimed[0]!
    expect(piece.area).toBeCloseTo(13.585, 3)
    expect(inside(piece.at, wardrobe)).toBe(true)
    expect([...piece.walls].sort()).toEqual(['corr-n', 'ext-n', 'n10', 'n8'])
    expect(result.unclaimedArea).toBeCloseTo(13.585, 3)
    expectBalanced(result)

    const issues = spaceIssues(missing)
    expect(issues.map((i) => [i.code, i.entity, i.id, i.severity])).toEqual([['floor/unclaimed', 'floor', 'ground', 'warning']])
    expect(issues[0]!.message).toBe(
      `Floor ground has 13.59 m² of enclosed floor that no room claims, around ` +
        `(${piece.at.x.toFixed(2)}, ${piece.at.y.toFixed(2)}), between walls ${piece.walls.slice(0, -1).join(', ')} ` +
        `and ${piece.walls.at(-1)}. It is in no room's area. If it is a room, draw it as one.`
    )
  })

  it('the house (lab I-2): the 5.54 m² utility room, the total going from 91.69 to 86.15 m²', () => {
    const house = fixture('three-bed-house.json')
    expect(totalArea(house)).toBeCloseTo(91.69, 2)
    expect(spaceIssues(house)).toEqual([])

    const utility = roomPolygon(house.rooms.find((r) => r.id === 'utility')!, indexPlan(house))
    const missing = without(house, 'utility')
    expect(totalArea(missing)).toBeCloseTo(86.15, 2)
    const result = known(missing)
    expect(result.unclaimed).toHaveLength(1)
    expect(result.unclaimed[0]!.area).toBeCloseTo(5.538, 3)
    expect(result.unclaimed[0]!.area).toBeCloseTo(totalArea(house) - totalArea(missing), 6)
    expect(inside(result.unclaimed[0]!.at, utility)).toBe(true)
    expect([...result.unclaimed[0]!.walls].sort()).toEqual(['bed1-n', 'corr-w', 'ext-w', 'util-n'])
    expectBalanced(result)
    expect(spaceIssues(missing).map((i) => i.message)).toEqual([expect.stringMatching(/^Floor ground has 5\.54 m² of enclosed floor/)])
  })

  it('a courtyard no room claims is unclaimed floor too', () => {
    const outer = outline([[0, 0], [10, 0], [10, 10], [0, 10]])
    const inner: Wall[] = [
      wall('cs', [4, 4], [6, 4]),
      wall('ce', [6, 4], [6, 6]),
      wall('cn', [6, 6], [4, 6]),
      wall('cw', [4, 6], [4, 4])
    ]
    const result = known(plan([...outer.walls, ...inner], []))
    // Both spaces: the ring between the walls and the courtyard inside.
    expect(result.unclaimed.map((p) => p.area.toFixed(4))).toEqual([(9.8 * 9.8 - 2.2 * 2.2).toFixed(4), (1.8 * 1.8).toFixed(4)])
    expectBalanced(result)
  })
})

describe('per floor, net room area + wall area + unclaimed floor = the outline', () => {
  it('holds on rectangular rooms, turned and with every wall thickness', () => {
    for (const rotate of [0, 1e-3, 17, 45, 90, 180, 282]) {
      for (const t of [0.05, 0.2, 0.45]) {
        const { walls, room: r } = outline([[0, 0], [6, 0], [6, 4], [0, 4]], { rotate, thickness: [t, t, t, t] })
        const result = known(plan(walls, [r]))
        expect(result.unclaimed).toEqual([])
        expect(result.mismatches).toEqual([])
        expect(result.roomArea).toBeCloseTo((6 - t) * (4 - t), 9)
        expectBalanced(result)
      }
    }
  })

  it('holds on a grid of rectangular rooms sharing their walls, drawn whole and in pieces', () => {
    for (const pieces of [false, true]) {
      const n = 4
      const walls: Wall[] = []
      const id = (kind: string, i: number, j: number) => `${kind}${i}-${j}`
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j < n; j++) {
          const kind = i === 0 || i === n ? 'exterior' : 'interior'
          const thickness = i === 0 || i === n ? 0.3 : 0.1
          if (pieces) {
            walls.push(wall(id('h', i, j), [j * 3, i * 3], [j * 3 + 3, i * 3], { thickness, kind }))
            walls.push(wall(id('v', i, j), [i * 3, j * 3], [i * 3, j * 3 + 3], { thickness, kind }))
          } else if (j === 0) {
            walls.push(wall(id('h', i, 0), [0, i * 3], [n * 3, i * 3], { thickness, kind }))
            walls.push(wall(id('v', i, 0), [i * 3, 0], [i * 3, n * 3], { thickness, kind }))
          }
        }
      }
      const rooms: Room[] = []
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const h = (row: number) => id('h', row, pieces ? j : 0)
          const v = (col: number) => id('v', col, pieces ? i : 0)
          rooms.push(room(`r${i}-${j}`, [h(i), v(j + 1), h(i + 1), v(j)]))
        }
      }
      const p = plan(walls, rooms)
      const result = known(p)
      expect(result.spaces).toHaveLength(n * n)
      expect(result.unclaimed).toEqual([])
      expect(result.mismatches).toEqual([])
      expect(spaceIssues(p)).toEqual([])
      expectBalanced(result)
    }
  })

  it('holds on the villa, the house and the shared fixture, floor by floor', () => {
    for (const name of ['villa.json', 'three-bed-house.json', 'floor-plan.json', 'madrid-flat.json', 'berlin-flat.json']) {
      const p = fixture(name)
      for (const result of planSpaces(p)) {
        if (!spacesKnown(result)) throw new Error(`${name}: ${result.reason}`)
        expect(result.unclaimed, name).toEqual([])
        expect(result.mismatches, name).toEqual([])
        expectBalanced(result)
      }
    }
  })
})

describe('rooms that do not match the space their walls enclose', () => {
  const RECT: Point[] = [[0, 0], [6, 0], [6, 3], [0, 3]]

  it('a dividing line through a room, missing from its wall list (lab v-wall-4)', () => {
    const { walls, room: r } = outline(RECT)
    const line = wall('line', [3, 0], [3, 3], { thickness: 0, height: 0, virtual: true })
    const result = known(plan([...walls, line], [r]))
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0]!.spaces.map((a) => a.toFixed(4))).toEqual([(2.9 * 2.8).toFixed(4), (2.9 * 2.8).toFixed(4)])
    expect(result.mismatches[0]!.lines).toEqual(['line'])
    const issues = spaceIssues(plan([...walls, line], [r]))
    expect(issues.map((i) => [i.code, i.id])).toEqual([['room/space-mismatch', 'r1']])
    expect(issues[0]!.message).toBe(
      'Room r1 does not match the space its walls enclose. Its outline measures 16.24 m²: it covers ' +
        'parts of 2 enclosed spaces (8.12 and 8.12 m²), split by dividing line line, which its wall ' +
        'list leaves out. Its area counts all of it. Check its wall list.'
    )
  })

  it('the same line, listed by two rooms either side, is two spaces and two rooms that match', () => {
    const walls = [
      wall('s1', [0, 0], [3, 0]),
      wall('s2', [3, 0], [6, 0]),
      wall('e', [6, 0], [6, 3]),
      wall('n2', [6, 3], [3, 3]),
      wall('n1', [3, 3], [0, 3]),
      wall('w', [0, 3], [0, 0]),
      wall('line', [3, 0], [3, 3], { thickness: 0, height: 0, virtual: true })
    ]
    const p = plan(walls, [room('a', ['s1', 'line', 'n1', 'w']), room('b', ['s2', 'e', 'n2', 'line'])])
    const result = known(p)
    expect(result.spaces).toHaveLength(2)
    expect(result.mismatches).toEqual([])
    expect(result.unclaimed).toEqual([])
    expect(spaceIssues(p)).toEqual([])
    expectBalanced(result)
  })

  it('a box of walls standing inside a room (a pod, a cupboard drawn as walls)', () => {
    const { walls, room: r } = outline(RECT)
    const pod = [
      wall('p1', [1, 1], [2, 1], { thickness: 0.1 }),
      wall('p2', [2, 1], [2, 2], { thickness: 0.1 }),
      wall('p3', [2, 2], [1, 2], { thickness: 0.1 }),
      wall('p4', [1, 2], [1, 1], { thickness: 0.1 })
    ]
    const result = known(plan([...walls, ...pod], [r]))
    const m = result.mismatches[0]!
    expect(m.room).toBe('r1')
    expect(m.onWalls.map((w) => w.wall).sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(m.onWalls.every((w) => !w.listed)).toBe(true)
    expect(m.spaces).toHaveLength(2) // the room around the pod, and the inside of the pod
    // The inside of the pod lies inside the room's outline, so it is not unclaimed.
    expect(result.unclaimed).toEqual([])
    expect(spaceIssues(plan([...walls, ...pod], [r]))[0]!.message).toMatch(
      /^Room r1 does not match the space its walls enclose\. Its outline measures 16\.24 m²: 0\.\d\d m² of it lies on walls p1, p2, p3 and p4, which its wall list leaves out; it covers parts of 2 enclosed spaces/
    )
  })

  it('a plot drawn round a house: the garden takes in the house, its walls and its rooms', () => {
    const plot = outline([[-5, -5], [15, -5], [15, 10], [-5, 10]])
    const plotWalls = plot.walls.map((w) => ({ ...w, id: `plot-${w.id}`, thickness: 0.1 }))
    const garden = room('garden', plotWalls.map((w) => w.id))
    const house = outline([[0, 0], [10, 0], [10, 5], [0, 5]])
    const p = plan([...plotWalls, ...house.walls], [garden, house.room])
    const result = known(p)
    expect(result.mismatches.map((m) => m.room)).toEqual(['garden'])
    expect(result.mismatches[0]!.onWalls.map((w) => w.wall).sort()).toEqual(['w1', 'w2', 'w3', 'w4'])
    expect(result.mismatches[0]!.spaces).toHaveLength(2)
  })

  it('two rooms side by side in one space, with no wall between them (lab d2-stair-shifted)', () => {
    // Both rooms list the partition `mid`, but it stops 2 m short of the far wall, so nothing
    // divides the space. Each room's outline runs along the partition's line all the same.
    const walls = [
      wall('s1', [0, 0], [3, 0]),
      wall('s2', [3, 0], [6, 0]),
      wall('e', [6, 0], [6, 3]),
      wall('n2', [6, 3], [3, 3]),
      wall('n1', [3, 3], [0, 3]),
      wall('w', [0, 3], [0, 0]),
      wall('mid', [3, 0], [3, 1], { thickness: 0.1 })
    ]
    const p = plan(walls, [room('a', ['s1', 'mid', 'n1', 'w']), room('b', ['s2', 'e', 'n2', 'mid'])])
    const result = known(p)
    expect(result.spaces).toHaveLength(1)
    expect(result.mismatches.map((m) => [m.room, m.sharedWith])).toEqual([['a', ['b']], ['b', ['a']]])
    // The strip where the partition is missing belongs to neither room: 0.1 m wide, from the
    // partition's end (lengthened by the millimetre every wall is) to the face of the far wall.
    expect(result.unclaimed.map((u) => u.area.toFixed(4))).toEqual([(0.1 * (2.9 - 1.001)).toFixed(4)])
    const issues = spaceIssues(p)
    expect(issues.map((i) => [i.code, i.id])).toEqual([['floor/unclaimed', 'ground'], ['room/space-mismatch', 'a'], ['room/space-mismatch', 'b']])
    expect(issues[1]!.message).toBe(
      'Room a does not match the space its walls enclose. Its outline measures 7.98 m²: it lies in ' +
        'one enclosed space with room b, and no wall or dividing line divides that space between ' +
        'them. Its area counts all of it. Check its wall list.'
    )
  })

  it('two rooms that overlap are left to the overlap check, not called rooms side by side', () => {
    const { walls, room: r } = outline(RECT)
    const result = known(plan(walls, [r, { ...r, id: 'again' }]))
    expect(result.mismatches).toEqual([])
  })

  it('a room whose walls leave a 1.5 m gap is not enclosed (lab MS-2)', () => {
    const { walls, room: r } = outline(RECT)
    walls[1] = { ...walls[1]!, start: [6, 1.5] }
    const result = known(plan(walls, [r]))
    expect(result.spaces).toEqual([])
    expect(result.mismatches.map((m) => [m.room, m.enclosed])).toEqual([['r1', 0]])
    expect(spaceIssues(plan(walls, [r])).map((i) => i.code)).toEqual(['room/not-enclosed'])
  })

  it('walls that stop a hair short of meeting, under a millimetre, still enclose the room', () => {
    const { walls, room: r } = outline(RECT)
    walls[1] = { ...walls[1]!, start: [6, 0.1009] } // ends 0.9 mm short of the face of w1
    expect(spaceIssues(plan(walls, [r]))).toEqual([])
  })

  it('dividing lines that close a terrace on the open side, ending on the corner of the walls', () => {
    const { walls, room: r } = outline([[0, 0], [8, 0], [8, 6], [0, 6]], { thickness: [0.3, 0.3, 0.3, 0.3] })
    const lines = [
      wall('ter-w', [-0.15, 6.15], [-0.15, 9], { thickness: 0.001, virtual: true }),
      wall('ter-n', [-0.15, 9], [4, 9], { thickness: 0.001, virtual: true }),
      wall('ter-e', [4, 9], [4, 6.15], { thickness: 0.001, virtual: true })
    ]
    const terrace = room('terrace', ['w3', 'ter-w', 'ter-n', 'ter-e'])
    const p = plan([...walls, ...lines], [r, terrace])
    expect(spaceIssues(p)).toEqual([])
    expectBalanced(known(p))
  })
})

describe('what is not reported twice, and what cannot be worked out', () => {
  it('floor that a refused room lists the walls of is not reported again as unclaimed', () => {
    const { walls, room: r } = outline([[0, 0], [5, 0], [5.03, 4], [0, 4.02]])
    const p = plan(walls, [{ ...r, boundary: ['w1', 'w3', 'w2', 'w4'] }])
    expect(known(p).unclaimed).toHaveLength(1)
    expect(validatePlan(p).issues.map((i) => i.code)).toEqual(['room/out-of-order'])
  })

  it('a forgotten room beside a refused one is still reported', () => {
    const walls = [
      wall('s', [0, 0], [8, 0]),
      wall('e', [8, 0], [8, 4]),
      wall('n', [8, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      wall('mid', [4, 0], [4, 4])
    ]
    const p = plan(walls, [room('broken', ['s', 'n', 'mid', 'w'])])
    const result = validatePlan(p)
    expect(result.broken.has('broken')).toBe(true)
    const unclaimed = result.issues.filter((i) => i.code === 'floor/unclaimed')
    expect(unclaimed).toHaveLength(1)
    expect(unclaimed[0]!.message).toMatch(/^Floor ground has 14\.44 m² of enclosed floor that no room claims, around \(6\.00, 2\.00\), between walls s, e, n and mid\./)
  })

  it('is left out with { spaces: false }, and `broken` is the same either way', () => {
    const p = without(fixture('villa.json'), 'wardrobe')
    const full = validatePlan(p)
    const quick = validatePlan(p, indexPlan(p), { spaces: false })
    expect(full.issues.map((i) => i.code)).toEqual(['floor/unclaimed'])
    expect(quick.issues).toEqual([])
    expect([...quick.broken]).toEqual([...full.broken])
  })

  it('says so when the walls lie too far out to join', () => {
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const far = walls.map((w) => ({ ...w, start: [w.start[0] + 2e7, w.start[1]] as Point, end: [w.end[0] + 2e7, w.end[1]] as Point }))
    const issues = spaceIssues(plan(far, [r]))
    expect(issues.map((i) => [i.code, i.entity, i.id])).toEqual([['floor/spaces-unknown', 'floor', 'ground']])
    expect(issues[0]!.message).toMatch(/could not be worked out: wall w1 lies more than 10000 km from the origin/)
  })

  it('works out surveyed coordinates, millions of metres from the origin', () => {
    const { walls, room: r } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const moved = walls.map((w) => ({
      ...w,
      start: [w.start[0] + 440512.25, w.start[1] + 4474120.5] as Point,
      end: [w.end[0] + 440512.25, w.end[1] + 4474120.5] as Point
    }))
    const result = known(plan(moved, [r]))
    expect(result.mismatches).toEqual([])
    expect(result.unclaimed).toEqual([])
  })

  it('joins an L turned every way, where rounding leaves edges that almost coincide', () => {
    const L: Point[] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]
    for (let rotate = 0; rotate < 360; rotate += 7.5) {
      const { walls, room: r } = outline(L, { rotate, thickness: [0.2, 0.3, 0.2, 0.1, 0.2, 0.3] })
      const result = known(plan(walls, [r]))
      expect(result.mismatches, `turned ${rotate}°`).toEqual([])
      expect(result.unclaimed, `turned ${rotate}°`).toEqual([])
    }
  })

  it('takes a plan of 900 rooms in seconds, not minutes', () => {
    const n = 30
    const walls: Wall[] = []
    for (let i = 0; i <= n; i++) {
      walls.push(wall(`h${i}`, [0, i * 3], [n * 3, i * 3]))
      walls.push(wall(`v${i}`, [i * 3, 0], [i * 3, n * 3]))
    }
    const rooms: Room[] = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) rooms.push(room(`r${i}-${j}`, [`h${i}`, `v${j + 1}`, `h${i + 1}`, `v${j}`]))
    }
    const started = Date.now()
    const result = known(plan(walls, rooms))
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(result.spaces).toHaveLength(n * n)
    expect(result.unclaimed).toEqual([])
    expect(result.mismatches).toEqual([])
  })
})
