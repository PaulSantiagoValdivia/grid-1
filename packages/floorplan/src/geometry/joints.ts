/**
 * Corners: how walls that meet are joined, decided once (SHT-2, lab DR-1).
 *
 * A wall arrives as a line with a thickness, and on its own it is a strip cut square at both
 * ends. Where walls meet, square ends leave a square missing outside a right-angled corner, a
 * wedge open at an angled one, and a partition that runs into another wall to its centre line.
 * Here each end of each wall that meets others is given how far each of its two faces reaches
 * past the end of its axis. The drawing, the 3D model and every export build their walls with
 * these figures (`wallSlicePolygon`, `wallElevation`), so all of them show the same corners.
 *
 * Every wall keeps a shape of its own, so it can still be picked, named and exported as itself;
 * the shapes meet edge to edge. Where the walls meet:
 *
 * - Two walls at an angle are mitred: each face runs to where it crosses the other wall's face on
 *   the same side, so both walls end on the line through the two crossings. With different
 *   thicknesses that line is not the bisector, and the walls still meet along it.
 * - Two walls in a straight line keep their square ends, which meet flush or, when the
 *   thicknesses differ, with a step (ARE-2).
 * - A wall that runs into another, the other carrying on (a T), stops at the face of the wall it
 *   runs into, which is left as it is. Three or four ends at one point are treated the same way
 *   when two of them are in a straight line: those two carry on, the others stop at their faces.
 * - Three or more ends with no two in line: the two closest to a straight line are mitred, and
 *   each other wall stops, cut square, where it covers the whole corner between them. It may
 *   overlap them a little; it never leaves a gap.
 * - A corner so sharp that the faces cross further out than `mitreReach` half thicknesses is
 *   left cut square, as a bevel.
 *
 * Walls join where their ends, or an end and a wall's axis, are within `joint` of each other: a
 * wall that stops short of its corner or runs past it is not joined (that is MSG-12's to
 * report). Dividing lines have no faces and join nothing. Walls join only on their own floor.
 */

import type { Wall } from './plan'
import type { Vec2 } from './vec2'
import { floorOf } from './floors'
import { tolerance } from './tolerances'
import { add, cross, dot, perp, scale, sub } from './vec2'
import type { FaceReach, WallEnds } from './wall'
import { wallAxis } from './wall'
import { boxIndex, boxOfPoints, widenBox } from './boxIndex'

/** One wall seen from a joint: its axis leaving the joint, and its half thickness. */
interface Ray {
  /** The wall's place in the list given. */
  readonly wall: number
  /** Which end of the wall is at the joint; `through` for a wall that carries on past it. */
  readonly end: 'start' | 'end' | 'through'
  /** On the wall's axis, at the joint. */
  readonly at: Vec2
  /** Unit direction along the wall, away from the joint. */
  readonly dir: Vec2
  readonly half: number
  readonly angle: number
}

type Side = 1 | -1
const LEFT: Side = 1
const RIGHT: Side = -1

/** A point on one face of a ray: `left` is the face its normal (90° counter-clockwise) points at. */
const facePoint = (ray: Ray, side: Side): Vec2 => add(ray.at, scale(perp(ray.dir), ray.half * side))

/**
 * How far along `a` (from its point at the joint) its face on `sideA` crosses the face of `b`
 * on `sideB`, or `null` when the two faces are parallel.
 */
function meet(a: Ray, sideA: Side, b: Ray, sideB: Side): number | null {
  const turn = cross(a.dir, b.dir)
  if (Math.abs(turn) < tolerance('parallel')) return null
  return cross(sub(facePoint(b, sideB), facePoint(a, sideA)), b.dir) / turn
}

/** Where the face of `a` on `sideA` crosses the face of `b` on `sideB`, or `null`. */
function crossing(a: Ray, sideA: Side, b: Ray, sideB: Side): Vec2 | null {
  const s = meet(a, sideA, b, sideB)
  return s === null ? null : add(facePoint(a, sideA), scale(a.dir, s))
}

/** Whether two faces lie on one line. */
function sameLine(a: Ray, sideA: Side, b: Ray, sideB: Side): boolean {
  if (Math.abs(cross(a.dir, b.dir)) >= tolerance('parallel')) return false
  return Math.abs(cross(a.dir, sub(facePoint(b, sideB), facePoint(a, sideA)))) <= tolerance('sameFace')
}

const opposite = (a: Ray, b: Ray): boolean => dot(a.dir, b.dir) < 0 && Math.abs(cross(a.dir, b.dir)) < tolerance('parallel')

/** How far each face of a ray reaches towards the joint, along the ray: `null` leaves it square. */
interface Cut {
  readonly left: number
  readonly right: number
}

