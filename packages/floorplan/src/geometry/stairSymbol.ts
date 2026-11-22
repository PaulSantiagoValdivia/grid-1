/**
 * A stair's plan symbol, as an architect draws it (SHT-11, lab DR-5), from the stair the plan
 * states (`planStairs`, LVL-3).
 *
 * On the floor a stair rises from, the plan is cut `planCutHeight` above the floor. Up to where
 * the flight reaches that height the stair is seen from above: its outline, a line at every
 * riser and the walking line are drawn solid. A break line crosses the flight there, and what
 * lies above the cut is drawn dashed. On the floor it arrives on, the whole stair lies below the
 * cut, seen through the floor's opening, and is drawn solid with no break. On both floors the
 * walking line ends in an arrow head at its upper end, pointing up the stair.
 *
 * Only shapes in plan metres come out: which lines are dashed, and how, is the look's (in the
 * viewer). The break line's slope and zig-zag and the arrow head's size are proportions of the
 * stair's own width, so the symbol is drawn to scale like the stair.
 *
 * Pure, and never throws.
 */

import type { StairLayout } from './stairs'
import type { Vec2 } from './vec2'
import { add, distance, lerp, normalize, perp, scale, sub } from './vec2'
import { limit, tolerance } from './tolerances'

/** A line of the symbol: its part, its points in order, and whether it lies above the cut. */
export interface StairSymbolLine {
  readonly kind: 'outline' | 'riser' | 'walk'
  readonly points: readonly Vec2[]
  /** A ring, its last point joined back to its first: a whole flight's or landing's outline. */
  readonly closed: boolean
  /** Above the plan's cut, on the floor the stair rises from: drawn dashed. */
  readonly above: boolean
}

export interface StairSymbol {
  readonly lines: readonly StairSymbolLine[]
  /** The break line across the flight at the cut, a zig-zag; null where the stair is not cut. */
  readonly cut: readonly Vec2[] | null
  /** The arrow head at the upper end of the walking line, a triangle, tip first; null with no last stretch. */
  readonly arrow: readonly Vec2[] | null
}

/** How far the break line runs along the flight from one edge to the other, as a share of the width. */
const BREAK_SLANT = 1 / 2
/** How far its zig-zag steps along the flight, either way, as a share of the width. */
const BREAK_ZIG = 1 / 10
/** The arrow head's length, as a share of the width, and its length over its half width. */
const ARROW_LENGTH = 1 / 4
const ARROW_SHAPE = 2.5

/** The arrow head at the end of `line`, pointing along its last stretch. */
function arrowHead(line: readonly Vec2[], width: number): Vec2[] | null {
  const tip = line[line.length - 1]
  const back = line[line.length - 2]
  if (tip === undefined || back === undefined) return null
  const stretch = distance(back, tip)
  if (!(stretch > tolerance('noLength'))) return null
  const dir = normalize(sub(tip, back))
  const size = Math.min(width * ARROW_LENGTH, stretch / 2)
  const base = sub(tip, scale(dir, size))
  const side = scale(perp(dir), size / ARROW_SHAPE)
  return [tip, add(base, side), sub(base, side)]
}

/** Where the cut falls: the flight it crosses, and how far up that flight from its lower end. */
function cutAt(stair: StairLayout, height: number): { flight: number; along: number } | null {
  if (!(stair.rise > height) || !(stair.riserHeight > 0)) return null
  for (let i = 0; i < stair.flights.length; i++) {
    const flight = stair.flights[i]!
    const length = distance(flight.from, flight.to)
    // The line of the nosings rises one riser per going, from the top of the flight's first riser.
    const along = (height / stair.riserHeight - flight.risersBelow - 1) * flight.going
    if (along <= length) return { flight: i, along: Math.max(0, along) }
  }
  return null
}

/**
 * The symbol of a laid-out stair as the floor at its `end` draws it: cut, with a break line and
 * the part above dashed, on its lower floor; whole on its upper floor.
 */
