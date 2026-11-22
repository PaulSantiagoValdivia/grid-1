import type { FloorPlan, Opening, Room, Wall } from '../geometry/plan'

/**
 * Plans for the local rules check, drawn the way the assistant draws them: one
 * wall per room edge, exterior walls 0.2 m, interior 0.1 m. The one copy (QAR-6):
 * the core's tests and the rules package's import them from here, the rules
 * package as `@ongrid/floorplan/test-support/plans`.
 */

export function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  extra: Partial<Wall> = {}
): Wall {
  const kind = extra.kind ?? 'interior'
  return { id, start, end, thickness: kind === 'exterior' ? 0.2 : 0.1, height: 2.7, kind, ...extra }
}

export const exterior = (id: string, start: [number, number], end: [number, number], extra: Partial<Wall> = {}) =>
  wall(id, start, end, { kind: 'exterior', ...extra })

export function room(id: string, name: string, boundary: string[], floor?: string): Room {
  return { id, name, boundary, ...(floor === undefined ? {} : { floor }) }
}

export function door(id: string, wallId: string, offset: number, width = 0.9): Opening {
  return { id, wall: wallId, type: 'door', offset, width, sill: 0, height: 2.1 }
}

export function window_(id: string, wallId: string, offset: number, width = 1.2): Opening {
  return { id, wall: wallId, type: 'window', offset, width, sill: 0.9, height: 1.2 }
}

function plan(parts: Partial<FloorPlan> & Pick<FloorPlan, 'walls'>): FloorPlan {
  return { version: '1', units: 'm', rooms: [], openings: [], ...parts }
}

/**
 * A 10 × 8 flat on the ground floor:
 *
 *   y 8 +-----------+-----------+
 *       |  Bedroom  d_bb Bathroom|
 *   y 4 +--d_hb-+---+-----------+
 *       | Hall  d_hk   Kitchen  |
 *   y 0 +-front-+---------------+
 *       x 0     4   5           10
 *
 * The front door is the only exit. Windows on the kitchen and the bathroom.
 */
export function flat(): FloorPlan {
  return plan({
    walls: [
      exterior('s1', [0, 0], [4, 0]),
      exterior('s2', [4, 0], [10, 0]),
      exterior('e1', [10, 0], [10, 4]),
      exterior('e2', [10, 4], [10, 8]),
      exterior('n1', [10, 8], [5, 8]),
      exterior('n2', [5, 8], [0, 8]),
      exterior('w2', [0, 8], [0, 4]),
      exterior('w1', [0, 4], [0, 0]),
      wall('hk', [4, 0], [4, 4]),
      wall('hb', [0, 4], [4, 4]),
      wall('kb1', [4, 4], [5, 4]),
      wall('kb2', [5, 4], [10, 4]),
      wall('bb', [5, 4], [5, 8])
    ],
    rooms: [
      room('hall', 'Hall', ['s1', 'hk', 'hb', 'w1']),
      room('kitchen', 'Kitchen', ['s2', 'e1', 'kb2', 'kb1', 'hk']),
      room('bedroom', 'Bedroom', ['hb', 'kb1', 'bb', 'n2', 'w2']),
      room('bathroom', 'Bathroom', ['kb2', 'e2', 'n1', 'bb'])
    ],
    openings: [
      door('front', 's1', 1.5),
      door('d_hk', 'hk', 1.5),
      door('d_hb', 'hb', 1.5),
      door('d_bb', 'bb', 1),
      window_('win_k', 's2', 2),
      window_('win_b', 'n1', 2)
    ]
  })
}

/**
 * The flat on the ground floor and, above it, a study and a landing with a door
 * between them and a balcony door on the study's exterior wall.
 */
