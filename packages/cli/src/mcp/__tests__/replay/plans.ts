/**
 * The buildings of the lab's five replayed conversations (cluster J, replayed in Y), written
 * again here at the same sizes: a terraced house before its kitchen extension, an architect's
 * three layouts on a 12 × 8 m plot, an estate agent's flat (with and without its balcony), and
 * one two-bedroom flat that a builder refurbishes and a wheelchair user tries.
 *
 * Nothing here was copied from the lab: only the sizes the people gave are the same.
 */

type Pair = [number, number]
type Json = Record<string, unknown>

const wall = (id: string, start: Pair, end: Pair, thickness = 0.1, kind = 'interior', height = 2.6, extra: Json = {}): Json =>
  ({ id, start, end, thickness, height, kind, ...extra })
const outer = (id: string, start: Pair, end: Pair, thickness = 0.3, height = 2.6): Json => wall(id, start, end, thickness, 'exterior', height)
const room = (id: string, name: string, use: string, boundary: string[]): Json => ({ id, name, use, boundary })
const door = (id: string, on: string, offset: number, width = 0.8, hinge = 'start', swing = 'left'): Json =>
  ({ id, wall: on, type: 'door', offset, width, sill: 0, height: 2.1, hinge, swing })
const win = (id: string, on: string, offset: number, width: number, sill = 0.9, height = 1.3): Json =>
  ({ id, wall: on, type: 'window', offset, width, sill, height })
const gap = (id: string, on: string, offset: number, width: number): Json => ({ id, wall: on, type: 'opening', offset, width, sill: 0, height: 2.1 })
const plan = (walls: Json[], rooms: Json[], openings: Json[]): Json => ({ version: '1', units: 'm', walls, rooms, openings })

/** 1. The house as it is now: 6 m wide, the kitchen 5.7 × 3.4 m inside at the back. */
export function houseNow(): Json {
  return plan(
    [
      outer('front', [0, 0], [6, 0]), outer('side-east', [6, 0], [6, 8]), outer('back', [6, 8], [0, 8]), outer('side-west', [0, 8], [0, 0]),
      wall('mid', [0, 4.4], [6, 4.4]), wall('hall-wall', [3.6, 0], [3.6, 4.4]),
    ],
    [
      room('living', 'Living room', 'living', ['front', 'hall-wall', 'mid', 'side-west']),
      room('hall', 'Hall', 'corridor', ['front', 'side-east', 'mid', 'hall-wall']),
      room('kitchen', 'Kitchen', 'kitchen', ['mid', 'side-east', 'back', 'side-west']),
    ],
    [
      door('front-door', 'front', 4.3, 0.9), win('win-living', 'front', 1.0, 1.8, 0.6, 1.5),
      door('door-living', 'hall-wall', 2.8, 0.8, 'start', 'right'), door('door-kitchen', 'mid', 4.2, 0.8),
      door('back-door', 'back', 0.6, 0.9), win('win-kitchen', 'back', 2.5, 1.8, 1.0, 1.1),
    ],
  )
}

const shell = (): Json[] => [outer('south', [0, 0], [12, 0]), outer('east', [12, 0], [12, 8]), outer('north', [12, 8], [0, 8]), outer('west', [0, 8], [0, 0])]

