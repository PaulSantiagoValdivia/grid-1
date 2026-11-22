/**
 * Net, gross internal and gross external area, per floor and per use, each saying what it
 * measures (ARE-9), named as the ARE-8 decision says.
 *
 * Every figure here follows Grid's own rule, described in Grid's own words in `MEASURES`: what it
 * measures, what it does not take off, and what the plan cannot say. No figure is said to be
 * measured to a published standard. A standard's rule would come in only as a figure record with
 * its document, edition, clause, place, day read and status, and none is carried yet.
 *
 * The figures come from the spaces the walls enclose (`spaces.ts`), so that on every floor
 *
 *     gross external = net + rooms named outside + walls + floor no room claims − off its space
 *
 * holds to the last digit the arithmetic keeps, and gross internal is the same with the outer
 * walls left out. `off its space` is room floor that is not enclosed floor counted once: rooms
 * that overlap, or that run over walls or outside them. On a plan without such faults it is 0
 * (validation names each one: `room/overlap`, `room/space-mismatch`).
 *
 * Which walls face outside is the one answer `exposure.ts` gives (MSG-13), stretch by stretch.
 * Gross internal is the outline of the floor less those stretches of wall, keeping only the parts
 * that hold enclosed floor, so the square at an outside corner and a garden wall standing apart
 * go with the outer walls.
 *
 * Pure: a plan in, numbers and sentences out. The join is done by `polygon-clipping` (MIT).
 */

import { planInState } from './phases'
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { indexPlan } from './plan'
import { floorOf, planFloors, wallsOnFloor } from './floors'
import { roomFloorArea, tryRoomPolygon } from './room'
import { floorSpaces, spacesKnown, type FloorSpaces } from './spaces'
import { planWallSides, type WallSides } from './exposure'
import { validatePlan } from './validate'
import { floorJoins } from './floorJoins'
import { cornerFills, inPolygon, polygonArea, strip, union } from './polygons'
import { roomZones } from './zones'
import { statedOutline } from './massing'
import { TOLERANCES, tolerance } from './tolerances'
import type { Vec2 } from './vec2'

/** The three measures, and the floor by headroom band (LVL-6). */
export type Measure = 'net' | 'grossInternal' | 'grossExternal' | 'headroom'
export type GrossMeasure = 'grossInternal' | 'grossExternal'

/** A measure described in Grid's own words. No standard's text, and no standard's name. */
export interface MeasureRule {
  readonly measure: Measure
  /** What it is called in an answer. */
  readonly name: string
  /** What it measures, in one sentence. */
  readonly measures: string
  /** What it does not take off. */
  readonly notTakenOff: string
  /** What the plan cannot say, that a reader may assume. */
  readonly cannotSay: string
}

/**
 * The measures table. `docs/areas.md` holds the same table; a test fails
 * when the two differ.
 */
export const MEASURES: Readonly<Record<Measure, MeasureRule>> = {
  net: {
    measure: 'net',
    name: 'Net area',
    measures: 'Net area is the floor inside each room, measured to the faces of its walls, less any hole in it and any room drawn inside it; a stair drawn as a room on floor after floor counts once, on the floor it rises from.',
    notTakenOff: 'Nothing inside a room is taken off: fixed units, a column drawn without walls and floor under a low ceiling all count.',
    cannotSay: 'The plan cannot say which rooms the reader counts: a balcony or a store drawn as a room counts unless it is named as outside.',
  },
  grossInternal: {
    measure: 'grossInternal',
    name: 'Gross internal area',
    measures: 'Gross internal area is the floor inside the inside face of the walls that face outside, with the inner walls and partitions counted.',
    notTakenOff: 'Inner walls, partitions, stairs and floor no room claims are not taken off.',
    cannotSay: 'Which walls face outside is worked out from the rooms beside them; the plan cannot say whether floor no room claims, such as a courtyard or a light well, is covered, so it counts.',
  },
  grossExternal: {
    measure: 'grossExternal',
    name: 'Gross external area',
    measures: 'Gross external area is the floor inside the outside face of the walls, every wall counted.',
    notTakenOff: 'Outer walls, inner walls and floor no room claims are not taken off.',
    cannotSay: 'The plan cannot say which walls are shared with a neighbour, so a shared wall counts in full, and a wall standing apart counts too.',
  },
  headroom: {
    measure: 'headroom',
    name: 'Area by headroom',
    measures: `Area by headroom is the floor of each room with at least ${TOLERANCES.headroomLow.value} m, and with at least ${TOLERANCES.headroomFull.value} m, of height over it, from the room's floor to its ceiling or to the underside of the roof its floor states, whichever is lower.`,
    notTakenOff: 'It is part of the net area: nothing standing in the room is taken off, and floor under a lowered zone of the ceiling counts by that zone\'s height.',
    cannotSay: 'The plan cannot say how deep the roof is built up or where a low slope is boxed in, so the height is taken to the roof\'s underside as stated, from its eaves on the outside walls\' lines.',
  },
}

