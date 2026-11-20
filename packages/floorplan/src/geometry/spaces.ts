/**
 * Spaces from walls.
 *
 * A room in the plan file is a list of walls, and `room.ts` traces its outline along them.
 * Nothing there asks whether the walls really enclose that outline. A room left out of the file
 * simply makes the total smaller, and a wall list that skips a wall measures floor that is not
 * one room. This module works out, once per floor and without looking at any room, the spaces the
 * walls enclose, and then sets the rooms against them.
 *
 *  1. Every solid wall is a strip: its centre line widened by half its thickness on each side,
 *     with square ends, as the 2D view draws it. No corner is filled, as in the room outline
 *     (lab entry V-10 is still open). Each strip is lengthened by a millimetre at both ends, so
 *     that walls drawn to meet do meet, whatever the rounding.
 *  2. Every dividing line (a virtual wall) is a hairline strip, also lengthened by a
 *     millimetre. It bounds spaces and takes no floor worth counting.
 *  3. The strips are joined. What their outer edges enclose is the floor's outline. The outline
 *     less the solid walls is the enclosed floor. The outline less the walls and the lines falls
 *     apart into the spaces.
 *  4. Each room's outline is set against them. Enclosed floor that no room covers is unclaimed.
 *     A room that covers wall, or ground outside the walls, or parts of two spaces, does not
 *     match the space its walls enclose.
 *
 * The joining is done by `polygon-clipping` (MIT). Everything else here is Grid's own. After the
 * one join, every comparison is local: a room is cut only against the spaces and walls whose
 * boxes it overlaps, so a plan of thousands of rooms costs thousands of small cuts, not one
 * large cut per room.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import { floorOf, planFloors } from './floors'
import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { indexPlan } from './plan'
import { tryRoomPolygon } from './room'
import type { Vec2 } from './vec2'
import { signedArea } from './vec2'

/**
 * Below this, in square metres, a difference in area is not reported: the same line the
 * scoreboard draws between two areas that "differ".
 */
export const SPACE_AREA_TOLERANCE = 0.01

/** How far each wall strip and line is lengthened at both ends, in metres. */
const JOIN = 0.001
/**
 * Half the width a dividing line is given near the origin, in metres. It grows with the
 * distance from the origin, so that it never falls below what a number there can tell apart,
 * and with the grid points are rounded to (see `GRIDS`).
 */
const LINE_HALF_WIDTH = 1e-9
/** How close a wall must come to a piece of floor to be named as one of its walls, in metres. */
const TOUCH = 0.002
/** How long that contact must be, in metres. */
const TOUCH_LENGTH = 0.02
/**
 * Half the width of a slit that does not join two spaces, in metres. Two rooms are only said to
 * lie in one space when they still do with every wall and line widened by this much: a line
 * drawn on the face of a wall, a fraction of a millimetre off after the plan was turned, leaves
 * a slit between them that is not a way from one space to the other.
 */
const SLIT = 0.003
/** Shortest stretch of a dividing line inside a room that is named, in metres. */
const LINE_INSIDE = 0.05
/** Wall area under a room below this, in square metres, is not named wall by wall. */
const WALL_SHARE = SPACE_AREA_TOLERANCE / 10
/**
 * Coordinates and thicknesses past this, in metres, are not a building. Joining strips that
 * large loses the precision the comparison needs, so such a floor's spaces are not worked out.
 */
const FAR = 1e7
/**
 * The polygon library can fail to close a ring when two edges almost, but not quite, coincide
 * (rounding noise such as 2.8999999999999995 beside 2.9). The join is tried as drawn first, then
 * with every point rounded to these grids, in metres, coarsest last.
 */
const GRIDS = [0, 1e-9, 1e-7, 1e-6, 1e-5] as const

