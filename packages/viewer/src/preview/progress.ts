/**
 * A step's progress as both views read it: eased, and looked up by kind and id.
 */

import type { StepKind } from '@ongrid/core/geometry'
import type { InFlight } from './playback'

/** Slow in and out, so a part settles instead of stopping dead. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Eased progress of `id`'s `kind` step, or null when it isn't in flight. */
export function progressOf(
  inFlight: readonly InFlight[] | undefined,
  kind: StepKind,
  id: string
): number | null {
  const found = inFlight?.find((f) => f.step.kind === kind && f.step.id === id)
  return found ? ease(found.t) : null
}

/** Eased progress of the removals, which fade together. */
export function removalProgress(inFlight: readonly InFlight[] | undefined): number | null {
  const found = inFlight?.find((f) => f.step.kind === 'remove')
  return found ? ease(found.t) : null
}