/**
 * The gross measure Grid gives first, by the country the plan will be built in (ARE-8): the inside
 * face in the UK and most of Europe, the outside face for homes in the US. Elsewhere there is no
 * usual one, and both are given. This is the decision recorded on ARE-8, not a figure read from
 * any document; it names no standard.
 */
const INSIDE_FACE: ReadonlySet<string> = new Set([
  'GB', 'IE', 'FR', 'DE', 'ES', 'PT', 'IT', 'NL', 'BE', 'LU', 'AT', 'CH', 'DK', 'SE', 'NO', 'FI',
  'IS', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'RO', 'BG', 'GR', 'CY', 'MT', 'EE', 'LV', 'LT',
])
const OUTSIDE_FACE: ReadonlySet<string> = new Set(['US'])

/** The gross measure usual where the plan will be built, or null when Grid has none for that place. */
export function usualGross(country: string | undefined): GrossMeasure | null {
  const code = (country ?? '').trim().toUpperCase()
  if (INSIDE_FACE.has(code)) return 'grossInternal'
  if (OUTSIDE_FACE.has(code)) return 'grossExternal'
  return null
}

/** A room as the areas count it. */
export interface RoomAreaFigure {
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly floor: string
  /** Net, as Grid measures a room everywhere (`roomArea`). */
  readonly area: number
  /** Named as outside by the caller: listed apart, in no net or gross internal figure. */
  readonly outside: boolean
  /**
   * CNT-8: the room this one is a zone of, or null. A zone is listed and measured, and is in no
   * figure: its floor is its room's. Its area goes to `byUse` under its own use, out of its room's.
   */
  readonly zoneOf: string | null
  /**
   * SHT-11, lab DR-5: on a room used as a stair that lies over a stair room on the floor below
   * (LVL-3's join), the stair room its floor is counted with: the lowest of the rooms the stair
   * rises through. The room keeps its area, and is in no net figure. Absent on every other room.
   */
  readonly countedWith?: { readonly floor: string; readonly room: string }
}

/** A room Grid could not draw, so it is in no figure. */
export interface RoomLeftOut {
  readonly id: string
  readonly name: string
  readonly floor: string
}

export interface FloorAreaFigures {
  readonly floor: string
  /** The rooms that are counted, in plan order. */
  readonly rooms: readonly RoomAreaFigure[]
  /** Rooms on this floor that could not be drawn: in no figure here. */
  readonly leftOut: readonly RoomLeftOut[]
  /** The rooms not named outside, less the stair rooms counted with the one below (`overStairs`), and no zone (CNT-8). */
  readonly net: number
  /** `net` by room use; a room with none is under `not said`. Adds up to `net`. */
  readonly byUse: Readonly<Record<string, number>>
  /** The rooms named outside. */
  readonly outsideRooms: number
  /** SHT-11: the stair rooms over a stair room below, whose floor is counted there (`countedWith`). */
  readonly overStairs: number
  /** The rest are null when the floor's spaces could not be worked out (`why`). */
  readonly grossExternal: number | null
  readonly grossInternal: number | null
  /** Every solid wall, with the corners made good between them. */
  readonly walls: number | null
  /** The part of `walls` outside the inside face of the outer walls: gross external less gross internal, less outside rooms. */
  readonly outerWalls: number | null
  /** Enclosed floor no room claims. */
  readonly unclaimed: number | null
  /** Room floor that is not enclosed floor counted once: overlaps, and rooms over or outside walls. 0 on a sound plan. */
  readonly offSpace: number | null
  /** Why a gross figure is null, in a sentence; null when both are known. */
  readonly why: string | null
  /** BRF-4 (C17): the floor is massing, an outline it states with no walls yet: gross external only. */
  readonly massing: boolean
}

