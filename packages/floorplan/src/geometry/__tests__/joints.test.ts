import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import type { Wall } from '../plan'
import { indexPlan } from '../plan'
import { buildFloorPlan, type PlanDrawing } from '../floorplan'
import { buildScene } from '../scene3d'
import { wallMesh } from '../export/mesh'
import { wallJoints } from '../joints'
import { intersectionArea, ringArea, union } from '../polygons'
import { roomPolygon } from '../room'
import type { Vec2 } from '../vec2'

/**
 * SHT-2: walls joined at their corners into one outline (lab DR-1, F12, V-10).
 *
 * Before, every wall was a strip cut square at both ends. Where two walls met at a corner, the
 * outside of the corner had a square missing (0.45 m across with 0.9 m stone walls), an angled
 * corner had a wedge open to the street, and a round room of 48 pieces had 48 of them. The lab
 * measured the bench's two-bedroom flat at 74.96 m² inside its 75.05 m² box.
 */
const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

/**
 * A ring for the polygon library, snapped to a nanometre as the library's own joins are: two
 * walls compute the edge they share a rounding error apart, and unsnapped the union keeps it.
 */
const snap = (v: number): number => Math.round(v * 1e9) / 1e9
const ring = (points: readonly Vec2[]): Pair[] => points.map((p): Pair => [snap(p.x), snap(p.y)])

/** What the 2D drawing paints as wall: every solid run, and every opening across its wall. */
function drawnFootprint(drawing: PlanDrawing): MultiPolygon {
  const shapes: Polygon[] = drawing.walls.flatMap((w) => w.slices.map((s) => [ring(s)]))
  for (const o of drawing.openings) {
    const h = o.thickness / 2
    const n = { x: o.normal.x * h, y: o.normal.y * h }
    shapes.push([
      ring([
        { x: o.from.x + n.x, y: o.from.y + n.y },
        { x: o.to.x + n.x, y: o.to.y + n.y },
        { x: o.to.x - n.x, y: o.to.y - n.y },
        { x: o.from.x - n.x, y: o.from.y - n.y }
      ])
    ])
  }
  return union(shapes)
}

/** The walls of the 3D model seen from above: every face of every wall mesh, flattened. */
function modelFootprint(plan: FloorPlan): MultiPolygon {
  const shapes: Polygon[] = []
  for (const wall of buildScene(plan).walls) {
    const mesh = wallMesh(wall)!
    for (const [a, b, c] of mesh.faces) {
      const t = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!]
      const flat = ring(t)
      if (ringArea(flat) > 1e-12) shapes.push([flat])
    }
  }
  return union(shapes)
}

/** The outer edge of a footprint that is one piece. */
function outerRing(footprint: MultiPolygon): Pair[] {
  expect(footprint).toHaveLength(1)
  return footprint[0]![0]!
}

/** A ring without its closing point and without points in line with their neighbours. */
function corners(r: readonly Pair[]): Pair[] {
  const open = r.length > 1 && r[0]![0] === r[r.length - 1]![0] && r[0]![1] === r[r.length - 1]![1] ? r.slice(0, -1) : [...r]
  return open.filter((p, i) => {
    const a = open[(i + open.length - 1) % open.length]!
    const b = open[(i + 1) % open.length]!
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9
  })
}

const wall = (id: string, start: [number, number], end: [number, number], thickness = 0.2): Wall => ({
  id,
  start,
  end,
  thickness,
  height: 2.7,
  kind: 'interior'
})

/** A closed ring of walls along a convex polygon, each wall centred on one side. */
function ringOfWalls(points: readonly [number, number][], thickness: number): FloorPlan {
  const walls = points.map((p, i) => wall(`w${i}`, p, points[(i + 1) % points.length]!, thickness))
  return parseFloorPlan({
    version: '1',
    units: 'm',
    walls,
    rooms: [{ id: 'r', name: 'Room', boundary: walls.map((w) => w.id) }],
    openings: []
  })
}