/** A piece of floor: one connected area, with any islands of wall cut out of it. */
export interface FloorPiece {
  /** The outer ring first, then one ring per island. */
  readonly rings: readonly (readonly Vec2[])[]
  /** In square metres, islands taken out. */
  readonly area: number
  /** A point inside the piece, away from its edges, to say where it is. */
  readonly at: Vec2
  /** Corners of the box around it. */
  readonly min: Vec2
  readonly max: Vec2
  /** The walls and dividing lines along its edge, in plan order. */
  readonly walls: readonly string[]
}

/** One space the walls enclose, and the rooms that cover part of it. */
export interface Space extends FloorPiece {
  readonly rooms: readonly { readonly room: string; readonly area: number }[]
}

/** A room whose outline is not the space its walls enclose. */
export interface RoomMismatch {
  readonly room: string
  /** The room's area as Grid measures it, along its outline. */
  readonly area: number
  /** How much of that is enclosed floor. */
  readonly enclosed: number
  /** Walls the outline runs over, and how much of each. `listed` when the room names the wall. */
  readonly onWalls: readonly { readonly wall: string; readonly area: number; readonly listed: boolean }[]
  /** How much of the outline lies outside the walls altogether. */
  readonly outside: number
  /** The spaces it covers part of, by area, largest first. More than one means it runs across a wall or a line. */
  readonly spaces: readonly number[]
  /** Dividing lines that run through the room and are not in its wall list. */
  readonly lines: readonly string[]
  /**
   * Other rooms that lie beside this one in the same space, with no wall or dividing line
   * between them, and without overlapping it. Rooms that overlap are not listed here.
   */
  readonly sharedWith: readonly string[]
}

export interface FloorSpaces {
  readonly floor: string
  /** Inside the outer edge of the walls, in square metres. */
  readonly outlineArea: number
  /**
   * Taken by the solid walls and the corners made good between them, less any such corner a
   * room's outline takes in (see `cornerFills`), so that the four figures add up.
   */
  readonly wallArea: number
  /** The outline less the walls: the floor the walls enclose. */
  readonly floorArea: number
  /** The sum of the areas of the rooms on this floor that can be drawn. */
  readonly roomArea: number
  /** Enclosed floor that no room covers, every piece counted. */
  readonly unclaimedArea: number
  readonly spaces: readonly Space[]
  /** The pieces of unclaimed floor of at least `SPACE_AREA_TOLERANCE`, largest first. */
  readonly unclaimed: readonly FloorPiece[]
  readonly mismatches: readonly RoomMismatch[]
}

/** Why a floor's spaces were not worked out. */
export interface FloorSpacesUnknown {
  readonly floor: string
  readonly reason: string
}

// ---------------------------------------------------------------------------------------------
// Polygons as polygon-clipping takes them: rings of [x, y] pairs.

interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

function boxOfRings(rings: readonly (readonly Pair[])[]): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return { x0, y0, x1, y1 }
}

const overlaps = (a: Box, b: Box): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

const ringArea = (ring: readonly Pair[]): number => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!
    const [bx, by] = ring[(i + 1) % ring.length]!
    sum += ax * by - bx * ay
  }
  return Math.abs(sum / 2)
}

const polygonArea = (polygon: Polygon): number =>
  polygon.reduce((sum, ring, i) => sum + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0)

const multiArea = (geom: MultiPolygon): number => geom.reduce((sum, polygon) => sum + polygonArea(polygon), 0)

const union = (geoms: readonly Polygon[]): MultiPolygon =>
  geoms.length === 0 ? [] : polygonClipping.union(geoms[0]!, ...geoms.slice(1))

const intersectionArea = (a: Polygon, b: Polygon): number => multiArea(polygonClipping.intersection(a, b))

// ---------------------------------------------------------------------------------------------

/** A wall as a strip, and the rectangle around it that counts as being along it. */
interface WallShape {
  readonly wall: Wall
  readonly body: Polygon
  readonly box: Box
  readonly start: Vec2
  readonly dir: Vec2
  readonly length: number
  /** Half the width of the rectangle "along the wall": half the strip, plus `TOUCH`. */
  readonly reach: number
}

