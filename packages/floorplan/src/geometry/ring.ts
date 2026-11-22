/**
 * A ring of corners as a plot's boundary (BRF-3) or a floor's outline (BRF-4) states it: whether
 * it crosses itself or encloses no ground. Pure, and only the tolerance table and the vectors
 * below it, so the plan schema can read it too.
 */
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { signedArea } from './vec2'

const orient = (a: Vec2, b: Vec2, c: Vec2): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

/** Whether two segments cross or touch. */
export function segmentsMeet(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const eps = tolerance('onLine')
  const d1 = orient(c, d, a)
  const d2 = orient(c, d, b)
  const d3 = orient(a, b, c)
  const d4 = orient(a, b, d)
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return true
  const on = (p: Vec2, q: Vec2, r: Vec2, o: number): boolean =>
    Math.abs(o) <= eps && Math.min(p.x, q.x) - eps <= r.x && r.x <= Math.max(p.x, q.x) + eps && Math.min(p.y, q.y) - eps <= r.y && r.y <= Math.max(p.y, q.y) + eps
  return on(c, d, a, d1) || on(c, d, b, d2) || on(a, b, c, d3) || on(a, b, d, d4)
}

/** Why a ring of corners cannot be a plot: it crosses itself or encloses no ground. Null when sound. */
export function ringProblem(points: readonly Vec2[]): string | null {
  if (points.length < 3) return 'it has fewer than three corners'
  if (Math.abs(signedArea(points)) <= tolerance('noArea')) return 'it encloses no ground'
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]!
    const b = points[(i + 1) % n]!
    if (Math.hypot(b.x - a.x, b.y - a.y) <= tolerance('noLength')) return `edge ${i + 1} has no length`
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a corner, and the last edge neighbours the first.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segmentsMeet(a, b, points[j]!, points[(j + 1) % n]!)) return `edges ${i + 1} and ${j + 1} cross or touch`
    }
  }
  return null
}