/** A total, with the rule it follows. */
export interface AreaFigure {
  readonly measure: Measure
  /** Null when some floor's figure is unknown; `why` says which. */
  readonly area: number | null
  readonly rule: MeasureRule
  readonly why: string | null
}

/** Which gross measure the answer gives first, and why. */
export interface ReaderMeasure {
  /** The measures to give, in order. Both when none is usual or both were asked for. */
  readonly gross: readonly GrossMeasure[]
  /** `asked`: the caller named it. `country`: usual where the plan will be built. `none`: no country, or none usual there. */
  readonly chosen: 'asked' | 'country' | 'none'
  readonly country: string | null
  /** In a sentence. */
  readonly why: string
}

export interface PlanAreaFigures {
  readonly floors: readonly FloorAreaFigures[]
  readonly net: AreaFigure
  readonly grossInternal: AreaFigure
  readonly grossExternal: AreaFigure
  /** Net by use over the floors given. Adds up to the net total. */
  readonly byUse: Readonly<Record<string, number>>
  readonly outsideRooms: number
  readonly leftOut: readonly RoomLeftOut[]
  readonly reader: ReaderMeasure
  readonly notes: readonly string[]
}

export interface AreaOptions {
  readonly index?: PlanIndex
  /** Ids the drawing's checks mark as broken; worked out with `validatePlan` when not given. */
  readonly broken?: ReadonlySet<string>
  /** Room ids to list apart, such as a balcony: in no net or gross internal figure. */
  readonly outside?: ReadonlySet<string>
  /** Only these floors, in plan order. Every floor when not given. */
  readonly floors?: readonly string[]
  /** Where the plan will be built, as a two-letter country code. */
  readonly country?: string
  /** The gross measure asked for. The usual one for `country` when not given. */
  readonly gross?: GrossMeasure | 'both'
}

const NOT_SAID = 'not said'
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)
const nameOf = (room: Room): string => (room.name.trim() === '' ? room.id : room.name)

/** The walls `floorSpaces` joins on this floor, in plan order. */
export function floorWalls(plan: FloorPlan, floor: string, broken: ReadonlySet<string>): Wall[] {
  // LVL-5: a wall through floors is one of each floor's it stands on.
  return wallsOnFloor(plan, floor).filter(
    (wall) =>
      !broken.has(wall.id) &&
      (wall.start[0] !== wall.end[0] || wall.start[1] !== wall.end[1]) &&
      (wall.virtual === true || wall.thickness > 0)
  )
}

/**
 * The stretches of a solid wall that face outside, along it from its start, each longer than
 * `lineInside`. A stretch with no room on either face (where a partition runs into the wall, or
 * round a corner) goes with the outer stretches when they lie on both sides of it, or on one side
 * with the wall's end on the other.
 */
function outerStretches(sides: WallSides | undefined, length: number): (readonly [number, number])[] {
  if (sides === undefined) return []
  if (sides.stated === 'exterior') return [[0, length]]
  const list = sides.stretches
  const outer = (i: number): boolean | null => (i < 0 || i >= list.length ? null : list[i]!.worked === 'exterior')
  const out: [number, number][] = []
  list.forEach((stretch, i) => {
    const before = outer(i - 1)
    const after = outer(i + 1)
    const faces = stretch.worked === 'exterior' || (stretch.worked === 'detached' && before !== false && after !== false && (before === true || after === true))
    if (!faces) return
    const last = out[out.length - 1]
    if (last !== undefined && stretch.from - last[1] <= tolerance('noLength')) last[1] = stretch.to
    else out.push([stretch.from, stretch.to])
  })
  return out.filter(([from, to]) => to - from >= tolerance('lineInside'))
}


/**
 * The floor inside the inside face of the walls that face outside, inner walls counted: the
 * floor's outline, as `spaces.ts` joins it, less the outer stretches of wall, keeping the parts
 * that hold enclosed floor. Null with a reason when no wall on the floor faces outside.
 */
interface Run {
  readonly wall: Wall
  readonly start: Vec2
  readonly dir: Vec2
  readonly length: number
}

const runsOf = (walls: readonly Wall[]): Run[] =>
  walls.map((wall) => {
    const start = { x: wall.start[0], y: wall.start[1] }
    const dx = wall.end[0] - start.x
    const dy = wall.end[1] - start.y
    const length = Math.hypot(dx, dy)
    return { wall, start, dir: { x: dx / length, y: dy / length }, length }
  })

