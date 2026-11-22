import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../plan'
import { buildFloorPlan } from '../../floorplan'
import { toDxf } from '../dxf'
import { dxfProblems } from './dxf-reader'

/**
 * HND-1: a DXF golden file, the whole document, compared byte for byte.
 *
 * `dxf.test.ts` checks what a file means and `dxf.structure.test.ts` that it holds together; this
 * pins what it is, so a change to the writer shows up as a reviewable diff of a real file. A
 * difference here is a failure, never something to accept with `-u` in passing: regenerate only
 * in a commit whose purpose is to change the file, and read the diff of the `.dxf` first.
 *
 * One room called "Baño", 4 × 3 m, with a door that states its hinge and swing, a window and a
 * doorless opening, and a room number: every kind of block, the fill, the dimensions and the tag.
 */
function plan(): FloorPlan {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, height: 2.5, kind: 'exterior' as const })
  return {
    version: '1',
    units: 'm',
    walls: [wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0], [4, 3]), wall('w3', [4, 3], [0, 3]), wall('w4', [0, 3], [0, 0])],
    rooms: [{ id: 'r1', name: 'Baño', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [
      { id: 'd1', wall: 'w1', type: 'door', offset: 0.5, width: 0.8, sill: 0, height: 2.1, hinge: 'start', swing: 'left' },
      { id: 'v1', wall: 'w3', type: 'window', offset: 1.5, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'p1', wall: 'w2', type: 'opening', offset: 1, width: 0.9, sill: 0, height: 2.1 }
    ]
  }
}

describe('DXF golden file (HND-1)', () => {
  const dxf = toDxf(buildFloorPlan(plan()), { roomNumbers: new Map([['r1', '1']]) })

  it('one room: holds together', () => {
    expect(dxfProblems(dxf)).toEqual([])
  })

  it('one room: is the file it was', async () => {
    await expect(dxf).toMatchFileSnapshot('./golden/one-room.dxf')
  })
})