/** A strip along a segment: `half` either side of it, lengthened by `ends` at both ends. */
function strip(start: Vec2, dir: Vec2, length: number, half: number, ends: number, snap: (v: number) => number): Polygon {
  const a = { x: start.x - dir.x * ends, y: start.y - dir.y * ends }
  const b = { x: start.x + dir.x * (length + ends), y: start.y + dir.y * (length + ends) }
  const nx = -dir.y * half
  const ny = dir.x * half
  const p = (x: number, y: number): Pair => [snap(x), snap(y)]
  return [[p(a.x - nx, a.y - ny), p(b.x - nx, b.y - ny), p(b.x + nx, b.y + ny), p(a.x + nx, a.y + ny)]]
}

function shapeOf(wall: Wall, lineHalf: number, snap: (v: number) => number): WallShape {
  const start = { x: wall.start[0], y: wall.start[1] }
  const dx = wall.end[0] - start.x
  const dy = wall.end[1] - start.y
  const length = Math.hypot(dx, dy)
  const dir = { x: dx / length, y: dy / length }
  const half = wall.virtual ? lineHalf : wall.thickness / 2
  const body = strip(start, dir, length, half, JOIN, snap)
  return { wall, body, box: boxOfRings(strip(start, dir, length, half + TOUCH, JOIN + TOUCH, (v) => v)), start, dir, length, reach: half + TOUCH }
}

/** Ends of two walls closer than this, in metres, are one joint. */
const JOINT = 1e-6

/**
 * The corners made good. Where two solid walls end at one point at an angle, their square ends
 * leave a notch between them: outside an outside corner, and inside a room that wraps round an
 * inside corner. A built corner has no notch, and the room outline (`joint` in `room.ts`) leaves
 * none either, so it is filled: the smallest convex patch over both square ends and the points
 * where the faces of one wall cross the faces of the other, near the joint.
 *
 * Grid has not yet decided its corners once for drawing, 3D and outlines (lab entry V-10), and in
 * one case the room outline does not fill the corner: a thick wall ends where a cross wall ends,
 * and a thinner wall carries on. So floor in a fill is neither unclaimed nor a mismatch.
 */
function cornerFills(walls: readonly WallShape[], inset: number, snap: (v: number) => number): Polygon[] {
  interface End { readonly shape: number; readonly at: Vec2; readonly dir: Vec2; readonly half: number }
  const ends: End[] = []
  walls.forEach((s, i) => {
    // A hair inside the wall's faces, so that no corner of the patch lies, but for rounding, on
    // the edge of a strip: the polygon library cannot always tell which side such a point is on.
    const half = Math.max(s.wall.thickness / 2 - inset, s.wall.thickness / 4)
    ends.push({ shape: i, at: s.start, dir: s.dir, half })
    ends.push({ shape: i, at: { x: s.start.x + s.dir.x * s.length, y: s.start.y + s.dir.y * s.length }, dir: s.dir, half })
  })
  // Sorted by x, so only ends that are close in x are compared.
  ends.sort((a, b) => a.at.x - b.at.x)
  const fills: Polygon[] = []
  for (let i = 0; i < ends.length; i++) {
    const p = ends[i]!
    for (let j = i + 1; j < ends.length && ends[j]!.at.x - p.at.x <= JOINT; j++) {
      const q = ends[j]!
      if (p.shape === q.shape || Math.hypot(p.at.x - q.at.x, p.at.y - q.at.y) > JOINT) continue
      const turn = p.dir.x * q.dir.y - p.dir.y * q.dir.x
      if (Math.abs(turn) < 1e-9) continue
      const face = (e: End, side: number): Vec2 => ({ x: e.at.x - e.dir.y * e.half * side, y: e.at.y + e.dir.x * e.half * side })
      const reach = 4 * Math.max(p.half, q.half)
      const points: Vec2[] = []
      for (const s of [1, -1]) {
        const a = face(p, s)
        points.push(a, face(q, s))
        for (const t of [1, -1]) {
          const b = face(q, t)
          // Where the face line of p through `a` crosses the face line of q through `b`.
          const k = ((b.x - a.x) * q.dir.y - (b.y - a.y) * q.dir.x) / turn
          const meet = { x: a.x + p.dir.x * k, y: a.y + p.dir.y * k }
          if (Math.hypot(meet.x - p.at.x, meet.y - p.at.y) <= reach) points.push(meet)
        }
      }
      const hull = convexHull(points)
      if (hull.length >= 3) fills.push([hull.map((v): Pair => [snap(v.x), snap(v.y)])])
    }
  }
  return fills
}