/**
 * The stretches of the solid walls that face outside, as strips, with the corners made good
 * between two of them (MSG-13): what gross internal takes off the outline, and what a parapet
 * stands on (LVL-4). Empty when no wall faces outside.
 */
function outerStrips(runs: readonly Run[], sides: ReadonlyMap<string, WallSides>, lineHalf: number, snap: (v: number) => number): Polygon[] {
  const join = tolerance('gap')
  const outer = runs.filter((r) => r.wall.virtual !== true).flatMap((r) => outerStretches(sides.get(r.wall.id), r.length).map((s) => ({ run: r, s })))
  const cuts: Polygon[] = outer.map(({ run, s: [from, to] }) => {
    const a = from <= tolerance('noLength') ? -join : from
    const b = to >= run.length - tolerance('noLength') ? run.length + join : to
    const at = { x: run.start.x + run.dir.x * a, y: run.start.y + run.dir.y * a }
    return strip(at, run.dir, b - a, run.wall.thickness / 2, 0, snap)
  })
  // The corners made good between two outer stretches go with them.
  const outerRuns = outer.map(({ run, s: [from, to] }) => ({ wall: run.wall, start: { x: run.start.x + run.dir.x * from, y: run.start.y + run.dir.y * from }, dir: run.dir, length: to - from }))
  cuts.push(...cornerFills(outerRuns, lineHalf, snap))
  return cuts
}

const reachOf = (walls: readonly Wall[]): number => {
  let reach = 0
  for (const wall of walls) reach = Math.max(reach, ...wall.start.map(Math.abs), ...wall.end.map(Math.abs))
  return reach
}

/**
 * The floor inside the inside face of the walls that face outside, inner walls counted: the
 * floor's outline, as `spaces.ts` joins it, less the outer stretches of wall, keeping the parts
 * that hold enclosed floor. Null with a reason when no wall on the floor faces outside.
 */
function insideFace(walls: readonly Wall[], spaces: FloorSpaces, sides: ReadonlyMap<string, WallSides>): number | string {
  if (spaces.spaces.length === 0) return 0
  const join = tolerance('gap')
  const reach = reachOf(walls)
  const runs = runsOf(walls)
  const solid = runs.filter((r) => r.wall.virtual !== true)
  if (outerStrips(solid, sides, 0, (v) => v).length === 0) return 'no wall on this floor faces outside, so the inside face of the outer walls is not known'
  let failure: unknown = null
  for (const grid of TOLERANCES.joinGrids.values) {
    try {
      const steps = grid === 0 ? 0 : Math.round(1 / grid)
      const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
      const lineHalf = Math.max(TOLERANCES.lineHalfWidth.value, 5 * grid, reach * TOLERANCES.farNoise.value)
      const bodies: Polygon[] = runs.map((r) => strip(r.start, r.dir, r.length, r.wall.virtual === true ? lineHalf : r.wall.thickness / 2, join, snap))
      const frame = union([...bodies, ...cornerFills(solid, lineHalf, snap)])
      const filled = union(frame.map((polygon) => [polygon[0]!]))
      const rest: MultiPolygon = polygonClipping.difference(filled, ...outerStrips(solid, sides, lineHalf, snap))
      return sum(rest.filter((piece) => spaces.spaces.some((space) => inPolygon(space.at, piece))).map(polygonArea))
    } catch (error) {
      failure = error
    }
  }
  return `the outer walls could not be cut from the floor (${failure instanceof Error ? failure.message : String(failure)})`
}

/**
 * The walls of one floor that face outside, as strips along them (LVL-4: what a parapet stands
 * on): the same stretches gross internal takes off. `walls` are the floor's walls as `floorSpaces`
 * joins them. Empty when none faces outside.
 */
export function outerWallBand(walls: readonly Wall[], sides: ReadonlyMap<string, WallSides>): Polygon[] {
  const solid = runsOf(walls).filter((r) => r.wall.virtual !== true)
  const lineHalf = Math.max(TOLERANCES.lineHalfWidth.value, reachOf(walls) * TOLERANCES.farNoise.value)
  return outerStrips(solid, sides, lineHalf, (v) => v)
}

