/**
 * The routes a person can take through one floor, deduced from the plan.
 *
 * Nothing in the schema marks a route: rooms are where a person can be,
 * and doors, doorless openings and virtual walls are how they move between
 * them. Which rooms an opening joins is read from the geometry at the opening's
 * own position, never from the list of rooms that name its wall: a long wall
 * can border several rooms along different stretches.
 */

import type { FloorPlan, Opening, PlanIndex, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomNesting, tryRoomPolygon } from '../room'
import type { Vec2 } from '../vec2'
import { add, area, scale } from '../vec2'
import { wallAxis } from '../wall'
import { TOLERANCES, tolerance } from '../tolerances'

/** How far past a wall's face a point is taken to be in the room beyond it, in metres (`stepPastFace`). */
export const STEP_PAST_FACE_M = TOLERANCES.stepPastFace.value

export interface RoomOutline {
  readonly id: string
  readonly polygon: readonly Vec2[]
}

/** The outline of every room that closes, by id, except those left out. */
export function roomOutlines(
  plan: FloorPlan,
  index: PlanIndex,
  leftOut: ReadonlySet<string> = new Set()
): Map<string, RoomOutline> {
  const outlines = new Map<string, RoomOutline>()
  for (const room of plan.rooms) {
    if (leftOut.has(room.id)) continue
    const polygon = tryRoomPolygon(room, index)
    if (polygon !== null) outlines.set(room.id, { id: room.id, polygon })
  }
  return outlines
}

/** Even-odd ray cast. A point exactly on an edge may fall either way. */
function contains(polygon: readonly Vec2[], point: Vec2): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > point.y !== b.y > point.y) {
      const x = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y)
      if (point.x < x) inside = !inside
    }
  }
  return inside
}

/**
 * The rooms on the two sides of a point on a wall's axis, `[left, right]`:
 * `left` is the side the wall's normal points at. Only rooms that name the
 * wall are tried, so a room on another storey or across the plan never matches.
 *
 * Rooms inside rooms (ARE-5). Where more than one of those rooms holds the
 * point, the smallest is the one there: an en-suite in the corner of a bedroom
 * lists the bedroom's outer walls too, and its window is its own. And a room
 * marked `inside` lists only its own walls, so on their far side, where none of
 * the rooms that name the wall is, lies the room it sits in (`roomNesting`, found
 * from the outlines): a door in a wardrobe pod opens into the bedroom.
 */
export function sidesAt(
  wall: Wall,
  along: number,
  index: PlanIndex,
  outlines: ReadonlyMap<string, RoomOutline>
): [string | null, string | null] {
  const axis = wallAxis(wall)
  const centre = add(axis.start, scale(axis.dir, along))
  const step = wall.thickness / 2 + tolerance('stepPastFace')
  const candidates = (index.roomsByWall.get(wall.id) ?? [])
    .map((room) => outlines.get(room.id))
    .filter((outline): outline is RoomOutline => outline !== undefined)
  const nesting = roomNesting(index)
  const roomAt = (point: Vec2): string | null => {
    let found: RoomOutline | null = null
    let foundArea = Infinity
    for (const outline of candidates) {
      if (!contains(outline.polygon, point)) continue
      const size = area([...outline.polygon])
      if (size < foundArea) {
        found = outline
        foundArea = size
      }
    }
    if (found !== null) return found.id
    for (const outline of candidates) {
      const host = nesting.inner.get(outline.id)?.host ?? null
      const around = host === null ? undefined : outlines.get(host)
      if (around !== undefined && contains(around.polygon, point)) return around.id
    }
    return null
  }
  return [roomAt(add(centre, scale(axis.normal, step))), roomAt(add(centre, scale(axis.normal, -step)))]
}

/** The rooms on the two sides of an opening, at its middle (C2: measured from `wall.start`). */
export function openingSides(
  opening: Opening,
  index: PlanIndex,
  outlines: ReadonlyMap<string, RoomOutline>
): [string | null, string | null] {
  const wall = index.wallsById.get(opening.wall)
  if (wall === undefined) return [null, null]
  return sidesAt(wall, opening.offset + opening.width / 2, index, outlines)
}

/** Two rooms a person can move between, in id order, and the opening or virtual wall between them. */
export interface RouteLink {
  readonly rooms: readonly [string, string]
  readonly via: string
}

/** An opening with a room on one side only. */
export interface OneSided {
  readonly room: string
  readonly opening: string
}

export interface FloorGraph {
  /** Every room that closes, by id. */
  readonly rooms: readonly string[]
  readonly links: readonly RouteLink[]
  /** Doors and doorless openings to the outside, through an `exterior` wall. */
  readonly exits: readonly OneSided[]
  /** Doors and doorless openings with nothing drawn behind them, through any other wall. */
  readonly undrawn: readonly OneSided[]
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The routes of one floor. `plan` is a single storey (`planForFloor`) whose walls
 * and openings can all be drawn, so every wall has an axis. Rooms in `leftOut`
 * stay in the plan but are not places: a door beside one says nothing.
 */
export function floorGraph(plan: FloorPlan, leftOut: ReadonlySet<string> = new Set()): FloorGraph {
  const index = indexPlan(plan)
  const outlines = roomOutlines(plan, index, leftOut)
  const nesting = roomNesting(index)
  const links: RouteLink[] = []
  const exits: OneSided[] = []
  const undrawn: OneSided[] = []

  const passage = (wall: Wall, via: string, sides: [string | null, string | null]): void => {
    const [left, right] = sides
    if (left !== null && right !== null) {
      if (left !== right) {
        links.push({ rooms: [left, right].sort(byText) as [string, string], via })
      }
      return
    }
    const room = left ?? right
    if (room === null) return
    // The other side may be a room that was left out: no conclusion from what is not drawn.
    if ((index.roomsByWall.get(wall.id) ?? []).some((r) => !outlines.has(r.id))) return
    // Nor when the room sits inside a room that was left out.
    const host = nesting.inner.get(room)?.host ?? null
    if (host !== null && !outlines.has(host)) return
    // `kind` is read as declared, never inferred.
    if (wall.kind === 'exterior') {
      exits.push({ room, opening: via })
    } else {
      undrawn.push({ room, opening: via })
    }
  }

  for (const opening of plan.openings) {
    // A window is never a way through.
    if (opening.type === 'window') continue
    const wall = index.wallsById.get(opening.wall)
    if (wall === undefined) continue
    passage(wall, opening.id, openingSides(opening, index, outlines))
  }
  // A virtual wall is an open side: it joins the rooms it separates, tested at its middle.
  for (const wall of plan.walls) {
    if (wall.virtual !== true) continue
    passage(wall, wall.id, sidesAt(wall, wallAxis(wall).length / 2, index, outlines))
  }

  const bySide = (a: OneSided, b: OneSided): number => byText(a.room, b.room) || byText(a.opening, b.opening)
  return {
    rooms: [...outlines.keys()].sort(byText),
    links: links.sort(
      (a, b) => byText(a.rooms[0], b.rooms[0]) || byText(a.rooms[1], b.rooms[1]) || byText(a.via, b.via)
    ),
    exits: exits.sort(bySide),
    undrawn: undrawn.sort(bySide)
  }
}
