/**
 * Plans for the diff tests, built in code so every number is visible and no
 * recorded JSON can drift. Each one validates with no issues.
 */

import type { FloorPlan } from '../plan'

type Wall = FloorPlan['walls'][number]
type Room = FloorPlan['rooms'][number]
type Opening = FloorPlan['openings'][number]

export function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  extra: Partial<Wall> = {}
): Wall {
  return { id, start, end, thickness: 0.2, height: 2.7, kind: 'interior', ...extra }
}

export function room(id: string, name: string, boundary: string[], floor?: string): Room {
  return floor === undefined ? { id, name, boundary } : { id, name, boundary, floor }
}

export function opening(
  id: string,
  wallId: string,
  type: Opening['type'],
  offset: number,
  width: number,
  extra: Partial<Opening> = {}
): Opening {
  const door = type === 'door'
  return {
    id,
    wall: wallId,
    type,
    offset,
    width,
    sill: door ? 0 : 0.9,
    height: door ? 2.1 : 1.2,
    ...extra
  }
}

export function plan(parts: Partial<FloorPlan> & Pick<FloorPlan, 'walls'>): FloorPlan {
  return { version: '1', units: 'm', rooms: [], openings: [], ...parts }
}

/**
 * Two 4 × 4 rooms side by side, 8 m wide: a south, east, north and west
 * wall of 0.2 m and a 0.1 m wall between them. A door in the middle wall and
 * a window in the north wall.
 */
export function twoRoomBox(): FloorPlan {
  return plan({
    walls: [
      wall('w_s', [0, 0], [8, 0], { kind: 'exterior' }),
      wall('w_e', [8, 0], [8, 4], { kind: 'exterior' }),
      wall('w_n', [8, 4], [0, 4], { kind: 'exterior' }),
      wall('w_w', [0, 4], [0, 0], { kind: 'exterior' }),
      wall('w_mid', [4, 0], [4, 4], { thickness: 0.1 })
    ],
    rooms: [
      room('r_left', 'Left room', ['w_s', 'w_mid', 'w_n', 'w_w']),
      room('r_right', 'Right room', ['w_s', 'w_e', 'w_n', 'w_mid'])
    ],
    openings: [
      opening('o_door', 'w_mid', 'door', 1.5, 0.9),
      opening('o_win', 'w_n', 'window', 1, 1.2)
    ]
  })
}

/**
 * Three rooms by two, each 4 × 4, drawn the way the assistant draws them: one
 * wall per room edge, so a divider between two rooms is one 4 m wall. The
 * perimeter is 0.2 m and the dividers 0.1 m. Room `r<column><row>`; walls
 * `h<line>_<column>` run along x and `v<line>_<row>` along y.
 */
export function sixRoomHouse(): FloorPlan {
  const walls: Wall[] = []
  for (let line = 0; line < 3; line++) {
    for (let column = 0; column < 3; column++) {
      const y = line * 4
      walls.push(
        wall(`h${line}_${column}`, [column * 4, y], [column * 4 + 4, y], line === 1 ? { thickness: 0.1 } : { kind: 'exterior' })
      )
    }
  }
  for (let line = 0; line < 4; line++) {
    for (let row = 0; row < 2; row++) {
      const x = line * 4
      walls.push(
        wall(`v${line}_${row}`, [x, row * 4], [x, row * 4 + 4], line === 0 || line === 3 ? { kind: 'exterior' } : { thickness: 0.1 })
      )
    }
  }
  const rooms: Room[] = []
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 3; column++) {
      rooms.push(
        room(`r${column}${row}`, `Room ${column}${row}`, [
          `h${row}_${column}`,
          `v${column + 1}_${row}`,
          `h${row + 1}_${column}`,
          `v${column}_${row}`
        ])
      )
    }
  }
  return plan({
    walls,
    rooms,
    openings: [
      opening('d0', 'v1_0', 'door', 1.5, 0.9),
      opening('d1', 'v2_1', 'door', 1.5, 0.9),
      opening('d2', 'h1_0', 'door', 1.5, 0.9),
      opening('win0', 'h0_0', 'window', 1, 1.2),
      opening('win1', 'h2_1', 'window', 1, 1.2)
    ]
  })
}

