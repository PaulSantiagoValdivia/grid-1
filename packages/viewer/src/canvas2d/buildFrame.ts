/**
 * How the 2D view draws a part in flight.
 *
 * The geometry (what a half-traced wall covers) comes from `@ongrid/floorplan/geometry`;
 * this only maps a step's progress to the cheap things the view changes per
 * animation frame: a clip, an offset, an opacity, a width.
 */

import type { BuildStep, Dimension } from '@ongrid/floorplan/geometry'
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

export { openingAt, stripAcross } from './strip'
