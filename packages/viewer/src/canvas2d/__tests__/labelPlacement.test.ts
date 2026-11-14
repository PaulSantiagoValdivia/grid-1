import { describe, expect, it } from 'vitest'
import { buildFloorPlan, roomDimensions } from '@ongrid/core/geometry'
import type { Dimension, PlanRoom } from '@ongrid/core/geometry'
import type { FloorPlan } from '@ongrid/core/types/floorplan'
import { dimensionTextBox, overlaps, placeDimensionLabel, roomLabelBox } from '../labelPlacement'

// About 70 px per metre: the "normal zoom" the issue measured (0.33 m ≈ 20-25 px).
const MPP = 1 / 70

/** A w × d room at the origin, built through the real geometry so labelAt is the real one. */
function room(name: string, w: number, d: number): PlanRoom {
  const plan: FloorPlan = {
    version: '1', units: 'm',
    walls: [
      { id: 'a', start: [0, 0], end: [w, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'b', start: [w, 0], end: [w, d], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'c', start: [w, d], end: [0, d], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'd', start: [0, d], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
    ],
    rooms: [{ id: 'r', name, boundary: ['a', 'b', 'c', 'd'] }],
    openings: [],
  }
  return buildFloorPlan(plan).rooms[0]
}

function onLine(dim: Dimension, at: { x: number; y: number }): boolean {
  const [lo, hi] = [Math.min(dim.from.x, dim.to.x), Math.max(dim.from.x, dim.to.x)]
  const [loY, hiY] = [Math.min(dim.from.y, dim.to.y), Math.max(dim.from.y, dim.to.y)]
  const eps = 1e-9
  return at.x >= lo - eps && at.x <= hi + eps && at.y >= loY - eps && at.y <= hiY + eps
}

describe('placeDimensionLabel', () => {
  it.each([
    ['Upstairs study', 4.02, 1.32, 'width'],
    ['Bathroom', 4.02, 1.38, 'width'],
    ['Landing', 1.48, 4.2, 'depth'],
  ] as const)('moves the %s number off the name and area (%s × %s m)', (name, w, d, which) => {
    const r = room(name, w, d)
    const block = roomLabelBox(r, MPP)
    const dim = roomDimensions(r).find((x) => x.id.endsWith(which))!
    // The reported bug: at its default spot the number sits on the label.
    expect(overlaps(dimensionTextBox(dim.labelAt, dim, MPP), block)).toBe(true)

    const at = placeDimensionLabel(dim, [block], MPP)
    expect(at).not.toBeNull()
    expect(overlaps(dimensionTextBox(at!, dim, MPP), block)).toBe(false)
    expect(onLine(dim, at!)).toBe(true)
  })

  it('leaves a number that is already clear exactly where it was', () => {
    const r = room('Living room', 6, 5)
    for (const dim of roomDimensions(r)) {
      expect(placeDimensionLabel(dim, [roomLabelBox(r, MPP)], MPP)).toBe(dim.labelAt)
    }
  })

  it('hides the number when the line has no clear spot', () => {
    const r = room('A very long room name indeed', 1.3, 1.3)
    const dim = roomDimensions(r)[0]
    expect(placeDimensionLabel(dim, [roomLabelBox(r, MPP)], MPP * 6)).toBeNull()
  })

  it('never returns a spot that overlaps a label or leaves its line, at any size and zoom', () => {
    // Invariant over a grid of room shapes and zooms: clear and on the line, or hidden.
    for (const w of [0.9, 1.2, 1.5, 2, 3, 4.02, 6]) {
      for (const d of [0.9, 1.2, 1.32, 2, 3, 5]) {
        for (const pxPerMetre of [15, 30, 70, 150, 400]) {
          const mpp = 1 / pxPerMetre
          const r = room('Kitchen', w, d)
          const block = roomLabelBox(r, mpp)
          for (const dim of roomDimensions(r)) {
            const at = placeDimensionLabel(dim, [block], mpp)
            if (at === null) continue
            expect(overlaps(dimensionTextBox(at, dim, mpp), block)).toBe(false)
            expect(onLine(dim, at)).toBe(true)
          }
        }
      }
    }
  })
})

describe('roomLabelBox with a review area', () => {
  it('is as wide as the "before → after" line when that is wider than the name', () => {
    const room = { name: 'WC', area: 3.2, labelAt: { x: 0, y: 0 } }
    const plain = roomLabelBox(room, 0.01)
    const review = roomLabelBox({ ...room, areaText: '20.10 → 17.60 m²' }, 0.01)
    expect(review.maxX - review.minX).toBeGreaterThan(plain.maxX - plain.minX)
    // Same height: only the width depends on the text.
    expect(review.maxY - review.minY).toBeCloseTo(plain.maxY - plain.minY, 9)
  })
})