/** The convex hull, counter-clockwise, without repeated or in-line points. */
function convexHull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const turn = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = []
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, p) <= 1e-12) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

/** How much of segment `a`–`b` runs inside the rectangle along `shape`, in metres. */
function contact(a: Pair, b: Pair, shape: WallShape): number {
  // Into the wall's own coordinates: `s` along it from its start, `t` across it.
  const local = ([x, y]: Pair): [number, number] => {
    const rx = x - shape.start.x
    const ry = y - shape.start.y
    return [rx * shape.dir.x + ry * shape.dir.y, -rx * shape.dir.y + ry * shape.dir.x]
  }
  const [s0, t0] = local(a)
  const [s1, t1] = local(b)
  // Liang–Barsky: the part of the segment inside s in [lo, hi] and t in [-reach, reach].
  const lo = -(JOIN + TOUCH)
  const hi = shape.length + JOIN + TOUCH
  let u0 = 0
  let u1 = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-15) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > u1) return false
      if (r > u0) u0 = r
    } else {
      if (r < u0) return false
      if (r < u1) u1 = r
    }
    return true
  }
  const ds = s1 - s0
  const dt = t1 - t0
  if (!clip(-ds, s0 - lo) || !clip(ds, hi - s0) || !clip(-dt, t0 + shape.reach) || !clip(dt, shape.reach - t0)) return 0
  return Math.max(0, u1 - u0) * Math.hypot(ds, dt)
}

/**
 * A point inside a polygon, away from its edges: the middle of the widest gap that a few
 * horizontal lines across it find. The centre of the corners can lie outside an L or in an
 * island, so it is not used.
 */
function pointInside(polygon: Polygon, box: Box): Vec2 {
  let best: Vec2 = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
  let widest = -Infinity
  for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    const y = box.y0 + (box.y1 - box.y0) * t
    const xs: number[] = []
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!
        const [bx, by] = ring[(i + 1) % ring.length]!
        if (ay > y === by > y) continue
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay))
      }
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1]! - xs[i]!
      if (width > widest) {
        widest = width
        best = { x: (xs[i]! + xs[i + 1]!) / 2, y }
      }
    }
  }
  return best
}

function pieceOf(polygon: Polygon, shapes: readonly WallShape[]): FloorPiece {
  const box = boxOfRings(polygon)
  const walls: string[] = []
  for (const shape of shapes) {
    if (!overlaps(box, shape.box)) continue
    let along = 0
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i++) along += contact(ring[i]!, ring[i + 1]!, shape)
    }
    if (along >= TOUCH_LENGTH) walls.push(shape.wall.id)
  }
  return {
    rings: polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))),
    area: polygonArea(polygon),
    at: pointInside(polygon, box),
    min: { x: box.x0, y: box.y0 },
    max: { x: box.x1, y: box.y1 },
    walls
  }
}

