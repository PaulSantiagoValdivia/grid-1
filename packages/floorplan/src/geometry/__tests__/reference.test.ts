import { describe, expect, it } from 'vitest'
import type { Bounds } from '../floorplan'
import { computeBounds } from '../floorplan'
import {
  centerOf,
  fitImageToBounds,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_WIDTH,
  scaleImageAboutCenter
} from '../reference'

const plan: Bounds = computeBounds([
  { x: 0, y: 0 },
  { x: 8, y: 5 }
])

describe('dropping a reference image', () => {
  it('centers it over the plan', () => {
    const placed = fitImageToBounds({ width: 800, height: 500 }, plan)
    const center = centerOf(placed)
    expect(center.x).toBeCloseTo(4)
    expect(center.y).toBeCloseTo(2.5)
  })

  it('keeps the image aspect ratio', () => {
    const placed = fitImageToBounds({ width: 1200, height: 400 }, plan)
    expect(placed.width / placed.height).toBeCloseTo(3)
  })

  it('fits a tall image by its height instead of overflowing', () => {
    // Taller than wide against a landscape plan: width has to give.
    const placed = fitImageToBounds({ width: 400, height: 1200 }, plan)
    expect(placed.height).toBeLessThanOrEqual(plan.height)
    expect(placed.width).toBeLessThan(plan.width)
  })

  it('leaves a margin rather than touching the edges', () => {
    const placed = fitImageToBounds({ width: 800, height: 500 }, plan)
    expect(placed.width).toBeLessThan(plan.width)
    expect(placed.x).toBeGreaterThan(plan.min.x)
  })

  it('survives a degenerate plan without dividing by zero', () => {
    const empty = computeBounds([{ x: 0, y: 0 }])
    const placed = fitImageToBounds({ width: 800, height: 500 }, empty)
    expect(Number.isFinite(placed.width)).toBe(true)
    expect(placed.width).toBeGreaterThan(0)
  })
})

describe('scaling a reference image', () => {
  const start = fitImageToBounds({ width: 800, height: 500 }, plan)

  it('keeps the center still', () => {
    // Anchored at a corner instead, the image walks across the plan while
    // being resized and the alignment work is lost.
    for (const factor of [0.5, 1.3, 2]) {
      const scaled = scaleImageAboutCenter(start, factor)
      expect(centerOf(scaled).x).toBeCloseTo(centerOf(start).x)
      expect(centerOf(scaled).y).toBeCloseTo(centerOf(start).y)
    }
  })

  it('keeps the aspect ratio', () => {
    const scaled = scaleImageAboutCenter(start, 1.7)
    expect(scaled.width / scaled.height).toBeCloseTo(start.width / start.height)
  })

  it('clamps at both ends without distorting', () => {
    const tiny = scaleImageAboutCenter(start, 0.0001)
    expect(tiny.width).toBeCloseTo(MIN_IMAGE_WIDTH)
    expect(tiny.width / tiny.height).toBeCloseTo(start.width / start.height)

    const huge = scaleImageAboutCenter(start, 10000)
    expect(huge.width).toBeCloseTo(MAX_IMAGE_WIDTH)
    expect(huge.width / huge.height).toBeCloseTo(start.width / start.height)
  })

  it('round-trips: scaling up then down lands where it started', () => {
    const there = scaleImageAboutCenter(start, 2)
    const back = scaleImageAboutCenter(there, 0.5)
    expect(back.x).toBeCloseTo(start.x)
    expect(back.y).toBeCloseTo(start.y)
    expect(back.width).toBeCloseTo(start.width)
  })
})
