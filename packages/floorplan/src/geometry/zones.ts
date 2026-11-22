/**
 * Zones inside one room (CNT-8, lab EL-13, AB-9).
 *
 * An open-plan room holds several uses: a studio where you sleep, cook and sit. The plan draws
 * the room once, round its own walls, and each zone as a room of its own that names the room in
 * `partOf`. A zone's outline lies inside its room's, along the room's walls and dividing lines of
 * the zone's own, so the two overlap on purpose:
 *
 *  - **The room is the place.** It is measured, counted, reached and checked as a whole. A door
 *    in its walls opens into it, never into one of its zones.
 *  - **A zone is named and measured**, and is counted in no total: no floor is counted twice.
 *    The overlap check leaves a zone and its room alone; two zones of one room that overlap each
 *    other still share floor, and are named.
 *  - **A zone's dividing lines are the zone's own.** A line that only zones list makes no space of
 *    its own and does not divide the room (`lines`).
 *
 * A room is a zone only when the room it names is on its floor, is not a zone itself, and holds
 * it: all of the zone's floor, but `areaReported`, lies in the room's outline. Otherwise it is a
 * room of its own, counted on its own, and validation names it (`room/zone-not-in-room`).
 *
 * Pure: a plan index in, ids out. Worked out once per index, and only for a plan with a room
 * that states `partOf`.
 */

import type { Pair, Polygon } from 'polygon-clipping'
import { floorOf } from './floors'
import type { PlanIndex, Room } from './plan'
import { tryRoomPolygon } from './room'
import { intersectionArea, polygonArea } from './polygons'
import { TOLERANCES, tolerance, tolerancesAsStated } from './tolerances'
import type { Vec2 } from './vec2'
import { name, num, said, type Said } from '../messages/say'

/** A room that names a room it is not a zone of, and why. */
export interface ZoneFault {
  readonly zone: string
  /** The id it names in `partOf`. */
  readonly room: string
  /** Why it is not a zone of that room, in a clause (MSG-11: by its key, `issue.room/zone-not-in-room.*`). */
  readonly why: Said
}

export interface RoomZones {
  /** Each zone, by id: the id of the room it is part of. */
  readonly zoneOf: ReadonlyMap<string, string>
  /** Each room with zones, by id: its zones' ids, in plan order. */
  readonly zones: ReadonlyMap<string, readonly string[]>
  /** Dividing lines that only zones list: they divide no room and make no space of their own. */
  readonly lines: ReadonlySet<string>
  /** Rooms that state `partOf` and are not zones of that room, in plan order. */
  readonly faults: readonly ZoneFault[]
}

/** A plan with no zones. */
export const NO_ZONES: RoomZones = { zoneOf: new Map(), zones: new Map(), lines: new Set(), faults: [] }

/** As in `nesting.ts`: tried as drawn first, then with every point rounded to these grids. */
const GRIDS = TOLERANCES.joinGrids.values


/** How much of `zone` lies outside `room`, in square metres; both moved next to the origin first. */
function outsideOf(zone: readonly Vec2[], room: readonly Vec2[]): number {
  const o = room[0]!
  let failure: unknown = null
  for (const grid of GRIDS) {
    const steps = grid === 0 ? 0 : Math.round(1 / grid)
    const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
    const ring = (points: readonly Vec2[]): Polygon => [points.map((p): Pair => [snap(p.x - o.x), snap(p.y - o.y)])]
    try {
      const a = ring(zone)
      return Math.max(0, polygonArea(a) - intersectionArea(a, ring(room)))
    } catch (error) {
      failure = error
    }
  }
  throw failure
}

function findZones(index: PlanIndex): RoomZones {
  const rooms = index.plan.rooms
  const byId = new Map<string, Room>()
  for (const room of rooms) if (!byId.has(room.id)) byId.set(room.id, room)
  const zoneOf = new Map<string, string>()
  const faults: ZoneFault[] = []
  for (const zone of rooms) {
    const named = zone.partOf
    if (named === undefined) continue
    const fault = (why: Said): void => {
      faults.push({ zone: zone.id, room: named, why })
    }
    const room = byId.get(named)
    if (named === zone.id) {
      fault(said('issue.room/zone-not-in-room.itself'))
      continue
    }
    if (room === undefined || floorOf(room) !== floorOf(zone)) {
      fault(said('issue.room/zone-not-in-room.noRoom', { room: name(named), floor: name(floorOf(zone)) }))
      continue
    }
    if (room.partOf !== undefined) {
      fault(said('issue.room/zone-not-in-room.zoneOfZone', { room: name(named), of: name(room.partOf) }))
      continue
    }
    const inner = tryRoomPolygon(zone, index)
    const outer = tryRoomPolygon(room, index)
    // An outline that does not close is named by its own line; the zone is still its room's.
    if (inner !== null && outer !== null && inner.length >= 3 && outer.length >= 3) {
      let outside: number
      try {
        outside = outsideOf(inner, outer)
      } catch (error) {
        fault(said('issue.room/zone-not-in-room.notCompared', { error: error instanceof Error ? error.message : String(error) }))
        continue
      }
      if (outside >= tolerance('areaReported')) {
        fault(said('issue.room/zone-not-in-room.outside', { area: num(outside.toFixed(2)), room: name(named) }))
        continue
      }
    }
    zoneOf.set(zone.id, room.id)
  }
  if (zoneOf.size === 0 && faults.length === 0) return NO_ZONES

  const zones = new Map<string, string[]>()
  for (const room of rooms) {
    const of = zoneOf.get(room.id)
    if (of === undefined || zones.get(of)?.includes(room.id)) continue
    zones.set(of, [...(zones.get(of) ?? []), room.id])
  }
  // A dividing line listed by zones and by no room that is a place.
  const lines = new Set<string>()
  for (const [wallId, listing] of index.roomsByWall) {
    const wall = index.wallsById.get(wallId)
    if (wall?.virtual !== true || listing.length === 0) continue
    if (listing.every((room) => zoneOf.has(room.id))) lines.add(wallId)
  }
  return { zoneOf, zones, lines, faults }
}

const found = new WeakMap<PlanIndex, RoomZones>()

/**
 * Which rooms of the plan are zones of which (CNT-8). Only rooms that state `partOf` are looked
 * at; a plan with none costs nothing. Worked out once per index.
 */
export function roomZones(index: PlanIndex): RoomZones {
  if (!index.plan.rooms.some((room) => room.partOf !== undefined)) return NO_ZONES
  // Under changed tolerances (`withTolerances`) the answer is not the stated one: not kept.
  const stated = tolerancesAsStated()
  let zones = stated ? found.get(index) : undefined
  if (zones === undefined) {
    zones = findZones(index)
    if (stated) found.set(index, zones)
  }
  return zones
}

/** Whether a room is a zone of another (CNT-8): counted in no total, and no place of its own. */
export function isZone(index: PlanIndex, roomId: string): boolean {
  return roomZones(index).zoneOf.has(roomId)
}
