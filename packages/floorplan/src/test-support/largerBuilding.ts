import type { FloorPlan } from '../geometry/plan'
import { door, exterior, room, wall, window_ } from './plans'

/**
 * CNT-6: plans that are part of a larger building, drawn the way the assistant draws them.
 *
 * Two flats side by side on one floor, each entered from a landing the plan does not draw (lab
 * R-10), with a party wall between them (`p`):
 *
 *   y 6 +--------+--------+--------+--------+
 *       | A hall da A liv  p B liv db B hall|
 *   y 0 +--fa----+--------+--------+--fb----+
 *       x 0      3        6        9        12
 *        landing (not drawn)        landing
 *
 * The two front doors (`fa`, `fb`) are in separating walls with the landing beyond them.
 */
export function twoFlats(): FloorPlan {
  const separating = { kind: 'separating' as const, thickness: 0.2 }
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s_a1', [0, 0], [3, 0], separating),
      exterior('s_a2', [3, 0], [6, 0]),
      exterior('s_b2', [6, 0], [9, 0]),
      wall('s_b1', [9, 0], [12, 0], separating),
      exterior('e', [12, 0], [12, 6]),
      exterior('n1', [12, 6], [9, 6]),
      exterior('n2', [9, 6], [6, 6]),
      exterior('n3', [6, 6], [3, 6]),
      exterior('n4', [3, 6], [0, 6]),
      exterior('w', [0, 6], [0, 0]),
      wall('a', [3, 0], [3, 6]),
      wall('p', [6, 0], [6, 6], separating),
      wall('b', [9, 0], [9, 6])
    ],
    rooms: [
      room('A-hall', 'A hall', ['s_a1', 'a', 'n4', 'w']),
      room('A-living', 'A living room', ['s_a2', 'p', 'n3', 'a']),
      room('B-living', 'B living room', ['s_b2', 'b', 'n2', 'p']),
      room('B-hall', 'B hall', ['s_b1', 'e', 'n1', 'b'])
    ],
    openings: [
      door('fa', 's_a1', 1),
      door('fb', 's_b1', 1),
      door('da', 'a', 2),
      door('db', 'b', 2),
      window_('win_a', 's_a2', 1),
      window_('win_b', 's_b2', 1)
    ],
    flats: [
      { id: 'A', name: 'Flat A', rooms: ['A-hall', 'A-living'] },
      { id: 'B', name: 'Flat B', rooms: ['B-living', 'B-hall'] }
    ]
  }
}

/**
 * A stand in an exhibition hall (lab S-3): three solid walls and an open front onto the aisle, a
 * virtual wall with nothing drawn beyond it.
 *
 *   y 3 +-----------+
 *       |   Stand   |
 *   y 0 + - - - - - +  open front (`front`), the aisle beyond
 *       x 0         4
 */
export function stand(beyond?: 'outside' | 'common' | 'neighbour'): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'front', start: [0, 0], end: [4, 0], thickness: 0, height: 0, kind: 'interior', virtual: true, ...(beyond === undefined ? {} : { beyond }) },
      wall('e', [4, 0], [4, 3]),
      wall('n', [4, 3], [0, 3]),
      wall('w', [0, 3], [0, 0])
    ],
    rooms: [room('stand', 'Stand', ['front', 'e', 'n', 'w'])],
    openings: []
  }
}

/**
 * A 10 × 8 house with a neighbour's house on each side of it (lab EL-17), each neighbour 10 × 8 m.
 * `asContext` draws the neighbours as context shapes; otherwise they are walls and rooms, as the
 * lab drew them.
 */
export function houseWithNeighbours(asContext: boolean): FloorPlan {
  const house: FloorPlan = {
    version: '1',
    units: 'm',
    walls: [
      exterior('s', [0, 0], [10, 0]),
      exterior('e', [10, 0], [10, 8]),
      exterior('n', [10, 8], [0, 8]),
      exterior('w', [0, 8], [0, 0])
    ],
    rooms: [room('home', 'Home', ['s', 'e', 'n', 'w'])],
    openings: [door('front', 's', 4)]
  }
  if (asContext) {
    return {
      ...house,
      context: [
        { id: 'left', name: 'No. 12', points: [[-10.5, 0], [-0.5, 0], [-0.5, 8], [-10.5, 8]], height: 6 },
        { id: 'right', name: 'No. 16', points: [[10.5, 0], [20.5, 0], [20.5, 8], [10.5, 8]], height: 6 }
      ]
    }
  }
  const neighbour = (id: string, x: number): Pick<FloorPlan, 'walls' | 'rooms'> => ({
    walls: [
      exterior(`${id}-s`, [x, 0], [x + 10, 0]),
      exterior(`${id}-e`, [x + 10, 0], [x + 10, 8]),
      exterior(`${id}-n`, [x + 10, 8], [x, 8]),
      exterior(`${id}-w`, [x, 8], [x, 0])
    ],
    rooms: [room(id, `Neighbour ${id}`, [`${id}-s`, `${id}-e`, `${id}-n`, `${id}-w`])]
  })
  const left = neighbour('left', -10.5)
  const right = neighbour('right', 10.5)
  return { ...house, walls: [...house.walls, ...left.walls, ...right.walls], rooms: [...house.rooms, ...left.rooms, ...right.rooms] }
}
