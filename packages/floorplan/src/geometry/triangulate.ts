/**
 * Triangulation of a polygon with holes.
 *
 * Pure, like the rest of the core: it returns indices and numbers, and never
 * imports Three. Canvas3D still triangulates through Three's `ExtrudeGeometry`;
 * this exists so an exporter can produce the same walls without dragging the
 * renderer along.
 *
 * The input is a wall elevation: a rectangle with doors and windows cut out as
 * holes. That is NOT the textbook case. A door's sill is 0, so its bottom edge
 * lies on the wall's bottom edge; a door can start at the wall's end; a window
 * can reach the top; two openings can share an edge; and a full-height one cuts
 * the wall in two. Validation allows all of it (`from >= 0`, `to <= length`,
 * `sill >= 0`, `head <= height`, touching is not overlapping). A triangulator
 * that assumes holes float free inside the outline fails on exactly the walls
 * people draw, so this one first rewrites the input into rings that do not
 * touch along an edge:
 *
 *   1. conform: a vertex lying on another ring's edge splits that edge;
 *   2. cancel: directed edges that appear in both directions are not boundary
 *      (the door's bottom is also the wall's bottom: neither is a face);
 *   3. relink what is left into rings, one per connected piece of solid;
 *
 * and only then bridges each hole to its outline and ear-clips the result.
 *
 * Two properties are deliberate:
 *   - It returns the boundary rings it ended up with, because a solid built
 *     from this triangulation needs side faces that match the caps vertex for
 *     vertex, and the original outline/holes are no longer that boundary.
 *   - Every tie breaks by input order, never by coordinate order. A rule such
 *     as "the leftmost vertex" depends on the frame, and then a wall along a
 *     diagonal triangulates differently from the same wall along an axis.
 *
 * Holes must be disjoint (touching is fine). Overlapping openings are reported
 * by validation but not marked broken, so this stays total — it terminates and
 * never throws — but gives no guarantee about what it returns for them.
 */

import type { Vec2 } from './vec2'
import { cross, dot, signedArea, sub } from './vec2'
import { TOLERANCES } from './tolerances'

/** Metres. Far below any real feature, far above float noise at plan scale. Fixed entries. */
const TOL = TOLERANCES.samePoint.value
const ANGLE_EPS = TOLERANCES.sameAngle.value
const AREA_EPS = TOLERANCES.noArea.value
const TWO_PI = Math.PI * 2

export interface Triangulation {
  /** Distinct points. Triangles and rings index into this. */
  readonly vertices: readonly Vec2[]
  /** Counter-clockwise. */
  readonly triangles: readonly (readonly [number, number, number])[]
  /**
   * The region's boundary. Outer rings wind counter-clockwise, holes clockwise.
   * They can contain more points than the input did: a vertex that sat on
   * another ring's edge is kept, so the caps and the sides of a solid agree.
   */
  readonly rings: readonly (readonly number[])[]
}

interface Edge {
  readonly from: number
  readonly to: number
}

/** Points closer than `TOL` are one vertex; the first one seen is its position. */
class Vertices {
  readonly points: Vec2[] = []

  idOf(q: Vec2): number {
    for (let i = 0; i < this.points.length; i++) {
      const known = this.points[i]!
      if (Math.abs(known.x - q.x) <= TOL && Math.abs(known.y - q.y) <= TOL) return i
    }
    this.points.push(q)
    return this.points.length - 1
  }
}

function ringArea(points: readonly Vec2[], ring: readonly number[]): number {
  return signedArea(ring.map((i) => points[i]!))
}

/** Angle turning `a` counter-clockwise onto `b`, in [0, 2π). */
function turn(a: Vec2, b: Vec2): number {
  const angle = Math.atan2(cross(a, b), dot(a, b))
  return angle < 0 ? angle + TWO_PI : angle
}

/** Distance from `q` to the infinite line through `a` and `b`, signed: left is positive. */
function side(a: Vec2, b: Vec2, q: Vec2): number {
  const d = sub(b, a)
  return cross(d, sub(q, a)) / Math.hypot(d.x, d.y)
}

function sign(distance: number): -1 | 0 | 1 {
  return distance > TOL ? 1 : distance < -TOL ? -1 : 0
}

/** Whether the closed segments touch at all, endpoints included. */
function touches(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const s1 = sign(side(a, b, c))
  const s2 = sign(side(a, b, d))
  const s3 = sign(side(c, d, a))
  const s4 = sign(side(c, d, b))

  if (s1 === 0 && s2 === 0) {
    // Collinear: they touch if their shadows on the line overlap.
    const axis = sub(b, a)
    const along = (q: Vec2) => dot(axis, sub(q, a)) / Math.hypot(axis.x, axis.y)
    const length = Math.hypot(axis.x, axis.y)
    const lo = Math.min(along(c), along(d))
    const hi = Math.max(along(c), along(d))
    return hi >= -TOL && lo <= length + TOL
  }
  return s1 * s2 <= 0 && s3 * s4 <= 0
}

