/**
 * Plans for tests: one closed outline of walls and the room inside it. Test code only.
 *
 * The walls are w1..wn, wall i running from point i to point i + 1, and the room `r1`
 * lists them in that order. Give the points counter-clockwise (C3).
 */

import type { Room, Wall } from '../geometry/plan'

export type Point = [number, number]

export interface OutlineOptions {
  /** Thickness of each wall, by position; 0.2 m when left out. */
  readonly thickness?: readonly number[]
  /** Turn the whole outline about the origin, in degrees counter-clockwise. */
  readonly rotate?: number
  /** Positions of walls drawn from their other end. */
  readonly reverse?: readonly number[]
}

export const DEFAULT_THICKNESS = 0.2

/** A point turned about the origin by `degrees` counter-clockwise. */
export function turn([x, y]: readonly [number, number], degrees: number): Point {
  const a = (degrees * Math.PI) / 180
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}

export function outline(points: readonly Point[], options: OutlineOptions = {}): { walls: Wall[]; room: Room } {
  const deg = options.rotate ?? 0
  const walls = points.map((p, i): Wall => {
    const a = turn(p, deg)
    const b = turn(points[(i + 1) % points.length]!, deg)
    const flipped = options.reverse?.includes(i) ?? false
    return {
      id: `w${i + 1}`,
      start: flipped ? b : a,
      end: flipped ? a : b,
      thickness: options.thickness?.[i] ?? DEFAULT_THICKNESS,
      height: 2.7,
      kind: 'exterior'
    }
  })
  return { walls, room: { id: 'r1', name: 'Room', boundary: walls.map((w) => w.id), use: 'living' } }
}

/**
 * The area between the inner faces of a right-angled outline whose walls all have one
 * thickness `t`: the centre-line area, less half a wall along the whole perimeter, plus a
 * (t/2)² square back at each convex corner and less one at each reflex corner.
 */
export function insideArea(points: readonly Point[], t = DEFAULT_THICKNESS): number {
  const d = t / 2
  let twice = 0
  let perimeter = 0
  let corners = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const q = points[(i + 1) % points.length]!
    const r = points[(i + 2) % points.length]!
    twice += p[0] * q[1] - q[0] * p[1]
    perimeter += Math.hypot(q[0] - p[0], q[1] - p[1])
    corners += (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) > 0 ? 1 : -1
  }
  return twice / 2 - perimeter * d + corners * d * d
}
