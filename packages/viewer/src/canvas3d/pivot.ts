/**
 * Easing the orbit pivot to a focused storey.
 * Pure, so `BuildingCamera` only applies it on each frame.
 */

/**
 * How fast the pivot closes the gap, per second: the gap shrinks by e every
 * 1/40 s, which lands a 10 m move in about 230 ms.
 */
const RATE = 40
/** Close enough to stop easing and land exactly: well under a pixel. */
const LANDED = 0.001

/**
 * The pivot height one frame of `dt` seconds later, on its way to `goal`.
 *
 * Exponential, so it is the same pace at any frame rate and can never pass the
 * goal; it lands exactly once it is within a millimetre. Reduced motion lands
 * at once. A frame time that is not a positive number holds still.
 */
export function easePivot(current: number, goal: number, dt: number, reducedMotion: boolean): number {
  if (reducedMotion) return goal
  if (!(dt > 0)) return current
  const next = goal + (current - goal) * Math.exp(-RATE * dt)
  return Math.abs(goal - next) < LANDED ? goal : next
}

type Vec3 = readonly [number, number, number]

/**
 * The target and camera one frame later: both move up or down by the same
 * amount, so the angle and distance the user orbited to hold.
 */
export function moveRig(
  target: Vec3,
  camera: Vec3,
  goalY: number,
  dt: number,
  reducedMotion: boolean
): { target: [number, number, number]; camera: [number, number, number] } {
  const dy = easePivot(target[1], goalY, dt, reducedMotion) - target[1]
  return {
    target: [target[0], target[1] + dy, target[2]],
    camera: [camera[0], camera[1] + dy, camera[2]]
  }
}
