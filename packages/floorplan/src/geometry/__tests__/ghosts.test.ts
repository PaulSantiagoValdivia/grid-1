import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { buildFloorPlan } from '../floorplan'
import type { PlanDrawing } from '../floorplan'
import { boundsWithGhosts, ghostsOf } from '../ghosts'
import type { DiffStatus } from '../ghosts'

/**
 * Which elements of the version before become ghosts on the canvas.
 * The input is the base version's drawing, so everything is already per floor
 * and already free of broken entities.
 */

const wall = (
  id: string,
  start: [number, number],
  end: [number, number],
  extra: Partial<Wall> = {}
): Wall => ({ id, start, end, thickness: 0.2, height: 2.5, kind: 'exterior', ...extra })

/** Two rooms, a free wall, a virtual wall and a door. */
function basePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('w1', [0, 0], [4, 0]),
      wall('w2', [4, 0], [4, 3]),
      wall('w3', [4, 3], [0, 3]),
      wall('w4', [0, 3], [0, 0]),
      wall('w5', [10, 0], [14, 0]),
      wall('w6', [14, 0], [14, 3]),
      wall('w7', [14, 3], [10, 3]),
      wall('w8', [10, 3], [10, 0]),
      wall('free', [1, 1.5], [2, 1.5], { kind: 'interior' }),
      wall('v1', [0, 6], [2, 6], { kind: 'interior', virtual: true })
    ],
    rooms: [
      { id: 'r1', name: 'First', boundary: ['w1', 'w2', 'w3', 'w4'] },
      { id: 'r2', name: 'Second', boundary: ['w5', 'w6', 'w7', 'w8'] }
    ],
    openings: [{ id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 }]
  }
}

const drawing = (): PlanDrawing => buildFloorPlan(basePlan())

const ids = (items: readonly { id: string }[]): string[] => items.map((i) => i.id)

describe('which base elements become ghosts', () => {
  const status: Record<string, DiffStatus> = {
    w1: 'removed',
    w2: 'modified',
    w3: 'added',
    // w4 is absent: unchanged
    v1: 'modified',
    o1: 'removed',
    r1: 'modified',
    r2: 'added'
  }

  it('keeps the removed and modified ones, in the base order', () => {
    const ghosts = ghostsOf(drawing(), status)
    expect(ids(ghosts.walls)).toEqual(['w1', 'w2', 'v1'])
    expect(ids(ghosts.openings)).toEqual(['o1'])
    expect(ids(ghosts.rooms)).toEqual(['r1'])
  })

  it('returns the base elements themselves, so the canvas draws what the base drew', () => {
    const base = drawing()
    const ghosts = ghostsOf(base, status)
    expect(ghosts.walls[0]).toBe(base.walls.find((w) => w.id === 'w1'))
    expect(ghosts.rooms[0]).toBe(base.rooms.find((r) => r.id === 'r1'))
    expect(ghosts.openings[0]).toBe(base.openings.find((o) => o.id === 'o1'))
  })

  it('includes virtual walls, which have no slices', () => {
    const ghosts = ghostsOf(drawing(), { v1: 'removed' })
    expect(ghosts.walls).toHaveLength(1)
    expect(ghosts.walls[0]!.virtual).toBe(true)
  })

  it('gives nothing for added, unchanged or unknown ids', () => {
    const ghosts = ghostsOf(drawing(), { w3: 'added', r2: 'added', nowhere: 'removed' })
    expect(ghosts.walls).toEqual([])
    expect(ghosts.rooms).toEqual([])
    expect(ghosts.openings).toEqual([])
  })

  it('copes with an empty status and with an empty base', () => {
    expect(ghostsOf(drawing(), {}).walls).toEqual([])
    const empty = buildFloorPlan({ version: '1', units: 'm', walls: [], rooms: [], openings: [] })
    const ghosts = ghostsOf(empty, status)
    expect(ghosts.walls).toEqual([])
    expect(ghosts.rooms).toEqual([])
    expect(ghosts.openings).toEqual([])
    expect(ghosts.bounds.width).toBe(0)
  })
})

describe('the bounds of the ghosts', () => {
  it('cover every point of every ghost', () => {
    const ghosts = ghostsOf(drawing(), {
      w1: 'removed',
      w6: 'modified',
      v1: 'removed',
      r2: 'modified',
      o1: 'removed'
    })
    const { min, max } = ghosts.bounds
    const points = [
      ...ghosts.walls.flatMap((w) => [...w.slices.flat(), ...w.centerline]),
      ...ghosts.rooms.flatMap((r) => r.polygon)
    ]
    expect(points.length).toBeGreaterThan(0)
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(min.x - 1e-9)
      expect(p.x).toBeLessThanOrEqual(max.x + 1e-9)
      expect(p.y).toBeGreaterThanOrEqual(min.y - 1e-9)
      expect(p.y).toBeLessThanOrEqual(max.y + 1e-9)
    }
    expect(ghosts.bounds.width).toBeCloseTo(max.x - min.x, 9)
    expect(ghosts.bounds.height).toBeCloseTo(max.y - min.y, 9)
  })

  it('reach only as far as the ghosts, not the rest of the plan', () => {
    // w1 is the 4 m wall along the bottom of the first room; the second room is at x >= 10.
    const ghosts = ghostsOf(drawing(), { w1: 'removed' })
    expect(ghosts.bounds.max.x).toBeLessThan(5)
    // 4 m along the axis; the thickness (0.2 m) grows across it, not past its ends (C1).
    expect(ghosts.bounds.width).toBeCloseTo(4, 6)
    expect(ghosts.bounds.height).toBeCloseTo(0.2, 6)
  })

  it('are empty when there are no ghosts', () => {
    expect(ghostsOf(drawing(), { w3: 'added' }).bounds.width).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Did a room's area change?
// ---------------------------------------------------------------------------

describe('the frame with the ghosts in it', () => {
  it('grows to hold a ghost that lies outside the plan', () => {
    const base = drawing()
    const plan = buildFloorPlan({ ...basePlan(), walls: basePlan().walls.filter((w) => w.id !== 'w6') })
    const ghosts = ghostsOf(base, { w6: 'removed' })

    const framed = boundsWithGhosts(plan.bounds, ghosts)
    expect(framed.max.x).toBeGreaterThanOrEqual(ghosts.bounds.max.x)
    expect(framed.min.x).toBeLessThanOrEqual(plan.bounds.min.x)
    expect(framed.max.y).toBeGreaterThanOrEqual(Math.max(plan.bounds.max.y, ghosts.bounds.max.y))
    expect(framed.width).toBeCloseTo(framed.max.x - framed.min.x, 9)
  })

  it('is the very same bounds when there are no ghosts, even though their own bounds sit at 0,0', () => {
    const plan = drawing()
    const none = ghostsOf(plan, { w3: 'added' })
    expect(boundsWithGhosts(plan.bounds, none)).toBe(plan.bounds)
  })
})
