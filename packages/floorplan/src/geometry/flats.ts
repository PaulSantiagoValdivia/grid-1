/**
 * Flats (CNT-4, C18; lab EL-1, WR-6, AR-7): which rooms make each flat, read from the plan's own
 * list, never from the rooms' names.
 *
 * A flat is a named group of rooms: an id, a name, the type it is and its rooms, by id, on one
 * floor or several (a duplex). A flat type is stated once (`flatTypes`) and placed many times; a
 * flat that is its type's mirror image says so (`mirrored`). A flat adds no floor and closes no
 * outline: what it holds is measured as its rooms are (`areas.ts`), and a room is in one flat at
 * most.
 *
 * Everything that reads the flats reads them here, so a fault in the list is read one way: the
 * first flat with an id is the flat, a room two flats name stays in the one whose id comes first
 * (QAR-5's id order, so the file's order decides nothing), and an id that is no room is named and
 * left out of the flat's figures (`flatIssues`). Nothing is refused.
 *
 * Pure: a plan in, ids, words and outlines out.
 */

import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { indexPlan } from './plan'
import { floorOf, isFloorSlice, planFloors, wholePlan } from './floors'
import { tryRoomShape } from './room'
import { roomZones } from './zones'
import { union } from './polygons'
import type { Polygon } from 'polygon-clipping'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import type { Issue } from './validate'
import { quoted, quotedList } from '../types/planText'
import { likelyId } from '../types/nearest'
import { compareIds } from './order'

/** A flat as Grid reads it: the rooms of the plan it names, each once, in its order. */
export interface PlanFlat {
  readonly id: string
  /** Its name, else its id. */
  readonly name: string
  /** The type it states, by id; null when it states none. */
  readonly type: string | null
  /** The type's name, else its id; null with no type, or one the plan does not state. */
  readonly typeName: string | null
  /** Whether the plan states the type it names (`flatTypes`). */
  readonly typeKnown: boolean
  readonly mirrored: boolean
  /** The rooms it holds: rooms of the plan that no flat with an id before its own holds, in the order it names them. */
  readonly rooms: readonly { readonly id: string; readonly floor: string }[]
  /** The floors its rooms are on, in the plan's floor order: more than one for a duplex. */
  readonly floors: readonly string[]
  /** Ids it names that are no room of the plan. */
  readonly unknown: readonly string[]
  /** Rooms it names that a flat with an id before its own holds, each with that flat's id. */
  readonly elsewhere: readonly { readonly room: string; readonly flat: string }[]
}

/** A flat type as the plan states it. */
export interface PlanFlatType {
  readonly id: string
  readonly name: string
}

/** The plan's flat types, the first with an id winning, in plan order. */
export function planFlatTypes(plan: FloorPlan): PlanFlatType[] {
  const seen = new Map<string, PlanFlatType>()
  for (const type of plan.flatTypes ?? []) if (!seen.has(type.id)) seen.set(type.id, { id: type.id, name: type.name ?? type.id })
  return [...seen.values()]
}

/**
 * The plan's flats, the first with an id winning, in plan order. A slice (`planForFloor`) is read
 * as the plan it was cut from, so a duplex keeps its rooms on the other floor.
 */
export function planFlats(plan: FloorPlan): PlanFlat[] {
  const { whole } = wholePlan(plan)
  if ((whole.flats ?? []).length === 0) return []
  const rooms = new Map<string, Room>()
  for (const room of whole.rooms) if (!rooms.has(room.id)) rooms.set(room.id, room)
  const types = new Map(planFlatTypes(whole).map((type) => [type.id, type] as const))
  const order = new Map(planFloors(whole).map((floor, i) => [floor.id, i] as const))
  const ids = new Set<string>()
  const first = (whole.flats ?? []).filter((flat) => (ids.has(flat.id) ? false : (ids.add(flat.id), true)))
  // A room two flats name is held by the one whose id comes first.
  const holder = new Map<string, string>()
  for (const flat of [...first].sort((a, b) => compareIds(a.id, b.id))) for (const id of flat.rooms) if (rooms.has(id) && !holder.has(id)) holder.set(id, flat.id)
  const out: PlanFlat[] = []
  for (const flat of first) {
    const held: { id: string; floor: string }[] = []
    const unknown: string[] = []
    const elsewhere: { room: string; flat: string }[] = []
    for (const id of new Set(flat.rooms)) {
      const room = rooms.get(id)
      if (room === undefined) unknown.push(id)
      else if (holder.get(id) !== flat.id) elsewhere.push({ room: id, flat: holder.get(id)! })
      else held.push({ id, floor: floorOf(room) })
    }
    const type = flat.type ?? null
    const known = type === null ? null : types.get(type) ?? null
    out.push({
      id: flat.id,
      name: flat.name ?? flat.id,
      type,
      typeName: known?.name ?? null,
      typeKnown: known !== null,
      mirrored: flat.mirrored === true,
      rooms: held,
      floors: [...new Set(held.map((room) => room.floor))].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
      unknown,
      elsewhere,
    })
  }
  return out
}

