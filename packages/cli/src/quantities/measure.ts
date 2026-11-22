/**
 * Measuring in a person's terms: a room's sizes, height and the widest circle it holds, whether
 * a box or a circle fits in it, the way from one room to another with the doors it passes, what
 * is narrower than a figure the person gives, a wall's lengths, and the clear distance between
 * two things (ARE-10).
 *
 * Every answer measures the empty room between its wall faces: the plan holds no furniture,
 * fixtures, radiators or door leaves, and says so.
 */
import {
  cross,
  dot,
  floorOf,
  fromTuple,
  itemFootprint,
  planForFloor,
  pointAlong,
  poleOfInaccessibility,
  roomWallIds,
  spotsInside,
  sub,
  tolerance,
  curveFault,
  wallAxis,
  wallLength,
  wallSlicePolygon,
  type FloorPlan,
  type Item,
  type Opening,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { floorGraph } from '@ongrid/floorplan/geometry/rules/graph'
import { compassOf, type Compass } from '../describe/facts'
import type { Survey, SurveyRoom } from './survey'

export const EMPTY_ROOM_RULE =
  'Measured in the empty room between wall faces: the fixtures the plan holds, furniture, radiators, door leaves and the space a person needs round them are not taken off.'

export interface RoomSide {
  readonly facing: Compass
  readonly length: number
  readonly wall: string | null
}

export interface RoomMeasure {
  readonly id: string
  readonly name: string
  readonly floor: string
  readonly area: number
  readonly perimeter: number
  /** Across (x) and up (y) the drawing: its sizes when the room is a rectangle square to it. */
  readonly across: number
  readonly up: number
  readonly rectangle: boolean
  /** The widest circle that fits, and where its centre is. */
  readonly widestCircle: number
  readonly circleAt: Vec2
  readonly sides: readonly RoomSide[]
}

function sidesOf(room: SurveyRoom): RoomSide[] {
  return room.edges.map((edge) => {
    // The side's own direction turned outward: the outline runs counter-clockwise.
    const out = { x: edge.to.y - edge.from.y, y: -(edge.to.x - edge.from.x) }
    return { facing: compassOf(out), length: edge.length, wall: edge.wall?.id ?? null }
  })
}

export function measureRoom(room: SurveyRoom): RoomMeasure {
  const pole = poleOfInaccessibility(room.polygon, undefined, room.holes)
  const shape = room.facts.shape
  return {
    id: room.facts.id,
    name: room.facts.name,
    floor: room.facts.floor,
    area: shape?.area ?? 0,
    perimeter: room.edges.reduce((sum, edge) => sum + edge.length, 0),
    across: shape?.across ?? 0,
    up: shape?.up ?? 0,
    rectangle: shape?.rectangle ?? false,
    widestCircle: 2 * pole.distance,
    circleAt: pole.point,
    sides: sidesOf(room),
  }
}

export interface FitAnswer {
  readonly fits: boolean
  readonly what: string
  /** Where its middle can go, when it fits: one spot, and how it is turned. */
  readonly at: Vec2 | null
  readonly turned: boolean
  /** For a box: the biggest square it would take, as a hint when it does not fit. */
  readonly widestCircle: number
}

/**
 * Whether a box or a circle fits in the room, and where. `clear` is the footprints it must keep
 * clear of besides the room's holes: the room's fixtures (CNT-12), which take their floor.
 */
export function fitInRoom(room: SurveyRoom, shape: { width: number; depth: number } | { diameter: number }, clear: readonly (readonly Vec2[])[] = []): FitAnswer {
  const holes = clear.length === 0 ? room.holes : [...room.holes, ...clear]
  const pole = poleOfInaccessibility(room.polygon, undefined, holes)
  if ('diameter' in shape) {
    const fits = 2 * pole.distance >= shape.diameter - tolerance('joint')
    return { fits, what: `a circle ${shape.diameter.toFixed(2)} m across`, at: fits ? pole.point : null, turned: false, widestCircle: 2 * pole.distance }
  }
  const what = `a ${shape.width.toFixed(2)} × ${shape.depth.toFixed(2)} m rectangle`
  const along = spotsInside(room.polygon, shape.width / 2, shape.depth / 2, holes)
  if (along.length > 0) return { fits: true, what, at: along[0]!, turned: false, widestCircle: 2 * pole.distance }
  const turned = spotsInside(room.polygon, shape.depth / 2, shape.width / 2, holes)
  if (turned.length > 0) return { fits: true, what, at: turned[0]!, turned: true, widestCircle: 2 * pole.distance }
  return { fits: false, what, at: null, turned: false, widestCircle: 2 * pole.distance }
}

export interface RouteStep {
  /** The opening or dividing line passed, and its width; a dividing line has none. */
  readonly via: string
  readonly type: 'door' | 'window' | 'opening' | 'open side'
  readonly width: number | null
  readonly into: string
}

export interface Route {
  readonly from: string
  readonly to: string
  /** Rooms in order, the first and the last included. */
  readonly rooms: readonly string[]
  readonly steps: readonly RouteStep[]
  /** The narrowest door or opening on the way, and the room with the narrowest widest circle. */
  readonly narrowestPassage: { readonly via: string; readonly width: number } | null
  readonly narrowestRoom: { readonly room: string; readonly widestCircle: number } | null
}

/** The way out of every room, as a step past the last room of a route to `outside`. */
export const OUTSIDE = '\u0000outside'

/**
 * The ways from room to room on one floor: for each room, the rooms (or `OUTSIDE`) a door, a
 * doorless opening or a dividing line (`via`) leads to, as the way-out check reads them.
 */
export function wayGraph(survey: Survey, floor: string): { next: Map<string, Array<{ room: string; via: string }>>; openings: Map<string, Opening> } {
  const { storey, leftOut } = drawable(planForFloor(survey.plan, floor))
  const graph = floorGraph(storey, leftOut.rooms)
  const openings = new Map(storey.openings.map((o) => [o.id, o]))
  const next = new Map<string, Array<{ room: string; via: string }>>()
  const join = (a: string, b: string, via: string): void => {
    if (!next.has(a)) next.set(a, [])
    next.get(a)!.push({ room: b, via })
  }
  for (const l of graph.links) {
    join(l.rooms[0], l.rooms[1], l.via)
    join(l.rooms[1], l.rooms[0], l.via)
  }
  for (const exit of graph.exits) join(exit.room, OUTSIDE, exit.opening)
  return { next, openings }
}

/** The way with the fewest rooms between two rooms of one floor, or to any way out ('outside'). */
export function routeBetween(survey: Survey, from: string, to: string): Route | null {
  const floor = survey.byId.get(from)!.facts.floor
  const { next, openings } = wayGraph(survey, floor)
  const OUT = OUTSIDE
  const goal = to === 'outside' ? OUT : to

  const back = new Map<string, { room: string; via: string }>()
  const queue = [from]
  const seen = new Set([from])
  while (queue.length > 0) {
    const room = queue.shift()!
    if (room === goal) break
    for (const step of next.get(room) ?? []) {
      if (seen.has(step.room)) continue
      seen.add(step.room)
      back.set(step.room, { room, via: step.via })
      queue.push(step.room)
    }
  }
  if (!seen.has(goal)) return null

  const rooms: string[] = []
  const steps: RouteStep[] = []
  for (let at = goal; at !== from;) {
    const prev = back.get(at)!
    const opening = openings.get(prev.via)
    steps.unshift({
      via: prev.via,
      type: opening?.type ?? 'open side',
      width: opening?.width ?? null,
      into: at === OUT ? 'outside' : at,
    })
    if (at !== OUT) rooms.unshift(at)
    at = prev.room
  }
  rooms.unshift(from)

  let narrowestPassage: Route['narrowestPassage'] = null
  for (const step of steps) {
    if (step.width !== null && (narrowestPassage === null || step.width < narrowestPassage.width)) narrowestPassage = { via: step.via, width: step.width }
  }
  let narrowestRoom: Route['narrowestRoom'] = null
  for (const id of rooms) {
    const room = survey.byId.get(id)
    if (room === undefined || room.polygon.length < 3) continue
    const circle = 2 * poleOfInaccessibility(room.polygon, undefined, room.holes).distance
    if (narrowestRoom === null || circle < narrowestRoom.widestCircle) narrowestRoom = { room: id, widestCircle: circle }
  }
  return { from, to, rooms, steps, narrowestPassage, narrowestRoom }
}

// ---------------------------------------------------------------------------------------------
// ARE-10: lengths, distances and a room's height, measured from faces as a person measures.

export const FACES_RULE =
  'Measured between faces, as a tape would be: a wall by its faces, a door or window by the edges of its hole in the wall, a room by its inside outline. Centre lines are used only for a wall\'s own length.'

export const HEIGHT_RULE =
  'A room is as high as the plan states for it. When it states none, the room is as high as the lowest solid wall round it, since a level ceiling rests on all of them; dividing lines stand no height and are left out.'

/** A room's height and where it comes from. */
export interface RoomHeight {
  /** In metres; null when the plan states none and no solid wall bounds the room. */
  readonly value: number | null
  /** `room`: the room states it; `walls`: its solid walls agree; `lowest wall`: they differ and the lowest wins. */
  readonly from: 'room' | 'walls' | 'lowest wall' | null
  /** The solid walls round the room: the lowest and highest height, and the walls at the lowest, by id. Null when there are none. */
  readonly walls: { readonly low: number; readonly high: number; readonly lowest: readonly string[] } | null
}

/**
 * The rule for a room's height (ARE-10): a height the room states wins; else the lowest solid
 * wall its boundary or its holes list (ARE-6), because a level ceiling rests on every one of
 * them. A wall that states no height takes its floor's stated height (LVL-1), else the schema's
 * 2.7 m, which cannot be told from a stated 2.7 m (AU3).
 */
export function roomHeight(plan: FloorPlan, roomId: string): RoomHeight {
  const room = plan.rooms.find((r) => r.id === roomId)
  const byId = new Map(plan.walls.map((w) => [w.id, w]))
  const solid = [...new Set(room ? roomWallIds(room) : [])]
    .map((id) => byId.get(id))
    .filter((w): w is Wall => w !== undefined && w.virtual !== true && w.height > 0)
  let walls: RoomHeight['walls'] = null
  if (solid.length > 0) {
    const low = Math.min(...solid.map((w) => w.height))
    const high = Math.max(...solid.map((w) => w.height))
    walls = { low, high, lowest: solid.filter((w) => w.height - low < tolerance('joint')).map((w) => w.id) }
  }
  if (room?.height !== undefined) return { value: room.height, from: 'room', walls }
  if (walls === null) return { value: null, from: null, walls }
  return { value: walls.low, from: walls.high - walls.low < tolerance('joint') ? 'walls' : 'lowest wall', walls }
}

/** A wall's length on its centre line, and the stretch of each room's inside outline along it. */
export interface WallLengths {
  readonly id: string
  readonly floor: string
  readonly length: number
  readonly thickness: number
  readonly height: number
  readonly virtual: boolean
  readonly faces: ReadonlyArray<{ readonly room: string; readonly name: string; readonly length: number }>
}

export function wallLengths(survey: Survey, wall: Wall): WallLengths {
  const faces = survey.rooms
    .map((room) => ({
      room: room.facts.id,
      name: room.facts.name,
      length: room.edges.filter((edge) => edge.wall?.id === wall.id).reduce((sum, edge) => sum + edge.length, 0),
    }))
    .filter((face) => face.length > tolerance('joint'))
  return {
    id: wall.id,
    floor: floorOf(wall),
    length: lengthOf(wall),
    thickness: wall.virtual === true ? 0 : wall.thickness,
    height: wall.height,
    virtual: wall.virtual === true,
    faces,
  }
}

/** Something to measure from: its kind, id, floor and outline in plan (a polygon, a line or a point). */
export interface Thing {
  readonly kind: 'wall' | 'opening' | 'room' | 'item' | 'point'
  readonly id: string | null
  /** Null for a free point, which takes the floor of what it is measured to. */
  readonly floor: string | null
  readonly shape: readonly Vec2[]
}

/** A wall's length along its axis: along its curve for a curved wall (CNT-18), 0 for one that cannot be built. */
function lengthOf(wall: Wall): number {
  if (wall.arc !== undefined) return curveFault(wall) === null ? wallLength(wall) : 0
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

/**
 * A wall's footprint: its faces, or its line when it is a dividing line. A curved wall's is its
 * faces along the curve (CNT-18); a curved dividing line's, the curve itself as a band of no width.
 */
function wallShape(wall: Wall, from: number, to: number): Vec2[] {
  if (wall.arc !== undefined) return wallSlicePolygon(wall.virtual === true ? { ...wall, thickness: 0 } : wall, from, to)
  const axis = wallAxis(wall)
  if (wall.virtual === true) return [pointAlong(axis, from), pointAlong(axis, to)]
  return wallSlicePolygon(wall, from, to)
}

export function wallThing(wall: Wall): Thing {
  const length = lengthOf(wall)
  const shape = length < tolerance('noLength') ? [fromTuple(wall.start)] : wallShape(wall, 0, length)
  return { kind: 'wall', id: wall.id, floor: floorOf(wall), shape }
}

/** An opening's hole through its wall: from its near edge to its far edge, face to face. */
export function openingThing(opening: Opening, wall: Wall): Thing {
  return { kind: 'opening', id: opening.id, floor: floorOf(wall), shape: wallShape(wall, opening.offset, opening.offset + opening.width) }
}

export function roomThing(room: SurveyRoom): Thing {
  return { kind: 'room', id: room.facts.id, floor: room.facts.floor, shape: room.polygon }
}

/** A fixture by its footprint (CNT-12): the gap between two fixtures is between their edges. */
export function itemThing(item: Item): Thing {
  return { kind: 'item', id: item.id, floor: floorOf(item), shape: itemFootprint(item) }
}

export function pointThing(point: Vec2): Thing {
  return { kind: 'point', id: null, floor: null, shape: [point] }
}

export interface Distance {
  /** The clear distance in metres; 0 when the two touch or overlap. */
  readonly distance: number
  /** The nearest point of each, the first thing's first. */
  readonly at: readonly [Vec2, Vec2]
  /** Which way the second is from the first on the drawing; null when they touch. */
  readonly toward: Compass | null
}

type Segment = readonly [Vec2, Vec2]

function segmentsOf(shape: readonly Vec2[]): Segment[] {
  if (shape.length === 1) return [[shape[0]!, shape[0]!]]
  if (shape.length === 2) return [[shape[0]!, shape[1]!]]
  return shape.map((p, i) => [p, shape[(i + 1) % shape.length]!] as const)
}

function nearestOnSegment(p: Vec2, [a, b]: Segment): Vec2 {
  const ab = sub(b, a)
  const span = dot(ab, ab)
  if (span < tolerance('noLength') ** 2) return a
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
  return { x: a.x + ab.x * t, y: a.y + ab.y * t }
}

/** Where two segments cross, when they cross away from each other's ends. */
function crossing([a, b]: Segment, [c, d]: Segment): Vec2 | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < tolerance('noLength')) return null
  const t = cross(sub(c, a), s) / denominator
  const u = cross(sub(c, a), r) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a.x + r.x * t, y: a.y + r.y * t }
}

