import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'

type Wall = FloorPlan['walls'][number]
type Opening = FloorPlan['openings'][number]

const outer = (id: string, start: [number, number], end: [number, number]): Wall => ({
  id,
  start,
  end,
  thickness: 0.25,
  height: 2.6,
  kind: 'exterior'
})
const inner = (id: string, start: [number, number], end: [number, number]): Wall => ({
  id,
  start,
  end,
  thickness: 0.1,
  height: 2.6,
  kind: 'interior'
})
const door = (id: string, wall: string, offset: number, width: number, extra: Partial<Opening> = {}): Opening => ({
  id,
  wall,
  type: 'door',
  offset,
  width,
  height: 2.1,
  sill: 0,
  ...extra
})
const window = (id: string, wall: string, offset: number, width: number): Opening => ({
  id,
  wall,
  type: 'window',
  offset,
  width,
  height: 1.2,
  sill: 0.9
})

/**
 * A typical small plan, drawn for these tests: a 10 × 7.5 m flat with two bedrooms, a
 * bathroom, a kitchen open to the living room, four doors with their swings, and windows.
 *
 *   y 7.5 ┌──────────┬───────────────────┐
 *         │ Bedroom 1│    Living room    │
 *   y 3.75├──────────┤                   │
 *         │ Bedroom 2├──────┬────────────┤ y 2.6
 *         │          │ Bath │  Kitchen   │
 *   y 0   └──────────┴──────┴────────────┘
 *         x 0       x 4   x 6.5        x 10
 */
export function twoBedFlat(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      outer('south', [0, 0], [10, 0]),
      outer('east', [10, 0], [10, 7.5]),
      outer('north', [10, 7.5], [0, 7.5]),
      outer('west', [0, 7.5], [0, 0]),
      inner('spine', [4, 0], [4, 7.5]),
      inner('bedrooms', [0, 3.75], [4, 3.75]),
      inner('living', [4, 2.6], [10, 2.6]),
      inner('bath-wall', [6.5, 0], [6.5, 2.6])
    ],
    rooms: [
      { id: 'bed2', name: 'Bedroom 2', boundary: ['south', 'spine', 'bedrooms', 'west'] },
      { id: 'bed1', name: 'Bedroom 1', boundary: ['bedrooms', 'spine', 'north', 'west'] },
      { id: 'bath', name: 'Bathroom', boundary: ['south', 'bath-wall', 'living', 'spine'] },
      { id: 'kitchen', name: 'Kitchen', boundary: ['south', 'east', 'living', 'bath-wall'] },
      { id: 'lounge', name: 'Living room', boundary: ['living', 'east', 'north', 'spine'] }
    ],
    openings: [
      door('front', 'north', 1, 0.95, { hinge: 'start', swing: 'left' }),
      door('bed2-door', 'spine', 2.85, 0.8, { hinge: 'start', swing: 'left' }),
      door('bed1-door', 'spine', 4.6, 0.8, { hinge: 'end', swing: 'left' }),
      door('bath-door', 'living', 1, 0.75, { hinge: 'start', swing: 'right' }),
      { id: 'kitchen-gap', wall: 'living', type: 'opening', offset: 3.3, width: 2, height: 2.1, sill: 0 },
      window('bed2-window', 'south', 1.2, 1.4),
      window('kitchen-window', 'south', 7.6, 1.4),
      window('lounge-window', 'north', 3, 1.8),
      window('bed1-window', 'north', 7.3, 1.4),
      window('east-window', 'east', 4, 1.6)
    ]
  }
}