function floorFigures(
  plan: FloorPlan,
  floor: string,
  index: PlanIndex,
  broken: ReadonlySet<string>,
  outside: ReadonlySet<string>,
  sides: () => ReadonlyMap<string, WallSides>,
  countedWith: ReadonlyMap<string, { readonly floor: string; readonly room: string }>
): FloorAreaFigures {
  const rooms: RoomAreaFigure[] = []
  const leftOut: RoomLeftOut[] = []
  const zones = roomZones(index)
  for (const room of plan.rooms) {
    if (floorOf(room) !== floor) continue
    // The rooms `floorSpaces` sets against the spaces, so that the figures add up.
    const outline = broken.has(room.id) ? null : tryRoomPolygon(room, index)
    if (outline === null || outline.length < 3) {
      leftOut.push({ id: room.id, name: nameOf(room), floor })
      continue
    }
    const zoneOf = zones.zoneOf.get(room.id) ?? null
    const below = outside.has(room.id) ? undefined : countedWith.get(`${floor}|${room.id}`)
    rooms.push({
      id: room.id,
      name: nameOf(room),
      use: room.use ?? null,
      floor,
      area: roomFloorArea(room, index, outline),
      outside: outside.has(room.id),
      zoneOf,
      ...(below === undefined ? {} : { countedWith: below }),
    })
  }
  // A zone is in no figure (CNT-8): its floor is its room's, counted once. A zone is in no stair
  // stack either (`stairStacks`), so it never has `countedWith`.
  const counted = rooms.filter((room) => !room.outside && room.zoneOf === null && room.countedWith === undefined)
  const overStairs = sum(rooms.filter((room) => room.countedWith !== undefined).map((room) => room.area))
  const byUse: Record<string, number> = {}
  const add = (use: string | null, value: number): void => {
    byUse[use ?? NOT_SAID] = (byUse[use ?? NOT_SAID] ?? 0) + value
  }
  for (const room of counted) {
    // A room with zones gives each zone's floor to the zone's use, and keeps the rest for its own.
    // Zones that hold more than the room (two that overlap) leave it to the room's own use.
    const own = rooms.filter((zone) => zone.zoneOf === room.id)
    const zoned = sum(own.map((zone) => zone.area))
    if (own.length === 0 || zoned > room.area + tolerance('areaReported')) {
      add(room.use, room.area)
      continue
    }
    // What is left is the room's own; a sliver left by rounding goes with the first zone, so the
    // uses still add up to the net area to the last digit.
    const rest = room.area - zoned
    own.forEach((zone, i) => add(zone.use ?? room.use, zone.area + (i === 0 && rest < tolerance('areaReported') ? rest : 0)))
    if (rest >= tolerance('areaReported')) add(room.use, rest)
  }
  const net = sum(counted.map((room) => room.area))
  const outsideRooms = sum(rooms.filter((room) => room.outside).map((room) => room.area))
  const base = { floor, rooms, leftOut, net, byUse, outsideRooms, overStairs }

  const spaces = floorSpaces(plan, floor, { index, broken })
  if (!spacesKnown(spaces)) {
    return { ...base, grossExternal: null, grossInternal: null, walls: null, outerWalls: null, unclaimed: null, offSpace: null, why: `the walls' outline could not be worked out: ${spaces.reason}`, massing: false }
  }
  const offSpace = spaces.roomArea - (spaces.floorArea - spaces.unclaimedArea)
  const walls = floorWalls(plan, floor, broken)
  if (walls.length === 0 && statedOutline(plan, floor) !== null) {
    // BRF-4 (C17): massing, an outline with no walls yet. Its outline is its outside face; it has
    // no inside face of walls to measure to until the walls are drawn.
    return { ...base, grossExternal: spaces.outlineArea, grossInternal: null, walls: 0, outerWalls: null, unclaimed: spaces.unclaimedArea, offSpace, why: MASSING_WHY, massing: true }
  }
  const inside = insideFace(walls, spaces, sides())
  const known = typeof inside === 'number'
  return {
    ...base,
    grossExternal: spaces.outlineArea,
    grossInternal: known ? Math.max(0, inside - outsideRooms) : null,
    walls: spaces.wallArea,
    outerWalls: known ? Math.max(0, spaces.outlineArea - inside) : null,
    unclaimed: spaces.unclaimedArea,
    offSpace,
    why: known ? null : inside,
    massing: false,
  }
}

/** BRF-4: why a massing floor has no gross internal area. */
export const MASSING_WHY = 'it is an outline with no walls yet, so there is no inside face of its walls to measure to; its gross external area is its outline'


