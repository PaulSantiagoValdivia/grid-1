/**
 * Rooms that overlap (ARE-5).
 *
 * A room whose wall list names one wrong wall grows over its neighbours, and a room pasted in
 * twice covers the same floor as the first. Nothing else in the drawing's checks sees it: each
 * outline closes, and each is measured. The floor they share is then counted twice.
 *
 * The rooms of each floor are set against each other, pair by pair, exactly: the area both
 * cover is the area of the intersection of their two polygons, from `polygon-clipping` (MIT),
 * the library ARE-4 brought in for the spaces. Two rooms are only said to overlap when they
 * share at least `areaReported` (0.01 m²). Rooms that meet face to face share an edge at most,
 * along a dividing line, or nothing at all, across a wall: an area of 0, or rounding noise far
 * below the line.
 *
 * A room is compared by its floor as Grid measures it: its outline, less any room marked
 * `inside` that sits in it (`nesting.ts`). A room inside a room is therefore never said to
 * overlap the room it sits in, nor any room further out that holds both.
 *
 * Only pairs whose boxes overlap by at least `areaReported` are cut, found by sweeping the
 * rooms in order of their left edge, so a floor of thousands of rooms in a row costs a few
 * thousand cuts, not millions.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair } from 'polygon-clipping'
import { floorOf } from './floors'
import type { FloorPlan, PlanIndex, Room } from './plan'
import { indexPlan } from './plan'
import { roomNesting, tryRoomPolygon } from './room'
import type { Vec2 } from './vec2'
import { TOLERANCES, tolerance } from './tolerances'
import { sitsWithin } from './nesting'
import type { Box } from './polygons'
import { boxOfRings, multiArea, pointInside, polygonArea } from './polygons'

/** How two rooms that overlap lie. */
export type OverlapKind =
  /** They cover the same floor: a room listed twice, or drawn twice. */
  | 'same'
  /** The smaller lies wholly inside the larger: a pod, or a room the larger grew over. */
  | 'inside'
  /** Each covers part of the other. */
  | 'part'

export interface RoomOverlap {
  readonly floor: string
  /** The two rooms, in plan order. */
  readonly rooms: readonly [string, string]
  /** Each room's area as Grid measures it, in the same order, in square metres. */
  readonly areas: readonly [number, number]
  /** The floor both cover, in square metres. */
  readonly shared: number
  /** A point inside the largest piece of that floor, to say where it is. */
  readonly at: Vec2
  readonly kind: OverlapKind
  /** Whether both rooms list the same walls, in any order. */
  readonly sameWalls: boolean
}

/** Two rooms that could not be compared, and why. */
export interface UncomparedRooms {
  readonly floor: string
  readonly rooms: readonly [string, string]
  readonly reason: string
}

export interface RoomOverlaps {
  readonly overlaps: readonly RoomOverlap[]
  readonly uncompared: readonly UncomparedRooms[]
  /**
   * The floors whose rooms were not all compared, in plan order, because the plan reached
   * `MAX_CUTS`. Empty when every pair was compared.
   */
  readonly stopped: readonly string[]
}

export interface OverlapOptions {
  readonly index?: PlanIndex
  /** Ids the drawing's checks mark as broken (`validatePlan`). Those rooms are left out. */
  readonly broken?: ReadonlySet<string>
}

/**
 * The most pairs of rooms one plan is cut for. Pairs grow with the square of the rooms piled in
 * one place: 5,000 copies of one room would be 12.5 million cuts, most of an hour. At about
 * 10 µs a cut this stops within a few seconds, and says which floors were not finished.
 */
export const MAX_CUTS = 200_000

/** As in `spaces.ts`: the cut is tried as drawn, then with points rounded to these grids. */
const GRIDS = TOLERANCES.overlapGrids.values

interface Measured {
  readonly room: Room
  readonly floor: string
  /** Moved so that the corner of the box is at the origin: see `shift`. */
  readonly geom: MultiPolygon
  readonly area: number
  readonly box: Box
  readonly order: number
}

/** The area two boxes share, 0 when they only touch. */
function boxShare(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

const moved = (geom: MultiPolygon, dx: number, dy: number, snap: (v: number) => number): MultiPolygon =>
  geom.map((polygon) => polygon.map((ring) => ring.map(([x, y]): Pair => [snap(x - dx), snap(y - dy)])))

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((id) => sb.has(id))
}

/**
 * The floor two rooms share. Both are moved so that the corner of the first one's box sits at
 * the origin before they are cut: the cut is then as exact far from the origin as near it.
 */