export function twoFloorHouse(): FloorPlan {
  const ground = flat()
  const up = (id: string, start: [number, number], end: [number, number], kind: Wall['kind']) =>
    wall(id, start, end, { kind, floor: 'first' })
  return {
    ...ground,
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls: [
      ...ground.walls,
      up('u_s', [0, 0], [10, 0], 'exterior'),
      up('u_e', [10, 0], [10, 8], 'exterior'),
      up('u_n1', [10, 8], [5, 8], 'exterior'),
      up('u_n2', [5, 8], [0, 8], 'exterior'),
      up('u_w', [0, 8], [0, 0], 'exterior'),
      up('u_mid', [5, 0], [5, 8], 'interior')
    ],
    rooms: [
      ...ground.rooms,
      room('landing', 'Landing', ['u_s', 'u_mid', 'u_n2', 'u_w'], 'first'),
      room('study', 'Study', ['u_s', 'u_e', 'u_n1', 'u_mid'], 'first')
    ],
    openings: [
      ...ground.openings,
      door('d_up', 'u_mid', 3),
      door('balcony', 'u_n1', 2)
    ]
  }
}

/**
 * Three 4 × 4 rooms side by side above one 12 m exterior wall; only the middle
 * one has a door on it. The dividers have doors between neighbours.
 */
export function longWallStrip(): FloorPlan {
  return plan({
    walls: [
      exterior('long', [0, 0], [12, 0]),
      exterior('east', [12, 0], [12, 4]),
      exterior('north', [12, 4], [0, 4]),
      exterior('west', [0, 4], [0, 0]),
      wall('div1', [4, 0], [4, 4]),
      wall('div2', [8, 0], [8, 4])
    ],
    rooms: [
      room('left', 'Left', ['long', 'div1', 'north', 'west']),
      room('middle', 'Middle', ['long', 'div2', 'north', 'div1']),
      room('right', 'Right', ['long', 'east', 'north', 'div2'])
    ],
    openings: [door('main', 'long', 5.5)]
  })
}

/**
 * LVL-7, lab R-4: a 4 × 3 flat entered through a genkan. The genkan (x 0 to 1.5) and the hall
 * (1.5 to 4) are joined by a doorless opening `g` in the partition `x`, which runs from (1.5, 0)
 * to (1.5, 3), so the genkan is on its left face. The front door `d` is in the west wall. The
 * genkan stands `offset` off the storey's floor.
 */
export function genkanFlat(offset = 0.18): FloorPlan {
  return plan({
    walls: [
      exterior('s', [0, 0], [4, 0]),
      exterior('e', [4, 0], [4, 3]),
      exterior('n', [4, 3], [0, 3]),
      exterior('w', [0, 3], [0, 0]),
      wall('x', [1.5, 0], [1.5, 3])
    ],
    rooms: [
      { ...room('genkan', 'Genkan', ['s', 'x', 'n', 'w']), use: 'corridor', floorOffset: offset },
      { ...room('hall', 'Hall', ['s', 'e', 'n', 'x']), use: 'corridor' }
    ],
    openings: [
      door('d', 'w', 1),
      { id: 'g', wall: 'x', type: 'opening', offset: 1, width: 0.9, sill: 0, height: 2.1 }
    ]
  })
}

/**
 * LVL-7, lab S-17: a 24 × 18 ballroom, walls 0.3 m thick and 5 m high, with an 8 × 4 m stage
 * 0.6 m high against its north wall. The stage is a room inside the ballroom, edged with
 * dividing lines, not a wall.
 */
export function ballroomWithStage(offset = 0.6): FloorPlan {
  const hall = (id: string, start: [number, number], end: [number, number]): Wall =>
    exterior(id, start, end, { thickness: 0.3, height: 5 })
  const edge = (id: string, start: [number, number], end: [number, number]): Wall =>
    wall(id, start, end, { thickness: 0, height: 0, virtual: true })
  return plan({
    walls: [
      hall('hall-s', [0, 0], [24, 0]),
      hall('hall-e', [24, 0], [24, 18]),
      hall('hall-n', [24, 18], [0, 18]),
      hall('hall-w', [0, 18], [0, 0]),
      edge('stg-s', [8, 13.6], [16, 13.6]),
      edge('stg-e', [16, 13.6], [16, 17.6]),
      edge('stg-n', [16, 17.6], [8, 17.6]),
      edge('stg-w', [8, 17.6], [8, 13.6])
    ],
    rooms: [
      { ...room('ballroom', 'Ballroom', ['hall-s', 'hall-e', 'hall-n', 'hall-w']), use: 'other' },
      { ...room('stage', 'Stage', ['stg-s', 'stg-e', 'stg-n', 'stg-w']), use: 'other', inside: true, floorOffset: offset }
    ],
    openings: [door('entry', 'hall-s', 11.5, 1.8)]
  })
}