/**
 * SHT-11, lab DR-5: the stair rooms whose floor is counted with a stair room below, by floor and
 * id, each with the lowest room of its stair. Rooms used as a stair on neighbouring floors are one
 * stair when LVL-3's way-out check joins them (`floorJoins`: they share at least
 * `stairRoomOverlap` of the smaller); its floor is counted once, on the floor it rises from.
 */
function stairStacks(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>): Map<string, { floor: string; room: string }> {
  const outlines = new Map<string, Map<string, Vec2[]>>()
  // CNT-8: a zone is part of its room, not a room of its own, so it is in no stack.
  const zones = roomZones(index)
  for (const room of plan.rooms) {
    if (room.use !== 'stair' || broken.has(room.id) || zones.zoneOf.has(room.id)) continue
    const outline = tryRoomPolygon(room, index)
    if (outline === null || outline.length < 3) continue
    const floor = floorOf(room)
    const rooms = outlines.get(floor) ?? new Map<string, Vec2[]>()
    rooms.set(room.id, outline)
    outlines.set(floor, rooms)
  }
  const stacks = new Map<string, { floor: string; room: string }>()
  if ([...outlines.values()].filter((rooms) => rooms.size > 0).length < 2) return stacks
  const below = new Map<string, { floor: string; room: string }>()
  // Only what the outlines hold: no stated stair is laid out here.
  for (const join of floorJoins({ ...plan, stairs: [] }, outlines, () => broken).joins) {
    if (join.kind !== 'stair-room') continue
    const key = `${join.upper.floor}|${join.upper.room}`
    // A room over two stair rooms below goes with the first found: it is still counted once.
    if (!below.has(key)) below.set(key, join.lower)
  }
  for (const key of below.keys()) {
    let lowest = below.get(key)!
    const seen = new Set([key])
    for (let next = below.get(`${lowest.floor}|${lowest.room}`); next !== undefined; next = below.get(`${lowest.floor}|${lowest.room}`)) {
      const at = `${next.floor}|${next.room}`
      if (seen.has(at)) break
      seen.add(at)
      lowest = next
    }
    stacks.set(key, lowest)
  }
  return stacks
}

function readerMeasure(options: AreaOptions): ReaderMeasure {
  const country = options.country === undefined || options.country.trim() === '' ? null : options.country.trim().toUpperCase()
  if (options.gross === 'both') return { gross: ['grossInternal', 'grossExternal'], chosen: 'asked', country, why: 'Both gross areas were asked for.' }
  if (options.gross !== undefined) return { gross: [options.gross], chosen: 'asked', country, why: `${MEASURES[options.gross].name} was asked for.` }
  const usual = usualGross(country ?? undefined)
  if (usual === 'grossInternal') return { gross: [usual], chosen: 'country', country, why: `For ${country} Grid gives the inside face of the outer walls first; gross external can be asked for.` }
  if (usual === 'grossExternal') return { gross: [usual], chosen: 'country', country, why: `For homes in ${country} Grid gives the outside face of the walls first; gross internal can be asked for.` }
  const usualWhere = 'the inside face is usual in the UK and most of Europe, the outside face for homes in the US'
  return {
    gross: ['grossInternal', 'grossExternal'],
    chosen: 'none',
    country,
    why: country === null
      ? `No country was given, so both gross areas are given: ${usualWhere}.`
      : `Grid has no usual gross measure for ${country}, so both are given: ${usualWhere}.`,
  }
}

const total = (measure: Measure, floors: readonly FloorAreaFigures[], pick: (f: FloorAreaFigures) => number | null): AreaFigure => {
  const unknown = floors.filter((f) => pick(f) === null)
  return {
    measure,
    area: unknown.length > 0 ? null : sum(floors.map((f) => pick(f)!)),
    rule: MEASURES[measure],
    why: unknown.length > 0 ? unknown.map((f) => `Floor ${JSON.stringify(f.floor)}: ${f.why ?? 'not known'}.`).join(' ') : null,
  }
}

/**
 * Net, gross internal and gross external area of the plan, per floor and per use, each with the
 * rule it follows. Never throws on a plan the schema reads: a figure that cannot be worked out is
 * null with the reason.
 */