/**
 * A 6 × 4 box on the ground floor (which never says so) and the same box
 * above it, registered as `first`.
 */
export function twoFloorPlan(): FloorPlan {
  const box = (prefix: string, floor?: string): Wall[] => {
    const extra = floor === undefined ? {} : { floor }
    return [
      wall(`${prefix}_s`, [0, 0], [6, 0], { kind: 'exterior', ...extra }),
      wall(`${prefix}_e`, [6, 0], [6, 4], { kind: 'exterior', ...extra }),
      wall(`${prefix}_n`, [6, 4], [0, 4], { kind: 'exterior', ...extra }),
      wall(`${prefix}_w`, [0, 4], [0, 0], { kind: 'exterior', ...extra })
    ]
  }
  return plan({
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls: [...box('g'), ...box('f', 'first')],
    rooms: [
      room('g_room', 'Hall', ['g_s', 'g_e', 'g_n', 'g_w']),
      room('f_room', 'Bedroom', ['f_s', 'f_e', 'f_n', 'f_w'], 'first')
    ],
    openings: [
      opening('g_door', 'g_s', 'door', 2, 0.9),
      opening('f_win', 'f_n', 'window', 2, 1.2)
    ]
  })
}

/** A copy of the plan that tests can edit without touching the original. */
export function edit(source: FloorPlan, change: (copy: FloorPlan) => void): FloorPlan {
  const copy = structuredClone(source)
  change(copy)
  return copy
}

/** Replaces one wall's fields. */
export function withWall(source: FloorPlan, id: string, patch: Partial<Wall>): FloorPlan {
  return edit(source, (copy) => {
    const target = copy.walls.find((w) => w.id === id)
    if (!target) throw new Error(`no wall ${id}`)
    Object.assign(target, patch)
  })
}

/** Replaces one opening's fields. */
export function withOpening(source: FloorPlan, id: string, patch: Partial<Opening>): FloorPlan {
  return edit(source, (copy) => {
    const target = copy.openings.find((o) => o.id === id)
    if (!target) throw new Error(`no opening ${id}`)
    Object.assign(target, patch)
  })
}

/** Replaces one room's fields. */
export function withRoom(source: FloorPlan, id: string, patch: Partial<Room>): FloorPlan {
  return edit(source, (copy) => {
    const target = copy.rooms.find((r) => r.id === id)
    if (!target) throw new Error(`no room ${id}`)
    Object.assign(target, patch)
  })
}

/** Moves a wall by a vector, both ends. */
export function moveWall(source: FloorPlan, id: string, dx: number, dy: number): FloorPlan {
  return edit(source, (copy) => {
    const target = copy.walls.find((w) => w.id === id)
    if (!target) throw new Error(`no wall ${id}`)
    target.start = [target.start[0] + dx, target.start[1] + dy]
    target.end = [target.end[0] + dx, target.end[1] + dy]
  })
}

/** Small, fast, deterministic: the same seed gives the same sequence anywhere. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleList<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function shuffleKeys<T extends object>(value: T, random: () => number): T {
  const entries = shuffleList(Object.entries(value), random)
  return Object.fromEntries(entries) as T
}

/**
 * The same plan written another way: every list in another order and every
 * object with its keys in another order. A room's `boundary` keeps its order,
 * because C3 makes that order mean something.
 */
export function shuffled(source: FloorPlan, seed = 1): FloorPlan {
  const random = mulberry32(seed)
  const each = <T extends object>(list: readonly T[]): T[] =>
    shuffleList(list, random).map((item) => shuffleKeys(item, random))
  return shuffleKeys(
    {
      ...source,
      walls: each(source.walls),
      rooms: each(source.rooms),
      openings: each(source.openings),
      ...(source.floors ? { floors: each(source.floors) } : {})
    },
    random
  )
}