/**
 * LVL-3, lab VE-1: a three-floor house, 6 × 4 on each floor, with the stair drawn as a room on
 * every floor, the way agents draw it. On each floor a partition at x 4 parts a main room
 * (x 0 to 4) from a stair room (4 to 6), with a door between them. The ground floor's front door
 * is in the south wall of its hall. `shifted` moves the first floor's stair room (and its
 * partition) to the west end, out of line with the stair rooms above and below. `use` is what
 * the stair rooms are used as.
 *
 *   y 4 +--------------+------+
 *       |  hall/room   d stair|
 *   y 0 +--front-------+------+
 *       x 0            4      6
 */
export function stairRoomHouse(options: { shifted?: boolean; use?: 'stair' | 'lift' } = {}): FloorPlan {
  const floors = [
    { id: 'ground', name: 'Ground floor', level: 0 },
    { id: 'first', name: 'First floor', level: 1 },
    { id: 'second', name: 'Second floor', level: 2 }
  ]
  const walls: Wall[] = []
  const rooms: Room[] = []
  const openings: Opening[] = []
  for (const { id: f } of floors) {
    const moved = options.shifted === true && f === 'first'
    // The partition, and which side of it the stair room is on.
    const x = moved ? 2 : 4
    const on = { floor: f }
    walls.push(
      exterior(`${f}-s1`, [0, 0], [x, 0], on),
      exterior(`${f}-s2`, [x, 0], [6, 0], on),
      exterior(`${f}-e`, [6, 0], [6, 4], on),
      exterior(`${f}-n2`, [6, 4], [x, 4], on),
      exterior(`${f}-n1`, [x, 4], [0, 4], on),
      exterior(`${f}-w`, [0, 4], [0, 0], on),
      wall(`${f}-x`, [x, 0], [x, 4], on)
    )
    const main = { ...room(`${f}-main`, f === 'ground' ? 'Hall' : 'Room', moved ? [`${f}-s2`, `${f}-e`, `${f}-n2`, `${f}-x`] : [`${f}-s1`, `${f}-x`, `${f}-n1`, `${f}-w`], f), use: 'corridor' as const }
    const stair = { ...room(`${f}-stair`, 'Stair', moved ? [`${f}-s1`, `${f}-x`, `${f}-n1`, `${f}-w`] : [`${f}-s2`, `${f}-e`, `${f}-n2`, `${f}-x`], f), use: options.use ?? 'stair' }
    rooms.push(main, stair)
    openings.push(door(`${f}-d`, `${f}-x`, 1.5))
  }
  openings.push(door('front', 'ground-s1', 1.5))
  return plan({ floors, walls, rooms, openings })
}

/**
 * LVL-3 (decided in LVL-2): the two-floor house with a stair stated once, from the hall up to
 * the landing: 0.9 m wide, its walking line from (0.6, 0.6) to (0.6, 3.4), along the hall's west
 * wall. The ground floor is 2.7 m high on a 0.25 m slab, so the stair climbs 2.95 m.
 */
export function stairHouse(): FloorPlan {
  return { ...twoFloorHouse(), stairs: [{ id: 's1', name: 'Main stair', from: 'ground', to: 'first', width: 0.9, run: [[0.6, 0.6], [0.6, 3.4]] }] }
}

/** A copy of the plan the test can edit without touching the original. */
export function edit(source: FloorPlan, change: (copy: FloorPlan) => void): FloorPlan {
  const copy = structuredClone(source) as FloorPlan
  change(copy)
  return copy
}

export const withoutOpening = (source: FloorPlan, id: string): FloorPlan =>
  edit(source, (copy) => {
    copy.openings = copy.openings.filter((o) => o.id !== id)
  })

export const withOpening = (source: FloorPlan, opening: Opening): FloorPlan =>
  edit(source, (copy) => {
    copy.openings.push(opening)
  })

export const madeVirtual = (source: FloorPlan, wallId: string): FloorPlan =>
  edit(source, (copy) => {
    const target = copy.walls.find((w) => w.id === wallId)!
    target.virtual = true
    copy.openings = copy.openings.filter((o) => o.wall !== wallId)
  })
