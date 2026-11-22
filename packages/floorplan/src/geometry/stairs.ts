/**
 * Stairs that join two floors (LVL-3, decided in LVL-2).
 *
 * A stair is stated once, as a designed object: the floor it starts on, the floor it ends on, its
 * width and its walking line (`Stair` in the schema). Everything else is worked out here, once,
 * for every view and check that reads a stair:
 *
 * - the rise, from the two floors' levels (LVL-1) and the floor offsets of the rooms it starts
 *   and ends in (LVL-7);
 * - the number of risers (the plan's, when it states one), their height, the going and the
 *   pitch;
 * - the flights and landings on plan, the riser lines across them, and the steps in 3D;
 * - the room it leaves from and the room it arrives in, which join the two floors for the
 *   way-out check (`floorJoins`).
 *
 * The walking line runs down the middle of the flight. Each point between its ends is a turn,
 * with a square landing as wide as the flight centred on it. Every flight has at least one tread,
 * and its last riser rises onto the landing or the floor above, so a stair of n risers has n
 * minus its flights of treads. Nothing here judges a riser or a going: that is for a check that
 * applies a figure from a building code, in `packages/rules`.
 *
 * Pure, total and never throws: a stair that cannot be laid out is left out and its problem said.
 */

import type { FloorPlan, PlanIndex, Stair } from './plan'
import { indexPlan } from './plan'
import { planFloors, planForFloor, wholePlan } from './floors'
import { floorElevations } from './elevations'
import { roomFloorOffset } from './steps'
import { tryRoomPolygon } from './room'
import type { Vec2 } from './vec2'
import { add, area, distance, fromTuple, normalize, perp, scale, sub } from './vec2'
import { limit, tolerance } from './tolerances'
import { metresText } from './rounding'
import { quoted } from '../types/planText'

/** A line across the flight, from its left edge to its right, looking up the stair. */
export type RiserLine = readonly [Vec2, Vec2]

export interface StairFlight {
  /** The flight on plan: a rectangle as wide as the stair, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** Its stretch of the walking line, from its lower end to its upper end. */
  readonly from: Vec2
  readonly to: Vec2
  /** How many risers it climbs. Its first rises from the floor or landing below. */
  readonly risers: number
  /** How many of the stair's risers lie below it. */
  readonly risersBelow: number
  /** The depth of each of its treads, in metres. */
  readonly going: number
  /** Every riser's line, from the bottom: the first at `from`, the last at `to`. */
  readonly riserLines: readonly RiserLine[]
}

export interface StairLanding {
  /** A square as wide as the flight, centred on a turn of the walking line, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** How many of the stair's risers lie below it: its floor stands that many risers up. */
  readonly risersBelow: number
}

/** Where a stair starts or ends: the floor, and the room there, if any holds the end. */
export interface StairEnd {
  readonly floor: string
  readonly room: string | null
  /** The end of the walking line on that floor. */
  readonly at: Vec2
  /** The height of the floor there, in metres from the ground floor's level: storey and room offset. */
  readonly level: number
}

export interface StairLayout {
  readonly id: string
  readonly name: string
  /** As stated: the floor the walking line starts on, and the one it ends on. */
  readonly from: string
  readonly to: string
  /** The lower and the upper end, whichever of `from` and `to` each is. */
  readonly lower: StairEnd
  readonly upper: StairEnd
  readonly width: number
  /** The walking line, from the lower end to the upper end. */
  readonly line: readonly Vec2[]
  /** How far it climbs, in metres. */
  readonly rise: number
  readonly risers: number
  /** Whether the plan states the number of risers, or Grid worked it out. */
  readonly risersStated: boolean
  /** The height of each riser, in metres. */
  readonly riserHeight: number
  /** The depth of the shortest tread, in metres: every flight's going is at least this. */
  readonly going: number
  /** The steepest flight's pitch, in degrees from the horizontal. */
  readonly pitch: number
  readonly flights: readonly StairFlight[]
  readonly landings: readonly StairLanding[]
  /** The plan area of its flights and landings, in square metres, counted once for the stair. */
  readonly footprint: number
}

export type StairProblemCode =
  | 'stair/unknown-floor'
  | 'stair/same-floor'
  | 'stair/no-rise'
  | 'stair/run-too-short'
  | 'stair/too-few-risers'
  | 'stair/end-in-no-room'
  | 'stair/duplicate-id'

