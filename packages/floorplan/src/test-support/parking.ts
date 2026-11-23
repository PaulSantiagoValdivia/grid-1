/**
 * A basement car park with parking bays and a ramp (CNT-19, lab EL-11), made for the tests. Test
 * code only.
 *
 * `basementCarPark`: the lab's block, its basement `B1` 26 m by 18 m on the walls' centre lines,
 * 3 m below the ground floor, with the stair core on its south side. Where the lab had to draw 16
 * rooms closed by dividing lines, a driving aisle room and a flat room named for its slope, it
 * holds one car park room, 16 bays numbered 1 to 16 (eight along the north wall, four each side of
 * the core) and seven columns. The ramp runs up along the west wall from y = 9, out through the
 * north wall, to the street at the ground floor's level at y = 27: 3 m up over 18 m, 1 in 6. It
 * states its slope, 16.7 %.
 */
import { parseFloorPlan, type FloorPlan } from '../types/floorplan'

type Pair = [number, number]

const wall = (id: string, start: Pair, end: Pair, floor: string, thickness = 0.4, kind: 'exterior' | 'interior' = 'exterior') => ({
  id,
  start,
  end,
  thickness,
  height: 2.7,
  kind,
  floor,
})

/** The basement's bays: eight along the north wall, then four east and four west of the core. */
export function basementBays(): Record<string, unknown>[] {
  const bays: Record<string, unknown>[] = []
  for (let i = 0; i < 8; i++) bays.push({ id: `bay-${i + 1}`, number: String(i + 1), at: [3.6 + 1.25 + 2.5 * i, 15.4], width: 2.5, length: 4.8, floor: 'B1' })
  for (let i = 0; i < 4; i++) bays.push({ id: `bay-${i + 9}`, number: String(i + 9), at: [16 + 1.25 + 2.5 * i, 5.1], width: 2.5, length: 5, floor: 'B1' })
  for (let i = 0; i < 4; i++) bays.push({ id: `bay-${i + 13}`, number: String(i + 13), at: [1.25 + 2.5 * i, 5.1], width: 2.5, length: 5, floor: 'B1' })
  return bays
}

/** The ramp from the basement up to the street, 3.6 m wide, along the west wall. */
export const BASEMENT_RAMP = { id: 'ramp', name: 'Car ramp', from: 'B1', to: 'ground', width: 3.2, run: [[1.8, 9], [1.8, 27]], slope: 16.7 } as const

export function basementCarPark(extra: Record<string, unknown> = {}): FloorPlan {
  const B = 'B1'
  const G = 'ground'
  return parseFloorPlan({
    floors: [
      { id: B, name: 'Basement car park', level: -1, elevation: -3 },
      { id: G, name: 'Ground floor', level: 0, elevation: 0 },
    ],
    walls: [
      wall('b-s1', [0, 0], [10, 0], B),
      wall('b-s2', [10, 0], [16, 0], B),
      wall('b-s3', [16, 0], [26, 0], B),
      wall('b-e', [26, 0], [26, 18], B),
      wall('b-n', [26, 18], [0, 18], B),
      wall('b-w', [0, 18], [0, 0], B),
      wall('b-core-w', [10, 0], [10, 7.6], B, 0.3, 'interior'),
      wall('b-core-n', [10, 7.6], [16, 7.6], B, 0.25, 'interior'),
      wall('b-core-e', [16, 7.6], [16, 0], B, 0.3, 'interior'),
      wall('g-s', [0, 0], [26, 0], G),
      wall('g-e', [26, 0], [26, 18], G),
      wall('g-n', [26, 18], [0, 18], G),
      wall('g-w', [0, 18], [0, 0], G),
    ],
    rooms: [
      { id: 'car-park', name: 'Car park', use: 'other', floor: B, boundary: ['b-s1', 'b-core-w', 'b-core-n', 'b-core-e', 'b-s3', 'b-e', 'b-n', 'b-w'] },
      { id: 'core', name: 'Stair', use: 'stair', floor: B, boundary: ['b-s2', 'b-core-e', 'b-core-n', 'b-core-w'] },
      { id: 'hall', name: 'Entrance hall', use: 'corridor', floor: G, boundary: ['g-s', 'g-e', 'g-n', 'g-w'] },
    ],
    openings: [
      { id: 'd-core', wall: 'b-core-n', type: 'door', offset: 2.5, width: 1, height: 2.1, sill: 0 },
      { id: 'ramp-mouth', wall: 'b-n', type: 'opening', offset: 22.6, width: 3.4, height: 2.4, sill: 0 },
      { id: 'd-hall', wall: 'g-s', type: 'door', offset: 12, width: 1.2, height: 2.1, sill: 0 },
    ],
    columns: [
      [8.6, 13], [13.6, 13], [18.6, 13], [23.6, 13], [18.5, 7.6], [23.5, 7.6], [5, 7.6],
    ].map((at, i) => ({ id: `col-${i + 1}`, shape: 'square', width: 0.4, at, floor: B })),
    bays: basementBays(),
    ramps: [BASEMENT_RAMP],
    ...extra,
  })
}