function shared(a: Measured, b: Measured): { area: number; at: Vec2 } {
  let failure: unknown = null
  for (const grid of GRIDS) {
    const steps = grid === 0 ? 0 : Math.round(1 / grid)
    const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
    try {
      const cut = polygonClipping.intersection(moved(a.geom, a.box.x0, a.box.y0, snap), moved(b.geom, a.box.x0, a.box.y0, snap))
      const area = multiArea(cut)
      let largest = cut[0]
      for (const piece of cut) if (polygonArea(piece) > polygonArea(largest!)) largest = piece
      const at = largest === undefined ? { x: 0, y: 0 } : pointInside(largest, boxOfRings(largest))
      return { area, at: { x: at.x + a.box.x0, y: at.y + a.box.y0 } }
    } catch (error) {
      failure = error
    }
  }
  throw failure
}

/**
 * Every pair of rooms on the same floor that share at least `areaReported` of floor, and
 * any pair the polygon library could not compare. Never throws.
 */
export function roomOverlaps(plan: FloorPlan, options: OverlapOptions = {}): RoomOverlaps {
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? new Set<string>()
  const nesting = roomNesting(index)

  const byFloor = new Map<string, Measured[]>()
  plan.rooms.forEach((room, order) => {
    if (broken.has(room.id)) return
    const outline = tryRoomPolygon(room, index)
    if (outline === null || outline.length < 3 || !outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return
    const host = nesting.hosts.get(room.id)
    const geom: MultiPolygon = host?.region ?? [[outline.map((p): Pair => [p.x, p.y])]]
    const area = host?.area ?? polygonArea(geom[0]!)
    if (!(area >= tolerance('areaReported'))) return
    const floor = floorOf(room)
    const list = byFloor.get(floor) ?? []
    list.push({ room, floor, geom, area, box: boxOfRings(geom.flat()), order })
    byFloor.set(floor, list)
  })

  const overlaps: RoomOverlap[] = []
  const uncompared: UncomparedRooms[] = []
  const stopped: string[] = []
  let cuts = 0
  for (const [floor, rooms] of byFloor) {
    if (cuts >= MAX_CUTS) {
      stopped.push(floor)
      continue
    }
    rooms.sort((a, b) => a.box.x0 - b.box.x0 || a.order - b.order)
    pairs: for (let i = 0; i < rooms.length; i++) {
      const p = rooms[i]!
      for (let j = i + 1; j < rooms.length && rooms[j]!.box.x0 < p.box.x1; j++) {
        const q = rooms[j]!
        if (boxShare(p.box, q.box) < tolerance('areaReported')) continue
        if (sitsWithin(nesting, p.room.id, q.room.id) || sitsWithin(nesting, q.room.id, p.room.id)) continue
        if (cuts >= MAX_CUTS) {
          stopped.push(floor)
          break pairs
        }
        cuts++
        const [a, b] = p.order < q.order ? [p, q] : [q, p]
        let cut: { area: number; at: Vec2 }
        try {
          cut = shared(a, b)
        } catch (error) {
          uncompared.push({ floor, rooms: [a.room.id, b.room.id], reason: error instanceof Error ? error.message : String(error) })
          continue
        }
        if (cut.area < tolerance('areaReported')) continue
        const larger = Math.max(a.area, b.area)
        const smaller = Math.min(a.area, b.area)
        const kind: OverlapKind =
          cut.area >= larger - tolerance('areaReported') ? 'same' : cut.area >= smaller - tolerance('areaReported') ? 'inside' : 'part'
        overlaps.push({
          floor,
          rooms: [a.room.id, b.room.id],
          areas: [a.area, b.area],
          shared: cut.area,
          at: cut.at,
          kind,
          sameWalls: sameSet(a.room.boundary, b.room.boundary)
        })
      }
    }
  }
  const position = new Map(plan.rooms.map((room, i) => [room.id, i] as const))
  const rank = (o: { rooms: readonly [string, string] }): [number, number] => [position.get(o.rooms[0]) ?? 0, position.get(o.rooms[1]) ?? 0]
  const byRooms = (x: { rooms: readonly [string, string] }, y: { rooms: readonly [string, string] }): number => {
    const [x0, x1] = rank(x)
    const [y0, y1] = rank(y)
    return x0 - y0 || x1 - y1
  }
  return { overlaps: overlaps.sort(byRooms), uncompared: uncompared.sort(byRooms), stopped }
}