/** Why a stair is left out, or what is worth a look on one that is laid out. */
export interface StairProblem {
  readonly stair: string
  readonly code: StairProblemCode
  /** An error leaves the stair out; a warning keeps it and says what is worth a look. */
  readonly severity: 'error' | 'warning'
  readonly message: string
}

export interface PlanStairs {
  /** Every stair that could be laid out, in the plan's order. */
  readonly stairs: readonly StairLayout[]
  readonly problems: readonly StairProblem[]
}

const NO_STAIRS: PlanStairs = { stairs: [], problems: [] }

/** The most risers a stair is tried with when the plan states none: a 100 m climb at 0.17 m a riser. */
const MOST_RISERS = 600

/**
 * Treads for each flight: at least one each, `treads` in all, shared as the lengths are, so the
 * goings come out as near alike as whole treads allow.
 */
function shareTreads(lengths: readonly number[], treads: number): number[] {
  const total = lengths.reduce((a, b) => a + b, 0)
  const counts = lengths.map((l) => Math.max(1, Math.round((l * treads) / total)))
  const going = (i: number): number => lengths[i]! / counts[i]!
  let sum = counts.reduce((a, b) => a + b, 0)
  while (sum > treads) {
    // Take a tread from the flight whose treads are shortest, keeping one on each.
    let pick = -1
    for (let i = 0; i < counts.length; i++) if (counts[i]! > 1 && (pick < 0 || going(i) < going(pick))) pick = i
    if (pick < 0) break
    counts[pick]!--
    sum--
  }
  while (sum < treads) {
    // Give one to the flight whose treads are longest.
    let pick = 0
    for (let i = 1; i < counts.length; i++) if (going(i) > going(pick)) pick = i
    counts[pick]!++
    sum++
  }
  return counts
}

/**
 * The number of risers when the plan states none: the one that brings twice the riser plus the
 * mean going nearest the stride (`stairStepLength`). At least two per flight, one tread each.
 */
function workedRisers(rise: number, lengths: readonly number[]): number {
  const flights = lengths.length
  const run = lengths.reduce((a, b) => a + b, 0)
  const stride = limit('stairStepLength')
  let best = 2 * flights
  let bestScore = Infinity
  for (let n = 2 * flights; n <= MOST_RISERS; n++) {
    const score = Math.abs((2 * rise) / n + run / (n - flights) - stride)
    if (score < bestScore) {
      best = n
      bestScore = score
    }
  }
  return best
}

/** A rectangle along `from`→`to`, `half` either side, counter-clockwise. */
function band(from: Vec2, to: Vec2, half: number): Vec2[] {
  const side = scale(perp(normalize(sub(to, from))), half)
  return [sub(from, side), sub(to, side), add(to, side), add(from, side)]
}

/** A square of side `2·half` centred on `at`, its sides along `dir`, counter-clockwise. */
function square(at: Vec2, dir: Vec2, half: number): Vec2[] {
  const along = scale(dir, half)
  return band(sub(at, along), add(at, along), half)
}

/** Even-odd ray cast. */
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

/** One floor's rooms that can be drawn, with their outlines, smallest first. */
interface FloorRooms {
  readonly rooms: readonly { readonly id: string; readonly outline: readonly Vec2[]; readonly offset: number }[]
}

function floorRooms(plan: FloorPlan, floor: string, broken: (slice: FloorPlan) => ReadonlySet<string>): FloorRooms {
  const slice = planForFloor(plan, floor)
  const index: PlanIndex = indexPlan(slice)
  const left = broken(slice)
  const rooms = slice.rooms.flatMap((room) => {
    if (left.has(room.id)) return []
    const outline = tryRoomPolygon(room, index)
    return outline === null ? [] : [{ id: room.id, outline, offset: roomFloorOffset(room), size: area(outline) }]
  })
  // The smallest room that holds a point is the one there: a lift pod inside a hall.
  rooms.sort((a, b) => a.size - b.size)
  return { rooms }
}

/**
 * The room an end of the walking line stands in: the one that holds the end, or, when the end
 * sits on a wall's face or a room's edge, the point a step past it, away from the stair.
 */
function roomAt(found: FloorRooms, at: Vec2, away: Vec2): { id: string; offset: number } | null {
  const step = tolerance('stepPastFace')
  for (const point of [at, add(at, scale(away, step))]) {
    const room = found.rooms.find((r) => contains(r.outline, point))
    if (room !== undefined) return { id: room.id, offset: room.offset }
  }
  return null
}