/**
 * Whether `dir`, seen from `v`, points into the region at a ring vertex. The
 * region is on the left of the ring's travel, so it is the sweep that turns
 * counter-clockwise from the outgoing edge round to the incoming one.
 */
function pointsInside(prev: Vec2, v: Vec2, next: Vec2, dir: Vec2): boolean {
  const outgoing = sub(next, v)
  const incoming = sub(prev, v)
  let cone = turn(outgoing, incoming)
  if (cone < ANGLE_EPS) cone = TWO_PI
  const angle = turn(outgoing, dir)
  return angle > ANGLE_EPS && angle < cone - ANGLE_EPS
}

// ---------------------------------------------------------------------------
// 1-3. Rewrite the rings so none of them touches another along an edge
// ---------------------------------------------------------------------------

/** Splits every edge at the vertices that lie on it. */
function conform(edges: readonly Edge[], points: readonly Vec2[], used: readonly number[]): Edge[] {
  const result: Edge[] = []
  for (const { from, to } of edges) {
    const a = points[from]!
    const b = points[to]!
    const axis = sub(b, a)
    const lengthSq = dot(axis, axis)

    const onEdge: { id: number; t: number }[] = []
    for (const id of used) {
      if (id === from || id === to) continue
      const q = points[id]!
      const t = dot(axis, sub(q, a)) / lengthSq
      if (t > 0 && t < 1 && Math.abs(side(a, b, q)) <= TOL) onEdge.push({ id, t })
    }
    onEdge.sort((x, y) => x.t - y.t)

    let previous = from
    for (const { id } of onEdge) {
      result.push({ from: previous, to: id })
      previous = id
    }
    result.push({ from: previous, to })
  }
  return result
}

/** Drops each edge that is met by its own reverse: that segment is not boundary. */
function cancel(edges: readonly Edge[]): Edge[] {
  const alive = edges.map(() => true)
  const open = new Map<string, number[]>()
  const key = (from: number, to: number) => `${from}>${to}`

  edges.forEach(({ from, to }, index) => {
    const waiting = open.get(key(to, from))
    const partner = waiting?.pop()
    if (partner !== undefined) {
      alive[partner] = false
      alive[index] = false
      return
    }
    const mine = open.get(key(from, to))
    if (mine) mine.push(index)
    else open.set(key(from, to), [index])
  })

  return edges.filter((_, index) => alive[index])
}

/**
 * Chains the edges that survived into rings.
 *
 * At a vertex with several ways out — rings that touch at a point — it takes
 * the one that turns first CLOCKWISE from the way back, which hugs the solid
 * on the ring's left. Two pieces of wall that meet only at a corner stay two
 * rings (not a figure-eight), and a hole that kisses the outline is absorbed
 * into the outline's ring through that shared vertex.
 */
function relink(edges: readonly Edge[], points: readonly Vec2[]): number[][] {
  const outgoing = new Map<number, number[]>()
  edges.forEach((edge, index) => {
    const list = outgoing.get(edge.from)
    if (list) list.push(index)
    else outgoing.set(edge.from, [index])
  })

  const used = edges.map(() => false)
  const rings: number[][] = []

  edges.forEach((first, start) => {
    if (used[start]) return
    used[start] = true
    const ring = [first.from]
    let current = first

    for (let guard = 0; guard <= edges.length; guard++) {
      const at = current.to
      const back = sub(points[current.from]!, points[at]!)
      const candidates = (outgoing.get(at) ?? []).filter((i) => !used[i] || i === start)
      if (candidates.length === 0) break

      let chosen = candidates[0]!
      if (candidates.length > 1) {
        let best = Infinity
        for (const i of candidates) {
          let angle = turn(sub(points[edges[i]!.to]!, points[at]!), back)
          if (angle < ANGLE_EPS) angle = TWO_PI
          if (angle < best - ANGLE_EPS) {
            best = angle
            chosen = i
          }
        }
      }

      if (chosen === start) break
      used[chosen] = true
      ring.push(at)
      current = edges[chosen]!
    }
    rings.push(ring)
  })

  return rings
}

// ---------------------------------------------------------------------------
// 4. Join each hole to its outline
// ---------------------------------------------------------------------------

