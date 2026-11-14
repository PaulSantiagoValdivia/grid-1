/** How far the pointer may move and still count as a click, in pixels. 2D and 3D share it. */
export const CLICK_SLOP = 4

/**
 * Whether a press and release `delta` pixels apart is a click rather than an
 * orbit, pan or drag. A distance that isn't a real number is never a click.
 */
export function isStillClick(delta: number): boolean {
  return Number.isFinite(delta) && delta >= 0 && delta <= CLICK_SLOP
}
