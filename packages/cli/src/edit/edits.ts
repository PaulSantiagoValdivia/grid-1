/**
 * The changes the tool server can make to a plan: change, move or remove one opening, move one
 * side of a room, and mirror the whole plan. The room edits (merge, split, add, stretch, rename;
 * WRT-3) are in their own files beside this one and use the same patch.
 *
 * Each works out a patch from the plan as Grid reads it, and the patch is applied twice: to that
 * plan, to say what the change did, and to the file's own JSON, so that everything the change
 * does not touch is written back exactly as it was, keys Grid does not know included.
 *
 * Pure: no file is read or written here. A change that can't be made is refused with
 * `EditRefused`, saying why and what would fit; nothing is half done.
 */
import { cameraRecord, compassBearing, dot, drawingBearing, planOrientation, storedView, sub, tolerance, viewSetting, wallAxis, wrapDegrees, type FloorPlan, type Opening, type OpeningAnchor, type StoredView, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import { surveyPlan, type Survey } from '../quantities/survey'
import { EditRefused } from './refused'
import { COMPASS, pt, r3, roomFaceAlong, seatOpenings } from './seat'

export { EditRefused }

type Pair = [number, number]
type RawRecord = Record<string, unknown>

/** A change to one opening. `null` takes a key out. */
export type OpeningChange = Partial<{ [K in 'offset' | 'width' | 'height' | 'sill' | 'type' | 'hinge' | 'swing' | 'wall']: Opening[K] }> & { anchor?: OpeningAnchor | null }

/** A change to one room. `null` takes a key out. `partOf` makes it a zone of that room (CNT-8). */
export type RoomChange = {
  boundary?: string[]
  name?: string
  use?: string | null
  partOf?: string | null
  properties?: Readonly<Record<string, string | number | boolean>>
}

/** What a change does, by id. */
export interface Patch {
  readonly walls: ReadonlyMap<string, { start?: Pair; end?: Pair; kind?: Wall['kind'] }>
  readonly openings: ReadonlyMap<string, OpeningChange>
  readonly removeOpenings: ReadonlySet<string>
  readonly rooms: ReadonlyMap<string, RoomChange>
  /** CNT-3: the plan's own fields set (`north`, `site`). `null` takes a key out. Left out by a change that sets none. */
  readonly plan?: Readonly<Record<string, unknown>>
  /** CNT-12: fixtures moved or turned, by id. Left out by a change that moves none. */
  readonly items?: ReadonlyMap<string, { at: Pair; turn: number }>
  /**
   * WRT-4 with LVL-8: the opening patterns, by id, whose door swings the other way (a mirror), as
   * each plain door's does. A pattern is otherwise kept as the file has it: its wall keeps its id,
   * start and end, so its places along the wall and its floors hold through a mirror or a turn.
   */
  readonly swingPatterns?: ReadonlySet<string>
  /** One line per thing changed, in Grid's words. */
  readonly said: readonly string[]
  /** Walls taken out; walls added go where the first one taken out was, or at the end. */
  readonly removeWalls?: ReadonlySet<string>
  readonly addWalls?: readonly RawRecord[]
  readonly removeRooms?: ReadonlySet<string>
  readonly addRooms?: readonly RawRecord[]
  readonly addOpenings?: readonly RawRecord[]
  /** What the request left open and Grid chose. */
  readonly guessed?: readonly string[]
  /** What the change could not keep as it was. */
  readonly notKept?: readonly string[]
  /** Rooms that are now part of another, by id: a door that joined the old one joins the new. */
  readonly roomsBecome?: ReadonlyMap<string, string>
  /** Anything else the answer carries as data. */
  readonly extra?: Readonly<Record<string, unknown>>
}

/**
 * Names in a sentence, at most `max` of them and then how many more, so an answer stays the
 * same size on a flat and on a block (lab AU6-3).
 */
export function listed(names: readonly string[], max = 3): string {
  const shown = names.length > max ? [...names.slice(0, max - 1), `${names.length - max + 1} more`] : [...names]
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

export function emptyPatch(said: string[]): Patch {
  return { walls: new Map(), openings: new Map(), removeOpenings: new Set(), rooms: new Map(), said }
}

function merged(record: RawRecord, change: Readonly<Record<string, unknown>>): RawRecord {
  const next: RawRecord = { ...record }
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) continue
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next
}

/**
 * The plan as Grid reads it after the patch (WRT-6). A wall the patch adds is written as its file
 * will hold it, which may leave out its height; here it is read as the file will be, its floor's
 * height or the default filled in, so the checks and the answer measure what the plan will be.
 */
export function readingAfter(plan: FloorPlan, patch: Patch): FloorPlan {
  const read = (wall: RawRecord): RawRecord => {
    const parsed = FloorPlanSchema.safeParse({ version: '1', walls: [wall], ...(plan.floors !== undefined ? { floors: plan.floors } : {}) })
    return parsed.success ? (parsed.data.walls[0] as unknown as RawRecord) : wall
  }
  const reading = patch.addWalls === undefined ? patch : { ...patch, addWalls: patch.addWalls.map(read) }
  return applyPatch(plan as unknown as RawRecord, reading) as unknown as FloorPlan
}

/** Applies a patch to a plan's JSON, the file's own or Grid's reading of it, without changing anything else. */
export function applyPatch<T extends RawRecord>(raw: T, patch: Patch): T {
  const list = (key: string): RawRecord[] => (Array.isArray(raw[key]) ? (raw[key] as RawRecord[]) : [])
  const removeWalls = patch.removeWalls ?? new Set<string>()
  const walls: RawRecord[] = []
  let placed = false
  for (const wall of list('walls')) {
    if (removeWalls.has(wall['id'] as string)) {
      if (!placed) walls.push(...(patch.addWalls ?? []))
      placed = true
      continue
    }
    const change = patch.walls.get(wall['id'] as string)
    walls.push(change ? merged(wall, change) : wall)
  }
  if (!placed) walls.push(...(patch.addWalls ?? []))
  const openings = list('openings')
    .filter((o) => !patch.removeOpenings.has(o['id'] as string))
    .map((o) => {
      const change = patch.openings.get(o['id'] as string)
      if (!change) return o
      const next = merged(o, change)
      // A door's hinge and swing say nothing on anything else.
      if (next['type'] !== 'door') {
        delete next['hinge']
        delete next['swing']
      }
      return next
    })
  openings.push(...(patch.addOpenings ?? []))
  const removeRooms = patch.removeRooms ?? new Set<string>()
  const rooms = list('rooms')
    .filter((room) => !removeRooms.has(room['id'] as string))
    .map((room) => {
      const change = patch.rooms.get(room['id'] as string)
      return change ? merged(room, change) : room
    })
  rooms.push(...(patch.addRooms ?? []))
  // A plan with no items keeps no key.
  const items = patch.items === undefined || !Array.isArray(raw['items'])
    ? {}
    : {
        items: list('items').map((item) => {
          const change = patch.items!.get(item['id'] as string)
          return change ? { ...item, ...change } : item
        }),
      }
  // LVL-8: a pattern's door swings the other way with every plain door's; a plan with no patterns keeps no key.
  const swing = patch.swingPatterns
  const patterns = swing === undefined || swing.size === 0 || !Array.isArray(raw['patterns'])
    ? {}
    : {
        patterns: list('patterns').map((pattern) => {
          const opening = pattern['opening'] as RawRecord | undefined
          const side = opening?.['swing']
          if (!swing.has(pattern['id'] as string) || (side !== 'left' && side !== 'right')) return pattern
          return { ...pattern, opening: { ...opening, swing: side === 'left' ? 'right' : 'left' } }
        }),
      }
  const top = (patch.plan === undefined ? raw : merged(raw, patch.plan)) as T
  return { ...top, walls, openings, rooms, ...items, ...patterns }
}

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

export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** What an opening may be placed and kept from: an end of its wall, or a side. */
export const FROMS = ['start', 'end', ...DIRECTIONS] as const
export type From = (typeof FROMS)[number]

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
  /** WRT-3: the room it is placed from, and with `side`, the side of that room it goes in. */
  readonly room?: string
  readonly side?: Direction
  /** WRT-3: what its place is measured and kept from. */
  readonly from?: From
  /** WRT-3: metres from that end or face to its nearer edge. */
  readonly distance?: number
}