/** 2. The architect's option A: separate kitchen, three bedrooms off a hall on the east. */
export function optionA(): Json {
  return plan(
    [...shell(), wall('spine', [6, 0], [6, 8]), wall('hall-e', [7.2, 0], [7.2, 8]), wall('liv-n', [0, 4.5], [6, 4.5]), wall('kit-e', [4, 4.5], [4, 8]),
      wall('b1-n', [7.2, 2.8], [12, 2.8]), wall('b2-n', [7.2, 5.4], [12, 5.4])],
    [
      room('living', 'Living', 'living', ['south', 'spine', 'liv-n', 'west']),
      room('kitchen', 'Kitchen', 'kitchen', ['liv-n', 'kit-e', 'north', 'west']),
      room('bath', 'Bathroom', 'bathroom', ['liv-n', 'spine', 'north', 'kit-e']),
      room('hall', 'Hall', 'corridor', ['south', 'hall-e', 'north', 'spine']),
      room('bed1', 'Bedroom 1', 'bedroom', ['south', 'east', 'b1-n', 'hall-e']),
      room('bed2', 'Bedroom 2', 'bedroom', ['b1-n', 'east', 'b2-n', 'hall-e']),
      room('bed3', 'Bedroom 3', 'bedroom', ['b2-n', 'east', 'north', 'hall-e']),
    ],
    [
      door('d-entry', 'south', 6.15, 0.9), door('d-living', 'spine', 2.0), gap('g-kitchen', 'liv-n', 1.0, 1.6), door('d-bath', 'spine', 6.0, 0.7),
      door('d-b1', 'hall-e', 1.0, 0.8, 'start', 'right'), door('d-b2', 'hall-e', 3.6, 0.8, 'start', 'right'), door('d-b3', 'hall-e', 6.2, 0.8, 'start', 'right'),
      win('w-living', 'south', 1.5, 2.4, 0.3, 1.9), win('w-living-w', 'west', 5.0, 1.6), win('w-kitchen', 'north', 9.0, 1.6, 1.0, 1.1),
      win('w-bath', 'north', 6.6, 0.6, 1.4, 0.7), win('w-b1', 'east', 0.7, 1.4), win('w-b2', 'east', 3.4, 1.4), win('w-b3', 'east', 6.0, 1.4),
    ],
  )
}

/** Option B: living and kitchen in one, a corridor across, bedrooms either side of it. */
export function optionB(): Json {
  return plan(
    [...shell(), wall('liv-e', [5, 0], [5, 8]), wall('cor-s', [5, 3.5], [12, 3.5]), wall('cor-n', [5, 4.7], [12, 4.7]), wall('s-mid', [8.5, 0], [8.5, 3.5]), wall('n-mid', [8.5, 4.7], [8.5, 8])],
    [
      room('living', 'Living and kitchen', 'living', ['south', 'liv-e', 'north', 'west']),
      room('hall', 'Corridor', 'corridor', ['cor-s', 'east', 'cor-n', 'liv-e']),
      room('bed1', 'Bedroom 1', 'bedroom', ['south', 's-mid', 'cor-s', 'liv-e']),
      room('bed2', 'Bedroom 2', 'bedroom', ['south', 'east', 'cor-s', 's-mid']),
      room('bed3', 'Bedroom 3', 'bedroom', ['cor-n', 'n-mid', 'north', 'liv-e']),
      room('bath', 'Bathroom', 'bathroom', ['cor-n', 'east', 'north', 'n-mid']),
    ],
    [
      door('d-entry', 'south', 3.6, 0.9), gap('g-cor', 'liv-e', 3.6, 1.0),
      door('d-b1', 'cor-s', 1.0, 0.8, 'start', 'right'), door('d-b2', 'cor-s', 4.5, 0.8, 'start', 'right'), door('d-b3', 'cor-n', 1.0), door('d-bath', 'cor-n', 4.5, 0.7),
      win('w-living', 'south', 0.8, 2.4, 0.3, 1.9), win('w-living-w', 'west', 2.0, 3.0, 0.3, 1.9), win('w-kitchen', 'north', 8.5, 2.0, 1.0, 1.1),
      win('w-b1', 'south', 6.0, 1.4), win('w-b2', 'south', 9.5, 1.4), win('w-b3', 'north', 4.5, 1.4), win('w-bath', 'north', 1.5, 0.6, 1.4, 0.7),
    ],
  )
}

