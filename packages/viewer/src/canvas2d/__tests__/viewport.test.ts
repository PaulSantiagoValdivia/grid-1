import { describe, expect, it } from 'vitest'
import type { Bounds } from '@ongrid/core/geometry'
import { computeBounds } from '@ongrid/core/geometry'
import type { SharedViewport, Viewport } from '../viewport'
import {
  contains,
  cover,
  fitTo,
  lerpView,
  sharedFrom,
  viewportFitting,
  viewportFrom
} from '../viewport'

/**
 * The shared viewport: a centre in plan coordinates (Y up) and a visible
 * width in metres. Two canvases of different shapes given one value must show
 * the same stretch of the plan, which is why the height is not part of it: each
 * canvas works its own out from its aspect ratio.
 */

const centres = [
  { x: 0, y: 0 },
  { x: -5, y: 12.5 },
  { x: 100, y: -40.25 },
  { x: 0.001, y: 0 }
]
const widths = [0.5, 3, 40, 400]
const aspects = [0.5, 1, 1.6, 3]

describe('converting a shared viewport', () => {
  it('comes back as the same centre and width, for any shape of canvas', () => {
    for (const center of centres) {
      for (const width of widths) {
        for (const aspect of aspects) {
          const back = sharedFrom(viewportFrom({ center, width }, aspect))
          expect(back.center.x).toBeCloseTo(center.x, 9)
          expect(back.center.y).toBeCloseTo(center.y, 9)
          expect(back.width).toBeCloseTo(width, 9)
        }
      }
    }
  })

  it('comes back as the same viewport, for any viewport that fits its canvas', () => {
    for (const aspect of aspects) {
      const view: Viewport = { x: -3.5, y: -8.25, width: 12, height: 12 / aspect }
      const back = viewportFrom(sharedFrom(view), aspect)
      expect(back.x).toBeCloseTo(view.x, 9)
      expect(back.y).toBeCloseTo(view.y, 9)
      expect(back.width).toBeCloseTo(view.width, 9)
      expect(back.height).toBeCloseTo(view.height, 9)
    }
  })

  it('flips Y once: a point forward of the centre is above it on screen', () => {
    // Centre (0, 0), 20 m wide at aspect 2: 10 m tall, so the screen Y runs -5 to 5.
    const view = viewportFrom({ center: { x: 0, y: 0 }, width: 20 }, 2)
    expect(view.y).toBeCloseTo(-5, 9)
    expect(view.height).toBeCloseTo(10, 9)
    // The plan point (0, 3) is at screen Y -3: inside the view, in its upper half.
    expect(-3).toBeGreaterThan(view.y)
    expect(-3).toBeLessThan(view.y + view.height / 2)
    // The plan point (0, 6) is at screen Y -6: above the top edge.
    expect(-6).toBeLessThan(view.y)
  })

  it('gives two canvases of different shapes the same centre and width', () => {
    const shared: SharedViewport = { center: { x: 4, y: -2 }, width: 18 }
    const wide = viewportFrom(shared, 2)
    const tall = viewportFrom(shared, 0.5)

    expect(wide.width).toBe(tall.width)
    expect(wide.height).toBeCloseTo(9, 9)
    expect(tall.height).toBeCloseTo(36, 9)
    expect(sharedFrom(wide).center.x).toBeCloseTo(sharedFrom(tall).center.x, 9)
    expect(sharedFrom(wide).center.y).toBeCloseTo(sharedFrom(tall).center.y, 9)
  })
})

describe('the viewport that frames some bounds', () => {
  const bounds = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    height: maxY - minY
  })
  const cases = [bounds(0, 0, 10, 4), bounds(-3, -8, 2, 12), bounds(50, 50, 52, 51)]

  it('contains the bounds, for a wide and for a tall canvas', () => {
    for (const b of cases) {
      for (const aspect of aspects) {
        const view = viewportFrom(viewportFitting(b, aspect), aspect)
        expect(view.x).toBeLessThanOrEqual(b.min.x)
        expect(view.x + view.width).toBeGreaterThanOrEqual(b.max.x)
        // Screen Y is the plan's Y flipped.
        expect(view.y).toBeLessThanOrEqual(-b.max.y)
        expect(view.y + view.height).toBeGreaterThanOrEqual(-b.min.y)
      }
    }
  })

  it('agrees with fitTo', () => {
    for (const b of cases) {
      for (const aspect of aspects) {
        const expected = fitTo(b, aspect)
        const view = viewportFrom(viewportFitting(b, aspect), aspect)
        expect(view.x).toBeCloseTo(expected.x, 9)
        expect(view.y).toBeCloseTo(expected.y, 9)
        expect(view.width).toBeCloseTo(expected.width, 9)
        expect(view.height).toBeCloseTo(expected.height, 9)
      }
    }
  })

  it('does not clamp: a plan wider than the maximum span still fits', () => {
    const huge = bounds(0, 0, 500, 100)
    const view = viewportFrom(viewportFitting(huge, 1.6), 1.6)
    expect(view.width).toBeGreaterThan(500)
  })
})


const box = (x0: number, y0: number, x1: number, y1: number): Bounds =>
  computeBounds([
    { x: x0, y: y0 },
    { x: x1, y: y1 }
  ])

describe('contains', () => {
  const view = fitTo(box(0, 0, 6, 4), 4 / 3)

  it('holds for the bounds it was fitted to and anything inside them', () => {
    expect(contains(view, box(0, 0, 6, 4))).toBe(true)
    expect(contains(view, box(2, 1, 3, 2))).toBe(true)
  })

  it('fails for bounds reaching outside on any side', () => {
    expect(contains(view, box(0, 0, 12, 4))).toBe(false)
    expect(contains(view, box(-6, 0, 6, 4))).toBe(false)
    expect(contains(view, box(0, 0, 6, 9))).toBe(false)
    expect(contains(view, box(0, -5, 6, 4))).toBe(false)
  })
})

describe('cover: the smallest zoom-out that shows both', () => {
  const aspect = 4 / 3
  const view = fitTo(box(0, 0, 6, 4), aspect)
  const wider = box(0, 0, 12, 4)
  const result = cover(view, wider, aspect)

  it('contains the new bounds and everything the view showed', () => {
    expect(contains(result, wider)).toBe(true)
    expect(result.x).toBeLessThanOrEqual(view.x)
    expect(result.y).toBeLessThanOrEqual(view.y)
    expect(result.x + result.width).toBeGreaterThanOrEqual(view.x + view.width)
    expect(result.y + result.height).toBeGreaterThanOrEqual(view.y + view.height)
  })

  it('keeps the aspect ratio', () => {
    expect(result.width / result.height).toBeCloseTo(aspect)
  })

  it('never zooms in', () => {
    const inside = cover(view, box(1, 1, 2, 2), aspect)
    expect(inside.width).toBeGreaterThanOrEqual(view.width)
  })
})

describe('lerpView', () => {
  it('goes from one view to the other', () => {
    const a: Viewport = { x: 0, y: 0, width: 10, height: 5 }
    const b: Viewport = { x: -10, y: -4, width: 30, height: 15 }
    expect(lerpView(a, b, 0)).toEqual(a)
    expect(lerpView(a, b, 1)).toEqual(b)
    expect(lerpView(a, b, 0.5)).toEqual({ x: -5, y: -2, width: 20, height: 10 })
  })
})