const sideName = (side: unknown): string | null => (typeof side === 'object' && side !== null && 'room' in side ? (side as { room: string }).room : side === 'outside' ? 'outside' : null)

/** The wall on one side of a room, or a refusal that says why there is not one. */
function wallOnSide(survey: Survey, roomId: string, side: Direction): { wall: Wall; lo: number; hi: number } {
  const room = survey.byId.get(roomId)!
  const name = quoted(room.facts.name)
  const out = COMPASS[side]
  const edges = room.edges.filter((edge) => {
    const d = sub(edge.to, edge.from)
    const n = { x: d.y / edge.length, y: -d.x / edge.length }
    return edge.wall !== null && Math.abs(dot(n, out) - 1) < 1e-3
  })
  if (edges.length === 0) throw new EditRefused(`${name} has no wall on its ${side} side.`)
  const walls = [...new Set(edges.map((edge) => edge.wall!))]
  if (walls.length > 1) throw new EditRefused(`The ${side} side of ${name} is ${walls.length} walls (${walls.map((w) => quoted(w.id)).join(', ')}); name the opening's place on one with from and distance after moving it there by hand.`)
  const wall = walls[0]!
  if (wall.virtual === true) throw new EditRefused(`The ${side} side of ${name} is a dividing line, not a wall: it takes no door or window.`)
  const axis = wallAxis(wall)
  const along = edges.flatMap((edge) => [dot(sub(edge.from, axis.start), axis.dir), dot(sub(edge.to, axis.start), axis.dir)])
  return { wall, lo: Math.min(...along), hi: Math.max(...along) }
}