/** Length of the stretch of segment `a`–`b` that lies inside `polygon`. */
function lengthInside(a: Vec2, b: Vec2, polygon: readonly Vec2[]): number {
  const d = { x: b.x - a.x, y: b.y - a.y }
  const ts = [0, 1]
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    const e = { x: q.x - p.x, y: q.y - p.y }
    const denom = d.x * e.y - d.y * e.x
    if (Math.abs(denom) < 1e-12) continue
    const t = ((p.x - a.x) * e.y - (p.y - a.y) * e.x) / denom
    const u = ((p.x - a.x) * d.y - (p.y - a.y) * d.x) / denom
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
  }
  ts.sort((x, y) => x - y)
  const inside = (pt: Vec2): boolean => {
    let odd = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i]!
      const pj = polygon[j]!
      if (pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x) odd = !odd
    }
    return odd
  }
  const len = Math.hypot(d.x, d.y)
  let total = 0
  for (let i = 0; i + 1 < ts.length; i++) {
    const mid = (ts[i]! + ts[i + 1]!) / 2
    if (inside({ x: a.x + d.x * mid, y: a.y + d.y * mid })) total += (ts[i + 1]! - ts[i]!) * len
  }
  return total
}

/** Why the spaces of this floor cannot be worked out, or null when they can. */
function farReason(walls: readonly Wall[]): string | null {
  for (const wall of walls) {
    if ([...wall.start, ...wall.end].some((v) => !Number.isFinite(v) || Math.abs(v) > FAR)) {
      return `wall ${wall.id} lies more than ${FAR / 1000} km from the origin`
    }
    if (!wall.virtual && (!Number.isFinite(wall.thickness) || wall.thickness > FAR)) {
      return `wall ${wall.id} is more than ${FAR / 1000} km thick`
    }
  }
  return null
}

export interface SpacesOptions {
  readonly index?: PlanIndex
  /** Ids the drawing's checks mark as broken (`validatePlan`). Those walls and rooms are left out. */
  readonly broken?: ReadonlySet<string>
}

interface DrawnRoom {
  readonly room: Room
  readonly outline: readonly Vec2[]
  readonly area: number
}

