/**
 * Vectors on the plan.
 *
 * The plan model stores points as `[x, y]` tuples; in here we work with
 * objects because the geometry reads much better that way.
 */

export interface Vec2 {
  readonly x: number
  readonly y: number
}

/** Default tolerance, in meters. One centimeter. */
export const EPS = 0.01

export function vec(x: number, y: number): Vec2 {
  return { x, y }
}

/** Converts a tuple from the plan file into a vector. */
export function fromTuple(p: readonly [number, number]): Vec2 {
  return { x: p[0], y: p[1] }
}

export function toTuple(v: Vec2): [number, number] {
  return [v.x, v.y]
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k }
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

/**
 * Z component of the cross product. In 2D it is a scalar, and it tells which
 * side of `a` the vector `b` falls on: positive to the left, negative to the
 * right.
 */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v)
  if (len === 0) throw new Error('Cannot normalize a zero-length vector')
  return { x: v.x / len, y: v.y / len }
}

/**
 * Left normal: rotates the vector 90° counter-clockwise.
 *
 * This is the operation that turns a wall's direction into the direction its
 * thickness grows along.
 */
export function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x }
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function equals(a: Vec2, b: Vec2, tol: number = EPS): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol
}

/** An infinite line, given by a point and a unit direction. */
export interface Line {
  readonly point: Vec2
  readonly dir: Vec2
}

/**
 * Intersection of two infinite lines. Returns `null` when they are parallel.
 *
 * We work with lines rather than segments on purpose: that way two walls that
 * do not quite touch still produce the correct corner, which is exactly what
 * rooms need.
 */
export function intersectLines(a: Line, b: Line): Vec2 | null {
  const denom = cross(a.dir, b.dir)
  if (Math.abs(denom) < 1e-9) return null
  const t = cross(sub(b.point, a.point), b.dir) / denom
  return add(a.point, scale(a.dir, t))
}

/** Signed area of a polygon (shoelace formula). */
export function signedArea(points: readonly Vec2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!
    const next = points[(i + 1) % points.length]!
    sum += current.x * next.y - next.x * current.y
  }
  return sum / 2
}

export function area(points: readonly Vec2[]): number {
  return Math.abs(signedArea(points))
}

/** True when the polygon winds counter-clockwise. */
export function isCounterClockwise(points: readonly Vec2[]): boolean {
  return signedArea(points) > 0
}

export function centroid(points: readonly Vec2[]): Vec2 {
  if (points.length === 0) throw new Error('No points to average')
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}