/** The direction from `b` to `a`, or none when they coincide. */
const away = (a: Vec2, b: Vec2): Vec2 => (distance(a, b) > 0 ? normalize(sub(a, b)) : { x: 0, y: 0 })

const known = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= tolerance('largest')

/**
 * Lays out one stair from its two ends' levels. Null, with the problem said, when it cannot be.
 */
function layOut(
  stair: Stair,
  name: string,
  ends: { readonly from: StairEnd; readonly to: StairEnd },
  problems: StairProblem[]
): StairLayout | null {
  const fail = (code: StairProblemCode, message: string): null => {
    problems.push({ stair: stair.id, code, severity: 'error', message })
    return null
  }
  const upward = ends.to.level >= ends.from.level
  const lower = upward ? ends.from : ends.to
  const upper = upward ? ends.to : ends.from
  const rise = upper.level - lower.level
  if (rise < tolerance('sameFloorLevel')) {
    return fail(
      'stair/no-rise',
      `Stair ${quoted(stair.id)} joins floors that stand at one height, so it climbs nothing; ` +
        'state the floors\' elevations, or join two floors at different heights.'
    )
  }

  // From the lower end up, so every figure below reads upwards.
  const stated = stair.run.map(fromTuple)
  const line = upward ? stated : [...stated].reverse()
  const half = stair.width / 2
  const turns = line.length - 2
  const flightsAt: { from: Vec2; to: Vec2; dir: Vec2 }[] = []
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!
    const b = line[i + 1]!
    const length = distance(a, b)
    const cut = (i > 0 ? half : 0) + (i < line.length - 2 ? half : 0)
    if (length - cut < tolerance('lineInside')) {
      return fail(
        'stair/run-too-short',
        `Stair ${quoted(stair.id)} has a stretch of its walking line ${metresText(length)} m long, too short for a flight ` +
          (cut > 0 ? `once its landings, as wide as the stair (${metresText(stair.width)} m), are taken off` : 'with a tread on it') +
          '; lengthen the stretch, or leave out the turn.'
      )
    }
    const dir = normalize(sub(b, a))
    flightsAt.push({ from: i > 0 ? add(a, scale(dir, half)) : a, to: i < line.length - 2 ? sub(b, scale(dir, half)) : b, dir })
  }
  const lengths = flightsAt.map((f) => distance(f.from, f.to))
  const fewest = 2 * flightsAt.length
  const risersStated = stair.risers !== undefined
  const risers = stair.risers ?? workedRisers(rise, lengths)
  if (risers < fewest) {
    return fail(
      'stair/too-few-risers',
      `Stair ${quoted(stair.id)} states ${risers} riser${risers === 1 ? '' : 's'}, but its ${flightsAt.length} flight${flightsAt.length === 1 ? '' : 's'} ` +
        `need at least ${fewest}: one tread on each, and one riser up from each; state more, or leave the number out.`
    )
  }
  const treads = shareTreads(lengths, risers - flightsAt.length)
  const riserHeight = rise / risers

  const flights: StairFlight[] = []
  const landings: StairLanding[] = []
  let below = 0
  flightsAt.forEach((flight, i) => {
    const going = lengths[i]! / treads[i]!
    const side = scale(perp(flight.dir), half)
    const riserLines: RiserLine[] = []
    for (let k = 0; k <= treads[i]!; k++) {
      const at = add(flight.from, scale(flight.dir, k * going))
      riserLines.push([add(at, side), sub(at, side)])
    }
    flights.push({
      outline: band(flight.from, flight.to, half),
      from: flight.from,
      to: flight.to,
      risers: treads[i]! + 1,
      risersBelow: below,
      going,
      riserLines
    })
    below += treads[i]! + 1
    if (i < turns) landings.push({ outline: square(line[i + 1]!, flight.dir, half), risersBelow: below })
  })
  const going = Math.min(...flights.map((f) => f.going))
  const pitch = (Math.atan2(riserHeight, going) * 180) / Math.PI

  return {
    id: stair.id,
    name,
    from: stair.from,
    to: stair.to,
    lower,
    upper,
    width: stair.width,
    line,
    rise,
    risers,
    risersStated,
    riserHeight,
    going,
    pitch,
    flights,
    landings,
    footprint: [...flights.map((f) => area(f.outline)), ...landings.map((l) => area(l.outline))].reduce((a, b) => a + b, 0)
  }
}

