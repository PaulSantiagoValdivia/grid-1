/**
 * Opening patterns (LVL-8, C12): a facade's rhythm stated once, expanded into the plain openings a
 * person would place by hand.
 *
 * A pattern names one wall, one opening (type, width, height, sill, door fields), a `count` or a
 * `spacing` or both, the margins kept clear at the wall's ends, and the floors above to repeat it
 * on. `expandPatterns` turns every pattern into plain openings, appended after the plan's own, and
 * takes `patterns` off the plan, so whatever reads the result (the drawings, the checks, the
 * exports) reads plain openings and nothing else. It is the one place a pattern becomes openings.
 *
 * Where the openings go, along the wall's axis from its start (C2), between the start margin `a`
 * and the wall's length less the end margin, `b`:
 *
 * - `count` alone: spread evenly, the first opening's near edge at `a` and the last one's far edge
 *   at `b`; one opening alone sits in the middle;
 * - `spacing`, with or without `count`: one every `spacing` metres, centre to centre, the first at
 *   `a`; without a count, as many as fit before `b`.
 *
 * On a floor above, each opening stands where it stands on the pattern's wall, on the wall of that
 * floor in the same line (its body over the pattern wall's) that holds its whole width; its offset is
 * measured from that wall's own start. Offsets are kept to the micrometre, as a person writes them.
 *
 * Nothing is dropped in silence: a pattern that names a wall the plan does not have, that does not
 * fit, or whose openings would overlap another opening, take an id already taken, or find no wall
 * above, gives a drawing problem (`pattern/…`), and only what can be placed is placed.
 *
 * Pure, and never throws.
 */

import type { FloorPlan, Opening, Wall } from './plan'
import type { Issue } from './validate'
import { floorOf, planFloors } from './floors'
import { tolerance } from './tolerances'
import type { OpeningPattern } from '../types/floorplan'
import { PARTS_MAX, quoted } from '../types/planText'
import { likelyId } from '../types/nearest'
import { metresText } from './rounding'
import { wallLength, wallPointAt } from './wall'
import { curveFault, wallCurve } from './arc'

/** What expanding a plan's patterns gives. */
export interface PatternExpansion {
  /** The plan with every placed opening after its own, and no `patterns`. */
  readonly plan: FloorPlan
  /** What could not be placed, and why: one drawing problem each, about the pattern. */
  readonly issues: readonly Issue[]
  /** The ids of the openings each pattern placed, by pattern id, in the order they were placed. */
  readonly placed: ReadonlyMap<string, readonly string[]>
}

/** Kept to the micrometre, as a person writes a length: 3.6, never 3.5999999999999996. */
const written = (metres: number): number => Number(metres.toFixed(6)) + 0

/** One opening a pattern would place, before it is checked against the plan. */
interface Placement {
  readonly pattern: OpeningPattern
  readonly opening: Opening
}

function problem(pattern: OpeningPattern, code: string, message: string): Issue {
  return { entity: 'pattern', id: pattern.id, code, message, severity: 'error' }
}

const label = (pattern: OpeningPattern): string => `Opening pattern ${quoted(pattern.id)}`

/** A wall's axis, or null for a wall with no length or a number that is not finite. */
function axisOf(wall: Wall): { sx: number; sy: number; dx: number; dy: number; length: number } | null {
  const [sx, sy] = wall.start
  const ex = wall.end[0] - sx
  const ey = wall.end[1] - sy
  const length = Math.hypot(ex, ey)
  if (!Number.isFinite(length) || length <= tolerance('noLength')) return null
  return { sx, sy, dx: ex / length, dy: ey / length, length }
}

/** The near-edge offsets of a pattern's openings along a wall `length` long, or why it does not fit. */
function offsetsOn(pattern: OpeningPattern, length: number): number[] | string {
  const width = pattern.opening.width
  const a = pattern.margins?.start ?? 0
  const b = length - (pattern.margins?.end ?? 0)
  const free = b - a
  const over = tolerance('openingOverrun')
  const between = `between its margins, ${metresText(Math.max(0, free))} m of the wall's ${metresText(length)} m`
  if (free + over < width) return `has no room for one opening ${metresText(width)} m wide ${between}`
  const { count, spacing } = pattern
  if (spacing === undefined) {
    const n = count!
    if (n * width > free + over) return `needs ${metresText(n * width)} m for ${n} openings ${metresText(width)} m wide, and has ${between}`
    if (n === 1) return [a + (free - width) / 2]
    const step = (free - width) / (n - 1)
    return Array.from({ length: n }, (_, i) => a + i * step)
  }
  if (spacing + over < width) return `has a spacing of ${metresText(spacing)} m, less than its openings' width of ${metresText(width)} m: they would overlap`
  const fits = Math.floor((free - width + over) / spacing) + 1
  const n = count ?? fits
  if (n > fits) return `needs ${metresText((n - 1) * spacing + width)} m for ${n} openings ${metresText(spacing)} m apart, and has ${between}`
  return Array.from({ length: n }, (_, i) => a + i * spacing)
}

