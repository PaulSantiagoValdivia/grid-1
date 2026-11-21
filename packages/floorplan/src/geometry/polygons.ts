/**
 * Polygons as `polygon-clipping` (MIT) takes them, rings of [x, y] pairs, and the few shapes
 * built from walls that more than one check needs: a wall as a strip, and the corner made good
 * where two walls meet. Moved here from `spaces.ts` when ARE-5 needed them too.
 */

import polygonClipping from 'polygon-clipping'
import type { Geom, MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import type { Vec2 } from './vec2'
import { TOLERANCES } from './tolerances'

export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export function boxOfRings(rings: readonly (readonly Pair[])[]): Box {
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

export const overlaps = (a: Box, b: Box): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

export const ringArea = (ring: readonly Pair[]): number => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!
    const [bx, by] = ring[(i + 1) % ring.length]!
    sum += ax * by - bx * ay
  }
  return Math.abs(sum / 2)
}

export const polygonArea = (polygon: Polygon): number =>
  polygon.reduce((sum, ring, i) => sum + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0)

export const multiArea = (geom: MultiPolygon): number => geom.reduce((sum, polygon) => sum + polygonArea(polygon), 0)

export const union = (geoms: readonly Geom[]): MultiPolygon =>
  geoms.length === 0 ? [] : polygonClipping.union(geoms[0]!, ...geoms.slice(1))

export const intersectionArea = (a: Geom, b: Geom): number => multiArea(polygonClipping.intersection(a, b))

/** A strip along a segment: `half` either side of it, lengthened by `ends` at both ends. */
export function strip(start: Vec2, dir: Vec2, length: number, half: number, ends: number, snap: (v: number) => number): Polygon {
  const a = { x: start.x - dir.x * ends, y: start.y - dir.y * ends }
  const b = { x: start.x + dir.x * (length + ends), y: start.y + dir.y * (length + ends) }
  const nx = -dir.y * half
  const ny = dir.x * half
  const p = (x: number, y: number): Pair => [snap(x), snap(y)]
  return [[p(a.x - nx, a.y - ny), p(b.x - nx, b.y - ny), p(b.x + nx, b.y + ny), p(a.x + nx, a.y + ny)]]
}

/** Ends of two walls closer than this, in metres, are one joint (a fixed entry). */
export const JOINT = TOLERANCES.joint.value

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
/** What a corner fill needs to know of a wall: its thickness, where its axis starts, its direction and length. */
export interface WallRun {
  readonly wall: { readonly thickness: number }
  readonly start: Vec2
  readonly dir: Vec2
  readonly length: number
}

export function cornerFills(walls: readonly WallRun[], inset: number, snap: (v: number) => number): Polygon[] {
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
      if (Math.abs(turn) < TOLERANCES.parallel.value) continue
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
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const turn = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = []
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, p) <= TOLERANCES.noArea.value) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

/**
 * A point inside a polygon, away from its edges: the middle of the widest gap that a few
 * horizontal lines across it find. The centre of the corners can lie outside an L or in an
 * island, so it is not used.
 */
export function pointInside(polygon: Polygon, box: Box): Vec2 {
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