/** The polygon each side of a convex polygon makes when moved `d` outwards (negative: in). */
function offsetConvex(points: readonly [number, number][], d: number): Pair[] {
  const n = points.length
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n]!
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    const dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len] as const
    // Counter-clockwise points: the outside is to the right of each side.
    const out = [dir[1], -dir[0]] as const
    return { p: [p[0] + out[0] * d, p[1] + out[1] * d] as const, dir }
  })
  return lines.map((a, i) => {
    const b = lines[(i + n - 1) % n]!
    const cross = b.dir[0] * a.dir[1] - b.dir[1] * a.dir[0]
    const k = ((a.p[0] - b.p[0]) * a.dir[1] - (a.p[1] - b.p[1]) * a.dir[0]) / cross
    return [b.p[0] + b.dir[0] * k, b.p[1] + b.dir[1] * k]
  })
}

describe('SHT-2 the two-bedroom flat: the drawn footprint is its 75.05 m² outline (DR-1: 74.96)', () => {
  const plan = fixture('two-bed-flat.json')

  it('draws the outside of the flat in 2D as its whole 9.5 × 7.9 m box', () => {
    const outer = outerRing(drawnFootprint(buildFloorPlan(plan)))
    expect(ringArea(outer)).toBeCloseTo(75.05, 9)
    expect(corners(outer)).toHaveLength(4)
  })

  it('raises the same box in the 3D model', () => {
    const outer = outerRing(modelFootprint(plan))
    expect(ringArea(outer)).toBeCloseTo(75.05, 9)
    expect(corners(outer)).toHaveLength(4)
  })

  it('stops each partition at the face of the wall it runs into, not at its centre line', () => {
    const slices = buildFloorPlan(plan).walls.find((w) => w.id === 'spine')!.slices
    const ys = slices.flatMap((s) => s.map((p) => p.y))
    // The spine runs from y 0 to 7.6, into the 0.3 m outside walls on both ends.
    expect(Math.min(...ys)).toBeCloseTo(0.15, 9)
    expect(Math.max(...ys)).toBeCloseTo(7.45, 9)
  })

  it('leaves the walls round each room on the room outline: one outline for both', () => {
    const index = indexPlan(plan)
    const walls = buildFloorPlan(plan).walls.flatMap((w) => w.slices.map((s): Polygon => [ring(s)]))
    for (const room of plan.rooms) {
      // No wall reaches into a room: the room's floor and the walls share only edges.
      const floor: Polygon = [ring(roomPolygon(room, index))]
      const overlap = walls.reduce((sum, w) => sum + intersectionArea(floor, w), 0)
      expect(overlap, room.id).toBeLessThan(1e-9)
    }
  })
})

