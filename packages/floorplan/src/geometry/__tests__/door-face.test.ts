import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { buildFloorPlan } from '../floorplan'
import { doorSwing } from '../door'
import { validateDoorSweeps } from '../sweep'

/**
 * SHT-2: a door leaf hangs from the face of the wall it opens towards (lab DR-7, M-10).
 *
 * Before, the hinge sat on the wall's centre line, so the leaf's reach was short by half the
 * wall: a 0.9 m door into a corridor 0.8 m deep raised no warning, nor did one into a corridor
 * 0.75 m deep between 0.3 m walls. The drawing was wrong in the same way.
 */

type Tuple = [number, number]

const wall = (id: string, start: Tuple, end: Tuple, thickness: number): Wall => ({
  id,
  start,
  end,
  thickness,
  height: 2.7,
  kind: 'interior'
})

/** The lab's corridor: four walls round a box `depth` deep between centre lines, a 0.9 m door in the south one. */
function corridor(depth: number, thickness: number): FloorPlan {
  const door: Opening = {
    id: 'front',
    wall: 's',
    type: 'door',
    offset: 1,
    width: 0.9,
    sill: 0,
    height: 2.1,
    hinge: 'start',
    swing: 'left'
  }
  const length = 4 + thickness / 2
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [length, 0], thickness),
      wall('e', [length, 0], [length, depth], thickness),
      wall('n', [length, depth], [0, depth], thickness),
      wall('w', [0, depth], [0, 0], thickness)
    ],
    rooms: [{ id: 'c', name: 'Corridor', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [door]
  }
}

const sweeps = (plan: FloorPlan): string[] =>
  validateDoorSweeps(plan, (o) => o).map((i) => `${i.code} ${i.id} ${i.hits.join(',')}`)

describe('SHT-2 the leaf hangs from the face it opens towards', () => {
  it('draws the hinge on the face, and the leaf a door width out from it', () => {
    const drawing = buildFloorPlan(corridor(1, 0.2))
    const opening = drawing.openings.find((o) => o.id === 'front')!
    const swing = doorSwing(opening, 'start', 'left')!
    // The south wall runs east; `left` is north, the face at y = 0.1.
    expect(swing.hinge.x).toBeCloseTo(1, 12)
    expect(swing.hinge.y).toBeCloseTo(0.1, 12)
    expect(swing.leaf[1].x).toBeCloseTo(1, 12)
    expect(swing.leaf[1].y).toBeCloseTo(1, 12)
    expect(swing.arc.radius).toBeCloseTo(0.9, 12)
  })

  it('hangs a door that opens to the right from the other face', () => {
    const drawing = buildFloorPlan(corridor(1, 0.2))
    const opening = drawing.openings.find((o) => o.id === 'front')!
    const swing = doorSwing(opening, 'end', 'right')!
    expect(swing.hinge.x).toBeCloseTo(1.9, 12)
    expect(swing.hinge.y).toBeCloseTo(-0.1, 12)
    expect(swing.leaf[1].y).toBeCloseTo(-1, 12)
  })

  it('warns of a 0.9 m door into a corridor 0.8 m deep (DR-7)', () => {
    expect(sweeps(corridor(1, 0.2))).toEqual(['opening/door-blocked front n'])
  })

  it('warns of a 0.9 m door into a corridor 0.75 m deep between 0.3 m walls (DR-7)', () => {
    expect(sweeps(corridor(1.05, 0.3))).toEqual(['opening/door-blocked front n'])
  })

  it('says nothing when the open leaf only reaches the far wall: a corridor 0.9 m deep', () => {
    expect(sweeps(corridor(1.1, 0.2))).toEqual([])
  })

  it('keeps a door in a dividing line on its line: a line has no face', () => {
    const plan = corridor(1, 0.2)
    plan.walls[0] = { ...plan.walls[0]!, virtual: true }
    const opening = buildFloorPlan(plan).openings.find((o) => o.id === 'front')!
    expect(doorSwing(opening, 'start', 'left')!.hinge.y).toBe(0)
  })
})
