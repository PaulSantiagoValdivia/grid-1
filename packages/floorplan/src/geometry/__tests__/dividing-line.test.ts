import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { buildScene } from '../scene3d'

/**
 * ARE-2: a dividing line (a virtual wall) takes no floor, may be written with no thickness
 * and no height, and is drawn as a line over floor that runs on under it.
 */
const wall = (id: string, start: [number, number], end: [number, number]) => ({
  id,
  start,
  end,
  thickness: 0.2,
  kind: 'exterior'
})

/** An 8 × 4 room split at x = 4 by a line that states nothing but `virtual`, with a gap in it. */
const openPlan = (line: object = {}): FloorPlan =>
  parseFloorPlan({
    walls: [
      wall('s1', [0, 0], [4, 0]),
      wall('s2', [4, 0], [8, 0]),
      wall('e', [8, 0], [8, 4]),
      wall('n2', [8, 4], [4, 4]),
      wall('n1', [4, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      { id: 'line', start: [4, 0], end: [4, 4], virtual: true, ...line }
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', boundary: ['s1', 'line', 'n1', 'w'] },
      { id: 'living', name: 'Living', boundary: ['s2', 'e', 'n2', 'line'] }
    ],
    openings: [{ id: 'gap', wall: 'line', type: 'opening', offset: 1, width: 2, height: 2.1 }]
  })

describe('a dividing line with no thickness and no height', () => {
  const plan = openPlan()

  it('is a sound plan: a gap in the line is not too tall for it', () => {
    expect(validatePlan(plan).issues).toEqual([])
  })

  it('splits the floor in two halves that add up to the whole', () => {
    const index = indexPlan(plan)
    const [kitchen, living] = plan.rooms.map((room) => Math.abs(roomArea(room, index)))
    expect(kitchen).toBeCloseTo(3.9 * 3.8, 9)
    expect(living).toBeCloseTo(3.9 * 3.8, 9)
    expect(kitchen! + living!).toBeCloseTo(7.8 * 3.8, 9)
  })

  it('is drawn as its axis, and a gap in it has no width either', () => {
    const drawing = buildFloorPlan(plan)
    const line = drawing.walls.find((w) => w.id === 'line')!
    expect(line).toMatchObject({ virtual: true, slices: [], centerline: [{ x: 4, y: 0 }, { x: 4, y: 4 }] })
    expect(drawing.openings.find((o) => o.id === 'gap')?.thickness).toBe(0)
  })

  it('gives the 3D scene a line on the floor, not a wall, and both slabs meet on it', () => {
    const scene = buildScene(plan)
    expect(scene.walls.map((w) => w.id)).not.toContain('line')
    expect(scene.dividers).toEqual([{ wallId: 'line', from: { x: 4, y: 0 }, to: { x: 4, y: 4 } }])
    const onLine = scene.slabs.map((slab) => slab.polygon.filter((p) => Math.abs(p.x - 4) < 1e-9).length)
    expect(onLine).toEqual([2, 2])
  })

  it('draws and measures the same whatever thickness and height it states', () => {
    const stated = openPlan({ thickness: 0.3, height: 2.7 })
    expect(buildFloorPlan(stated)).toEqual(buildFloorPlan(plan))
    expect(buildScene(stated).slabs).toEqual(buildScene(plan).slabs)
  })
})