/** Option C: living across the south, a corridor, four rooms in a row on the north. */
export function optionC(): Json {
  return plan(
    [...shell(), wall('liv-n', [0, 4], [12, 4]), wall('cor-n', [0, 5.2], [12, 5.2]), wall('p1', [3.5, 5.2], [3.5, 8]), wall('p2', [7, 5.2], [7, 8]), wall('p3', [9, 5.2], [9, 8])],
    [
      room('living', 'Living and kitchen', 'living', ['south', 'east', 'liv-n', 'west']),
      room('hall', 'Corridor', 'corridor', ['liv-n', 'east', 'cor-n', 'west']),
      room('bed1', 'Bedroom 1', 'bedroom', ['cor-n', 'p1', 'north', 'west']),
      room('bed2', 'Bedroom 2', 'bedroom', ['cor-n', 'p2', 'north', 'p1']),
      room('bath', 'Bathroom', 'bathroom', ['cor-n', 'p3', 'north', 'p2']),
      room('bed3', 'Bedroom 3', 'bedroom', ['cor-n', 'east', 'north', 'p3']),
    ],
    [
      door('d-entry', 'south', 5.5, 0.9), gap('g-cor', 'liv-n', 5.4, 1.2),
      door('d-b1', 'cor-n', 1.5), door('d-b2', 'cor-n', 4.5), door('d-bath', 'cor-n', 7.6, 0.7), door('d-b3', 'cor-n', 9.8),
      win('w-living', 'south', 1.0, 3.0, 0.3, 1.9), win('w-living2', 'south', 8.0, 3.0, 0.3, 1.9),
      win('w-b1', 'north', 9.5, 1.4), win('w-b2', 'north', 6.0, 1.4), win('w-bath', 'north', 3.7, 0.6, 1.4, 0.7), win('w-b3', 'north', 0.8, 1.4),
    ],
  )
}

/** 3. The estate agent's flat from the room sizes given: lounge 4.60 × 3.60 and so on. */
export function agentFlat(balcony = false): Json {
  const walls = [
    outer('south', [0, 0], [8.7, 0]), outer('east', [8.7, 0], [8.7, 7.6]), outer('north', [8.7, 7.6], [0, 7.6]), outer('west', [0, 7.6], [0, 0]),
    wall('hall-s', [0, 3.8], [8.7, 3.8]), wall('hall-n', [0, 5.0], [8.7, 5.0]), wall('lounge-e', [4.8, 0], [4.8, 3.8]),
    wall('kit-e', [3.2, 5.0], [3.2, 7.6]), wall('bath-e', [5.4, 5.0], [5.4, 7.6]),
  ]
  const rooms = [
    room('lounge', 'Lounge', 'living', ['south', 'lounge-e', 'hall-s', 'west']),
    room('bed1', 'Bedroom 1', 'bedroom', ['south', 'east', 'hall-s', 'lounge-e']),
    room('hall', 'Hall', 'corridor', ['hall-s', 'east', 'hall-n', 'west']),
    room('kitchen', 'Kitchen', 'kitchen', ['hall-n', 'kit-e', 'north', 'west']),
    room('bath', 'Bathroom', 'bathroom', ['hall-n', 'bath-e', 'north', 'kit-e']),
    room('bed2', 'Bedroom 2', 'bedroom', ['hall-n', 'east', 'north', 'bath-e']),
  ]
  let openings = [
    door('front-door', 'east', 3.95, 0.9), door('d-lounge', 'hall-s', 2.0, 0.8, 'start', 'right'), door('d-bed1', 'hall-s', 6.0, 0.8, 'start', 'right'),
    door('d-kitchen', 'hall-n', 1.2), door('d-bath', 'hall-n', 3.9, 0.7), door('d-bed2', 'hall-n', 6.5),
    win('w-lounge', 'south', 1.4, 2.0, 0.6, 1.5), win('w-bed1', 'south', 6.0, 1.4), win('w-kitchen', 'north', 6.4, 1.2, 1.0, 1.1),
    win('w-bath', 'north', 4.0, 0.6, 1.4, 0.7), win('w-bed2', 'north', 1.0, 1.4),
  ]
  if (balcony) {
    walls.push(outer('balc-w', [0, 0], [0, -1.4], 0.1, 1.1), outer('balc-s', [0, -1.4], [4.8, -1.4], 0.1, 1.1), outer('balc-e', [4.8, -1.4], [4.8, 0], 0.1, 1.1))
    rooms.push(room('balcony', 'Balcony', 'other', ['balc-s', 'balc-e', 'south', 'balc-w']))
    openings = [...openings.filter((o) => o['id'] !== 'w-lounge'), door('d-balcony', 'south', 1.4, 1.6, 'start', 'right')]
  }
  return plan(walls, rooms, openings)
}

