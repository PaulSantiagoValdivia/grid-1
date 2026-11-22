import { describe, expect, it } from 'vitest'
import type { Box } from '../polygons'
import { overlaps } from '../polygons'
import { boxIndex, boxOfPoints, widenBox } from '../boxIndex'

/** A fixed-seed generator, so a failure can be replayed. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 })

/** What trying every box gives. */
const everyBox = (boxes: readonly Box[], query: Box): number[] =>
  boxes.flatMap((b, i) => (overlaps(b, query) ? [i] : []))

describe('boxIndex (QAR-7)', () => {
  it('finds what trying every box finds, in list order, for many sizes of list', () => {
    const next = random(42)
    for (const count of [0, 1, 15, 16, 17, 255, 256, 257, 3000]) {
      // Mostly small boxes, a few long thin ones across the field, as walls on a floor.
      const boxes = Array.from({ length: count }, (_, i) => {
        const x = next() * 200
        const y = next() * 200
        const long = i % 50 === 0
        return box(x, y, x + (long ? 150 : next() * 5), y + (long ? 0.3 : next() * 5))
      })
      const index = boxIndex(boxes)
      for (let q = 0; q < 200; q++) {
        const x = next() * 220 - 10
        const y = next() * 220 - 10
        const query = box(x, y, x + next() * 8, y + next() * 8)
        expect(index.near(query)).toEqual(everyBox(boxes, query))
      }
    }
  })

  it('counts boxes that only touch at an edge or a corner', () => {
    const index = boxIndex([box(0, 0, 1, 1), box(2, 0, 3, 1)])
    expect(index.near(box(1, 1, 2, 2))).toEqual([0, 1])
    expect(index.near(box(1.5, 0, 1.5, 1))).toEqual([])
  })

  it('finds nothing in a box that is not a number or has no points, and loses nothing near it', () => {
    const empty = boxOfPoints([])
    const index = boxIndex([box(Number.NaN, 0, 1, 1), empty, box(0, 0, 1, 1)])
    expect(index.near(box(-10, -10, 10, 10))).toEqual([2])
    expect(boxIndex([box(0, 0, 1, 1)]).near(box(Number.NaN, 0, 1, 1))).toEqual([])
  })

  it('reads the list once: changing it later changes nothing', () => {
    const boxes = [box(0, 0, 1, 1)]
    const index = boxIndex(boxes)
    boxes[0] = box(5, 5, 6, 6)
    expect(index.near(box(0, 0, 1, 1))).toEqual([0])
  })

  it('makes boxes from points and widens them on every side', () => {
    expect(boxOfPoints([{ x: 2, y: -1 }, { x: -3, y: 4 }])).toEqual(box(-3, -1, 2, 4))
    expect(widenBox(box(0, 0, 1, 2), 0.5)).toEqual(box(-0.5, -0.5, 1.5, 2.5))
  })
})
