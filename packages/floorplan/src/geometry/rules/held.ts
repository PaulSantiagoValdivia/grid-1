/**
 * MSG-5 (lab MS-4, W-6): the notes a check holds back while a part they rest on could not be
 * drawn. One room that cannot be drawn made its sound neighbours read "has no door" and the floor
 * "has no door to the outside", although the doors were there: one undrawable corridor gave 16
 * such notes. A note that rests on a part that could not be drawn is not given; the floor's "not
 * checked" line names the part and keeps the note, which comes back once the part is drawn, if it
 * still holds. A note that happens to be true is held too: whether it holds cannot be read while
 * the part is missing.
 *
 * The rule, from the lab (W-6):
 * - a way out or a route is held when any room or opening on its floors could not be drawn;
 * - "no door" when the room shares a wall with a room or an opening that could not be drawn, or
 *   when an opening could be placed on no wall at all, which may be its door;
 * - a door into a space not drawn, when a room that could not be drawn rests on the door's wall,
 *   or any room on its floor could not be drawn: that room may be the space beyond;
 * - an escape opening, when an opening on one of the room's walls could not be drawn, or could be
 *   placed on no wall.
 *
 * "Could not be drawn" is what the drawing check leaves out of a floor (`drawable`), and the walls,
 * rooms and openings the reader left out of the plan (MSG-6, `LeftOutPart`). Pure.
 */

import type { LeftOutPart } from '../../types/readParts'
import type { FloorPlan, Opening } from '../plan'
import { roomWallIds } from '../plan'
import { floorOf, planFloors } from '../floors'

/** One floor as `drawable` reads it: what it draws, and what it leaves out. */
export interface DrawnFloor {
  readonly storey: FloorPlan
  readonly leftOut: { readonly rooms: ReadonlySet<string>; readonly openings: ReadonlySet<string> }
}

/** What could not be drawn on one floor, and the walls it rests on. Ids sorted. */
export interface FloorDamage {
  readonly floor: string
  /** Rooms the drawing check leaves out, or the reader left out, on this floor. */
  readonly rooms: readonly string[]
  /** Doors, windows and openings that could not be drawn on this floor, and those placed on no wall. */
  readonly openings: readonly string[]
  /** Each wall that a room that could not be drawn rests on, with those rooms. */
  readonly roomWalls: ReadonlyMap<string, readonly string[]>
  /** Each wall that holds an opening that could not be drawn, with those openings. */
  readonly openingWalls: ReadonlyMap<string, readonly string[]>
  /** Openings that could be placed on no wall of the plan: any room's door or window, on any floor. */
  readonly unplaced: readonly string[]
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

class Damage {
  readonly rooms = new Set<string>()
  readonly openings = new Set<string>()
  readonly roomWalls = new Map<string, Set<string>>()
  readonly openingWalls = new Map<string, Set<string>>()

  room(id: string, walls: readonly string[]): void {
    this.rooms.add(id)
    for (const wall of walls) this.roomWalls.set(wall, (this.roomWalls.get(wall) ?? new Set()).add(id))
  }

  opening(id: string, wall: string | null): void {
    this.openings.add(id)
    if (wall !== null) this.openingWalls.set(wall, (this.openingWalls.get(wall) ?? new Set()).add(id))
  }

