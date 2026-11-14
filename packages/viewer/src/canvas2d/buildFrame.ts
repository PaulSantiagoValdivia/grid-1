/**
 * How the 2D view draws a part in flight.
 *
 * The geometry (what a half-traced wall covers) comes from `@ongrid/core/geometry`;
 * this only maps a step's progress to the cheap things the view changes per
 * animation frame: a clip, an offset, an opacity, a width.
 */

import type { BuildStep, Dimension, PlanOpening, Vec2 } from '@ongrid/core/geometry'
import type { InFlight } from '../preview/playback'
import { progressOf } from '../preview/progress'

/** How far the dimensions have faded in: 0 before their step, 1 after it. */
export function dimensionsProgress(
  steps: readonly BuildStep[],
  k: number,
  inFlight: readonly InFlight[]
): number {
  const index = steps.findIndex((step) => step.kind === 'dimensions')
  if (index < 0) return 1
  if (index >= k) return 0
  return progressOf(inFlight, 'dimensions', steps[index].id) ?? 1
}

/** A dimension's identity and value: an unchanged one never hides during a build. */
export function dimensionKey(dim: Dimension): string {
  const n = (v: number) => v.toFixed(4)
  return [dim.id, n(dim.from.x), n(dim.from.y), n(dim.to.x), n(dim.to.y), n(dim.offset)].join(':')
}

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
})

/** The opening `t` of the way open, from its centre outwards. */
export function openingAt(opening: PlanOpening, t: number): { from: Vec2; to: Vec2 } {
  const centre = lerp(opening.from, opening.to, 0.5)
  return { from: lerp(centre, opening.from, t), to: lerp(centre, opening.to, t) }
}

/** A strip across the wall between two points of its axis. */
export function stripAcross(from: Vec2, to: Vec2, normal: Vec2, thickness: number): Vec2[] {
  const nx = (normal.x * thickness) / 2
  const ny = (normal.y * thickness) / 2
  return [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny }
  ]
}