/** The whole comparison, with every point rounded to `grid` metres (0: as drawn). */
function compare(floor: string, walls: readonly Wall[], rooms: readonly DrawnRoom[], grid: number, reach: number): FloorSpaces {
  const steps = grid === 0 ? 0 : Math.round(1 / grid)
  const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
  const lineHalf = Math.max(LINE_HALF_WIDTH, 5 * grid, reach * 1e-14)
  const shapes = walls.map((wall) => shapeOf(wall, lineHalf, snap))
  const solidShapes = shapes.filter((s) => !s.wall.virtual)
  const lineShapes = shapes.filter((s) => s.wall.virtual)

  const fills = cornerFills(solidShapes, lineHalf, snap).map((polygon) => ({ polygon, box: boxOfRings(polygon) }))
  const solid = union([...solidShapes.map((s) => s.body), ...fills.map((f) => f.polygon)])
  const frame = lineShapes.length === 0 ? solid : union([...solid, ...lineShapes.map((s) => s.body)])
  const filled = union(frame.map((polygon) => [polygon[0]!]))
  const faces = filled.length === 0 ? [] : polygonClipping.difference(filled, frame)
  const outlineArea = multiArea(filled)

  const drawn = rooms.map((r) => {
    const polygon: Polygon = [r.outline.map((p): Pair => [snap(p.x), snap(p.y)])]
    return { ...r, polygon, box: boxOfRings(polygon) }
  })
  const faceBoxes = faces.map(boxOfRings)

  // Which room covers how much of which space: every pair whose boxes overlap, cut once.
  const shares = faces.map(() => [] as { room: number; area: number }[])
  const enclosedOf = drawn.map(() => 0)
  const covered = drawn.map(() => [] as number[])
  drawn.forEach((r, ri) => {
    faces.forEach((face, fi) => {
      if (!overlaps(r.box, faceBoxes[fi]!)) return
      const area = intersectionArea(face, r.polygon)
      if (area <= 0) return
      shares[fi]!.push({ room: ri, area })
      enclosedOf[ri] += area
      if (area >= SPACE_AREA_TOLERANCE) covered[ri]!.push(area)
    })
  })

  const spaces: Space[] = faces.map((face, fi) => ({
    ...pieceOf(face, shapes),
    rooms: shares[fi]!
      .filter((s) => s.area >= SPACE_AREA_TOLERANCE)
      .map((s) => ({ room: drawn[s.room]!.room.id, area: s.area }))
  }))

  // What no room covers, space by space. And rooms that lie side by side in one space: the
  // space holds two rooms, but nothing in the plan divides it. Where they overlap instead, the
  // overlap is the fault, and it is not reported here.
  let unclaimedArea = 0
  const unclaimed: FloorPiece[] = []
  const sharedWith = drawn.map(() => new Set<string>())
  const candidates: number[][] = []
  faces.forEach((face, fi) => {
    const over = shares[fi]!
    const rest = over.length === 0 ? [face] : polygonClipping.difference(face, ...over.map((s) => drawn[s.room]!.polygon))
    let left = 0
    for (const piece of rest) {
      const area = polygonArea(piece)
      left += area
      if (area >= SPACE_AREA_TOLERANCE) unclaimed.push(over.length === 0 ? spaces[fi]! : pieceOf(piece, shapes))
    }
    unclaimedArea += left
    const sharing = over.filter((s) => s.area >= SPACE_AREA_TOLERANCE)
    const overlap = over.reduce((sum, s) => sum + s.area, 0) - (polygonArea(face) - left)
    if (sharing.length > 1 && overlap < SPACE_AREA_TOLERANCE) candidates.push(sharing.map((s) => s.room))
  })
  unclaimed.sort((a, b) => b.area - a.area)
  if (candidates.length > 0) {
    // The same spaces with every wall and line widened by `SLIT`: rooms that still share one of
    // them lie side by side in one space.
    const wide = union([
      ...shapes.map((s) => strip(s.start, s.dir, s.length, (s.wall.virtual ? 0 : s.wall.thickness / 2) + SLIT, JOIN + SLIT, snap)),
      ...fills.map((f) => f.polygon)
    ])
    const wideFaces = polygonClipping.difference(filled, wide)
    const wideBoxes = wideFaces.map(boxOfRings)
    const homes = new Map<number, Set<number>>()
    const homeOf = (ri: number): Set<number> => {
      let found = homes.get(ri)
      if (!found) {
        found = new Set()
        const r = drawn[ri]!
        wideFaces.forEach((face, wi) => {
          if (overlaps(r.box, wideBoxes[wi]!) && intersectionArea(face, r.polygon) >= SPACE_AREA_TOLERANCE) found!.add(wi)
        })
        homes.set(ri, found)
      }
      return found
    }
    for (const group of candidates) {
      for (const a of group) {
        for (const b of group) {
          if (a !== b && [...homeOf(a)].some((wi) => homeOf(b).has(wi))) sharedWith[a]!.add(drawn[b]!.room.id)
        }
      }
    }
  }

  const mismatches: RoomMismatch[] = []
  let roomOnFills = 0
  drawn.forEach((r, ri) => {
    const spans = covered[ri]!.sort((a, b) => b - a)
    let off = r.area - enclosedOf[ri]!
    // A corner made good that the room's outline takes in counts as the room's (see
    // `cornerFills`): it is neither a mismatch nor wall.
    const nearFills = off > 1e-9 ? fills.filter((f) => overlaps(r.box, f.box)).map((f) => f.polygon) : []
    if (nearFills.length > 0) {
      const onFills = multiArea(polygonClipping.intersection(r.polygon, union(nearFills)))
      roomOnFills += onFills
      off = Math.max(0, off - onFills)
    }
    const beside = [...sharedWith[ri]!]
    if (off < SPACE_AREA_TOLERANCE && spans.length <= 1 && beside.length === 0) return
    const near = solidShapes.filter((s) => overlaps(r.box, s.box))
    const onWalls: { wall: string; area: number; listed: boolean }[] = []
    let outside = off
    if (off >= SPACE_AREA_TOLERANCE && near.length > 0) {
      const listed = new Set(r.room.boundary)
      for (const shape of near) {
        const area = intersectionArea(r.polygon, shape.body)
        if (area >= WALL_SHARE) onWalls.push({ wall: shape.wall.id, area, listed: listed.has(shape.wall.id) })
      }
      const body = union([...near.map((s) => s.body), ...nearFills])
      outside = Math.max(0, r.area - enclosedOf[ri]! - multiArea(polygonClipping.intersection(r.polygon, body)))
    }
    const lines =
      spans.length > 1
        ? lineShapes
            .filter((s) => !r.room.boundary.includes(s.wall.id) && overlaps(r.box, s.box))
            .filter((s) => {
              const end = { x: s.start.x + s.dir.x * s.length, y: s.start.y + s.dir.y * s.length }
              return lengthInside(s.start, end, r.outline) >= LINE_INSIDE
            })
            .map((s) => s.wall.id)
        : []
    mismatches.push({ room: r.room.id, area: r.area, enclosed: enclosedOf[ri]!, onWalls, outside, spaces: spans, lines, sharedWith: beside })
  })

  const wallArea = multiArea(solid) - roomOnFills
  return {
    floor,
    outlineArea,
    wallArea,
    floorArea: outlineArea - wallArea,
    roomArea: rooms.reduce((sum, r) => sum + r.area, 0),
    unclaimedArea,
    spaces,
    unclaimed,
    mismatches
  }
}

