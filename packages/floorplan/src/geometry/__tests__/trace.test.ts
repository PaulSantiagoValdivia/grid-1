import { describe, expect, it } from 'vitest'
import { flat } from '../../test-support/plans'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { limit } from '../tolerances'
import { traceFloor, tracePixelToPlan, tracePlacement, traceScale } from '../trace'

/** The flat with a trace image placed as `image` says. */
function traced(image: Record<string, unknown>, extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({ ...(JSON.parse(JSON.stringify(flat())) as object), ...extra, referenceImage: { path: 'assets/scan.png', ...image } })
}

const close = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.y).toBeCloseTo(b.y, 9)
}

describe('a trace image under the plan (HND-10, C31)', () => {
  it('sets its scale from two points and the length between them', () => {
    // 300 px and 400 px apart along the two axes: 500 px for 4 m.
    const scale = traceScale({ calibration: { from: [100, 200], to: [400, 600], length: 4 } })
    expect(scale).toEqual({ metresPerPixel: 4 / 500, from: 'calibration', pixels: 500, length: 4 })
  })

  it('takes a stated scale, and with none is unscaled at traceUnscaled', () => {
    expect(traceScale({ scale: 0.02 })).toEqual({ metresPerPixel: 0.02, from: 'scale' })
    expect(traceScale({})).toEqual({ metresPerPixel: limit('traceUnscaled'), from: 'none' })
  })

  it('lies with its top-left corner on at, its pixels running down the plan', () => {
    const placement = tracePlacement(traced({ at: [1, 8], scale: 0.01 }), { width: 600, height: 400 })!
    expect(placement.corners).toEqual([
      { x: 1, y: 8 },
      { x: 7, y: 8 },
      { x: 7, y: 4 },
      { x: 1, y: 4 },
    ])
    // Drawn in the 2D view's frame, y down: pixel (u, v) at (1 + u/100, -8 + v/100).
    expect(placement.matrix).toEqual([0.01, -0, 0, 0.01, 1, -8])
  })

  it('turns about that corner, counter-clockwise', () => {
    const placement = tracePlacement(traced({ at: [2, 3], rotation: 90, calibration: { from: [0, 0], to: [100, 0], length: 1 } }), { width: 200, height: 100 })!
    // The picture's top edge, 2 m long, now runs up the plan from (2, 3); its left edge runs to +x.
    close(placement.corners[1], { x: 2, y: 5 })
    close(placement.corners[3], { x: 3, y: 3 })
    // The transform and the corners agree: pixel (200, 100) by the matrix, back in plan y.
    const [a, b, c, d, e, f] = placement.matrix
    close({ x: a * 200 + c * 100 + e, y: -(b * 200 + d * 100 + f) }, placement.corners[2])
    close(tracePixelToPlan(placement, { x: 50, y: 50 }), { x: 2.5, y: 3.5 })
  })

  it('lies under the floor it names, else the lowest, which a picture draws when none is asked for', () => {
    expect(traceFloor(traced({}))).toEqual({ floor: 'ground', known: true })
    const floors = { floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }] }
    expect(traceFloor(traced({}, floors))).toEqual({ floor: 'ground', known: true })
    expect(traceFloor(traced({ floor: 'first' }, floors))).toEqual({ floor: 'first', known: true })
    expect(traceFloor(traced({ floor: 'attic' }, floors))).toEqual({ floor: 'attic', known: false })
  })

  it('is not placed without a trace image or without pixels', () => {
    expect(tracePlacement(parseFloorPlan(flat()), { width: 10, height: 10 })).toBeNull()
    expect(tracePlacement(traced({}), { width: 0, height: 10 })).toBeNull()
  })

  it('is refused with a scale and a calibration both, or two points that are one', () => {
    expect(() => traced({ scale: 0.01, calibration: { from: [0, 0], to: [10, 0], length: 1 } })).toThrow(/scale.*not both/s)
    expect(() => traced({ calibration: { from: [5, 5], to: [5, 5], length: 1 } })).toThrow(/same point as from/)
    expect(() => traced({ calibration: { from: [0, 0], to: [10, 0], length: 0 } })).toThrow()
    expect(() => traced({ scale: -1 })).toThrow()
  })

  it('is read without a placement that cannot be read, keeping its path and the rest', () => {
    const raw = { ...(JSON.parse(JSON.stringify(flat())) as object), referenceImage: { path: 'assets/scan.png', at: [1, 2], calibration: { from: [3, 3], to: [3, 3], length: 2 } } }
    const read = readPlanParts(raw)
    if (read.plan === null) throw new Error('refused')
    expect(read.plan.referenceImage).toEqual({ path: 'assets/scan.png', opacity: 0.4, at: [1, 2] })
    expect(read.faults.map((fault) => [fault.kind, 'path' in fault ? fault.path : null])).toEqual([['value-left-out', ['referenceImage', 'calibration', 'to']]])
  })

  it('reads a plan that states only its path as before', () => {
    expect(traced({}).referenceImage).toEqual({ path: 'assets/scan.png', opacity: 0.4 })
  })
})