export function planAreaFigures(stated: FloorPlan, given: AreaOptions = {}): PlanAreaFigures {
  // CNT-10: the areas of the building as it will be after the work.
  const plan = planInState(stated, 'after')
  const options = plan === stated ? given : { ...given, index: undefined, broken: undefined }
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? validatePlan(plan, index, { spaces: false }).broken
  const outside = options.outside ?? new Set<string>()
  let sides: ReadonlyMap<string, WallSides> | undefined
  const sidesOnce = (): ReadonlyMap<string, WallSides> => (sides ??= planWallSides(index))
  const stacks = stairStacks(plan, index, broken)
  const floors = planFloors(plan)
    .filter((floor) => options.floors === undefined || options.floors.includes(floor.id))
    .map((floor) => floorFigures(plan, floor.id, index, broken, outside, sidesOnce, stacks))

  const byUse: Record<string, number> = {}
  for (const f of floors) for (const [use, area] of Object.entries(f.byUse)) byUse[use] = (byUse[use] ?? 0) + area
  const leftOut = floors.flatMap((f) => f.leftOut)
  const reported = tolerance('areaReported')
  const notes: string[] = []
  if (leftOut.length > 0) {
    notes.push(`Left out of every figure, because Grid could not draw ${leftOut.length === 1 ? 'it' : 'them'}: ${leftOut.map((r) => JSON.stringify(r.name)).join(', ')}. grid_check says why.`)
  }
  const massing = floors.filter((f) => f.massing)
  if (massing.length > 0) {
    const names = new Map(planFloors(plan).map((f) => [f.id, f.name || f.id] as const))
    notes.push(
      `${massing.length === 1 ? 'Floor' : 'Floors'} ${massing.map((f) => JSON.stringify(names.get(f.floor) ?? f.floor)).join(', ')} ${massing.length === 1 ? 'is' : 'are'} massing, ` +
        `an outline with no walls yet: gross external area only, to the outline as stated, and no net or gross internal area until the walls and rooms are drawn.`
    )
  }
  const unclaimed = sum(floors.filter((f) => !f.massing).map((f) => f.unclaimed ?? 0))
  const where = floors.some((f) => statedOutline(plan, f.floor) !== null) ? "inside the walls, or inside a floor's stated outline," : 'inside the walls'
  if (unclaimed >= reported) notes.push(`${unclaimed.toFixed(2)} m² of floor ${where} belongs to no room: it is in the gross figures only.`)
  const off = sum(floors.map((f) => Math.abs(f.offSpace ?? 0)))
  if (off >= reported) notes.push(`${off.toFixed(2)} m² of the rooms' floor is counted twice, or lies on walls or outside them, so net plus walls plus unclaimed floor is not the gross; grid_check names the rooms.`)
  const outsideRooms = sum(floors.map((f) => f.outsideRooms))
  const over = rooms(floors).filter((room) => room.countedWith !== undefined)
  if (over.length > 0) {
    const names = new Map(plan.rooms.map((room) => [`${floorOf(room)}|${room.id}`, nameOf(room)] as const))
    const floorNames = new Map(planFloors(plan).map((f) => [f.id, f.name || f.id] as const))
    const lowest = [...new Map(over.map((room) => [`${room.countedWith!.floor}|${room.countedWith!.room}`, room.countedWith!] as const)).values()]
    for (const stair of lowest) {
      const above = over.filter((room) => room.countedWith!.floor === stair.floor && room.countedWith!.room === stair.room)
      notes.push(
        `${JSON.stringify(names.get(`${stair.floor}|${stair.room}`) ?? stair.room)} on ${JSON.stringify(floorNames.get(stair.floor) ?? stair.floor)} is a stair that rises through ` +
          `${above.length === 1 ? 'the stair room' : `${above.length} stair rooms`} over it (${above.map((room) => JSON.stringify(floorNames.get(room.floor) ?? room.floor)).join(', ')}): ` +
          `its floor is counted once, there, so ${sum(above.map((room) => room.area)).toFixed(2)} m² over it is in no net figure; the gross figures still hold it.`
      )
    }
  }
  if (rooms(floors).some((room) => room.outside)) notes.push('Rooms named as outside are listed apart: they are in no net or gross internal figure, and their floor is in the gross external one.')

  return {
    floors,
    net: total('net', floors, (f) => f.net),
    grossInternal: total('grossInternal', floors, (f) => f.grossInternal),
    grossExternal: total('grossExternal', floors, (f) => f.grossExternal),
    byUse,
    outsideRooms,
    leftOut,
    reader: readerMeasure(options),
    notes,
  }
}

const rooms = (floors: readonly FloorAreaFigures[]): RoomAreaFigure[] => floors.flatMap((f) => f.rooms)