/**
 * The wall on `floor` in the same line as `base` whose body lies over the base wall's and holds the
 * stretch from `p0` to `p1` along it, the nearest such wall when several do; with the opening's
 * offset on it, from its own start.
 */
function wallAbove(walls: readonly Wall[], base: Wall, p0: readonly [number, number], p1: readonly [number, number], width: number): { wall: Wall; offset: number } | null {
  const over = tolerance('openingOverrun')
  let best: { wall: Wall; offset: number; off: number } | null = null
  for (const wall of walls) {
    if (wall.virtual === true || wall.arc !== undefined) continue
    const axis = axisOf(wall)
    if (axis === null) continue
    const along = (p: readonly [number, number]): number => (p[0] - axis.sx) * axis.dx + (p[1] - axis.sy) * axis.dy
    const across = (p: readonly [number, number]): number => Math.abs((p[0] - axis.sx) * -axis.dy + (p[1] - axis.sy) * axis.dx)
    const reach = (wall.thickness + base.thickness) / 2
    const off = Math.max(across(p0), across(p1))
    if (!(off <= reach)) continue
    const offset = Math.min(along(p0), along(p1))
    if (offset < -over || offset + width > axis.length + over) continue
    if (best === null || off < best.off) best = { wall, offset: Math.max(0, offset), off }
  }
  return best === null ? null : { wall: best.wall, offset: best.offset }
}

/**
 * CNT-18: on the floor above, the curved wall on the same circle as curved wall `base` (its centre
 * and radius within the two walls' half thicknesses) that holds the stretch of `base`'s curve from
 * `from` to `from + width`, with that stretch's offset along its own curve.
 */
function curveAbove(walls: readonly Wall[], base: Wall, from: number, width: number): { wall: Wall; offset: number } | null {
  const over = tolerance('openingOverrun')
  const at = wallPointAt(base, from)
  const own = wallCurve(base)!
  for (const wall of walls) {
    if (wall.virtual === true || wall.arc === undefined || curveFault(wall) !== null) continue
    const curve = wallCurve(wall)!
    const reach = (wall.thickness + base.thickness) / 2
    if (Math.hypot(curve.centre.x - own.centre.x, curve.centre.y - own.centre.y) > reach || Math.abs(curve.radius - own.radius) > reach) continue
    const turn = (Math.sign(curve.sweep) * (Math.atan2(at.y - curve.centre.y, at.x - curve.centre.x) - curve.startAngle)) % (2 * Math.PI)
    let offset = (turn < 0 ? turn + 2 * Math.PI : turn) * curve.radius
    // A curve running the other way holds the stretch from its far edge.
    if (Math.sign(curve.sweep) !== Math.sign(own.sweep)) offset -= width
    if (offset < -over || offset + width > curve.length + over) continue
    return { wall, offset: Math.max(0, offset) }
  }
  return null
}

/** The openings one pattern would place, and what stops the rest. */
function placementsOf(plan: FloorPlan, pattern: OpeningPattern, floorIds: readonly string[], issues: Issue[]): Placement[] {
  const named = plan.walls.filter((w) => w.id === pattern.wall)
  if (named.length === 0) {
    const near = likelyId(pattern.wall, plan.walls.map((w) => w.id))
    issues.push(problem(pattern, 'pattern/unknown-wall', `${label(pattern)} names wall ${quoted(pattern.wall)}, which the plan does not have, so none of its openings is placed${near === null ? '' : `; the nearest wall id is ${quoted(near)}`}`))
    return []
  }
  if (named.length > 1) {
    issues.push(problem(pattern, 'pattern/unknown-wall', `${label(pattern)} names wall ${quoted(pattern.wall)}, an id ${named.length} walls share, so its wall is not known and none of its openings is placed`))
    return []
  }
  const base = named[0]!
  // A curved wall's openings go along its curve (CNT-18, C13), its length along it.
  const curved = base.arc !== undefined && curveFault(base) === null
  const axis = curved ? { sx: 0, sy: 0, dx: 0, dy: 0, length: wallLength(base) } : base.arc !== undefined ? null : axisOf(base)
  if (axis === null) {
    issues.push(problem(pattern, 'pattern/does-not-fit', `${label(pattern)} is on wall ${quoted(base.id)}, which has no length to place openings along, so none of its openings is placed`))
    return []
  }
  const offsets = offsetsOn(pattern, axis.length)
  if (typeof offsets === 'string') {
    issues.push(problem(pattern, 'pattern/does-not-fit', `${label(pattern)} on wall ${quoted(base.id)} ${offsets}, so none of its openings is placed`))
    return []
  }
  const { type, width, sill, height, hinge, swing } = pattern.opening
  const make = (id: string, wall: string, offset: number): Opening => ({
    id,
    wall,
    type,
    offset: written(offset),
    width,
    sill,
    height,
    ...(hinge === undefined ? {} : { hinge }),
    ...(swing === undefined ? {} : { swing }),
  })
  const own = floorOf(base)
  const out: Placement[] = offsets.map((offset, i) => ({ pattern, opening: make(`${pattern.id}-${own}-${i + 1}`, base.id, offset) }))

  const floors: string[] = []
  for (const floor of pattern.floors ?? []) if (floor !== own && !floors.includes(floor)) floors.push(floor)
  for (const floor of floors) {
    if (!floorIds.includes(floor)) {
      const near = likelyId(floor, floorIds)
      issues.push(problem(pattern, 'pattern/unknown-floor', `${label(pattern)} is to be repeated on floor ${quoted(floor)}, which the plan does not have, so nothing is placed there${near === null ? '' : `; the nearest floor id is ${quoted(near)}`}`))
      continue
    }
    const walls = plan.walls.filter((w) => floorOf(w) === floor)
    const missed: number[] = []
    offsets.forEach((offset, i) => {
      const p0: [number, number] = [axis.sx + axis.dx * offset, axis.sy + axis.dy * offset]
      const p1: [number, number] = [axis.sx + axis.dx * (offset + width), axis.sy + axis.dy * (offset + width)]
      const above = curved ? curveAbove(walls, base, offset, width) : wallAbove(walls, base, p0, p1, width)
      if (above === null) missed.push(i + 1)
      else out.push({ pattern, opening: make(`${pattern.id}-${floor}-${i + 1}`, above.wall.id, above.offset) })
    })
    if (missed.length > 0) {
      const which = missed.length === offsets.length ? 'none of its openings' : `opening${missed.length === 1 ? '' : 's'} ${missed.join(', ')} of ${offsets.length}`
      issues.push(problem(pattern, 'pattern/no-wall-above', `${label(pattern)} finds no wall on floor ${quoted(floor)} in the line of wall ${quoted(base.id)} to hold ${which}, so ${missed.length === 1 ? 'it is' : 'they are'} not placed there`))
    }
  }
  return out
}

