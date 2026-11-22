/**
 * The changes the tool server can make to a plan: change or remove one opening, move one side
 * of a room, and mirror the whole plan.
 *
 * Each works out a patch from the plan as Grid reads it, and the patch is applied twice: to that
 * plan, to say what the change did, and to the file's own JSON, so that everything the change
 * does not touch is written back exactly as it was, keys Grid does not know included.
 *
 * Pure: no file is read or written here. A change that can't be made is refused with
 * `EditRefused`, saying why and what would fit; nothing is half done.
 */
import { dot, sub, tolerance, wallAxis, type FloorPlan, type Opening, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import type { Survey } from '../quantities/survey'

export class EditRefused extends Error {
  override readonly name = 'EditRefused'
}

type Pair = [number, number]

/** What a change does, by id. */
export interface Patch {
  readonly walls: ReadonlyMap<string, { start?: Pair; end?: Pair }>
  readonly openings: ReadonlyMap<string, Partial<Pick<Opening, 'offset' | 'width' | 'height' | 'sill' | 'type' | 'hinge' | 'swing'>>>
  readonly removeOpenings: ReadonlySet<string>
  readonly rooms: ReadonlyMap<string, { boundary: string[] }>
  /** CNT-12: fixtures moved or turned, by id. Left out by a change that moves none. */
  readonly items?: ReadonlyMap<string, { at: Pair; turn: number }>
  /** One line per thing changed, in Grid's words. */
  readonly said: readonly string[]
}

function emptyPatch(said: string[]): Patch {
  return { walls: new Map(), openings: new Map(), removeOpenings: new Set(), rooms: new Map(), said }
}

type RawRecord = Record<string, unknown>

/** Applies a patch to a plan's JSON, the file's own or Grid's reading of it, without changing anything else. */
export function applyPatch<T extends RawRecord>(raw: T, patch: Patch): T {
  const list = (key: string): RawRecord[] => (Array.isArray(raw[key]) ? (raw[key] as RawRecord[]) : [])
  const walls = list('walls').map((wall) => {
    const change = patch.walls.get(wall['id'] as string)
    return change ? { ...wall, ...change } : wall
  })
  const openings = list('openings')
    .filter((o) => !patch.removeOpenings.has(o['id'] as string))
    .map((o) => {
      const change = patch.openings.get(o['id'] as string)
      if (!change) return o
      const next: RawRecord = { ...o, ...change }
      // A door's hinge and swing say nothing on anything else.
      if (next['type'] !== 'door') {
        delete next['hinge']
        delete next['swing']
      }
      return next
    })
  const rooms = list('rooms').map((room) => {
    const change = patch.rooms.get(room['id'] as string)
    return change ? { ...room, ...change } : room
  })
  // A plan with no items keeps no key.
  const items = patch.items === undefined || !Array.isArray(raw['items'])
    ? {}
    : {
        items: list('items').map((item) => {
          const change = patch.items!.get(item['id'] as string)
          return change ? { ...item, ...change } : item
        }),
      }
  return { ...raw, walls, openings, rooms, ...items }
}

const r3 = (value: number): number => Math.round(value * 1000) / 1000

/** The free stretches of a wall, measured from its start, between the other openings in it. */
function freeStretches(plan: FloorPlan, wall: Wall, skip: string): Array<[number, number]> {
  const length = wallAxis(wall).length
  const taken = plan.openings
    .filter((o) => o.wall === wall.id && o.id !== skip)
    .map((o): [number, number] => [o.offset, o.offset + o.width])
    .sort((a, b) => a[0] - b[0])
  const free: Array<[number, number]> = []
  let at = 0
  for (const [lo, hi] of taken) {
    if (lo > at + tolerance('noLength')) free.push([at, lo])
    at = Math.max(at, hi)
  }
  if (length > at + tolerance('noLength')) free.push([at, length])
  return free
}

export const KEEPS = ['start', 'centre', 'end'] as const
export type Keep = (typeof KEEPS)[number]

export interface OpeningChangeRequest {
  readonly width?: number
  readonly height?: number
  readonly sill?: number
  readonly type?: Opening['type']
  /** A room id, or "outside": the side a door opens toward. */
  readonly opensInto?: string
  readonly hinge?: Opening['hinge']
  readonly keep?: Keep
  readonly remove?: boolean
}

export function changeOpening(survey: Survey, id: string, request: OpeningChangeRequest): Patch {
  const plan = survey.plan
  const opening = plan.openings.find((o) => o.id === id)!
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (!wall) throw new EditRefused('That opening names a wall the plan does not have; grid_check says more.')
  const label = `${opening.type} ${JSON.stringify(opening.id)}`
  if (request.remove) {
    const extra = Object.keys(request).filter((key) => key !== 'remove' && (request as Record<string, unknown>)[key] !== undefined)
    if (extra.length > 0) throw new EditRefused(`remove takes nothing else: leave out ${extra.join(', ')}.`)
    const patch = emptyPatch([`Removed ${label} (${opening.width.toFixed(2)} m wide); the wall is solid there now.`])
    ;(patch.removeOpenings as Set<string>).add(id)
    return patch
  }

  const type = request.type ?? opening.type
  const width = request.width ?? opening.width
  const height = request.height ?? (request.type === 'door' && opening.type !== 'door' ? 2.1 : opening.height)
  const sill = request.sill ?? (type === 'door' ? 0 : opening.sill)
  if (type !== 'door' && (request.opensInto !== undefined || request.hinge !== undefined)) {
    throw new EditRefused(`Only a door opens into a room or hangs from a side; this would be a ${type}.`)
  }
  if (sill + height > wall.height + tolerance('noLength')) {
    throw new EditRefused(`A sill of ${sill.toFixed(2)} m and a height of ${height.toFixed(2)} m reach above the ${wall.height.toFixed(2)} m wall.`)
  }

  const keep = request.keep ?? 'centre'
  const length = wallAxis(wall).length
  const offset = keep === 'start' ? opening.offset : keep === 'end' ? opening.offset + opening.width - width : opening.offset + (opening.width - width) / 2
  const free = freeStretches(plan, wall, id)
  const fits = free.some(([lo, hi]) => offset >= lo - tolerance('joint') && offset + width <= hi + tolerance('joint'))
  if (!fits) {
    const room = free.filter(([lo, hi]) => hi - lo >= width - tolerance('joint'))
    const where = free.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m (${(hi - lo).toFixed(2)} m)`).join(', ')
    const hint = room.length > 0
      ? `A stretch that takes ${width.toFixed(2)} m: ${room.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m`).join(', ')}; try keep start or end, or remove what is in the way first.`
      : `No stretch of this wall takes ${width.toFixed(2)} m; remove an opening in the way first.`
    throw new EditRefused(`${label} can't be ${width.toFixed(2)} m wide keeping its ${keep}: it would run from ${offset.toFixed(2)} to ${(offset + width).toFixed(2)} m along its ${length.toFixed(2)} m wall. Free stretches, from the wall's start: ${where || 'none'}. ${hint}`)
  }

  const change: Record<string, unknown> = {}
  const said: string[] = []
  if (type !== opening.type) {
    change['type'] = type
    said.push(`${label} is now a ${type}.`)
  }
  if (Math.abs(width - opening.width) > tolerance('noLength')) {
    change['width'] = r3(width)
    change['offset'] = r3(offset)
    said.push(`${label} width ${opening.width.toFixed(2)} → ${width.toFixed(2)} m, keeping its ${keep}.`)
  }
  if (Math.abs(height - opening.height) > tolerance('noLength')) {
    change['height'] = r3(height)
    said.push(`${label} height ${opening.height.toFixed(2)} → ${height.toFixed(2)} m.`)
  }
  if (Math.abs(sill - opening.sill) > tolerance('noLength')) {
    change['sill'] = r3(sill)
    said.push(`${label} sill ${opening.sill.toFixed(2)} → ${sill.toFixed(2)} m.`)
  }
  if (request.opensInto !== undefined) {
    const facts = survey.facts.openings.get(id)
    const sides = facts?.sides.map((side) => (typeof side === 'object' ? side.room : side === 'outside' ? 'outside' : null)) ?? []
    const at = sides.indexOf(request.opensInto)
    if (at < 0) {
      const names = sides.map((side) => (side === null ? 'nothing drawn' : side === 'outside' ? '"outside"' : JSON.stringify(side)))
      throw new EditRefused(`That door is between ${names.join(' and ')}: it can open into one of those only.`)
    }
    const swing = at === 0 ? 'left' : 'right'
    change['swing'] = swing
    if (opening.hinge === undefined && request.hinge === undefined) change['hinge'] = 'start'
    if (swing !== opening.swing) said.push(`${label} now opens into ${request.opensInto === 'outside' ? 'the outside' : JSON.stringify(survey.facts.rooms.get(request.opensInto)?.name ?? request.opensInto)}.`)
  }
  if (request.hinge !== undefined && request.hinge !== opening.hinge) {
    change['hinge'] = request.hinge
    said.push(`${label} now hangs from the end nearer the wall's ${request.hinge}.`)
  }
  if (said.length === 0) throw new EditRefused(`That is how ${label} is already: nothing to change.`)
  const patch = emptyPatch(said)
  ;(patch.openings as Map<string, Record<string, unknown>>).set(id, change)
  return patch
}

export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const
export type Direction = (typeof DIRECTIONS)[number]

const OUTWARD: Record<Direction, Vec2> = { north: { x: 0, y: 1 }, east: { x: 1, y: 0 }, south: { x: 0, y: -1 }, west: { x: -1, y: 0 } }

const pt = (pair: readonly [number, number]): Vec2 => ({ x: pair[0], y: pair[1] })

/**
 * Moves the wall on one side of a room straight out (or in, with a negative distance). Walls
 * that end on it follow, so the rooms beside it grow or shrink with it, and its openings move
 * with it. Only a side square to the drawing can move: north, east, south or west.
 */
export function moveRoomSide(survey: Survey, roomId: string, side: Direction, by: number): Patch {
  const room = survey.byId.get(roomId)!
  const out = OUTWARD[side]
  const edges = room.edges.filter((edge) => {
    const d = sub(edge.to, edge.from)
    const n = { x: d.y / edge.length, y: -d.x / edge.length }
    return edge.wall !== null && Math.abs(dot(n, out) - 1) < 1e-3
  })
  const name = JSON.stringify(room.facts.name)
  if (edges.length === 0) throw new EditRefused(`${name} has no side facing ${side}: its sides face ${[...new Set(room.edges.map((e) => compass(e)))].join(', ')}.`)
  const walls = [...new Set(edges.map((edge) => edge.wall!))]
  if (walls.length > 1) throw new EditRefused(`The ${side} side of ${name} is made of ${walls.length} walls; move one wall at a time is not offered yet.`)
  const wall = walls[0]!
  if (wall.virtual === true) throw new EditRefused(`The ${side} side of ${name} is a dividing line, not a wall.`)
  const v = { x: out.x * by, y: out.y * by }
  const plan: FloorPlan = survey.plan
  const floor = wall.floor ?? 'ground'
  const oldStart = pt(wall.start)
  const oldEnd = pt(wall.end)
  const axis = wallAxis(wall)
  const onAxis = (p: Vec2): boolean => {
    const t = dot(sub(p, oldStart), axis.dir)
    const off = Math.abs(dot(sub(p, oldStart), axis.normal))
    return off < 0.02 && t > -0.02 && t < axis.length + 0.02
  }
  const moved = (p: Vec2): Pair => [r3(p.x + v.x), r3(p.y + v.y)]
  const patchWalls = new Map<string, { start?: Pair; end?: Pair }>()
  patchWalls.set(wall.id, { start: moved(oldStart), end: moved(oldEnd) })
  const patchOpenings = new Map<string, Record<string, unknown>>()
  const followers: string[] = []
  for (const other of plan.walls) {
    if (other.id === wall.id || (other.floor ?? 'ground') !== floor) continue
    const s = pt(other.start)
    const e = pt(other.end)
    const change: { start?: Pair; end?: Pair } = {}
    if (onAxis(s) && !onAxis(e)) change.start = moved(s)
    if (onAxis(e) && !onAxis(s)) change.end = moved(e)
    if (!change.start && !change.end) continue
    const ns = change.start ? pt(change.start) : s
    const ne = change.end ? pt(change.end) : e
    const oldAxis = wallAxis(other)
    const nd = sub(ne, ns)
    const nl = Math.hypot(nd.x, nd.y)
    if (nl < 0.05) throw new EditRefused(`Moving it ${by.toFixed(2)} m would leave wall ${JSON.stringify(other.id)} with no length.`)
    if (Math.abs(dot({ x: nd.x / nl, y: nd.y / nl }, oldAxis.dir) - 1) > 1e-6) {
      throw new EditRefused(`Wall ${JSON.stringify(other.id)} ends on it at an angle, and would turn; Grid moves only walls that meet it square.`)
    }
    patchWalls.set(other.id, change)
    followers.push(other.id)
    // Its openings keep their place on the ground: offsets are measured from its start.
    for (const o of plan.openings.filter((x) => x.wall === other.id)) {
      const at = oldAxis.start.x + oldAxis.dir.x * o.offset
      const atY = oldAxis.start.y + oldAxis.dir.y * o.offset
      const offset = dot(sub({ x: at, y: atY }, ns), oldAxis.dir)
      if (offset < -tolerance('joint') || offset + o.width > nl + tolerance('joint')) {
        throw new EditRefused(`Moving it ${by.toFixed(2)} m would leave ${o.type} ${JSON.stringify(o.id)} outside its wall ${JSON.stringify(other.id)}; move or remove it first.`)
      }
      if (Math.abs(offset - o.offset) > tolerance('noLength')) patchOpenings.set(o.id, { offset: r3(offset) })
    }
  }
  const said = [
    `Moved wall ${JSON.stringify(wall.id)}, the ${side} side of ${name}, ${Math.abs(by).toFixed(2)} m ${by >= 0 ? side : `back from the ${side}`}${followers.length > 0 ? `; walls that end on it followed: ${followers.map((id) => JSON.stringify(id)).join(', ')}` : ''}.`,
  ]
  return { walls: patchWalls, openings: patchOpenings, removeOpenings: new Set(), rooms: new Map(), said }
}

function compass(edge: { from: Vec2; to: Vec2; length: number }): string {
  const d = sub(edge.to, edge.from)
  const n = { x: d.y / edge.length, y: -d.x / edge.length }
  if (n.y > 0.99) return 'north'
  if (n.y < -0.99) return 'south'
  if (n.x > 0.99) return 'east'
  if (n.x < -0.99) return 'west'
  return 'at an angle'
}

export const MIRRORS = ['left-right', 'top-bottom'] as const
export type Mirror = (typeof MIRRORS)[number]

/**
 * The whole plan mirrored about the middle of its walls' box: left to right swaps east and
 * west. Every door keeps opening into the same room, every room keeps its size, and each
 * room's walls are listed the other way round, so they still run counter-clockwise (C3).
 */
export function mirrorPlan(survey: Survey, how: Mirror): Patch {
  const plan = survey.plan
  const xs = plan.walls.flatMap((w) => [w.start[0], w.end[0]])
  const ys = plan.walls.flatMap((w) => [w.start[1], w.end[1]])
  const flip = (p: readonly [number, number]): Pair =>
    how === 'left-right'
      ? [r3(Math.min(...xs) + Math.max(...xs) - p[0]), p[1]]
      : [p[0], r3(Math.min(...ys) + Math.max(...ys) - p[1])]
  const walls = new Map(plan.walls.map((w) => [w.id, { start: flip(w.start), end: flip(w.end) }]))
  const openings = new Map<string, Record<string, unknown>>()
  for (const o of plan.openings) if (o.swing !== undefined) openings.set(o.id, { swing: o.swing === 'left' ? 'right' : 'left' })
  const rooms = new Map(plan.rooms.map((room) => [room.id, { boundary: [...room.boundary].reverse() }]))
  // CNT-12: a fixture's middle is mirrored, and its front faces the mirrored way: left to right
  // turns it to minus its turn, top to bottom to a half turn less it.
  const items = new Map((plan.items ?? []).map((item) => {
    const turn = item.turn ?? 0
    const mirrored = how === 'left-right' ? -turn : 180 - turn
    return [item.id, { at: flip(item.at), turn: r3(((mirrored % 360) + 360) % 360) }]
  }))
  return {
    walls,
    openings,
    removeOpenings: new Set(),
    rooms,
    ...(items.size === 0 ? {} : { items }),
    said: [`Mirrored the plan ${how === 'left-right' ? 'left to right (east and west swap)' : 'top to bottom (north and south swap)'}: ${plan.walls.length} walls, ${plan.openings.length} openings and ${plan.rooms.length} rooms${items.size === 0 ? '' : `, and ${items.size} fixture${items.size === 1 ? '' : 's'}`}.`],
  }
}