/** What validation leaves out of a floor's slice, without the checks that read the whole plan. */
export type BrokenOnFloor = (slice: FloorPlan) => ReadonlySet<string>

/**
 * Every stair in the plan, laid out, and what stands in the way of the rest. A floor's slice
 * (`planForFloor`) reads the stairs of the plan it was cut from that start or end on its floor.
 *
 * `broken` says which rooms of a floor cannot be drawn: they hold no end of a stair. The
 * validation passes its own answer, so this never asks it again.
 */
export function planStairs(plan: FloorPlan, broken: BrokenOnFloor): PlanStairs {
  const { whole, floor: sliceFloor } = wholePlan(plan)
  const stairs = whole.stairs ?? []
  if (stairs.length === 0) return NO_STAIRS
  const floors = new Map(planFloors(whole).map((f) => [f.id, f] as const))
  const elevations = floorElevations(whole)
  const roomsOn = new Map<string, FloorRooms>()
  const rooms = (floor: string): FloorRooms => {
    let found = roomsOn.get(floor)
    if (found === undefined) {
      found = floorRooms(whole, floor, broken)
      roomsOn.set(floor, found)
    }
    return found
  }

  const laidOut: StairLayout[] = []
  const problems: StairProblem[] = []
  const seen = new Set<string>()
  for (const stair of stairs) {
    if (sliceFloor !== null && stair.from !== sliceFloor && stair.to !== sliceFloor) continue
    const name = stair.name ?? stair.id
    if (seen.has(stair.id)) {
      problems.push({
        stair: stair.id,
        code: 'stair/duplicate-id',
        severity: 'error',
        message: `Two stairs share the id ${quoted(stair.id)}; the second is left out. Give each stair an id of its own.`
      })
      continue
    }
    seen.add(stair.id)
    const unknown = [stair.from, stair.to].filter((id) => !floors.has(id))
    if (unknown.length > 0) {
      problems.push({
        stair: stair.id,
        code: 'stair/unknown-floor',
        severity: 'error',
        message: `Stair ${quoted(stair.id)} joins ${[...new Set(unknown)].map(quoted).join(' and ')}, which the plan does not know as a floor, so it is left out.`
      })
      continue
    }
    if (stair.from === stair.to) {
      problems.push({
        stair: stair.id,
        code: 'stair/same-floor',
        severity: 'error',
        message: `Stair ${quoted(stair.id)} starts and ends on ${quoted(floors.get(stair.from)!.name || stair.from)}; a stair joins two floors. A step inside a floor is a room's floorOffset.`
      })
      continue
    }
    const points = stair.run.map(fromTuple)
    if (!points.every((p) => known(p.x) && known(p.y)) || !known(stair.width)) {
      problems.push({
        stair: stair.id,
        code: 'stair/run-too-short',
        severity: 'error',
        message: `Stair ${quoted(stair.id)} has a point or a width past the size Grid accepts, so it is left out.`
      })
      continue
    }
    // An end's room: the one the walking line's end stands in, stepping away from the stair.
    const first = points[0]!
    const last = points[points.length - 1]!
    const end = (floor: string, at: Vec2, outward: Vec2): StairEnd => {
      const room = roomAt(rooms(floor), at, outward)
      return { floor, room: room?.id ?? null, at, level: (elevations.floors.get(floor)?.floorLevel ?? 0) + (room?.offset ?? 0) }
    }
    const ends = {
      from: end(stair.from, first, away(first, points[1]!)),
      to: end(stair.to, last, away(last, points[points.length - 2]!))
    }
    const layout = layOut(stair, name, ends, problems)
    if (layout === null) continue
    laidOut.push(layout)
    for (const side of [layout.lower, layout.upper]) {
      if (side.room !== null) continue
      const floorName = floors.get(side.floor)!.name || side.floor
      problems.push({
        stair: stair.id,
        code: 'stair/end-in-no-room',
        severity: 'warning',
        message:
          `Stair ${quoted(stair.id)} ${side === layout.lower ? 'starts' : 'arrives'} on ${quoted(floorName)} in no room, so it joins nothing there ` +
          'and the way-out check does not go up or down it. Draw the room it ' +
          `${side === layout.lower ? 'starts from' : 'arrives in'}, or move the end of its walking line into one.`
      })
    }
  }
  return { stairs: laidOut, problems }
}
