/**
 * How a wall moved, read from its two axes.
 *
 * The first description that fits wins: translated, resized, rotated,
 * reshaped. Ends count as fixed under the same box test the diff uses for
 * positions, so a wall the diff calls moved is never called still here.
 */

import type { Wall } from '../plan'
import type { Vec2 } from '../vec2'
import { cross, dot, fromTuple, length, normalize, perp, sub } from '../vec2'
import type { WallMotion } from './types'

/**
 * Below this, a pair of rotated segments has a pivot so far away that its
 * position is noise: the wall is reshaped, not rotated about the horizon.
 */
const MIN_ROTATION_DETERMINANT = 1e-6

function within(v: Vec2, epsilon: number): boolean {
  return Math.abs(v.x) <= epsilon && Math.abs(v.y) <= epsilon
}

function tuple(v: Vec2): readonly [number, number] {
  return [v.x, v.y]
}

/** Undefined when neither end moved: the change is about something else. */
export function wallMotion(before: Wall, after: Wall, epsilon: number): WallMotion | undefined {
  const s0 = fromTuple(before.start)
  const e0 = fromTuple(before.end)
  const s1 = fromTuple(after.start)
  const e1 = fromTuple(after.end)

  const startMove = sub(s1, s0)
  const endMove = sub(e1, e0)
  const startFixed = within(startMove, epsilon)
  const endFixed = within(endMove, epsilon)
  if (startFixed && endFixed) return undefined

  const axis0 = sub(e0, s0)
  const axis1 = sub(e1, s1)
  const length0 = length(axis0)
  const length1 = length(axis1)
  // A wall with no length has no direction to describe a motion against.
  if (length0 === 0 || length1 === 0) return { kind: 'reshaped' }

  const dir0 = normalize(axis0)
  const dir1 = normalize(axis1)

  if (within(sub(endMove, startMove), epsilon)) {
    const vector = { x: (startMove.x + endMove.x) / 2, y: (startMove.y + endMove.y) / 2 }
    return {
      kind: 'translated',
      vector: tuple(vector),
      normalDistance: dot(vector, perp(dir0)),
      axialDistance: dot(vector, dir0)
    }
  }

  if (startFixed !== endFixed) {
    // The free end must stay on the wall's own line, on the same side of the fixed end.
    const reach = startFixed ? sub(e1, s0) : sub(e0, s1)
    if (Math.abs(cross(dir0, reach)) <= epsilon && dot(dir0, reach) > 0) {
      return {
        kind: 'resized',
        fixedEnd: startFixed ? 'start' : 'end',
        lengthDelta: length1 - length0
      }
    }
  }

  if (Math.abs(length1 - length0) <= epsilon) {
    const radians = Math.atan2(cross(dir0, dir1), dot(dir0, dir1))
    let angleDeg = (radians * 180) / Math.PI
    if (angleDeg <= -180 + 1e-9) angleDeg = 180

    if (startFixed) return { kind: 'rotated', pivot: tuple(s0), angleDeg }
    if (endFixed) return { kind: 'rotated', pivot: tuple(e0), angleDeg }

    // The point P with R(s0 - P) + P = s1, from (I - R) P = s1 - R s0.
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    const determinant = 2 - 2 * c
    if (determinant >= MIN_ROTATION_DETERMINANT) {
      const rx = s1.x - (c * s0.x - s * s0.y)
      const ry = s1.y - (s * s0.x + c * s0.y)
      return {
        kind: 'rotated',
        pivot: [((1 - c) * rx - s * ry) / determinant, (s * rx + (1 - c) * ry) / determinant],
        angleDeg
      }
    }
  }

  return { kind: 'reshaped' }
}
