/**
 * A lift shaft's plan symbol (SHT-11, lab DR-5): the shaft is the room used as a `lift` on each
 * floor it serves (LVL-3), boxed by its walls, and its symbol is a cross in it, corner to corner.
 *
 * A shaft with four corners and no hole gets its two diagonals. Any other outline gets a cross
 * on the point of its floor farthest from every edge (`poleOfInaccessibility`), as wide as the
 * circle that fits there, so it never runs out of the room.
 *
 * Pure, and never throws.
 */

import type { Vec2 } from './vec2'
import { cross, distance, sub } from './vec2'
import { poleOfInaccessibility } from './innerPoint'
import { tolerance } from './tolerances'

export interface LiftSymbol {
  /** The cross's two lines. Empty when the outline has no floor. */
  readonly lines: readonly (readonly [Vec2, Vec2])[]
}

/** The outline without corners that lie on a straight side, which a wall's T-junction can leave. */
function corners(outline: readonly Vec2[]): Vec2[] {
  const n = outline.length
  return outline.filter((p, i) => {
    const before = outline[(i + n - 1) % n]!
    const after = outline[(i + 1) % n]!
    const a = sub(p, before)
    const b = sub(after, p)
    const lengths = distance(before, p) * distance(p, after)
    return lengths > 0 && Math.abs(cross(a, b)) > tolerance('parallel') * lengths
  })
}

/** The lift symbol for a room's outline and holes, in plan metres. */
export function liftSymbol(outline: readonly Vec2[], holes: readonly (readonly Vec2[])[] = []): LiftSymbol {
  const found = corners(outline)
  if (found.length === 4 && holes.length === 0) {
    const turns = found.map((p, i) => cross(sub(p, found[(i + 3) % 4]!), sub(found[(i + 1) % 4]!, p)))
    if (turns.every((t) => t > 0) || turns.every((t) => t < 0)) {
      return { lines: [[found[0]!, found[2]!], [found[1]!, found[3]!]] }
    }
  }
  const pole = poleOfInaccessibility(outline, undefined, holes)
  const reach = pole.distance / Math.SQRT2
  if (!(reach > tolerance('noLength'))) return { lines: [] }
  const { x, y } = pole.point
  return {
    lines: [
      [{ x: x - reach, y: y - reach }, { x: x + reach, y: y + reach }],
      [{ x: x - reach, y: y + reach }, { x: x + reach, y: y - reach }]
    ]
  }
}