/**
 * Cuts each hole into the outer ring along a bridge: the shortest segment from
 * a hole vertex to a ring vertex that stays inside the region. The bridge is
 * walked twice (there and back), so the result is one weakly simple polygon.
 */
function bridgeHoles(
  points: readonly Vec2[],
  outer: readonly number[],
  holes: readonly (readonly number[])[]
): { ring: number[]; bridged: (readonly number[])[] } {
  let ring = [...outer]
  const pending = [...holes]
  const bridged: (readonly number[])[] = []

  while (pending.length > 0) {
    const obstacles: Edge[] = []
    for (const loop of [ring, ...pending]) {
      for (let i = 0; i < loop.length; i++) {
        obstacles.push({ from: loop[i]!, to: loop[(i + 1) % loop.length]! })
      }
    }

    let best: { length: number; hole: number; a: number; b: number } | null = null

    search: for (let h = 0; h < pending.length; h++) {
      const hole = pending[h]!
      for (let a = 0; a < hole.length; a++) {
        const aId = hole[a]!
        const aPoint = points[aId]!
        const aPrev = points[hole[(a + hole.length - 1) % hole.length]!]!
        const aNext = points[hole[(a + 1) % hole.length]!]!

        for (let b = 0; b < ring.length; b++) {
          const bId = ring[b]!
          const bPoint = points[bId]!
          const length = Math.hypot(bPoint.x - aPoint.x, bPoint.y - aPoint.y)
          if (best && length >= best.length - TOL) continue

          const bPrev = points[ring[(b + ring.length - 1) % ring.length]!]!
          const bNext = points[ring[(b + 1) % ring.length]!]!

          let ok: boolean
          if (aId === bId) {
            // Zero-length bridge: the hole kisses the ring at this vertex. Its
            // two edges must both leave into the ring's side.
            ok =
              pointsInside(bPrev, bPoint, bNext, sub(aPrev, aPoint)) &&
              pointsInside(bPrev, bPoint, bNext, sub(aNext, aPoint))
          } else {
            ok =
              pointsInside(bPrev, bPoint, bNext, sub(aPoint, bPoint)) &&
              pointsInside(aPrev, aPoint, aNext, sub(bPoint, aPoint)) &&
              obstacles.every(
                (edge) =>
                  edge.from === aId ||
                  edge.to === aId ||
                  edge.from === bId ||
                  edge.to === bId ||
                  !touches(aPoint, bPoint, points[edge.from]!, points[edge.to]!)
              )
          }

          if (!ok) continue
          best = { length, hole: h, a, b }
          if (length === 0) break search
        }
      }
    }

    if (!best) {
      // Nothing can see this hole: only possible for input validation rejects.
      // Dropping it keeps the function total.
      pending.shift()
      continue
    }

    const hole = pending.splice(best.hole, 1)[0]!
    const around = [...hole.slice(best.a), ...hole.slice(0, best.a)]
    const bId = ring[best.b]!
    ring =
      around[0] === bId
        ? // The hole kisses the ring here: one shared vertex, no zero-length edge.
          [...ring.slice(0, best.b + 1), ...around.slice(1), bId, ...ring.slice(best.b + 1)]
        : [...ring.slice(0, best.b + 1), ...around, around[0]!, bId, ...ring.slice(best.b + 1)]
    bridged.push(hole)
  }

  return { ring, bridged }
}

// ---------------------------------------------------------------------------
// 5. Ear clipping
// ---------------------------------------------------------------------------

/**
 * Whether `q` lies in, or within `TOL` of, the counter-clockwise triangle.
 * Inclusive on purpose: a vertex on the ear's diagonal would end up on an edge
 * the ear creates, and the mesh would stop being conforming.
 */
function inTriangle(a: Vec2, b: Vec2, c: Vec2, q: Vec2): boolean {
  return side(a, b, q) >= -TOL && side(b, c, q) >= -TOL && side(c, a, q) >= -TOL
}

