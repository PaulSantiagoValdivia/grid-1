import type { FloorPlan, Opening, Room, Wall } from '../plan'

/**
 * Plans for the local rules check, drawn the way the assistant draws them: one
 * wall per room edge, exterior walls 0.2 m, interior 0.1 m.
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