  read(floor: string, unplaced: readonly string[]): FloorDamage {
    const sortedMap = (map: Map<string, Set<string>>): Map<string, string[]> =>
      new Map([...map].map(([wall, ids]) => [wall, [...ids].sort(byText)] as const))
    return {
      floor,
      rooms: [...this.rooms].sort(byText),
      openings: [...new Set([...this.openings, ...unplaced])].sort(byText),
      roomWalls: sortedMap(this.roomWalls),
      openingWalls: sortedMap(this.openingWalls),
      unplaced
    }
  }
}

/**
 * What could not be drawn, floor by floor, for every floor of the plan. `drawn` is each floor as
 * `drawable` reads it; `leftOut`, what the reader left out of the plan.
 */
export function planDamage(
  plan: FloorPlan,
  drawn: ReadonlyMap<string, DrawnFloor>,
  leftOut: readonly LeftOutPart[] = []
): Map<string, FloorDamage> {
  const floors = planFloors(plan).map((f) => f.id)
  const damage = new Map(floors.map((id) => [id, new Damage()] as const))
  const openings = new Map<string, Opening>()
  for (const opening of plan.openings) if (!openings.has(opening.id)) openings.set(opening.id, opening)
  const wallFloors = new Map<string, Set<string>>()
  for (const wall of plan.walls) wallFloors.set(wall.id, (wallFloors.get(wall.id) ?? new Set()).add(floorOf(wall)))
  const leftOutWalls = new Map(leftOut.flatMap((part) => (part.kind === 'wall' && part.id !== null && part.floor !== null ? [[part.id, part.floor] as const] : [])))
  const unplaced: string[] = []
  /**
   * A room that could not be drawn, on its own floor and on the floor of every wall it lists that
   * has rooms of its own: a room that reaches across floors leaves a gap beside the walls of both.
   */
  const onFloors = (id: string, floor: string, walls: readonly string[]): void => {
    const others = walls.flatMap((wall) => [...(wallFloors.get(wall) ?? [])]).filter((on) => (drawn.get(on)?.storey.rooms.length ?? 0) > 0)
    for (const on of new Set([floor, ...others])) damage.get(on)?.room(id, walls)
  }
  /** An opening that could not be drawn, on the floors of its wall, or on none. */
  const onWall = (id: string, wall: string | null): void => {
    const on = wall === null ? [] : [...(wallFloors.get(wall) ?? []), ...(leftOutWalls.has(wall) ? [leftOutWalls.get(wall)!] : [])]
    const known = on.filter((floor) => damage.has(floor))
    if (known.length === 0) unplaced.push(id)
    for (const floor of known) damage.get(floor)!.opening(id, wall)
  }

  // What the drawing check leaves out of each floor.
  const sliced = new Set<string>()
  for (const floor of floors) {
    const read = drawn.get(floor)
    if (read === undefined) continue
    const at = damage.get(floor)!
    for (const room of read.storey.rooms) if (read.leftOut.rooms.has(room.id)) onFloors(room.id, floor, roomWallIds(room))
    for (const opening of read.storey.openings) sliced.add(opening.id)
    for (const id of read.leftOut.openings) {
      sliced.add(id)
      at.opening(id, openings.get(id)?.wall ?? null)
    }
  }
  // An opening no floor holds: on a wall the reader left out, on a wall whose id two floors use,
  // or on a wall the plan does not have.
  for (const opening of plan.openings) if (!sliced.has(opening.id)) onWall(opening.id, opening.wall)
  // What the reader left out. A wall left out takes the rooms and openings on it with it: those
  // are already counted above.
  for (const part of leftOut) {
    if (part.id === null) continue
    if (part.kind === 'room' && part.floor !== null) onFloors(part.id, part.floor, part.walls)
    if (part.kind === 'opening') onWall(part.id, part.walls[0] ?? null)
  }
  const lost = [...new Set(unplaced)].sort(byText)
  return new Map([...damage].map(([floor, at]) => [floor, at.read(floor, lost)] as const))
}

/** Whether anything on the floor could not be drawn. */
export function damaged(damage: FloorDamage | undefined): damage is FloorDamage {
  return damage !== undefined && damage.rooms.length + damage.openings.length > 0
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)].sort(byText)

/** The ids a room's walls carry in `byWall`. */
function carried(walls: readonly string[], byWall: ReadonlyMap<string, readonly string[]>): string[] {
  return unique(walls.flatMap((wall) => byWall.get(wall) ?? []))
}

/**
 * The parts a room's "no door" note waits for: the rooms and openings that could not be drawn on
 * its walls, or else the openings placed on no wall. Empty when it waits for none.
 */
export function doorWaitsFor(walls: readonly string[], damage: FloorDamage | undefined): string[] {
  if (damage === undefined) return []
  const beside = unique([...carried(walls, damage.roomWalls), ...carried(walls, damage.openingWalls)])
  return beside.length > 0 ? beside : [...damage.unplaced]
}

/**
 * The rooms that could not be drawn that a door into a space not drawn waits for: those that rest
 * on its wall, or else every room on its floor that could not be drawn, since a room whose wall
 * list cannot be read may be the space beyond it.
 */
export function leadsWaitsFor(wall: string | undefined, damage: FloorDamage | undefined): string[] {
  if (damage === undefined) return []
  const beside = wall === undefined ? [] : [...(damage.roomWalls.get(wall) ?? [])]
  return beside.length > 0 ? beside : [...damage.rooms]
}

/** The openings a room's escape note waits for: those on its walls that could not be drawn, or else those placed on no wall. */
export function escapeWaitsFor(walls: readonly string[], damage: FloorDamage | undefined): string[] {
  if (damage === undefined) return []
  const own = carried(walls, damage.openingWalls)
  return own.length > 0 ? own : [...damage.unplaced]
}

/** Everything that could not be drawn on these floors: what a way out or a route waits for. */
export function routeWaitsFor(damages: readonly (FloorDamage | undefined)[]): string[] {
  return unique(damages.flatMap((d) => (d === undefined ? [] : [...d.rooms, ...d.openings])))
}