describe('SHT-2 corners at any angle', () => {
  it('fills the outside of a right-angled corner: a 4 × 3 room is 4.2 × 3.2 outside', () => {
    const plan = ringOfWalls([[0, 0], [4, 0], [4, 3], [0, 3]], 0.2)
    const footprint = drawnFootprint(buildFloorPlan(plan))
    expect(ringArea(outerRing(footprint))).toBeCloseTo(4.2 * 3.2, 9)
    expect(ringArea(footprint[0]![1]!)).toBeCloseTo(3.8 * 2.8, 9)
  })

  it('closes an angled corner: a bay with 45° walls has no wedge open to the street', () => {
    const bay: [number, number][] = [[0, 0], [6, 0], [6, 3], [5, 4], [1, 4], [0, 3]]
    const plan = ringOfWalls(bay, 0.3)
    const footprint = drawnFootprint(buildFloorPlan(plan))
    const outer = outerRing(footprint)
    expect(ringArea(outer)).toBeCloseTo(ringArea(offsetConvex(bay, 0.15)), 6)
    expect(corners(outer)).toHaveLength(6)
    expect(ringArea(footprint[0]![1]!)).toBeCloseTo(ringArea(offsetConvex(bay, -0.15)), 6)
    expect(ringArea(outerRing(modelFootprint(plan)))).toBeCloseTo(ringArea(offsetConvex(bay, 0.15)), 6)
  })

  it('shows a round room of 48 pieces with 0 wedges, in 2D and in 3D', () => {
    const round: [number, number][] = Array.from({ length: 48 }, (_, i) => {
      const a = (2 * Math.PI * i) / 48
      return [5 + 3 * Math.cos(a), 5 + 3 * Math.sin(a)]
    })
    const plan = ringOfWalls(round, 0.2)
    for (const footprint of [drawnFootprint(buildFloorPlan(plan)), modelFootprint(plan)]) {
      const outer = outerRing(footprint)
      // A wedge would add corners to the outline and take floor out of it, some 0.0007 m² each.
      expect(corners(outer)).toHaveLength(48)
      expect(ringArea(outer)).toBeCloseTo(ringArea(offsetConvex(round, 0.1)), 6)
      expect(corners(footprint[0]![1]!)).toHaveLength(48)
    }
  })

  it('mitres walls of different thickness along the line through both face crossings', () => {
    const plan = parseFloorPlan({
      version: '1',
      units: 'm',
      walls: [wall('a', [0, 0], [4, 0], 0.4), wall('b', [4, 0], [4, 3], 0.2)],
      rooms: [],
      openings: []
    })
    const ends = wallJoints(plan.walls)
    // Wall a runs east: its left face (inside the turn) stops 0.1 m short of the corner and its
    // right face carries on 0.1 m past it, to where wall b's faces cross it.
    expect(ends.get('a')!.end.left).toBeCloseTo(-0.1, 12)
    expect(ends.get('a')!.end.right).toBeCloseTo(0.1, 12)
    expect(ends.get('b')!.start.left).toBeCloseTo(-0.2, 12)
    expect(ends.get('b')!.start.right).toBeCloseTo(0.2, 12)
    const footprint = drawnFootprint(buildFloorPlan(plan))
    expect(footprint).toHaveLength(1)
    // 4.1 × 0.4 to wall b's outer face, plus the 2.8 m of wall b beyond a's: nothing missing.
    expect(ringArea(footprint[0]![0]!)).toBeCloseTo(4.1 * 0.4 + 0.2 * 2.8, 9)
  })

  it('leaves a very sharp corner cut square rather than drawing a spike', () => {
    const plan = parseFloorPlan({
      version: '1',
      units: 'm',
      walls: [wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [0, 0.4])],
      rooms: [],
      openings: []
    })
    const ends = wallJoints(plan.walls)
    expect(ends.get('a')?.end ?? { left: 0, right: 0 }).toEqual({ left: 0, right: 0 })
  })

  it('trims both walls that cross a through wall to its faces, and leaves the through wall whole', () => {
    const plan = parseFloorPlan({
      version: '1',
      units: 'm',
      walls: [wall('main', [0, 0], [6, 0], 0.3), wall('n', [3, 0], [3, 2]), wall('s', [3, -2], [3, 0])],
      rooms: [],
      openings: []
    })
    const ends = wallJoints(plan.walls)
    expect(ends.get('main')).toBeUndefined()
    for (const reach of [ends.get('n')!.start, ends.get('s')!.end]) {
      expect(reach.left).toBeCloseTo(-0.15, 12)
      expect(reach.right).toBeCloseTo(-0.15, 12)
    }
  })

  it('joins only walls on the same floor', () => {
    const plan = parseFloorPlan({
      version: '1',
      units: 'm',
      floors: [
        { id: 'g', name: 'Ground', level: 0 },
        { id: 'f', name: 'First', level: 1 }
      ],
      walls: [{ ...wall('a', [0, 0], [4, 0]), floor: 'g' }, { ...wall('b', [4, 0], [4, 3]), floor: 'f' }],
      rooms: [],
      openings: []
    })
    expect(wallJoints(plan.walls).size).toBe(0)
  })

  it('leaves dividing lines out of every joint', () => {
    const plan = parseFloorPlan({
      version: '1',
      units: 'm',
      walls: [wall('a', [0, 0], [4, 0]), { ...wall('v', [4, 0], [4, 3], 0), virtual: true }],
      rooms: [],
      openings: []
    })
    expect(wallJoints(plan.walls).size).toBe(0)
  })
})