/** Each room a flat holds, by id: that flat's id. */
export function flatOfRoom(flats: readonly PlanFlat[]): ReadonlyMap<string, string> {
  return new Map(flats.flatMap((flat) => flat.rooms.map((room) => [room.id, flat.id] as const)))
}

const flatIssue = (id: string, code: string, message: string): Issue => ({ entity: 'flat', id, code, message, severity: 'warning' })

/**
 * What the drawing's check says about the flats list (CNT-4): a flat listed twice, a room it names
 * that the plan does not have, a room in two flats, a type the plan does not state, a type stated
 * twice and a zone named without its room. Each is worth a look and leaves out nothing but what it
 * names. Run on the whole plan only: a slice holds one floor's rooms, and a duplex's others are
 * not missing.
 */
export function flatIssues(plan: FloorPlan, index: PlanIndex = indexPlan(plan)): Issue[] {
  if (isFloorSlice(plan) || ((plan.flats ?? []).length === 0 && (plan.flatTypes ?? []).length === 0)) return []
  const issues: Issue[] = []
  const typeIds = new Set<string>()
  for (const type of plan.flatTypes ?? []) {
    if (typeIds.has(type.id)) {
      issues.push({ entity: 'plan', id: type.id, code: 'flat/duplicate-type', message: `Flat type ${quoted(type.id)} is stated more than once; the first is read`, severity: 'warning' })
    }
    typeIds.add(type.id)
  }
  const flatIds = new Set<string>()
  for (const flat of plan.flats ?? []) {
    if (flatIds.has(flat.id)) issues.push(flatIssue(flat.id, 'flat/duplicate-id', `Flat ${quoted(flat.id)} is listed more than once; the first is read and the others are left out`))
    flatIds.add(flat.id)
  }
  const roomIds = plan.rooms.map((room) => room.id)
  const zones = roomZones(index)
  for (const flat of planFlats(plan)) {
    for (const id of flat.unknown) {
      const meant = likelyId(id, roomIds)
      issues.push(flatIssue(flat.id, 'flat/unknown-room', `Flat ${quoted(flat.id)} names room ${quoted(id)}, which the plan does not have, so it is not counted in the flat${meant === null ? '' : `; ${quoted(meant)} is the room most likely meant`}`))
    }
    for (const { room, flat: first } of flat.elsewhere) {
      issues.push(flatIssue(flat.id, 'flat/room-in-two', `Flat ${quoted(flat.id)} names room ${quoted(room)}, which flat ${quoted(first)} names too, so it is counted in ${quoted(first)} only, the flat whose id comes first`))
    }
    if (flat.type !== null && !flat.typeKnown) {
      const meant = likelyId(flat.type, [...typeIds])
      issues.push(
        flatIssue(
          flat.id,
          'flat/unknown-type',
          `Flat ${quoted(flat.id)} is of type ${quoted(flat.type)}, which the plan's flat types do not state${typeIds.size === 0 ? ' (it states none)' : meant === null ? `: they are ${quotedList([...typeIds])}` : `; ${quoted(meant)} is the type most likely meant`}`
        )
      )
    }
    const held = new Set(flat.rooms.map((room) => room.id))
    for (const { id } of flat.rooms) {
      const host = zones.zoneOf.get(id)
      if (host !== undefined && !held.has(host)) {
        issues.push(flatIssue(flat.id, 'flat/zone-without-room', `Flat ${quoted(flat.id)} names ${quoted(id)}, a zone of room ${quoted(host)}, but not that room: a zone's floor is counted in its room, so it adds nothing to the flat`))
      }
    }
  }
  return issues
}

// ---------------------------------------------------------------------------------------------
// The outline on the drawing (SHT-11)

/** SHT-11: a flat's outline on one floor's drawing, to the middle of the walls round its rooms. */
export interface PlanFlatOutline {
  readonly id: string
  readonly name: string
  /** Closed rings, outer ones counter-clockwise, without the first point repeated. */
  readonly rings: readonly (readonly Vec2[])[]
}

type Pair = [number, number]

/** The half thickness of the wall in `boundary` whose face the edge from `a` to `b` lies on; 0 when none. */
function halfWallOn(a: Vec2, b: Vec2, walls: readonly Wall[]): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (!(length > tolerance('noLength'))) return 0
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (const wall of walls) {
    if (wall.virtual === true || !(wall.thickness > 0)) continue
    const wx = wall.end[0] - wall.start[0]
    const wy = wall.end[1] - wall.start[1]
    const wl = Math.hypot(wx, wy)
    if (!(wl > tolerance('noLength'))) continue
    const wd = { x: wx / wl, y: wy / wl }
    if (Math.abs(dir.x * wd.y - dir.y * wd.x) > tolerance('nearlyParallel')) continue
    const rx = mid.x - wall.start[0]
    const ry = mid.y - wall.start[1]
    const across = Math.abs(rx * wd.y - ry * wd.x)
    const along = rx * wd.x + ry * wd.y
    if (Math.abs(across - wall.thickness / 2) <= tolerance('wallContact') && along >= -wall.thickness && along <= wl + wall.thickness) return wall.thickness / 2
  }
  return 0
}

