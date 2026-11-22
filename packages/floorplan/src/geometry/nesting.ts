/**
 * Rooms inside rooms (ARE-5).
 *
 * A wardrobe pod, a lift shaft or an en-suite is often drawn inside the room around it: the
 * bedroom lists its four outer walls, and the pod lists its own four. Both outlines are right,
 * but the pod's floor then counts twice, once in the pod and again in the bedroom, and the
 * bedroom's area also counts the pod's walls. A plan says that a room sits inside another with
 * `inside: true`. This module finds the room it sits in and takes it off.
 *
 *  - **The host is found from the outlines.** It is the smallest room on the same floor whose
 *    outline holds the inner room's outline, all but `areaReported`. The door graph is not
 *    used: it hands a door to the first room it finds on each side, which is not a way to tell
 *    which room holds which.
 *  - **What the host loses** is the inner room's footprint: its outline, the strips of the solid
 *    walls it lists (square ends, as the 2D view draws them, and corners made good as in
 *    `spaces.ts`), and anything they enclose. Only the part of it inside the host's outline is
 *    taken off, so walls the two rooms share are not taken off twice.
 *  - **Several rooms inside one host** are taken off together, as one region, so two pods that
 *    overlap each other do not take the same floor off twice. A room inside a room inside a
 *    room takes its floor off the room right around it, and that room's footprint, with the
 *    inner one in it, comes off the next.
 *
 * Pure: outlines in, areas and regions out. The outlines come from `room.ts`, which calls this,
 * so that this file need not import it.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import { floorOf } from './floors'
import type { Room, Wall } from './plan'
import type { Vec2 } from './vec2'
import { TOLERANCES, tolerance } from './tolerances'
import type { Box, WallRun } from './polygons'
import { boxOfRings, cornerFills, intersectionArea, multiArea, overlaps, polygonArea, strip, union } from './polygons'

/** A room whose outline closes, with that outline (`roomPolygon`) and its holes (ARE-6). */
export interface TracedRoom {
  readonly room: Room
  readonly outline: readonly Vec2[]
  readonly holes?: readonly (readonly Vec2[])[]
}

/** A room the plan marks `inside`, and the room it was found to sit in. */
export interface InnerRoom {
  readonly room: string
  /** The room it sits in, or null when no room on its floor holds it. */
  readonly host: string | null
  /**
   * With no host: the room that holds the largest part of it, and how much of it lies outside
   * that room, in square metres. Null when no room holds any of it, or when `reason` is set.
   */
  readonly nearest: { readonly room: string; readonly outside: number } | null
  /** How much floor it takes off its host, in square metres: 0 with no host. */
  readonly taken: number
  /** Set when the host could not be worked out: why. */
  readonly reason?: string
}

/**
 * A room whose floor is less than its outline: it has rooms inside it, holes (ARE-6), or both.
 */
export interface HostFloor {
  /** The rooms that sit right inside it, in plan order. Empty for a room with holes only. */
  readonly rooms: readonly string[]
  /** Its outline less its holes and the footprints of those rooms, as `polygon-clipping` gives it. */
  readonly region: MultiPolygon
  /** The area of that region, in square metres: the room's area as Grid gives it. */
  readonly area: number
}

export interface RoomNesting {
  /** Every room marked `inside` whose outline closes, by id. */
  readonly inner: ReadonlyMap<string, InnerRoom>
  /** Every room with a room inside it, or a hole in it, by id. */
  readonly hosts: ReadonlyMap<string, HostFloor>
}

/** A plan with no room marked `inside`. */
export const NO_NESTING: RoomNesting = { inner: new Map(), hosts: new Map() }

/**
 * The polygon library can fail to close a ring when two edges almost coincide. As in
 * `spaces.ts`, the work is tried as drawn first, then with every point rounded to these grids.
 */