/** 4 and 7. The two-bedroom flat the builder prices and the wheelchair user tries. */
export function twoBedFlat(): Json {
  return plan(
    [
      outer('ext-south', [0, 0], [9.2, 0]), outer('ext-east', [9.2, 0], [9.2, 7.6]), outer('ext-north', [9.2, 7.6], [0, 7.6]), outer('ext-west', [0, 7.6], [0, 0]),
      wall('spine', [4.6, 0], [4.6, 7.6]), wall('bed1-north', [4.6, 3.3], [9.2, 3.3]), wall('hall-east', [6.0, 3.3], [6.0, 7.6]),
      wall('bath-north', [6.0, 5.0], [9.2, 5.0]), wall('living-north', [0, 4.4], [4.6, 4.4]),
    ],
    [
      room('living', 'Living room', 'living', ['ext-south', 'spine', 'living-north', 'ext-west']),
      room('kitchen', 'Kitchen', 'kitchen', ['living-north', 'spine', 'ext-north', 'ext-west']),
      room('hall', 'Hall', 'corridor', ['bed1-north', 'hall-east', 'ext-north', 'spine']),
      room('bed1', 'Bedroom 1', 'bedroom', ['ext-south', 'ext-east', 'bed1-north', 'spine']),
      room('bath', 'Bathroom', 'bathroom', ['bed1-north', 'ext-east', 'bath-north', 'hall-east']),
      room('bed2', 'Bedroom 2', 'bedroom', ['bath-north', 'ext-east', 'ext-north', 'hall-east']),
    ],
    [
      door('door-entrance', 'ext-north', 3.45, 0.9), door('door-living', 'spine', 3.45), door('door-kitchen', 'spine', 5.0),
      door('door-bed1', 'bed1-north', 0.3, 0.8, 'start', 'right'), door('door-bath', 'hall-east', 0.5, 0.7, 'start', 'right'), door('door-bed2', 'hall-east', 2.0, 0.8, 'start', 'right'),
      gap('pass-kitchen-living', 'living-north', 1.5, 1.2),
      win('win-living-south', 'ext-south', 1.2, 1.8, 0.6, 1.5), win('win-living-west', 'ext-west', 4.7, 1.4), win('win-kitchen', 'ext-west', 1.0, 1.2, 1.0, 1.1),
      win('win-bed1', 'ext-south', 6.2, 1.4), win('win-bath', 'ext-east', 3.8, 0.6, 1.4, 0.7), win('win-bed2', 'ext-east', 5.7, 1.2),
    ],
  )
}

/** The builder's refurbishment: the kitchen wall out, its door from the hall blocked, the bathroom door to 0.80 m. */
export function twoBedFlatRefurbished(): Json {
  const flat = twoBedFlat() as { walls: Json[]; rooms: Json[]; openings: Json[] }
  return plan(
    flat.walls.filter((w) => w['id'] !== 'living-north'),
    [
      room('living', 'Kitchen and living', 'living', ['ext-south', 'spine', 'ext-north', 'ext-west']),
      ...flat.rooms.filter((r) => r['id'] !== 'living' && r['id'] !== 'kitchen'),
    ],
    flat.openings
      .filter((o) => o['id'] !== 'door-kitchen' && o['id'] !== 'pass-kitchen-living')
      .map((o) => (o['id'] === 'door-bath' ? { ...o, width: 0.8 } : o)),
  )
}
