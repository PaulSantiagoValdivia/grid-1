/**
 * The "still working" pulse: like a text cursor, it sits where the last part
 * ended while the assistant works on the next save.
 */

import type { Vec2 } from '@ongrid/core/geometry'

interface PulseState {
  /** The drawing has caught up with the latest save. */
  readonly idle: boolean
  /** Where the last part drawn in this run ends; null before the first and after the run. */
  readonly lastPoint: Vec2 | null
}

/**
 * Where to show the pulse, or null. `state` is null outside a live run. It
 * never shows while a build plays, before anything was drawn, after the run
 * ended, or under reduce motion.
 */
export function pulseAt(state: PulseState | null, reducedMotion: boolean): Vec2 | null {
  if (!state || reducedMotion || !state.idle) return null
  return state.lastPoint
}