const GRIDS = TOLERANCES.joinGrids.values
/**
 * The most outlines one plan cuts against each other to find hosts. Many rooms marked `inside`
 * piled in one place would otherwise cost the square of their number; past this, the rest are
 * given no host, with the reason, instead of running for minutes.
 */
export const MAX_HOST_CUTS = 200_000
/** How far inside a wall's faces a corner fill is built, in metres (see `cornerFills`). */
const FILL_INSET = TOLERANCES.noLength.value

interface Traced {
  readonly room: Room
  readonly floor: string
  readonly polygon: Polygon
  readonly area: number
  readonly box: Box
  readonly order: number
}

const finite = (outline: readonly Vec2[]): boolean => outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

/**
 * The inner room's footprint: its outline, the strips of the solid walls it lists, the corners
 * made good between them, and whatever that encloses.
 */
function footprint(inner: Traced, wallsById: ReadonlyMap<string, Wall>, snap: (v: number) => number): MultiPolygon {
  const runs: (WallRun & { readonly half: number })[] = []
  for (const id of new Set(inner.room.boundary)) {
    const wall = wallsById.get(id)
    if (!wall || wall.virtual === true || !(wall.thickness > 0) || !Number.isFinite(wall.thickness)) continue
    const start = { x: wall.start[0], y: wall.start[1] }
    const dx = wall.end[0] - start.x
    const dy = wall.end[1] - start.y
    const length = Math.hypot(dx, dy)
    if (!(length > 0) || !Number.isFinite(length)) continue
    runs.push({ wall, start, dir: { x: dx / length, y: dy / length }, length, half: wall.thickness / 2 })
  }
  const strips = runs.map((r) => strip(r.start, r.dir, r.length, r.half, 0, snap))
  const joined = union([inner.polygon, ...strips, ...cornerFills(runs, FILL_INSET, snap)])
  // Floor the inner room and its walls close off is part of it too: only the outer rings count.
  return union(joined.map((polygon) => [polygon[0]!]))
}

function nest(traced: readonly Traced[], marked: readonly Traced[], wallsById: ReadonlyMap<string, Wall>, grid: number): RoomNesting {
  const steps = grid === 0 ? 0 : Math.round(1 / grid)
  const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
  const snapped = (t: Traced): Traced =>
    grid === 0 ? t : { ...t, polygon: t.polygon.map((ring) => ring.map(([x, y]): Pair => [snap(x), snap(y)])) }
  const rooms = traced.map(snapped)
  const byOrder = new Map(rooms.map((t) => [t.order, t]))

  const inner = new Map<string, InnerRoom>()
  const children = new Map<number, Traced[]>()
  let cuts = 0
  for (const m of marked) {
    const r = byOrder.get(m.order)!
    if (cuts >= MAX_HOST_CUTS) {
      const reason = `the plan has more than ${MAX_HOST_CUTS.toLocaleString('en')} pairs of outlines to compare, and the rest were not compared`
      inner.set(r.room.id, { room: r.room.id, host: null, nearest: null, taken: 0, reason })
      continue
    }
    let host: Traced | null = null
    let nearest: { room: Traced; shared: number } | null = null
    for (const c of rooms) {
      // A zone (CNT-8) is part of its room, never a room something sits in.
      if (c.order === r.order || c.floor !== r.floor || c.room.partOf !== undefined || !overlaps(c.box, r.box)) continue
      cuts++
      const shared = intersectionArea(r.polygon, c.polygon)
      if (shared <= 0) continue
      const holds = shared >= r.area - tolerance('areaReported') && c.area > r.area + tolerance('areaReported')
      if (holds) {
        if (host === null || c.area < host.area) host = c
      } else if (nearest === null || shared > nearest.shared) {
        nearest = { room: c, shared }
      }
    }
    if (host !== null) {
      children.set(host.order, [...(children.get(host.order) ?? []), r])
      inner.set(r.room.id, { room: r.room.id, host: host.room.id, nearest: null, taken: 0 })
    } else {
      const near = nearest === null ? null : { room: nearest.room.room.id, outside: Math.max(0, r.area - nearest.shared) }
      inner.set(r.room.id, { room: r.room.id, host: null, nearest: near, taken: 0 })
    }
  }

  const hosts = new Map<string, HostFloor>()
  for (const [order, list] of children) {
    const host = byOrder.get(order)!
    list.sort((a, b) => a.order - b.order)
    const prints = list.map((r) => footprint(r, wallsById, snap))
    const region = polygonClipping.difference(host.polygon, ...prints)
    hosts.set(host.room.id, { rooms: list.map((r) => r.room.id), region, area: multiArea(region) })
    list.forEach((r, i) => {
      inner.set(r.room.id, { ...inner.get(r.room.id)!, taken: intersectionArea(host.polygon, prints[i]!) })
    })
  }
  return { inner, hosts }
}