/**
 * The spaces the walls of one floor enclose, set against the rooms of that floor.
 *
 * Returns `FloorSpacesUnknown` when the floor's walls are too far out or too thick to join (see
 * `FAR`), or when the polygon library fails on every grid it is tried on. Never throws.
 */
export function floorSpaces(plan: FloorPlan, floor: string, options: SpacesOptions = {}): FloorSpaces | FloorSpacesUnknown {
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? new Set<string>()
  const walls = plan.walls.filter(
    (wall) =>
      floorOf(wall) === floor &&
      !broken.has(wall.id) &&
      (wall.start[0] !== wall.end[0] || wall.start[1] !== wall.end[1]) &&
      (wall.virtual === true || wall.thickness > 0)
  )
  const far = farReason(walls)
  if (far) return { floor, reason: far }

  const rooms: DrawnRoom[] = []
  for (const room of plan.rooms) {
    if (floorOf(room) !== floor || broken.has(room.id)) continue
    const outline = tryRoomPolygon(room, index)
    if (!outline || outline.length < 3) continue
    if (outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > FAR || Math.abs(p.y) > FAR)) {
      return { floor, reason: `room ${room.id} lies more than ${FAR / 1000} km from the origin` }
    }
    rooms.push({ room, outline, area: Math.abs(signedArea(outline)) })
  }

  let reach = 0
  for (const wall of walls) reach = Math.max(reach, ...wall.start.map(Math.abs), ...wall.end.map(Math.abs))
  let failure: unknown = null
  for (const grid of GRIDS) {
    try {
      return compare(floor, walls, rooms, grid, reach)
    } catch (error) {
      failure = error
    }
  }
  const why = failure instanceof Error ? failure.message : String(failure)
  return { floor, reason: `the walls could not be joined (${why})` }
}

/** `floorSpaces` for every floor of the plan, in floor order. */
export function planSpaces(plan: FloorPlan, options: SpacesOptions = {}): (FloorSpaces | FloorSpacesUnknown)[] {
  const index = options.index ?? indexPlan(plan)
  return planFloors(plan).map((floor) => floorSpaces(plan, floor.id, { ...options, index }))
}

export function spacesKnown(result: FloorSpaces | FloorSpacesUnknown): result is FloorSpaces {
  return !('reason' in result)
}
