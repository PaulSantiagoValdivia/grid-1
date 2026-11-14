import { describe, expect, it } from 'vitest'
import { easePivot, moveRig } from '../pivot'

/**
 * Focusing a storey moves the orbit pivot up or down to it, and the camera by
 * the same amount, so the framing and angle hold (design D3). Smooth, about
 * 250 ms, and at once under reduced motion.
 */

const FRAME = 1 / 60

/** Frames until `easePivot` lands exactly on the goal, from `from`. */
function framesToReach(from: number, goal: number, dt = FRAME): number {
  let y = from
  for (let frame = 1; frame <= 600; frame++) {
    y = easePivot(y, goal, dt, false)
    if (y === goal) return frame
  }
  return Infinity
}

describe('easePivot', () => {
  it('reaches the goal in about 250 ms', () => {
    for (const [from, goal] of [
      [0, 10],
      [0, 3.25],
      [15, -2.75],
      [0, 300]
    ] as const) {
      const ms = framesToReach(from, goal) * FRAME * 1000
      expect(ms, `${from} → ${goal}`).toBeGreaterThan(120)
      expect(ms, `${from} → ${goal}`).toBeLessThan(350)
    }
  })

  it('reaches it at the same pace whatever the frame rate', () => {
    const at60 = framesToReach(0, 10, 1 / 60) / 60
    const at144 = framesToReach(0, 10, 1 / 144) / 144
    expect(Math.abs(at60 - at144)).toBeLessThan(0.03)
  })

  it('never overshoots, and only moves toward the goal', () => {
    for (const [from, goal] of [
      [0, 10],
      [10, 0],
      [-2.75, 6.3]
    ] as const) {
      let y: number = from
      for (const dt of [FRAME, FRAME, 0.5, FRAME, 3, FRAME]) {
        const next = easePivot(y, goal, dt, false)
        expect(Math.abs(goal - next)).toBeLessThanOrEqual(Math.abs(goal - y))
        expect(Math.sign(goal - next) * Math.sign(goal - y)).toBeGreaterThanOrEqual(0)
        y = next
      }
    }
  })

  it('moves at once under reduced motion', () => {
    expect(easePivot(0, 6.3, FRAME, true)).toBe(6.3)
    expect(easePivot(9, -2.75, 0, true)).toBe(-2.75)
  })

  it('stays put at the goal, and with no time passed', () => {
    expect(easePivot(3.25, 3.25, FRAME, false)).toBe(3.25)
    expect(easePivot(0, 10, 0, false)).toBe(0)
  })

  it('is total: a bad frame time holds still instead of jumping or going NaN', () => {
    for (const dt of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
      expect(easePivot(2, 10, dt, false)).toBe(2)
    }
    expect(easePivot(2, 10, Number.POSITIVE_INFINITY, false)).toBe(10)
  })
})

describe('moveRig', () => {
  it('moves the camera by the same delta as the target, in y only', () => {
    const target = [4, 0, -3] as const
    const camera = [18, 12, 11] as const
    const { target: t, camera: c } = moveRig(target, camera, 6.3, FRAME, false)
    const dy = t[1] - target[1]

    expect(dy).toBeGreaterThan(0)
    expect(t[0]).toBe(target[0])
    expect(t[2]).toBe(target[2])
    expect(c[0]).toBe(camera[0])
    expect(c[1] - camera[1]).toBeCloseTo(dy, 12)
    expect(c[2]).toBe(camera[2])
  })

  it('keeps wherever the user orbited to, moving it only up or down', () => {
    const orbited = [-7, 20, 2] as const
    const { camera } = moveRig([0, 3, 0], orbited, 0, FRAME, true)
    expect(camera).toEqual([-7, 17, 2])
  })
})