function earcut(points: readonly Vec2[], polygon: readonly number[]): [number, number, number][] {
  const poly = [...polygon]
  const triangles: [number, number, number][] = []
  let from = 0

  const isEar = (k: number): boolean => {
    const n = poly.length
    const prevId = poly[(k + n - 1) % n]!
    const nextId = poly[(k + 1) % n]!
    const a = points[prevId]!
    const b = points[poly[k]!]!
    const c = points[nextId]!
    if (side(c, a, b) <= TOL) return false // not convex, or flat

    for (const id of poly) {
      const q = points[id]!
      // The bridge makes a vertex appear twice: a copy is not an obstacle.
      if ([a, b, c].some((corner) => Math.abs(corner.x - q.x) <= TOL && Math.abs(corner.y - q.y) <= TOL)) {
        continue
      }
      if (inTriangle(a, b, c, q)) return false
    }
    return true
  }

  while (poly.length > 3) {
    let found = -1
    for (let step = 0; step < poly.length; step++) {
      const k = (from + step) % poly.length
      if (isEar(k)) {
        found = k
        break
      }
    }

    if (found < 0) {
      // No clean ear: the polygon is not a valid one. Take any convex corner so
      // the loop still ends; if there is none, discard a vertex.
      const n = poly.length
      found = poly.findIndex((_, k) => {
        const a = points[poly[(k + n - 1) % n]!]!
        const b = points[poly[k]!]!
        const c = points[poly[(k + 1) % n]!]!
        return side(c, a, b) > TOL
      })
      if (found < 0) {
        poly.splice(0, 1)
        continue
      }
    }

    const n = poly.length
    triangles.push([poly[(found + n - 1) % n]!, poly[found]!, poly[(found + 1) % n]!])
    poly.splice(found, 1)
    from = found % poly.length
  }

  if (poly.length === 3) {
    const [a, b, c] = poly.map((i) => points[i]!) as [Vec2, Vec2, Vec2]
    if (side(c, a, b) > TOL) triangles.push([poly[0]!, poly[1]!, poly[2]!])
  }
  return triangles
}

// ---------------------------------------------------------------------------

function empty(): Triangulation {
  return { vertices: [], triangles: [], rings: [] }
}

/** Even-odd containment. Points handed to it never sit on the ring. */
function contains(ring: readonly Vec2[], q: Vec2): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Triangulates `outline` minus `holes`.
 *
 * Accepts any winding. Triangles come out counter-clockwise. A wall that a
 * full-height opening cuts in two comes out as two outer rings.
 */
export function triangulate(
  outline: readonly Vec2[],
  holes: readonly (readonly Vec2[])[] = []
): Triangulation {
  const vertices = new Vertices()
  const points = vertices.points

  const toRing = (loop: readonly Vec2[], wantCounterClockwise: boolean): number[] => {
    if (loop.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) return []
    const ring: number[] = []
    for (const q of loop) {
      const id = vertices.idOf(q)
      if (ring[ring.length - 1] !== id) ring.push(id)
    }
    while (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring.pop()
    if (ring.length < 3) return []
    const area = ringArea(points, ring)
    if (Math.abs(area) < AREA_EPS) return []
    return area > 0 === wantCounterClockwise ? ring : ring.reverse()
  }

  const outerRing = toRing(outline, true)
  if (outerRing.length === 0) return empty()
  const loops = [outerRing, ...holes.map((hole) => toRing(hole, false)).filter((r) => r.length > 0)]

  const used = [...new Set(loops.flat())]
  const edges: Edge[] = loops.flatMap((loop) =>
    loop.map((from, i) => ({ from, to: loop[(i + 1) % loop.length]! }))
  )

  const rings = relink(cancel(conform(edges, points, used)), points)

  const outers: number[][] = []
  const inner: number[][] = []
  for (const ring of rings) {
    const area = ringArea(points, ring)
    if (area > AREA_EPS) outers.push(ring)
    else if (area < -AREA_EPS) inner.push(ring)
  }

  // Each hole belongs to the smallest outer ring around it.
  const owned = outers.map(() => [] as number[][])
  for (const hole of inner) {
    const a = points[hole[0]!]!
    const b = points[hole[1]!]!
    const probe = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    let owner = -1
    for (let i = 0; i < outers.length; i++) {
      if (!contains(outers[i]!.map((id) => points[id]!), probe)) continue
      if (owner < 0 || ringArea(points, outers[i]!) < ringArea(points, outers[owner]!)) owner = i
    }
    if (owner >= 0) owned[owner]!.push(hole)
  }

  const triangles: [number, number, number][] = []
  const kept: (readonly number[])[] = []
  outers.forEach((outer, i) => {
    const { ring, bridged } = bridgeHoles(points, outer, owned[i]!)
    triangles.push(...earcut(points, ring))
    kept.push(outer, ...bridged)
  })

  // Hand back only the vertices in use, in the order they were first seen.
  const remap = new Map<number, number>()
  ;[...new Set(kept.flat())]
    .sort((x, y) => x - y)
    .forEach((id, index) => remap.set(id, index))

  return {
    vertices: [...remap.keys()].map((id) => points[id]!),
    triangles: triangles.map(([a, b, c]) => [remap.get(a)!, remap.get(b)!, remap.get(c)!]),
    rings: kept.map((ring) => ring.map((id) => remap.get(id)!))
  }
}
