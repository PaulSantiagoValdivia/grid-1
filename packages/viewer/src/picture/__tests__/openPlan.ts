import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'

const wall = (id: string, start: [number, number], end: [number, number]) => ({
  id,
  start,
  end,
  thickness: 0.2,
  kind: 'exterior'
})

/**
 * An 8 × 4 open-plan room, kitchen and living split by a dividing line at x = 4 with a gap
 * in it. The line states nothing but `virtual`, so it has thickness and height 0. Read
 * through the schema, as a plan file is.
 */
export const openPlan = (line: object = {}): FloorPlan =>
  parseFloorPlan({
    walls: [
      wall('s1', [0, 0], [4, 0]),
      wall('s2', [4, 0], [8, 0]),
      wall('e', [8, 0], [8, 4]),
      wall('n2', [8, 4], [4, 4]),
      wall('n1', [4, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      { id: 'line', start: [4, 0], end: [4, 4], kind: 'interior', virtual: true, ...line }
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', boundary: ['s1', 'line', 'n1', 'w'] },
      { id: 'living', name: 'Living', boundary: ['s2', 'e', 'n2', 'line'] }
    ],
    openings: [{ id: 'gap', wall: 'line', type: 'opening', offset: 1, width: 2, height: 2.1 }]
  })
