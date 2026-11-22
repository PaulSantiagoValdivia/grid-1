/**
 * Structural grids (CNT-16, C25; lab EL-6): a named grid's lines, worked out from where it is set
 * out, its turn and the spacing of each set, with their names and the dimensions between them.
 *
 * A grid's `x` lines run along its own y, each the set's spacing past the one before; its `y`
 * lines run along its own x. Each line runs `gridOverrun` past the outermost line across it, and
 * its name is written there, at both ends. Unnamed, x lines are numbered 1, 2, 3 and y lines
 * lettered A, B, C (then AA, AB). The spacing is dimensioned along the ends of each set's lines
 * at their start, line to line, and in all along their other ends when the set has three lines or
 * more. A grid is drawn only: it is in no measure, check or count, and places nothing.
 *
 * Pure: a plan in, lines and dimensions out.
 */

import type { GridLines, StructuralGrid } from '../types/floorplan'
import type { FloorPlan } from './plan'
import type { Dimension } from './dimensions'
import { isFloorSlice, planFloors } from './floors'
import { limit } from './tolerances'
import type { Vec2 } from './vec2'
import { english, name, said } from '../messages/say'
import { withSaid } from './issueWords'
import { likelyId } from '../types/nearest'
import type { Issue } from './validate'

export type { GridLines, StructuralGrid } from '../types/floorplan'

/** One line of a grid, ready to draw: its name and its two ends, beyond which its name is written. */
export interface PlanGridLine {
  readonly name: string
  /** Which set it is of: `x` lines run along the grid's y, `y` lines along its x. */
  readonly set: 'x' | 'y'
  readonly from: Vec2
  readonly to: Vec2
  /** The way from `to` to `from`'s side, a unit vector: past `from` its name is written, and past `to`. */
  readonly along: Vec2
}

/** A grid, ready to draw. */
export interface PlanGrid {
  readonly id: string
  readonly name: string | null
  readonly lines: readonly PlanGridLine[]
}

/** The name of a y line by its place in its set: A to Z, then AA, AB and on. */
export function gridLetter(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/** Where each line of a set lies along the grid's axis, from 0. */
function positions(set: GridLines): number[] {
  const out = [0]
  for (const step of set.spacing) out.push(out[out.length - 1]! + step)
  return out
}

/** The names of a set's lines: its own, else numbers (x) or letters (y). */
export function gridLineNames(set: GridLines, which: 'x' | 'y'): string[] {
  const count = set.spacing.length + 1
  if (set.names !== undefined && set.names.length === count) return set.names.map((value) => value.trim())
  return Array.from({ length: count }, (_, i) => (which === 'x' ? String(i + 1) : gridLetter(i)))
}

/** A grid's own axes: `ex` along its x, `ey` along its y. */
function axesOf(grid: StructuralGrid): { o: Vec2; ex: Vec2; ey: Vec2 } {
  const turn = ((grid.turn ?? 0) * Math.PI) / 180
  return {
    o: { x: grid.origin[0], y: grid.origin[1] },
    ex: { x: Math.cos(turn), y: Math.sin(turn) },
    ey: { x: -Math.sin(turn), y: Math.cos(turn) },
  }
}

const at = (o: Vec2, ex: Vec2, u: number, ey: Vec2, v: number): Vec2 => ({ x: o.x + ex.x * u + ey.x * v, y: o.y + ex.y * u + ey.y * v })

/** A grid's lines, x lines first, each in order. */
export function planGrid(grid: StructuralGrid): PlanGrid {
  const { o, ex, ey } = axesOf(grid)
  const xs = positions(grid.x)
  const ys = positions(grid.y)
  const run = limit('gridOverrun')
  const xNames = gridLineNames(grid.x, 'x')
  const yNames = gridLineNames(grid.y, 'y')
  const lines: PlanGridLine[] = [
    ...xs.map((u, i): PlanGridLine => ({
      name: xNames[i]!,
      set: 'x',
      from: at(o, ex, u, ey, ys[0]! - run),
      to: at(o, ex, u, ey, ys[ys.length - 1]! + run),
      along: { x: -ey.x, y: -ey.y },
    })),
    ...ys.map((v, j): PlanGridLine => ({
      name: yNames[j]!,
      set: 'y',
      from: at(o, ex, xs[0]! - run, ey, v),
      to: at(o, ex, xs[xs.length - 1]! + run, ey, v),
      along: { x: -ex.x, y: -ex.y },
    })),
  ]
  return { id: grid.id, name: grid.name ?? null, lines }
}

/** The grids drawn on a floor: each that names it, or names no floor. On a plan that is no slice, `floor` is null: the grids that name none. */
export function gridsOn(plan: FloorPlan, floor: string | null): StructuralGrid[] {
  return (plan.grids ?? []).filter((grid) => grid.floors === undefined || (floor !== null && grid.floors.includes(floor)))
}

/**
 * The dimensions of a grid drawn: for each set, line to line along the ends at its lines' start,
 * and from its first line to its last along their other ends when it has three lines or more. Each
 * measures to the lines' centre lines, and lies on their ends.
 */
export function gridDimensions(grid: PlanGrid): Dimension[] {
  const out: Dimension[] = []
  for (const set of ['x', 'y'] as const) {
    const lines = grid.lines.filter((line) => line.set === set)
    if (lines.length < 2) continue
    const dim = (id: string, a: Vec2, b: Vec2, normal: Vec2): Dimension => ({
      id,
      kind: 'grid',
      from: a,
      to: b,
      value: Math.hypot(b.x - a.x, b.y - a.y),
      normal,
      offset: 0,
      labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      measuredTo: ['centre-line', 'centre-line'],
    })
    const out1 = lines[0]!.along
    for (let i = 0; i + 1 < lines.length; i++) {
      out.push(dim(`grid:${grid.id}:${set}:${lines[i]!.name}-${lines[i + 1]!.name}`, lines[i]!.from, lines[i + 1]!.from, out1))
    }
    if (lines.length >= 3) {
      const first = lines[0]!
      const last = lines[lines.length - 1]!
      out.push(dim(`grid:${grid.id}:${set}:overall`, first.to, last.to, { x: -out1.x, y: -out1.y }))
    }
  }
  return out
}

/**
 * What the drawing's check says about the grids (CNT-16): a floor a grid names that the plan does
 * not have. Worth a look: the grid is drawn on the floors it names that the plan has. Run on the
 * whole plan only.
 */
export function gridIssues(plan: FloorPlan): Issue[] {
  if (isFloorSlice(plan) || (plan.grids ?? []).length === 0) return []
  const floorIds = planFloors(plan).map((floor) => floor.id)
  const issues: Issue[] = []
  for (const grid of plan.grids ?? []) {
    for (const floor of grid.floors ?? []) {
      if (floorIds.includes(floor)) continue
      const meant = likelyId(floor, floorIds)
      const values = { grid: name(grid.name ?? grid.id), floor: name(floor) }
      const sentence = meant === null ? said('issue.plan/grid-unknown-floor', values) : said('issue.plan/grid-unknown-floor.meant', { ...values, meant: name(meant) })
      issues.push(withSaid({ entity: 'plan', id: grid.id, code: 'plan/grid-unknown-floor', message: english(sentence), severity: 'warning' }, sentence))
    }
  }
  return issues
}
