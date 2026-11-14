import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { buildFloorPlan, planForFloor } from '@ongrid/floorplan/geometry'
import { retainSelection } from '../selection'

/**
 * Selection is derived, not synchronised.
 *
 * Nothing resets it when the floor changes or the assistant rewrites the plan;
 * instead it is checked against what is actually being drawn. Pure on purpose:
 * the rule is worth pinning on its own, independently of any component that
 * happens to call it. (A component test could also reach it now that test files
 * can opt into jsdom with `// @vitest-environment jsdom`, but that would be
 * testing the wiring, not the rule.)
 */

const plan: FloorPlan = {
  version: '1',
  units: 'm',
  floors: [
    { id: 'ground', name: 'Ground floor', level: 0 },
    { id: 'first', name: 'First floor', level: 1 }
  ],
  walls: [
    {
      id: 'g-w1',
      start: [0, 0],
      end: [4, 0],
      thickness: 0.2,
      height: 2.5,
      kind: 'exterior',
      floor: 'ground'
    },
    {
      id: 'g-w2',
      start: [4, 0],
      end: [4, 4],
      thickness: 0.2,
      height: 2.5,
      kind: 'exterior',
      floor: 'ground'
    },
    {
      id: 'g-w3',
      start: [4, 4],
      end: [0, 4],
      thickness: 0.2,
      height: 2.5,
      kind: 'exterior',
      floor: 'ground'
    },
    {
      id: 'g-w4',
      start: [0, 4],
      end: [0, 0],
      thickness: 0.2,
      height: 2.5,
      kind: 'exterior',
      floor: 'ground'
    },
    {
      id: 'f-w1',
      start: [0, 0],
      end: [4, 0],
      thickness: 0.2,
      height: 2.5,
      kind: 'exterior',
      floor: 'first'
    }
  ],
  rooms: [
    { id: 'g-r1', name: 'Room', boundary: ['g-w1', 'g-w2', 'g-w3', 'g-w4'], floor: 'ground' }
  ],
  openings: [
    { id: 'g-o1', wall: 'g-w1', type: 'door', offset: 1.5, width: 0.9, height: 2.1, sill: 0 }
  ]
}

const ground = buildFloorPlan(planForFloor(plan, 'ground'))
const first = buildFloorPlan(planForFloor(plan, 'first'))

describe('retainSelection', () => {
  it('keeps a wall that is being drawn', () => {
    expect(retainSelection(ground, 'g-w1')).toBe('g-w1')
  })

  it('keeps a room that is being drawn', () => {
    expect(retainSelection(ground, 'g-r1')).toBe('g-r1')
  })

  it('keeps an opening that is being drawn', () => {
    expect(retainSelection(ground, 'g-o1')).toBe('g-o1')
  })

  it('drops a selection that moved to another floor', () => {
    // The user picked a ground-floor wall, then switched upstairs.
    expect(retainSelection(first, 'g-w1')).toBeNull()
  })

  it('drops a selection the assistant deleted', () => {
    // Pre-existing bug, fixed by the same rule: the id simply is not there.
    expect(retainSelection(ground, 'w-deleted')).toBeNull()
  })

  it('passes nothing through as nothing', () => {
    expect(retainSelection(ground, null)).toBeNull()
  })

  it('drops everything when the drawing is empty', () => {
    const empty = buildFloorPlan(planForFloor(plan, 'nowhere'))

    expect(retainSelection(empty, 'g-w1')).toBeNull()
  })
})