export function changeOpening(survey: Survey, id: string, request: OpeningChangeRequest): Patch {
  const plan = survey.plan
  const opening = plan.openings.find((o) => o.id === id)!
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (!wall) throw new EditRefused('That opening names a wall the plan does not have; grid_check says more.')
  const label = `${opening.type} ${quoted(opening.id)}`
  if (request.remove) {
    const extra = Object.keys(request).filter((key) => key !== 'remove' && (request as Record<string, unknown>)[key] !== undefined)
    if (extra.length > 0) throw new EditRefused(`remove takes nothing else: leave out ${extra.join(', ')}.`)
    const patch = emptyPatch([`Removed ${label} (${opening.width.toFixed(2)} m wide); the wall is solid there now.`])
    ;(patch.removeOpenings as Set<string>).add(id)
    return patch
  }
  if (request.side !== undefined && request.room === undefined) throw new EditRefused('side names a side of a room: pass room with it.')
  if (request.room !== undefined && request.side === undefined && request.from === undefined) throw new EditRefused('room goes with side (the side of the room it moves to) or from (the side of the room it is measured from).')
  if (request.distance !== undefined && request.from === undefined) throw new EditRefused('distance is measured from something: pass from as well.')
  if (request.room !== undefined && (request.from === 'start' || request.from === 'end')) throw new EditRefused('With room, from is a side of that room: north, east, south or west.')

  const type = request.type ?? opening.type
  const width = request.width ?? opening.width
  const height = request.height ?? (request.type === 'door' && opening.type !== 'door' ? 2.1 : opening.height)
  const sill = request.sill ?? (type === 'door' ? 0 : opening.sill)
  if (type !== 'door' && (request.opensInto !== undefined || request.hinge !== undefined)) {
    throw new EditRefused(`Only a door opens into a room or hangs from a side; this would be a ${type}.`)
  }

  // Which wall it is on after the change, and where along it.
  const guessed: string[] = []
  const target = request.side !== undefined ? wallOnSide(survey, request.room!, request.side) : null
  const onto = target?.wall ?? wall
  const moving = onto.id !== wall.id
  if (sill + height > onto.height + tolerance('noLength')) {
    throw new EditRefused(`A sill of ${sill.toFixed(2)} m and a height of ${height.toFixed(2)} m reach above the ${onto.height.toFixed(2)} m wall.`)
  }
  const axis = wallAxis(onto)
  const length = axis.length
  const keep = request.keep ?? 'centre'
  let offset: number
  let anchor: OpeningAnchor | undefined
  let placedText = ''
  if (request.from !== undefined) {
    const from = request.from
    if (request.room !== undefined) {
      const compass = from as Direction
      if (Math.abs(dot(axis.dir, COMPASS[compass])) < 0.3) {
        const runs = Math.abs(axis.dir.x) > Math.abs(axis.dir.y) ? 'east-west' : 'north-south'
        throw new EditRefused(`Wall ${quoted(onto.id)} runs ${runs}, so a place along it is measured from ${runs === 'east-west' ? 'east or west' : 'north or south'}, not from ${compass}.`)
      }
      const near = moving ? (target!.lo + target!.hi) / 2 : opening.offset + opening.width / 2
      const face = roomFaceAlong(survey, request.room, onto, compass, near)
      if (face === null) throw new EditRefused(`Room ${quoted(survey.byId.get(request.room)!.facts.name)} has no side along wall ${quoted(onto.id)} to measure from.`)
      const high = dot(axis.dir, COMPASS[compass]) > 0
      const distance = request.distance ?? (moving ? null : high ? face - (opening.offset + opening.width) : opening.offset - face)
      if (distance === null) throw new EditRefused('Moving it to another wall needs distance: metres from that side of the room to its nearer edge.')
      offset = high ? face - distance - width : face + distance
      anchor = { from: compass, room: request.room }
      placedText = `${distance.toFixed(2)} m from the ${compass} side of ${quoted(survey.byId.get(request.room)!.facts.name)}`
    } else {
      const compassEnd = from === 'start' || from === 'end' ? from : Math.abs(dot(axis.dir, COMPASS[from])) < 0.3 ? null : dot(axis.dir, COMPASS[from]) > 0 ? 'end' : 'start'
      if (compassEnd === null) {
        const runs = Math.abs(axis.dir.x) > Math.abs(axis.dir.y) ? 'east-west' : 'north-south'
        throw new EditRefused(`Wall ${quoted(onto.id)} runs ${runs}: its ends are to the ${runs === 'east-west' ? 'east and west' : 'north and south'}, not the ${from}.`)
      }
      const distance = request.distance ?? (compassEnd === 'start' ? opening.offset : length - opening.offset - opening.width)
      offset = compassEnd === 'start' ? distance : length - distance - width
      anchor = { from }
      placedText = `${distance.toFixed(2)} m from the ${from === 'start' || from === 'end' ? `${from} of its wall` : `${from} end of its wall`}`
    }
  } else if (moving) {
    offset = (target!.lo + target!.hi) / 2 - width / 2
    guessed.push(`${label} is centred on the ${request.side} side of ${quoted(survey.byId.get(request.room!)!.facts.name)}: pass from and distance to place it.`)
  } else {
    offset = keep === 'start' ? opening.offset : keep === 'end' ? opening.offset + opening.width - width : opening.offset + (opening.width - width) / 2
  }

  const free = freeStretches(plan, onto, id)
  const fits = free.some(([lo, hi]) => offset >= lo - tolerance('joint') && offset + width <= hi + tolerance('joint'))
  if (!fits) {
    const room = free.filter(([lo, hi]) => hi - lo >= width - tolerance('joint'))
    const where = free.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m (${(hi - lo).toFixed(2)} m)`).join(', ')
    const hint = room.length > 0
      ? `A stretch that takes ${width.toFixed(2)} m: ${room.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m`).join(', ')}; try keep start or end, or remove what is in the way first.`
      : `No stretch of this wall takes ${width.toFixed(2)} m; remove an opening in the way first.`
    const how = request.from !== undefined || moving ? `placed ${placedText || 'there'}` : `keeping its ${keep}`
    throw new EditRefused(`${label} can't be ${width.toFixed(2)} m wide ${how}: it would run from ${offset.toFixed(2)} to ${(offset + width).toFixed(2)} m along its ${length.toFixed(2)} m wall ${quoted(onto.id)}. Free stretches, from the wall's start: ${where || 'none'}. ${hint}`)
  }

  const change: OpeningChange = {}
  const said: string[] = []
  if (type !== opening.type) {
    change.type = type
    said.push(`${label} is now a ${type}.`)
  }
  if (moving) {
    change.wall = onto.id
    change.offset = r3(offset)
    said.push(`Moved ${label} to wall ${quoted(onto.id)}, the ${request.side} side of ${quoted(survey.byId.get(request.room!)!.facts.name)}${placedText ? `, ${placedText}` : ''}.`)
  } else if (Math.abs(offset - opening.offset) > tolerance('noLength')) {
    change.offset = r3(offset)
    if (request.from !== undefined) said.push(`${label} is now ${placedText}.`)
  }
  if (Math.abs(width - opening.width) > tolerance('noLength')) {
    change.width = r3(width)
    change.offset = r3(offset)
    said.push(`${label} width ${opening.width.toFixed(2)} → ${width.toFixed(2)} m${request.from !== undefined || moving ? '' : `, keeping its ${keep}`}.`)
  }
  if (Math.abs(height - opening.height) > tolerance('noLength')) {
    change.height = r3(height)
    said.push(`${label} height ${opening.height.toFixed(2)} → ${height.toFixed(2)} m.`)
  }
  if (Math.abs(sill - opening.sill) > tolerance('noLength')) {
    change.sill = r3(sill)
    said.push(`${label} sill ${opening.sill.toFixed(2)} → ${sill.toFixed(2)} m.`)
  }
  if (anchor !== undefined && JSON.stringify(anchor) !== JSON.stringify(opening.anchor ?? null)) {
    change.anchor = anchor
    said.push(`${label} keeps its place from the ${anchor.room !== undefined ? `${anchor.from} side of ${quoted(survey.byId.get(anchor.room)!.facts.name)}` : anchor.from === 'start' || anchor.from === 'end' ? `${anchor.from} of its wall` : `${anchor.from} end of its wall`} when walls move.`)
  }
  if (moving && type === 'door' && opening.swing !== undefined && request.opensInto === undefined) {
    // A moved door keeps opening into the room it opened into, where that room is beside its new wall.
    const before = survey.facts.openings.get(id)?.sides.map(sideName) ?? []
    const into = before[opening.swing === 'left' ? 0 : 1] ?? null
    const trial = surveyPlan({ ...plan, openings: plan.openings.map((o) => (o.id === id ? { ...o, wall: onto.id, offset: r3(offset), width } : o)) })
    const now = trial.facts.openings.get(id)?.sides.map(sideName) ?? []
    const at = into === null ? -1 : now.indexOf(into)
    if (at >= 0) change.swing = at === 0 ? 'left' : 'right'
    else guessed.push(`${label} keeps its swing; the room it opened into is not beside its new wall, so check which way it opens.`)
  }
  if (request.opensInto !== undefined) {
    const facts = moving
      ? surveyPlan({ ...plan, openings: plan.openings.map((o) => (o.id === id ? { ...o, wall: onto.id, offset: r3(offset), width } : o)) }).facts.openings.get(id)
      : survey.facts.openings.get(id)
    const sides = facts?.sides.map(sideName) ?? []
    const at = sides.indexOf(request.opensInto)
    if (at < 0) {
      const names = sides.map((side) => (side === null ? 'nothing drawn' : side === 'outside' ? '"outside"' : quoted(side)))
      throw new EditRefused(`That door is between ${names.join(' and ')}: it can open into one of those only.`)
    }
    const swing = at === 0 ? 'left' : 'right'
    change.swing = swing
    if (opening.hinge === undefined && request.hinge === undefined) change.hinge = 'start'
    if (swing !== opening.swing) said.push(`${label} now opens into ${request.opensInto === 'outside' ? 'the outside' : quoted(survey.facts.rooms.get(request.opensInto)?.name ?? request.opensInto)}.`)
  }
  if (request.hinge !== undefined && request.hinge !== opening.hinge) {
    change.hinge = request.hinge
    said.push(`${label} now hangs from the end nearer the wall's ${request.hinge}.`)
  }
  if (said.length === 0) throw new EditRefused(`That is how ${label} is already: nothing to change.`)
  const patch: Patch = { ...emptyPatch(said), guessed }
  ;(patch.openings as Map<string, OpeningChange>).set(id, change)
  return patch
}

/** The size of a room's inside outline across one side: east-west for east or west, north-south for north or south. */
export function insideAcross(survey: Survey, roomId: string, side: Direction): number {
  const polygon = survey.byId.get(roomId)!.polygon
  const values = polygon.map((p) => (side === 'east' || side === 'west' ? p.x : p.y))
  return Math.max(...values) - Math.min(...values)
}

/**
 * Moves the wall on one side of a room straight out (or in, with a negative distance). Walls
 * that end on it follow, so the rooms beside it grow or shrink with it, and its openings move
 * with it. Openings on the walls that follow keep their anchor or their place in the building,
 * and a door that would join other rooms follows the move where it can (WRT-3). Only a side
 * square to the drawing can move: north, east, south or west.
 */
export function moveRoomSide(survey: Survey, roomId: string, side: Direction, by: number): Patch {
  const room = survey.byId.get(roomId)!
  const out = COMPASS[side]
  const edges = room.edges.filter((edge) => {
    const d = sub(edge.to, edge.from)
    const n = { x: d.y / edge.length, y: -d.x / edge.length }
    return edge.wall !== null && Math.abs(dot(n, out) - 1) < 1e-3
  })
  const name = quoted(room.facts.name)
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
    if (nl < 0.05) throw new EditRefused(`Moving it ${by.toFixed(2)} m would leave wall ${quoted(other.id)} with no length.`)
    if (Math.abs(dot({ x: nd.x / nl, y: nd.y / nl }, oldAxis.dir) - 1) > 1e-6) {
      throw new EditRefused(`Wall ${quoted(other.id)} ends on it at an angle, and would turn; Grid moves only walls that meet it square.`)
    }
    patchWalls.set(other.id, change)
    followers.push(other.id)
  }
  // A point on the moved wall moves with it; everything else stays where it is.
  const seated = seatOpenings(survey, patchWalls, (p, onWall) => (onWall === wall.id ? { x: p.x + v.x, y: p.y + v.y } : p), { shift: v, what: `moving it ${by.toFixed(2)} m` })
  const patchOpenings = new Map<string, OpeningChange>()
  for (const [id, offset] of seated.offsets) {
    const o = plan.openings.find((x) => x.id === id)!
    if (Math.abs(offset - o.offset) > tolerance('noLength')) patchOpenings.set(id, { offset })
  }
  const said = [
    `Moved wall ${quoted(wall.id)}, the ${side} side of ${name}, ${Math.abs(by).toFixed(2)} m ${by >= 0 ? side : `back from the ${side}`}${followers.length > 0 ? `; walls that end on it followed: ${listed(followers.map((id) => quoted(id)))}` : ''}.`,
  ]
  const others = survey.rooms.filter((r) => r.facts.id !== roomId && r.edges.some((edge) => edge.wall?.id === wall.id)).map((r) => quoted(r.facts.name))
  const guessed = [...seated.guessed]
  if (others.length > 0) guessed.unshift(`${others.length > 2 ? `${others[0]} and ${others.length - 1} other rooms` : others.join(' and ')} ${by >= 0 ? (others.length === 1 ? 'gives' : 'give') : others.length === 1 ? 'takes' : 'take'} the ${Math.abs(by).toFixed(2)} m: the wall is ${others.length === 1 ? 'its' : 'their'} side too.`)
  return { walls: patchWalls, openings: patchOpenings, removeOpenings: new Set(), rooms: new Map(), said, guessed, notKept: seated.notKept }
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

const MIRRORED: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' }

/**
 * The whole plan mirrored about the middle of its walls' box: left to right swaps east and
 * west. Every door keeps opening into the same room, every room keeps its size, and each
 * room's walls are listed the other way round, so they still run counter-clockwise (C3). An
 * anchor kept from a side of the drawing turns with it.
 *
 * CNT-3: the north the plan states is mirrored too, to minus itself, so the swap is the real
 * one: left to right, what faced east faces west, and top to bottom, what faced north faces
 * south, whichever way the drawing is turned. The site's origin is mirrored with the walls. The
 * y direction is kept: the result is a new design, still drawn as the plan says its y runs, and
 * the front stays the part it names, which is mirrored with the rest.
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
  const turns = (side: string): boolean => (how === 'left-right' ? side === 'east' || side === 'west' : side === 'north' || side === 'south')
  const openings = new Map<string, OpeningChange>()
  for (const o of plan.openings) {
    const change: OpeningChange = {}
    if (o.swing !== undefined) change.swing = o.swing === 'left' ? 'right' : 'left'
    if (o.anchor !== undefined && turns(o.anchor.from)) change.anchor = { ...o.anchor, from: MIRRORED[o.anchor.from] as From }
    if (Object.keys(change).length > 0) openings.set(o.id, change)
  }
  // LVL-8: a pattern's door swings the other way too; its places along its wall stay, as a plain opening's offset does.
  const swingPatterns = new Set((plan.patterns ?? []).filter((p) => p.opening.swing !== undefined).map((p) => p.id))
  const rooms = new Map(plan.rooms.map((room) => [room.id, { boundary: [...room.boundary].reverse() }]))
  // CNT-12: a fixture's middle is mirrored, and its front faces the mirrored way: left to right
  // turns it to minus its turn, top to bottom to a half turn less it.
  const items = new Map((plan.items ?? []).map((item) => {
    const turn = item.turn ?? 0
    const mirrored = how === 'left-right' ? -turn : 180 - turn
    return [item.id, { at: flip(item.at), turn: r3(((mirrored % 360) + 360) % 360) }]
  }))
  const top: Record<string, unknown> = {}
  if (plan.north !== undefined) top['north'] = wrapDegrees(r3(-plan.north))
  if (plan.site?.origin !== undefined && plan.walls.length > 0) top['site'] = { ...plan.site, origin: flip(plan.site.origin) }
  // VEW-3: each saved view is mirrored with the building, so it still frames what it framed.
  const views = mirroredViews(plan, how, flip, top['north'] as number | undefined)
  if (views !== null) top['views'] = views
  const north = plan.north === undefined ? '' : ` The plan's north is mirrored with it: ${wrapDegrees(r3(plan.north))}° → ${top['north'] as number}° counter-clockwise from the top of the drawing.`
  return {
    walls,
    openings,
    removeOpenings: new Set(),
    rooms,
    ...(items.size === 0 ? {} : { items }),
    ...(swingPatterns.size === 0 ? {} : { swingPatterns }),
    ...(Object.keys(top).length === 0 ? {} : { plan: top }),
    said: [`Mirrored the plan ${how === 'left-right' ? 'left to right (east and west swap)' : 'top to bottom (north and south swap)'}: ${plan.walls.length} walls, ${plan.openings.length} openings and ${plan.rooms.length} rooms${items.size === 0 ? '' : `, and ${items.size} fixture${items.size === 1 ? '' : 's'}`}.${north}${views === null ? '' : ` The ${views.length === 1 ? 'saved view is' : `${views.length} saved views are`} mirrored with it.`}${patternsFollow(plan)}`],
  }
}

/** LVL-8: one sentence when the plan has opening patterns: they stay patterns and their openings follow their walls. */
function patternsFollow(plan: FloorPlan): string {
  const n = plan.patterns?.length ?? 0
  return n === 0 ? '' : ` ${n === 1 ? 'Its opening pattern stays a pattern' : `Its ${n} opening patterns stay patterns`}, and the openings ${n === 1 ? 'it places follow its wall' : 'they place follow their walls'}.`
}

/** WRT-4: the turns `grid_mirror` makes, in degrees counter-clockwise on the drawing as Grid draws it (y up). */
export const TURNS = [90, 180, 270] as const
export type Turn = (typeof TURNS)[number]

const TURN_WORDS: Record<Turn, string> = { 90: 'a quarter counter-clockwise (90°)', 180: 'half round (180°)', 270: 'a quarter clockwise (270°, or -90°)' }

/**
 * WRT-4: the whole plan turned a quarter or half round about the middle of its walls' box,
 * counter-clockwise as Grid draws it, y up, as a stated north is measured. Every room keeps its
 * size and its walls in the same order, every door its swing and the room it opens into; an
 * anchor kept from a side of the drawing turns with it, a fixture turns with the plan, and the
 * site's origin turns with the walls. The stated north is kept: the building turns on its site,
 * so what faced south faces another way, as `grid_mirror`'s mirror is a new design too. The y
 * direction is kept, so on a page whose y runs down the plan turns the other way.
 */
export function turnPlanBy(survey: Survey, turn: Turn): Patch {
  const plan = survey.plan
  const xs = plan.walls.flatMap((w) => [w.start[0], w.end[0]])
  const ys = plan.walls.flatMap((w) => [w.start[1], w.end[1]])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const [cos, sin] = turn === 90 ? [0, 1] : turn === 180 ? [-1, 0] : [0, -1]
  const map = (p: readonly [number, number]): Pair => {
    const x = p[0] - cx
    const y = p[1] - cy
    return [r3(cx + cos * x - sin * y), r3(cy + sin * x + cos * y)]
  }
  const sides = ['north', 'west', 'south', 'east'] as const
  const turned = (side: string): string => {
    const k = sides.indexOf(side as (typeof sides)[number])
    return k < 0 ? side : sides[(k + turn / 90) % 4]!
  }
  const walls = new Map(plan.walls.map((w) => [w.id, { start: map(w.start), end: map(w.end) }]))
  const openings = new Map<string, OpeningChange>()
  for (const o of plan.openings) if (o.anchor !== undefined && turned(o.anchor.from) !== o.anchor.from) openings.set(o.id, { anchor: { ...o.anchor, from: turned(o.anchor.from) as From } })
  const items = new Map((plan.items ?? []).map((item) => [item.id, { at: map(item.at), turn: r3((((item.turn ?? 0) + turn) % 360 + 360) % 360) }]))
  const top: Record<string, unknown> = {}
  if (plan.site?.origin !== undefined && plan.walls.length > 0) top['site'] = { ...plan.site, origin: map(plan.site.origin) }
  const north = plan.north === undefined ? '' : ` The plan's north is kept at ${wrapDegrees(r3(plan.north))}°, so the building faces new ways: what faced south now faces ${turn === 90 ? 'east' : turn === 180 ? 'north' : 'west'}.`
  const down = plan.yAxis === 'down' ? ' The plan says its y runs down the page, so on that page it turned the other way.' : ''
  return {
    walls,
    openings,
    removeOpenings: new Set(),
    rooms: new Map(),
    ...(items.size === 0 ? {} : { items }),
    ...(Object.keys(top).length === 0 ? {} : { plan: top }),
    said: [`Turned the plan ${TURN_WORDS[turn]} about the middle of its walls: ${plan.walls.length} walls, ${plan.openings.length} openings and ${plan.rooms.length} rooms${items.size === 0 ? '' : `, and ${items.size} fixture${items.size === 1 ? '' : 's'}`}.${north}${down}${patternsFollow(plan)}`],
  }
}

/** VEW-3: the plan's saved views, mirrored: what each is pointed at, and the side it stands on. Null when it has none. */
function mirroredViews(plan: FloorPlan, how: Mirror, flip: (p: readonly [number, number]) => Pair, north: number | undefined): StoredView[] | null {
  const views = plan.views ?? []
  if (views.length === 0) return null
  const before = planOrientation(plan)
  const after = { ...plan, ...(north !== undefined ? { north } : {}) } as FloorPlan
  return views.map((view) => {
    const setting = viewSetting(view)
    const onDrawing = drawingBearing(setting.bearing, before, setting.north ?? null)
    const [x, y] = flip([setting.target.point[0], setting.target.point[1]])
    const record = cameraRecord(after, {
      ...setting,
      target: { ...setting.target, point: [x, y, setting.target.point[2]] },
      bearing: compassBearing(how === 'left-right' ? -onDrawing : 180 - onDrawing, planOrientation(after)),
      north: planOrientation(after).north,
    })
    return storedView(view.name, record)
  })
}