function holds(shape: readonly Vec2[], p: Vec2): boolean {
  if (shape.length < 3) return false
  let inside = false
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const a = shape[i]!
    const b = shape[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The clear distance between two things, outline to outline. */
export function distanceBetween(first: Thing, second: Thing): Distance {
  const touching = (p: Vec2): Distance => ({ distance: 0, at: [p, p], toward: null })
  if (holds(first.shape, second.shape[0]!)) return touching(second.shape[0]!)
  if (holds(second.shape, first.shape[0]!)) return touching(first.shape[0]!)
  let best: Distance | null = null
  for (const a of segmentsOf(first.shape)) {
    for (const b of segmentsOf(second.shape)) {
      const met = crossing(a, b)
      if (met !== null) return touching(met)
      const pairs: Array<readonly [Vec2, Vec2]> = [
        [a[0], nearestOnSegment(a[0], b)],
        [a[1], nearestOnSegment(a[1], b)],
        [nearestOnSegment(b[0], a), b[0]],
        [nearestOnSegment(b[1], a), b[1]],
      ]
      for (const [p, q] of pairs) {
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (best === null || d < best.distance) best = { distance: d, at: [p, q], toward: null }
      }
    }
  }
  const found = best!
  if (found.distance < tolerance('joint')) return touching(found.at[0])
  return { ...found, toward: compassOf(sub(found.at[1], found.at[0])) }
}