/**
 * The plan with its opening patterns expanded into plain openings, and what could not be placed.
 * A plan with no patterns is given back as it is. See the module's header for the rules.
 */
export function expandPatterns(plan: FloorPlan): PatternExpansion {
  const patterns = plan.patterns
  if (patterns === undefined) return { plan, issues: [], placed: new Map() }
  const { patterns: _taken, ...rest } = plan
  void _taken
  const issues: Issue[] = []
  const placed = new Map<string, string[]>()
  if (patterns.length === 0) return { plan: rest as FloorPlan, issues, placed }

  let floorIds: string[]
  try {
    floorIds = planFloors(plan).map((f) => f.id)
  } catch {
    floorIds = [...new Set(plan.walls.map(floorOf))]
  }
  const taken = new Set<string>()
  for (const list of [plan.walls, plan.rooms, plan.openings, plan.items ?? [], plan.stairs ?? [], patterns]) for (const part of list) taken.add(part.id)
  // Each wall's openings so far, as spans along it, for the overlap check.
  const spans = new Map<string, { id: string; from: number; to: number }[]>()
  for (const o of plan.openings) spans.set(o.wall, [...(spans.get(o.wall) ?? []), { id: o.id, from: o.offset, to: o.offset + o.width }])

  const over = tolerance('openingOverrun')
  const added: Opening[] = []
  for (const pattern of patterns) {
    const list: string[] = []
    placed.set(pattern.id, list)
    const placements = placementsOf(plan, pattern, floorIds, issues)
    if (added.length + placements.length + plan.openings.length > PARTS_MAX) {
      issues.push(problem(pattern, 'pattern/does-not-fit', `${label(pattern)} would place ${placements.length.toLocaleString('en-US')} openings, past the ${PARTS_MAX.toLocaleString('en-US')} a plan may have, so none of its openings is placed`))
      continue
    }
    for (const { opening } of placements) {
      if (taken.has(opening.id)) {
        issues.push(problem(pattern, 'pattern/id-clash', `${label(pattern)} would give an opening the id ${quoted(opening.id)}, which another part of the plan has, so that opening is not placed`))
        continue
      }
      const on = spans.get(opening.wall) ?? []
      const hit = on.find((s) => Math.min(s.to, opening.offset + opening.width) - Math.max(s.from, opening.offset) > over)
      if (hit !== undefined) {
        issues.push(problem(pattern, 'pattern/overlaps-opening', `${label(pattern)} would place ${quoted(opening.id)} over opening ${quoted(hit.id)} on wall ${quoted(opening.wall)}, so it is not placed`))
        continue
      }
      taken.add(opening.id)
      spans.set(opening.wall, [...on, { id: opening.id, from: opening.offset, to: opening.offset + opening.width }])
      added.push(opening)
      list.push(opening.id)
    }
  }
  return { plan: { ...(rest as FloorPlan), openings: [...plan.openings, ...added] }, issues, placed }
}

/** The plan with its patterns expanded, and nothing else: `expandPatterns(plan).plan`. */
export function withPatterns(plan: FloorPlan): FloorPlan {
  return plan.patterns === undefined ? plan : expandPatterns(plan).plan
}