export function stairSymbol(stair: StairLayout, end: 'lower' | 'upper'): StairSymbol {
  const lines: StairSymbolLine[] = []
  const arrow = arrowHead(stair.line, stair.width)
  const height = limit('planCutHeight')
  const cut = end === 'lower' ? cutAt(stair, height) : null
  const half = stair.width / 2

  if (cut === null) {
    for (const flight of stair.flights) lines.push({ kind: 'outline', points: flight.outline, closed: true, above: false })
    for (const landing of stair.landings) lines.push({ kind: 'outline', points: landing.outline, closed: true, above: false })
    for (const flight of stair.flights) for (const [a, b] of flight.riserLines) lines.push({ kind: 'riser', points: [a, b], closed: false, above: false })
    lines.push({ kind: 'walk', points: stair.line, closed: false, above: false })
    return { lines, cut: null, arrow }
  }

  const flight = stair.flights[cut.flight]!
  const length = distance(flight.from, flight.to)
  const dir = normalize(sub(flight.to, flight.from))
  const side = scale(perp(dir), half)
  const at = (along: number): Vec2 => add(flight.from, scale(dir, along))
  // The break runs from one edge (`side` to the right) at `along − slant` to the other at `along + slant`.
  const slant = Math.min(stair.width * BREAK_SLANT / 2, cut.along, length - cut.along)
  const right = (along: number): Vec2 => sub(at(along), side)
  const left = (along: number): Vec2 => add(at(along), side)
  const start = right(cut.along - slant)
  const finish = left(cut.along + slant)
  const zig = scale(dir, stair.width * BREAK_ZIG)
  const breakLine = [start, add(lerp(start, finish, 0.45), zig), sub(lerp(start, finish, 0.55), zig), finish]

  // Flights below the cut are seen, those above it dashed.
  stair.flights.forEach((f, i) => {
    if (i === cut.flight) return
    lines.push({ kind: 'outline', points: f.outline, closed: true, above: i > cut.flight })
  })
  // The cut flight's outline, in four lines: its edges meet the break line.
  lines.push(
    { kind: 'outline', points: [right(0), left(0)], closed: false, above: false },
    { kind: 'outline', points: [right(0), start], closed: false, above: false },
    { kind: 'outline', points: [left(0), finish], closed: false, above: false },
    { kind: 'outline', points: [start, right(length)], closed: false, above: true },
    { kind: 'outline', points: [finish, left(length)], closed: false, above: true },
    { kind: 'outline', points: [right(length), left(length)], closed: false, above: true }
  )
  // A landing is seen when its floor lies below the cut.
  for (const landing of stair.landings) {
    lines.push({ kind: 'outline', points: landing.outline, closed: true, above: landing.risersBelow * stair.riserHeight >= height })
  }
  stair.flights.forEach((f, i) => {
    for (const [a, b] of f.riserLines) {
      if (i !== cut.flight) {
        lines.push({ kind: 'riser', points: [a, b], closed: false, above: i > cut.flight })
        continue
      }
      // A riser line runs from the left edge (`a`) to the right (`b`); the break crosses it where
      // the break's distance up the flight, running from `along + slant` on the left to
      // `along − slant` on the right, equals the riser's.
      const riserAlong = (a.x - flight.from.x) * dir.x + (a.y - flight.from.y) * dir.y
      const u = slant > 0 ? Math.min(1, Math.max(0, (cut.along + slant - riserAlong) / (2 * slant))) : riserAlong < cut.along ? 1 : 0
      // From `a` to the crossing the riser lies below the break when it is nearer the foot there.
      const crossing = lerp(a, b, u)
      if (u > 0) lines.push({ kind: 'riser', points: [a, crossing], closed: false, above: false })
      if (u < 1) lines.push({ kind: 'riser', points: [crossing, b], closed: false, above: true })
    }
  })
  // The walking line, split where it crosses the cut: flight i runs along its stretch from point
  // i to point i + 1.
  const through = at(cut.along)
  lines.push(
    { kind: 'walk', points: [...stair.line.slice(0, cut.flight + 1), through], closed: false, above: false },
    { kind: 'walk', points: [through, ...stair.line.slice(cut.flight + 1)], closed: false, above: true }
  )
  return { lines, cut: breakLine, arrow }
}