/**
 * The cuts at one joint, for the rays sorted counter-clockwise. A ray's left face looks at the
 * next ray counter-clockwise, its right face at the one before.
 */
function cutsAt(rays: readonly Ray[]): Map<Ray, Cut> {
  const cuts = new Map<Ray, Cut>()
  const n = rays.length
  const within = (cut: Cut, ...others: Ray[]): boolean => {
    const reach = tolerance('mitreReach') * Math.max(...others.map((r) => r.half))
    return Math.abs(cut.left) <= reach && Math.abs(cut.right) <= reach
  }

  /** Two walls mitred to each other: each face to the crossing on its side. */
  const mitre = (a: Ray, b: Ray): void => {
    const al = meet(a, LEFT, b, RIGHT)
    const ar = meet(a, RIGHT, b, LEFT)
    const bl = meet(b, LEFT, a, RIGHT)
    const br = meet(b, RIGHT, a, LEFT)
    if (al === null || ar === null || bl === null || br === null) return
    const cutA = { left: al, right: ar }
    const cutB = { left: bl, right: br }
    if (!within(cutA, a, b) || !within(cutB, a, b)) return
    cuts.set(a, cutA)
    cuts.set(b, cutB)
  }

  /**
   * A wall stopped by the pair it lies between: `ccw` is the first of the pair counter-clockwise
   * from it, `cw` the first clockwise. On one line, the two faces it meets cut it exactly;
   * otherwise it is cut square where it covers the whole corner, the crossing of those faces too.
   */
  const stop = (r: Ray, ccw: Ray, cw: Ray): void => {
    const left = meet(r, LEFT, ccw, RIGHT)
    const right = meet(r, RIGHT, cw, LEFT)
    if (left === null || right === null) return
    let cut: Cut = { left, right }
    if (!sameLine(ccw, RIGHT, cw, LEFT)) {
      const corner = crossing(ccw, RIGHT, cw, LEFT)
      const deepest = Math.min(left, right, corner === null ? Infinity : dot(sub(corner, r.at), r.dir))
      cut = { left: deepest, right: deepest }
    }
    if (within(cut, r, ccw, cw)) cuts.set(r, cut)
  }

  /** The first ray of `pair` met going round from ray `i`, `step` +1 counter-clockwise or −1. */
  const firstOf = (i: number, pair: readonly Ray[], step: 1 | -1): Ray => {
    for (let k = 1; k < n; k++) {
      const ray = rays[(((i + step * k) % n) + n) % n]!
      if (pair.includes(ray)) return ray
    }
    return pair[0]!
  }

  if (n === 2 && !opposite(rays[0]!, rays[1]!)) {
    mitre(rays[0]!, rays[1]!)
    return cuts
  }

  // The pair that carries on: a wall that passes through the joint, or else the two ends in
  // line, the thicker pair first; failing those, the two ends closest to a straight line.
  let pair: Ray[] | null = null
  const through = rays.filter((r) => r.end === 'through')
  if (through.length >= 2) pair = through.slice(0, 2)
  else {
    let best = -Infinity
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!opposite(rays[i]!, rays[j]!)) continue
        const thinner = Math.min(rays[i]!.half, rays[j]!.half)
        if (thinner > best) {
          best = thinner
          pair = [rays[i]!, rays[j]!]
        }
      }
    }
  }
  if (pair === null) {
    let straightest = Infinity
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = dot(rays[i]!.dir, rays[j]!.dir)
        if (d < straightest) {
          straightest = d
          pair = [rays[i]!, rays[j]!]
        }
      }
    }
    mitre(pair![0]!, pair![1]!)
  }

  rays.forEach((r, i) => {
    if (pair!.includes(r)) return
    stop(r, firstOf(i, pair!, 1), firstOf(i, pair!, -1))
  })
  return cuts
}

