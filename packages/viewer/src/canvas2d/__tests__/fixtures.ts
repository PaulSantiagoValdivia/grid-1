import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'

export const EMPTY: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }

/** A 6×4 house split by an inner wall, a front door and a door between the rooms. */
export function house(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [6, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w2', start: [6, 0], end: [6, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w3', start: [6, 4], end: [0, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w5', start: [3, 0], end: [3, 4], thickness: 0.1, height: 2.7, kind: 'interior' }
    ],
    rooms: [
      { id: 'r1', name: 'Living', boundary: ['w1', 'w5', 'w3', 'w4'] },
      { id: 'r2', name: 'Kitchen', boundary: ['w1', 'w2', 'w3', 'w5'] }
    ],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 },
      { id: 'o2', wall: 'w5', type: 'door', offset: 1.5, width: 0.8, height: 2.1, sill: 0 }
    ]
  }
}

export function edit(mutate: (plan: FloorPlan) => void): FloorPlan {
  const plan: FloorPlan = JSON.parse(JSON.stringify(house()))
  mutate(plan)
  return plan
}
