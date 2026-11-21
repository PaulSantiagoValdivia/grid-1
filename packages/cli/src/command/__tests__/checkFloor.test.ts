import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { checkPlan } from '../check'
import type { LoadedPlan } from '../plan'

/**
 * `grid check --floor` keeps what was found on that floor. A `floor` issue (ARE-4's enclosed
 * floor no room claims) has the floor itself as its id, so it is kept on its own floor only.
 */

function box(floor: string, prefix: string): unknown[] {
  const corners: [number, number][] = [[0, 0], [6, 0], [6, 4], [0, 4]]
  return corners.map((start, i) => ({
    id: `${prefix}-${i}`,
    start,
    end: corners[(i + 1) % corners.length],
    thickness: 0.2,
    height: 2.6,
    kind: 'exterior',
    floor,
  }))
}

function loaded(): LoadedPlan {
  const plan: FloorPlan = FloorPlanSchema.parse({
    version: '1',
    units: 'm',
    floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
    walls: [...box('ground', 'g'), ...box('first', 'f')],
    rooms: [],
    openings: [],
  })
  const { issues, broken } = validatePlan(plan)
  return { file: 'plan.json', plan, issues, broken }
}

describe('grid check --floor', () => {
  it('finds enclosed floor no room claims on both floors without --floor', () => {
    const all = checkPlan(loaded(), {}).issues.filter((issue) => issue.entity === 'floor')
    expect(all.map((issue) => issue.id).sort()).toEqual(['first', 'ground'])
  })

  it('keeps only the chosen floor\'s unclaimed floor', () => {
    for (const floor of ['ground', 'first']) {
      const floors = checkPlan(loaded(), { floor }).issues.filter((issue) => issue.entity === 'floor')
      expect(floors.map((issue) => issue.id)).toEqual([floor])
    }
  })
})
