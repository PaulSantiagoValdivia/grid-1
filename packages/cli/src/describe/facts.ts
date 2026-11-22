/**
 * What `grid describe` says about a plan, worked out once and printed in several lengths
 * (`card.ts`).
 *
 * Which rooms an opening joins comes from the same place as the way-out check: the geometry
 * at the opening's middle (`openingSides` in `@ongrid/floorplan`), on each floor as that
 * check reads it, without the parts the drawing's checks reject. Nothing here is guessed
 * from a name: a room is a bedroom only when its `use` says so.
 */
import {
  cross,
  dot,
  floorJoins,
  floorOf,
  indexPlan,
  planFloors,
  planForFloor,
  roomArea,
  sub,
  tolerance,
  wallAxis,
  type Floor,
  type FloorPlan,
  type Opening,
  type PlanIndex,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { DEFAULT_FLOOR_ID, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { openingSides, roomOutlines, sidesAt, type RoomOutline } from '@ongrid/floorplan/geometry/rules/graph'

/** A direction on the drawing: north is up (+y), whatever north the plan states (CNT-3). */
export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

const COMPASS: readonly Compass[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']

export function compassOf(v: Vec2): Compass {
  const turn = Math.atan2(v.y, v.x) / (Math.PI / 4)
  return COMPASS[((Math.round(turn) % 8) + 8) % 8]!
}

export interface RoomShape {
  /** The lower-left corner of the inside, the smallest x and y of its outline. */
  readonly at: Vec2
  /** Across (x) and up (y) the drawing, inside the walls. */
  readonly across: number
  readonly up: number
  /** Whether the inside is a rectangle square to the drawing, so across by up is its size. */
  readonly rectangle: boolean
  readonly area: number
}

export interface RoomFacts {
  readonly id: string
  readonly name: string
  readonly use?: RoomUse
  readonly floor: string
  /** Null when the drawing's checks leave the room out: it has no outline to measure. */
  readonly shape: RoomShape | null
  /** Rooms across one of its walls, whether or not anything joins them, by id. */
  readonly neighbours: readonly string[]
}

/** How far an opening's edge is from the inside corner at one end of the room's side. */
export interface CornerGap {
  /** Which way the corner is from the opening, on the drawing. */
  readonly toward: Compass
  readonly distance: number
}

export interface OpeningSide {
  readonly room: string
  /** Which side of the room the opening is on, seen from inside. */
  readonly face: Compass
  /** The two inside corners of that side, nearer the wall's start first. Null when no side of the outline lies on the wall's face there. */
  readonly corners: readonly [CornerGap, CornerGap] | null
}

/** What is on a side of an opening with no room there. */
export type Beyond = 'outside' | 'nothing drawn' | 'a room left out'

export interface OpeningFacts {
  readonly id: string
  readonly type: Opening['type']
  readonly wall: string
  readonly floor: string
  readonly offset: number
  readonly width: number
  readonly sill: number
  readonly height: number
  /** The rooms on the two sides: the side the wall's normal points at first. */
  readonly sides: readonly [OpeningSide | Beyond, OpeningSide | Beyond]
}

/** A virtual wall: a line on the floor that leaves two rooms open to each other. */
export interface OpenSide {
  readonly wall: string
  readonly rooms: readonly [string, string]
}

export interface WallFacts {
  readonly id: string
  readonly start: Vec2
  readonly end: Vec2
  readonly thickness: number
  readonly height: number
  readonly kind: Wall['kind']
  readonly virtual: boolean
}

/** A floor laid out like an earlier one: same walls, rooms and openings, other ids. */
export interface Repeat {
  readonly of: string
  /** The id prefix of the earlier floor and the one that replaces it here, when the ids differ only by it. */
  readonly prefix: readonly [string, string] | null
}

export interface FloorFacts {
  readonly id: string
  /** Null when the plan does not name the floor. */
  readonly name: string | null
  readonly level: number
  readonly rooms: readonly RoomFacts[]
  readonly walls: readonly WallFacts[]
  /** Wall by wall, in the order of `walls`, and along each wall from its start. */
  readonly openings: readonly OpeningFacts[]
  readonly openSides: readonly OpenSide[]
  readonly repeats: Repeat | null
  readonly area: number
  /** The usual height of a solid wall on this floor; null when it has none. */
  readonly wallHeight: number | null
  /** Rooms and openings the drawing's checks leave out on this floor, by id. */
  readonly leftOut: readonly string[]
}

/** Something that departs from the usual height. */
export interface HeightException {
  readonly id: string
  readonly floor: string
  readonly value: number
}

export interface Heights {
  /** The usual height of a solid wall; null when there are none. */
  readonly wall: number | null
  /** Floors whose walls are usually another height. */
  readonly floorWalls: ReadonlyArray<{ readonly floor: string; readonly value: number }>
  /** Walls of another height than most on their floor. */
  readonly walls: readonly HeightException[]
  /** The usual sill of a window; null when there are none. */
  readonly windowSill: number | null
  readonly windowSills: readonly HeightException[]
  /** Doors and doorless openings with a sill above the floor. */
  readonly doorSills: readonly HeightException[]
}

export interface PlanFacts {
  readonly floors: readonly FloorFacts[]
  readonly rooms: ReadonlyMap<string, RoomFacts>
  readonly openings: ReadonlyMap<string, OpeningFacts>
  readonly heights: Heights
  readonly wallCount: number
  readonly openingCount: number
  /** Rooms with a stair use. */
  readonly stairRooms: number
  /**
   * How the floors are joined (LVL-3): stairs the plan states, with the figures Grid works out,
   * stair rooms and lift shafts that lie one over the other, and stair rooms or shafts out of line.
   */
  readonly connections: Connections
  /** Whether the plan states its north (CNT-3). The descriptions' sides stay the drawing's either way. */
  readonly northStated: boolean
}

export interface StairFacts {
  readonly id: string
  readonly name: string
  readonly lower: string
  readonly upper: string
  readonly risers: number
  readonly riserHeight: number
  readonly going: number
  readonly width: number
  /** The plan area of its flights and landings, m²: floor of the rooms it stands in, not added. */
  readonly footprint: number
}

export interface Connections {
  readonly stairs: readonly StairFacts[]
  /** Pairs of floors whose rooms used as a stair (or a lift) lie one over the other, lower first. */
  readonly stairRooms: readonly (readonly [string, string])[]
  readonly lifts: readonly (readonly [string, string])[]
  /** Pairs of floors whose stair rooms (or shafts) do not line up, lower first. */
  readonly outOfLine: readonly { readonly kind: 'stair' | 'lift'; readonly floors: readonly [string, string] }[]
  /** Floors with rooms that no stair, stated or drawn as a room, joins to another floor. */
  readonly unjoined: readonly string[]
}

/** How the floors are joined, from the one answer the way-out check reads (`floorJoins`). */
function connectionsOf(plan: FloorPlan, floors: readonly FloorFacts[]): Connections {
  const empty: Connections = { stairs: [], stairRooms: [], lifts: [], outOfLine: [], unjoined: [] }
  if (floors.length < 2) return empty
  const found = floorJoins(plan)
  const pairs = (kind: 'stair-room' | 'lift'): [string, string][] => {
    const seen = new Map<string, [string, string]>()
    for (const join of found.joins) if (join.kind === kind) seen.set(`${join.lower.floor}|${join.upper.floor}`, [join.lower.floor, join.upper.floor])
    return [...seen.values()]
  }
  const joined = new Set(found.joins.filter((j) => j.kind !== 'lift').flatMap((j) => [j.lower.floor, j.upper.floor]))
  return {
    stairs: found.stairs.map((stair) => ({
      id: stair.id,
      name: stair.name,
      lower: stair.lower.floor,
      upper: stair.upper.floor,
      risers: stair.risers,
      riserHeight: stair.riserHeight,
      going: stair.going,
      width: stair.width,
      footprint: stair.footprint,
    })),
    stairRooms: pairs('stair-room'),
    lifts: pairs('lift'),
    outOfLine: found.outOfLine.map((out) => ({ kind: out.kind, floors: [out.lower[0]!.floor, out.upper[0]!.floor] as const })),
    unjoined: floors.filter((floor) => floor.rooms.length > 0 && !joined.has(floor.id)).map((floor) => floor.id),
  }
}

/** How far a point may be from a wall's face and still be on it, in metres. */
const ON_FACE_M = 0.02
/**
 * A side of a room's outline lies along a wall when the sine of the angle between them is below
 * this. Not yet in MSG-15's table (`reviews/MSG-15.md` asks for an entry); kept here, once.
 */
export const ALONG_WALL_SINE = 1e-3
/** How much of a wall two rooms must share to be next to each other, in metres. */
const SHARED_M = 0.05

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The usual value, the one most things have; ties go to the smaller. */
function usual(values: readonly number[]): number | null {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: number | null = null
  let most = 0
  for (const [value, count] of counts) {
    if (count > most || (count === most && best !== null && value < best)) {
      best = value
      most = count
    }
  }
  return best
}

function shapeOf(polygon: readonly Vec2[], area: number): RoomShape {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const across = Math.max(...xs) - minX
  const up = Math.max(...ys) - minY
  const rectangle = polygon.length === 4 && Math.abs(across * up - area) < 0.01
  return { at: { x: minX, y: minY }, across, up, rectangle, area }
}

/**
 * The sides of a room's outline that lie on a wall's face, as the stretches of the wall's axis
 * they cover. `toward` is +1 for a room on the side the wall's normal points at, -1 for the other.
 */
function faceStretches(wall: Wall, polygon: readonly Vec2[], toward: 1 | -1): Array<readonly [number, number]> {
  const axis = wallAxis(wall)
  const half = wall.virtual === true ? 0 : wall.thickness / 2
  const off = (point: Vec2): number => dot(sub(point, axis.start), axis.normal) * toward - half
  const stretches: Array<readonly [number, number]> = []
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    const edge = sub(q, p)
    const length = Math.hypot(edge.x, edge.y)
    if (length < tolerance('noLength')) continue
    if (Math.abs(cross(edge, axis.dir)) / length > ALONG_WALL_SINE) continue
    if (Math.abs(off(p)) > ON_FACE_M || Math.abs(off(q)) > ON_FACE_M) continue
    const a = dot(sub(p, axis.start), axis.dir)
    const b = dot(sub(q, axis.start), axis.dir)
    stretches.push([Math.min(a, b), Math.max(a, b)])
  }
  return stretches
}

/** The stretch of the room's side on the wall's face that holds the point `along` the axis. */
function faceStretch(wall: Wall, polygon: readonly Vec2[], toward: 1 | -1, along: number): readonly [number, number] | null {
  return faceStretches(wall, polygon, toward).find(([lo, hi]) => along >= lo - ON_FACE_M && along <= hi + ON_FACE_M) ?? null
}

function sideOf(
  opening: Opening,
  wall: Wall,
  room: string,
  toward: 1 | -1,
  outlines: ReadonlyMap<string, RoomOutline>,
): OpeningSide {
  const axis = wallAxis(wall)
  const inward = { x: -axis.normal.x * toward, y: -axis.normal.y * toward }
  const polygon = outlines.get(room)!.polygon
  const stretch = faceStretch(wall, polygon, toward, opening.offset + opening.width / 2)
  const back = { x: -axis.dir.x, y: -axis.dir.y }
  return {
    room,
    face: compassOf(inward),
    corners: stretch === null
      ? null
      : [
          { toward: compassOf(back), distance: opening.offset - stretch[0] },
          { toward: compassOf(axis.dir), distance: stretch[1] - (opening.offset + opening.width) },
        ],
  }
}

/** What is past an opening's side with no room on it, read as the way-out check reads it. */
function beyond(wall: Wall, index: PlanIndex, outlines: ReadonlyMap<string, RoomOutline>): Beyond {
  if ((index.roomsByWall.get(wall.id) ?? []).some((room) => !outlines.has(room.id))) return 'a room left out'
  return wall.kind === 'exterior' ? 'outside' : 'nothing drawn'
}

/**
 * Every pair of rooms that meet across a wall: one on each face, along a shared stretch of
 * it. Only rooms that name the wall are tried, as for the rooms an opening joins.
 */
function neighboursOn(storey: FloorPlan, index: PlanIndex, outlines: ReadonlyMap<string, RoomOutline>): Map<string, Set<string>> {
  const next = new Map<string, Set<string>>()
  const meet = (a: string, b: string): void => {
    if (!next.has(a)) next.set(a, new Set())
    if (!next.has(b)) next.set(b, new Set())
    next.get(a)!.add(b)
    next.get(b)!.add(a)
  }
  for (const wall of storey.walls) {
    const named = (index.roomsByWall.get(wall.id) ?? []).filter((room) => outlines.has(room.id))
    if (named.length < 2) continue
    const on = (toward: 1 | -1): Array<{ room: string; lo: number; hi: number }> =>
      named.flatMap((room) => faceStretches(wall, outlines.get(room.id)!.polygon, toward).map(([lo, hi]) => ({ room: room.id, lo, hi })))
    const left = on(1)
    const right = on(-1)
    for (const a of left) {
      for (const b of right) {
        if (a.room !== b.room && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > SHARED_M) meet(a.room, b.room)
      }
    }
  }
  return next
}

/** A key for a floor's layout that leaves its ids out, and its ids in the same order. */
function layoutOf(storey: FloorPlan): { key: string; ids: string[] } {
  const n = (value: number): string => value.toFixed(4)
  const wallKey = new Map<string, string>()
  for (const wall of storey.walls) {
    wallKey.set(wall.id, [n(wall.start[0]), n(wall.start[1]), n(wall.end[0]), n(wall.end[1]), n(wall.thickness), n(wall.height), wall.kind, wall.virtual === true].join(','))
  }
  const entries: Array<[string, string]> = [
    ...storey.walls.map((wall): [string, string] => [`w${wallKey.get(wall.id)}`, wall.id]),
    ...storey.rooms.map((room): [string, string] => [
      `r${JSON.stringify([room.name, room.use ?? '', room.boundary.map((id) => wallKey.get(id) ?? '?'), ...(room.holes ?? []).map((hole) => hole.map((id) => wallKey.get(id) ?? '?'))])}`,
      room.id,
    ]),
    ...storey.openings.map((o): [string, string] => [
      `o${[wallKey.get(o.wall), o.type, n(o.offset), n(o.width), n(o.sill), n(o.height), o.hinge ?? '', o.swing ?? ''].join(',')}`,
      o.id,
    ]),
  ]
  entries.sort((a, b) => byText(a[0], b[0]) || byText(a[1], b[1]))
  return { key: entries.map((entry) => entry[0]).join('\n'), ids: entries.map((entry) => entry[1]) }
}

/** The prefixes that turn every id of one floor into the id in the same place on another, if there are such. */
function prefixSwap(from: readonly string[], to: readonly string[]): readonly [string, string] | null {
  let swap: readonly [string, string] | null = null
  for (let i = 0; i < from.length; i++) {
    const a = from[i]!
    const b = to[i]!
    let same = 0
    while (same < a.length && same < b.length && a[a.length - 1 - same] === b[b.length - 1 - same]) same++
    if (same === 0) return null
    const pair = [a.slice(0, a.length - same), b.slice(0, b.length - same)] as const
    if (swap === null) swap = pair
    else if (swap[0] !== pair[0] || swap[1] !== pair[1]) return null
  }
  return swap !== null && swap[0] !== swap[1] ? swap : null
}

function floorFacts(plan: FloorPlan, floor: Floor, named: boolean): FloorFacts {
  const { storey, leftOut } = drawable(planForFloor(plan, floor.id))
  const index = indexPlan(storey)
  const outlines = roomOutlines(storey, index, leftOut.rooms)
  const next = neighboursOn(storey, index, outlines)

  const rooms: RoomFacts[] = storey.rooms.map((room) => {
    const outline = outlines.get(room.id)
    return {
      id: room.id,
      name: room.name,
      ...(room.use === undefined ? {} : { use: room.use }),
      floor: floor.id,
      shape: outline === undefined ? null : shapeOf(outline.polygon, roomArea(room, index)),
      neighbours: [...(next.get(room.id) ?? [])].sort(byText),
    }
  })

  const openings: OpeningFacts[] = []
  for (const wall of storey.walls) {
    for (const opening of index.openingsByWall.get(wall.id) ?? []) {
      const [left, right] = openingSides(opening, index, outlines)
      const past = beyond(wall, index, outlines)
      openings.push({
        id: opening.id,
        type: opening.type,
        wall: wall.id,
        floor: floor.id,
        offset: opening.offset,
        width: opening.width,
        sill: opening.sill,
        height: opening.height,
        sides: [
          left === null ? past : sideOf(opening, wall, left, 1, outlines),
          right === null ? past : sideOf(opening, wall, right, -1, outlines),
        ],
      })
    }
  }

  const openSides: OpenSide[] = []
  for (const wall of storey.walls) {
    if (wall.virtual !== true) continue
    const [left, right] = sidesAt(wall, wallAxis(wall).length / 2, index, outlines)
    if (left !== null && right !== null && left !== right) openSides.push({ wall: wall.id, rooms: [left, right] })
  }

  const walls: WallFacts[] = storey.walls.map((wall) => ({
    id: wall.id,
    start: { x: wall.start[0], y: wall.start[1] },
    end: { x: wall.end[0], y: wall.end[1] },
    thickness: wall.thickness,
    height: wall.height,
    kind: wall.kind,
    virtual: wall.virtual === true,
  }))

  return {
    id: floor.id,
    name: named ? floor.name : null,
    level: floor.level,
    rooms,
    walls,
    openings,
    openSides,
    repeats: null,
    area: rooms.reduce((sum, room) => sum + (room.shape?.area ?? 0), 0),
    wallHeight: usual(storey.walls.filter((wall) => wall.virtual !== true).map((wall) => wall.height)),
    leftOut: [...leftOut.rooms, ...leftOut.openings].sort(byText),
  }
}

/**
 * The usual heights and the exceptions. A floor laid out like an earlier one adds no
 * exceptions of its own: they are the earlier floor's.
 */
function heightsOf(plan: FloorPlan, floors: readonly FloorFacts[]): Heights {
  const own = new Set(floors.filter((floor) => floor.repeats === null).map((floor) => floor.id))
  const usualOn = new Map(floors.map((floor) => [floor.id, floor.wallHeight]))
  const solid = plan.walls.filter((wall) => wall.virtual !== true)
  const wall = usual(solid.map((w) => w.height))
  const floorOfWall = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  const onOwn = (o: Opening): boolean => own.has(floorOfWall.get(o.wall) ?? DEFAULT_FLOOR_ID)
  const windows = plan.openings.filter((o) => o.type === 'window')
  const windowSill = usual(windows.map((o) => o.sill))
  const at = (o: Opening): HeightException => ({ id: o.id, floor: floorOfWall.get(o.wall) ?? DEFAULT_FLOOR_ID, value: o.sill })
  return {
    wall,
    floorWalls: floors.flatMap((floor) =>
      floor.repeats === null && floor.wallHeight !== null && floor.wallHeight !== wall ? [{ floor: floor.id, value: floor.wallHeight }] : []),
    walls: solid
      .filter((w) => own.has(floorOf(w)) && w.height !== usualOn.get(floorOf(w)))
      .map((w) => ({ id: w.id, floor: floorOf(w), value: w.height })),
    windowSill,
    windowSills: windows.filter((o) => o.sill !== windowSill && onOwn(o)).map(at),
    doorSills: plan.openings.filter((o) => o.type !== 'window' && o.sill > 0 && onOwn(o)).map(at),
  }
}

/** Everything `grid describe` says, from a plan that passed the schema. */
export function planFacts(plan: FloorPlan): PlanFacts {
  const registered = new Set((plan.floors ?? []).map((floor) => floor.id))
  const layouts = new Map<string, { floor: string; ids: string[] }>()
  const floors: FloorFacts[] = planFloors(plan).map((floor) => {
    const facts = floorFacts(plan, floor, registered.has(floor.id) || floor.id === DEFAULT_FLOOR_ID)
    const layout = layoutOf(planForFloor(plan, floor.id))
    const earlier = facts.rooms.length > 0 ? layouts.get(layout.key) : undefined
    if (earlier === undefined) {
      layouts.set(layout.key, { floor: floor.id, ids: layout.ids })
      return facts
    }
    return { ...facts, repeats: { of: earlier.floor, prefix: prefixSwap(earlier.ids, layout.ids) } }
  })
  return {
    floors,
    rooms: new Map(floors.flatMap((floor) => floor.rooms.map((room) => [room.id, room] as const))),
    openings: new Map(floors.flatMap((floor) => floor.openings.map((o) => [o.id, o] as const))),
    heights: heightsOf(plan, floors),
    wallCount: plan.walls.length,
    openingCount: plan.openings.length,
    stairRooms: plan.rooms.filter((room) => room.use === 'stair').length,
    connections: connectionsOf(plan, floors),
    northStated: typeof plan.north === 'number',
  }
}