/**
 * A room's floor grown out to the middle of the walls round it: the outline, a strip outside each
 * side as deep as half the wall that side lies on, and the corner between two such strips. Two
 * rooms of one flat each reach the middle of the wall between them, so the flat closes across it.
 */
function toWallMiddles(outline: readonly Vec2[], walls: readonly Wall[]): Polygon[] {
  const n = outline.length
  const over = tolerance('joint')
  const halves = outline.map((a, i) => halfWallOn(a, outline[(i + 1) % n]!, walls))
  const normal = (i: number): Vec2 => {
    const a = outline[i]!
    const b = outline[(i + 1) % n]!
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    // Counter-clockwise: the outside is on the right of each side.
    return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
  }
  const at = (p: Vec2, d: Vec2, k: number): Pair => [p.x + d.x * k, p.y + d.y * k]
  const pieces: Polygon[] = [[outline.map((p): Pair => [p.x, p.y])]]
  for (let i = 0; i < n; i++) {
    const h = halves[i]!
    if (h === 0) continue
    const a = outline[i]!
    const b = outline[(i + 1) % n]!
    const d = normal(i)
    pieces.push([[[a.x, a.y], [b.x, b.y], at(b, d, h + over), at(a, d, h + over)]])
  }
  for (let i = 0; i < n; i++) {
    const before = (i - 1 + n) % n
    const h1 = halves[before]!
    const h2 = halves[i]!
    if (h1 === 0 || h2 === 0) continue
    const p = outline[i]!
    const prev = outline[before]!
    const next = outline[(i + 1) % n]!
    // Only an outside corner gets a fill: an inside one is covered by the strips already.
    if ((p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x) <= 0) continue
    const n1 = normal(before)
    const n2 = normal(i)
    const a = at(p, n1, h1 + over)
    pieces.push([[[p.x, p.y], a, [a[0] + n2.x * (h2 + over), a[1] + n2.y * (h2 + over)], at(p, n2, h2 + over)]])
  }
  return pieces
}

/** A closed ring without its repeated first point and without the points on the straight run through their neighbours. */
function corners(ring: readonly Vec2[]): Vec2[] {
  const near = tolerance('sameFace')
  let points = [...ring]
  const last = points[points.length - 1]
  if (last !== undefined && points.length > 1 && Math.hypot(last.x - points[0]!.x, last.y - points[0]!.y) <= near) points = points.slice(0, -1)
  for (let changed = true; changed && points.length > 3; ) {
    changed = false
    for (let i = 0; i < points.length; i++) {
      const a = points[(i - 1 + points.length) % points.length]!
      const p = points[i]!
      const b = points[(i + 1) % points.length]!
      const span = Math.hypot(b.x - a.x, b.y - a.y)
      const off = span > 0 ? Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / span : Math.hypot(p.x - a.x, p.y - a.y)
      if (off <= near) {
        points.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return points
}

/**
 * SHT-11 with CNT-4: each flat's outline on this floor, as its plan draws it: the floor of its
 * rooms here, grown to the middle of the walls round them and joined, so one line runs round the
 * flat and along the middle of a wall it shares with the next flat. A flat with no room here that
 * can be drawn has none. Zones are inside their rooms and add nothing.
 */
export function flatOutlines(slice: FloorPlan, index: PlanIndex = indexPlan(slice), broken: ReadonlySet<string> = new Set()): PlanFlatOutline[] {
  const flats = planFlats(slice)
  if (flats.length === 0) return []
  const here = new Map(slice.rooms.map((room) => [room.id, room] as const))
  const walls = new Map(slice.walls.map((wall) => [wall.id, wall] as const))
  const out: PlanFlatOutline[] = []
  for (const flat of flats) {
    const pieces: Polygon[] = []
    const plain: Polygon[] = []
    for (const { id } of flat.rooms) {
      const room = here.get(id)
      if (room === undefined || broken.has(id)) continue
      const shape = tryRoomShape(room, index)
      if (shape === null || shape.polygon.length < 3) continue
      const own = room.boundary.flatMap((wallId) => {
        const wall = walls.get(wallId)
        return wall === undefined || broken.has(wallId) ? [] : [wall]
      })
      pieces.push(...toWallMiddles(shape.polygon, own))
      plain.push([shape.polygon.map((p): Pair => [p.x, p.y])])
    }
    if (pieces.length === 0) continue
    let joined
    try {
      joined = union(pieces)
    } catch {
      // A join the clipper cannot make: the rooms' own outlines, unjoined, still say which they are.
      joined = plain
    }
    const rings = joined.flatMap((polygon) => polygon.map((ring) => corners(ring.map(([x, y]) => ({ x, y }))))).filter((ring) => ring.length >= 3)
    out.push({ id: flat.id, name: flat.name, rings })
  }
  return out
}
