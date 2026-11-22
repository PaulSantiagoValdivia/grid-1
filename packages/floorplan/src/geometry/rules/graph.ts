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
import { floorOf } from '../floors'
import { roomNesting, tryRoomShape } from '../room'
import type { FloorSpaces } from '../spaces'
import { floorSpaces, spacesKnown } from '../spaces'
import { planWallSides } from '../exposure'
import type { Vec2 } from '../vec2'
import { add, area, scale } from '../vec2'
import { wallAxis } from '../wall'
import { TOLERANCES, limit, tolerance } from '../tolerances'
import { overFigure, underFigure } from '../rounding'

/** How far past a wall's face a point is taken to be in the room beyond it, in metres (`stepPastFace`). */
export const STEP_PAST_FACE_M = TOLERANCES.stepPastFace.value

export interface RoomOutline {
  readonly id: string
  readonly polygon: readonly Vec2[]
  /** Its holes, clockwise (ARE-6). A point in a hole is not in the room. */
  readonly holes: readonly (readonly Vec2[])[]
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
    const shape = tryRoomShape(room, index)
    if (shape !== null) outlines.set(room.id, { id: room.id, polygon: shape.polygon, holes: shape.holes })
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

/** Whether a room's floor holds the point: inside its outline and in none of its holes (ARE-6). */
function holds(outline: RoomOutline, point: Vec2): boolean {
  return contains(outline.polygon, point) && !outline.holes.some((hole) => contains(hole, point))
}

/** A room's floor area as the graph compares rooms: its outline less its holes. */
const floorArea = (outline: RoomOutline): number =>
  outline.holes.reduce((sum, hole) => sum - area([...hole]), area([...outline.polygon]))

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
      if (!holds(outline, point)) continue
      const size = floorArea(outline)
      if (size < foundArea) {
        found = outline
        foundArea = size
      }
    }
    if (found !== null) return found.id
    for (const outline of candidates) {
      const host = nesting.inner.get(outline.id)?.host ?? null
      const around = host === null ? undefined : outlines.get(host)
      if (around !== undefined && holds(around, point)) return around.id
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

/**
 * Whether the side of a wall with no room on it, at a point along the wall, is outside (MSG-13).
 *
 * A wall stated `exterior` faces outside, as stated. Any other wall is worked out: past a face
 * with no room lies the outside, unless the walls enclose floor there, which is a space no room
 * claims (a forgotten room, a courtyard not drawn), not the outside (ARE-4). The spaces of a
 * floor are worked out only when first asked, and when they cannot be, the side is not taken to
 * be outside, as before.
 */
export type OutsideTest = (wall: Wall, along: number, side: 'left' | 'right', asStated?: boolean) => boolean

export function outsideTest(plan: FloorPlan, index: PlanIndex): OutsideTest {
  const spaces = new Map<string, FloorSpaces | null>()
  const spacesOf = (floor: string): FloorSpaces | null => {
    if (!spaces.has(floor)) {
      const found = floorSpaces(plan, floor, { index })
      spaces.set(floor, spacesKnown(found) ? found : null)
    }
    return spaces.get(floor) ?? null
  }
  // `asStated: false` asks only what lies there, for a door with no room on either side.
  return (wall, along, side, asStated = true) => {
    if (asStated && wall.kind === 'exterior') return true
    const found = spacesOf(floorOf(wall))
    if (found === null) return false
    const axis = wallAxis(wall)
    const step = (wall.virtual === true ? 0 : wall.thickness / 2) + tolerance('stepPastFace')
    const point = add(add(axis.start, scale(axis.dir, along)), scale(axis.normal, side === 'left' ? step : -step))
    return !found.spaces.some((space) => {
      const [outer, ...islands] = space.rings
      return outer !== undefined && contains(outer, point) && !islands.some((ring) => contains(ring, point))
    })
  }
}

/** What keeps a person from passing a door or a doorless opening: a sill above the floor, too narrow, or too low. */
export type ShortOf = 'width' | 'height' | 'sill'

/**
 * Whether a person fits through a door or a doorless opening (MSG-18): wide and high enough, with
 * its sill at the floor, by Grid's own sizes (`passableWidth`, `passableHeight`, `passableSill`),
 * which are not code figures. The first it falls short of (sill, width, height), or `null` when it is a way
 * through. Compared as drawn, never rounded first (ARE-7): a door drawn at exactly the size fits.
 */
export function shortOf(opening: Opening): ShortOf | null {
  // A door up in the wall is named for that first, whatever its size.
  if (overFigure(opening.sill, limit('passableSill'), 'm')) return 'sill'
  if (underFigure(opening.width, limit('passableWidth'), 'm')) return 'width'
  if (underFigure(opening.height, limit('passableHeight'), 'm')) return 'height'
  return null
}

/** A door or doorless opening no person fits through, and the rooms on its sides, in id order. */
export interface TooSmall {
  readonly opening: string
  readonly rooms: readonly string[]
  readonly short: ShortOf
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
  /** Doors and doorless openings to the outside: through a wall stated `exterior`, or with no room and no enclosed floor past it. */
  readonly exits: readonly OneSided[]
  /** Doors and doorless openings into enclosed floor that no room claims. */
  readonly undrawn: readonly OneSided[]
  /**
   * Doors and doorless openings beside a room that no person fits through (MSG-18). None of them
   * is in `links`, `exits` or `undrawn`: a 5 cm hole is not a way out.
   */
  readonly tooSmall: readonly TooSmall[]
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
  const tooSmall: TooSmall[] = []

  const outside = outsideTest(plan, index)
  const passage = (wall: Wall, via: string, along: number, sides: [string | null, string | null]): void => {
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
    // Outside as stated, or worked out: no room and no enclosed floor past that face (MSG-13).
    if (outside(wall, along, left === null ? 'left' : 'right')) {
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
    const sides = openingSides(opening, index, outlines)
    // A door no person fits through is named, and is not a way through (MSG-18).
    const short = shortOf(opening)
    if (short !== null) {
      const rooms = [...new Set(sides.filter((room): room is string => room !== null))].sort(byText)
      if (rooms.length > 0) tooSmall.push({ opening: opening.id, rooms, short })
      continue
    }
    passage(wall, opening.id, opening.offset + opening.width / 2, sides)
  }
  // A virtual wall is an open side all along its length (MSG-14): each stretch of it joins the
  // rooms on its two sides there. The stretches are cut wherever the rooms beside it change, so
  // two lines that cross at their middles join all four rooms round the crossing (lab S-4); a
  // line tested only at its middle tested the crossing.
  const sides = planWallSides(index)
  for (const wall of plan.walls) {
    if (wall.virtual !== true) continue
    const stretches = (sides.get(wall.id)?.stretches ?? []).filter((st) => st.to - st.from > tolerance('lineInside'))
    const points = stretches.length > 0 ? stretches.map((st) => (st.from + st.to) / 2) : [wallAxis(wall).length / 2]
    for (const along of points) passage(wall, wall.id, along, sidesAt(wall, along, index, outlines))
  }

  const bySide = (a: OneSided, b: OneSided): number => byText(a.room, b.room) || byText(a.opening, b.opening)
  // A line with several stretches can join the same two rooms, or lead out of one room, more than once.
  const once = <T>(list: T[], key: (t: T) => string): T[] => [...new Map(list.map((t) => [key(t), t] as const)).values()]
  return {
    rooms: [...outlines.keys()].sort(byText),
    links: once(links, (l) => `${l.rooms.join('|')}|${l.via}`).sort(
      (a, b) => byText(a.rooms[0], b.rooms[0]) || byText(a.rooms[1], b.rooms[1]) || byText(a.via, b.via)
    ),
    exits: once(exits, (e) => `${e.room}|${e.opening}`).sort(bySide),
    undrawn: once(undrawn, (u) => `${u.room}|${u.opening}`).sort(bySide),
    tooSmall: tooSmall.sort((a, b) => byText(a.rooms[0]!, b.rooms[0]!) || byText(a.opening, b.opening))
  }
}