/**
 * Finds the room each room marked `inside` sits in, and what each host keeps. `rooms` are the
 * plan's rooms whose outlines close; rooms not marked `inside` are only looked at as hosts.
 * Never throws: when the polygon library fails on every grid, each marked room is given no
 * host, with the reason.
 */
export function nestRooms(rooms: readonly TracedRoom[], wallsById: ReadonlyMap<string, Wall>): RoomNesting {
  const traced: Traced[] = []
  rooms.forEach(({ room, outline, holes = [] }, order) => {
    if (outline.length < 3 || !finite(outline)) return
    // A hole is one more ring of the polygon (ARE-6): its area comes off the outline's.
    const rings = [outline, ...holes.filter((hole) => hole.length >= 3 && finite(hole))]
    const polygon: Polygon = rings.map((ring) => ring.map((p): Pair => [p.x, p.y]))
    const area = polygonArea(polygon)
    if (!(area > 0)) return
    traced.push({ room, floor: floorOf(room), polygon, area, box: boxOfRings(polygon), order })
  })
  return withHoles(nestMarked(traced, wallsById), traced)
}

/** The rooms marked `inside`, each with the room it sits in, and what each of those keeps. */
function nestMarked(traced: readonly Traced[], wallsById: ReadonlyMap<string, Wall>): RoomNesting {
  // A zone (CNT-8) lies in its room on purpose and takes no floor off it.
  const marked = traced.filter((t) => t.room.inside === true && t.room.partOf === undefined)
  if (marked.length === 0) return NO_NESTING

  let failure: unknown = null
  for (const grid of GRIDS) {
    try {
      return nest(traced, marked, wallsById, grid)
    } catch (error) {
      failure = error
    }
  }
  const reason = `the outlines could not be compared (${failure instanceof Error ? failure.message : String(failure)})`
  return {
    inner: new Map(marked.map((t) => [t.room.id, { room: t.room.id, host: null, nearest: null, taken: 0, reason }])),
    hosts: new Map()
  }
}

/**
 * A room with holes and no room inside it keeps its outline less its holes (ARE-6). No cut is
 * needed for that: the holes are rings of its polygon, checked to lie inside the outline and
 * clear of each other (`room.ts`).
 */
function withHoles(nesting: RoomNesting, traced: readonly Traced[]): RoomNesting {
  const holed = traced.filter((t) => t.polygon.length > 1 && !nesting.hosts.has(t.room.id))
  if (holed.length === 0) return nesting
  const hosts = new Map(nesting.hosts)
  for (const t of holed) hosts.set(t.room.id, { rooms: [], region: [t.polygon], area: t.area })
  return { inner: nesting.inner, hosts }
}

/** Whether `ancestor` holds `room`, right around it or further out. */
export function sitsWithin(nesting: RoomNesting, room: string, ancestor: string): boolean {
  const seen = new Set<string>()
  let at = nesting.inner.get(room)?.host ?? null
  while (at !== null && !seen.has(at)) {
    if (at === ancestor) return true
    seen.add(at)
    at = nesting.inner.get(at)?.host ?? null
  }
  return false
}
