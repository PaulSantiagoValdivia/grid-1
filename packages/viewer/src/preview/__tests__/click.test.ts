import { describe, expect, it } from 'vitest'
import { CLICK_SLOP, isStillClick } from '../click'

/**
 * A press and release without moving counts as a click; anything more is an
 * orbit, a pan or a drag.
 * 2D and 3D share one slop, so a click feels the same in both.
 */
describe('isStillClick', () => {
  it('allows 4 px of movement', () => {
    expect(CLICK_SLOP).toBe(4)
    for (const delta of [0, 1, 3.9, 4]) expect(isStillClick(delta), String(delta)).toBe(true)
  })

  it('reads more than 4 px as a drag', () => {
    for (const delta of [4.01, 5, 40, 1000]) expect(isStillClick(delta), String(delta)).toBe(false)
  })

  it('is not a click when the distance makes no sense', () => {
    for (const delta of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(isStillClick(delta), String(delta)).toBe(false)
    }
  })
})