/** Ends of walls on one floor, and the walls they meet. */
function joinFloor(walls: readonly Wall[], indices: readonly number[], out: Map<number, { start: FaceReach; end: FaceReach }>): void {
  const near = tolerance('joint')
  interface End {
    readonly wall: number
    readonly end: 'start' | 'end'
    readonly at: Vec2
  }
  const axes = new Map(indices.map((i) => [i, wallAxis(walls[i]!)]))
  // Each axis's box, widened by twice `joint` so rounding never drops a joint exactly `joint` off.
  const nearAxes = boxIndex(indices.map((i) => widenBox(boxOfPoints([axes.get(i)!.start, axes.get(i)!.end]), 2 * near)))
  const ends: End[] = []
  for (const i of indices) {
    const axis = axes.get(i)!
    ends.push({ wall: i, end: 'start', at: axis.start }, { wall: i, end: 'end', at: axis.end })
  }
  ends.sort((a, b) => a.at.x - b.at.x)

  // Ends within `joint` of each other are one joint (union–find, comparing only ends close in x).
  const parent = ends.map((_, i) => i)
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!
    return i
  }
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length && ends[j]!.at.x - ends[i]!.at.x <= near; j++) {
      if (Math.hypot(ends[j]!.at.x - ends[i]!.at.x, ends[j]!.at.y - ends[i]!.at.y) <= near) parent[root(j)] = root(i)
    }
  }
  const groups = new Map<number, End[]>()
  ends.forEach((e, i) => {
    const key = root(i)
    const group = groups.get(key)
    if (group) group.push(e)
    else groups.set(key, [e])
  })

  for (const group of groups.values()) {
    const members = new Set(group.map((e) => e.wall))
    // A wall with both ends at one point is too short to join.
    if (members.size < group.length) continue
    const centre = {
      x: group.reduce((s, e) => s + e.at.x, 0) / group.length,
      y: group.reduce((s, e) => s + e.at.y, 0) / group.length
    }
    const rays: Ray[] = group.map((e) => {
      const axis = axes.get(e.wall)!
      const dir = e.end === 'start' ? axis.dir : scale(axis.dir, -1)
      return { wall: e.wall, end: e.end, at: e.at, dir, half: walls[e.wall]!.thickness / 2, angle: Math.atan2(dir.y, dir.x) }
    })
    // A wall that carries on through the joint: the joint lies on its axis, away from its ends,
    // so within `joint` of its axis, and so in its widened box (QAR-7).
    for (const k of nearAxes.near(boxOfPoints([centre]))) {
      const i = indices[k]!
      if (members.has(i)) continue
      const axis = axes.get(i)!
      const s = dot(sub(centre, axis.start), axis.dir)
      if (s <= near || s >= axis.length - near) continue
      if (Math.abs(cross(axis.dir, sub(centre, axis.start))) > near) continue
      const at = add(axis.start, scale(axis.dir, s))
      const half = walls[i]!.thickness / 2
      for (const dir of [axis.dir, scale(axis.dir, -1)]) {
        rays.push({ wall: i, end: 'through', at, dir, half, angle: Math.atan2(dir.y, dir.x) })
      }
    }
    if (rays.length < 2) continue
    rays.sort((a, b) => a.angle - b.angle)

    for (const [ray, cut] of cutsAt(rays)) {
      if (ray.end === 'through') continue
      const reach = out.get(ray.wall) ?? { start: { left: 0, right: 0 }, end: { left: 0, right: 0 } }
      // A face that stops `cut` along the ray from the joint reaches `−cut` past the axis end.
      // At the start the ray runs with the wall, so its left is the wall's left; at the end it
      // runs against it, and its left is the wall's right.
      if (ray.end === 'start') reach.start = { left: -cut.left, right: -cut.right }
      else reach.end = { left: -cut.right, right: -cut.left }
      out.set(ray.wall, reach)
    }
  }
}

/**
 * How far each face of each wall reaches past the ends of its axis once the corners are
 * joined, by wall id. A wall with both ends cut square is not in the map.
 *
 * `walls` are the walls the caller draws, of any floors: dividing lines, walls of no thickness
 * and walls that cannot be built (zero length, a number that is not finite) are left out, and
 * each floor is joined on its own.
 */
export function wallJoints(walls: readonly Wall[]): ReadonlyMap<string, WallEnds> {
  const byFloor = new Map<string, number[]>()
  walls.forEach((wall, i) => {
    if (wall.virtual || !(wall.thickness > 0) || !Number.isFinite(wall.thickness)) return
    if (![...wall.start, ...wall.end].every(Number.isFinite)) return
    if (wall.start[0] === wall.end[0] && wall.start[1] === wall.end[1]) return
    const floor = floorOf(wall)
    const list = byFloor.get(floor)
    if (list) list.push(i)
    else byFloor.set(floor, [i])
  })

  const reaches = new Map<number, { start: FaceReach; end: FaceReach }>()
  for (const indices of byFloor.values()) joinFloor(walls, indices, reaches)

  const none = tolerance('noLength')
  const result = new Map<string, WallEnds>()
  for (const [i, reach] of reaches) {
    const wall = walls[i]!
    const length = wallAxis(wall).length
    const all = [reach.start.left, reach.start.right, reach.end.left, reach.end.right]
    // A wall too short for its corners keeps its square ends rather than turning inside out.
    if (!all.every(Number.isFinite)) continue
    if (length + reach.start.left + reach.end.left <= none || length + reach.start.right + reach.end.right <= none) continue
    if (all.every((v) => Math.abs(v) <= none)) continue
    if (result.has(wall.id)) continue
    result.set(wall.id, reach)
  }
  return result
}
