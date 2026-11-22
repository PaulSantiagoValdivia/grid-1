/**
 * The outside of the building, floor by floor (ARE-13): each floor's outline as its walls draw
 * it (`floorSpaces`), how much of that outline runs along each wall, and the part of the outline
 * with no floor above it.
 *
 * The plan holds no slab and no roof yet (LVL-4), so a first estimate works them out from these
 * outlines and marks them assumed: a slab under the lowest floor's outline, a flat roof over
 * every part of a floor that no floor above covers (lab AC-6: the roof over a single-storey part
 * is part of the roof). The outside face of the outer walls is the outline's edge, corners
 * included, times the height of the wall each stretch of it runs along.
 *
 * Floors stand one over the other as drawn: the same origin on every floor. A floor that is part
 * of a larger building cannot say so (lab AC-7), so its outline gets a roof and a slab like any
 * other.
 *
 * Pure: a plan in, numbers out. Never throws on a plan the schema reads: a floor whose outline
 * cannot be worked out says why.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import type { FloorPlan, PlanIndex, Wall } from './plan'
import { indexPlan } from './plan'
import { planFloors, wallsOnFloor } from './floors'
import { floorSpaces, spacesKnown } from './spaces'
import { multiArea } from './polygons'
import { validatePlan } from './validate'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { dot, sub } from './vec2'
import { wallAxis } from './wall'

/** A stretch of the outline's edge along one wall. */
export interface OuterFace {
  readonly wall: string
  /** Along the outline, in metres: corners made good are in it. */
  readonly length: number
  /** The wall's height, in metres. */
  readonly height: number
}

export interface FloorShell {
  readonly floor: string
  readonly level: number
  /** Inside the outline, in m²: the floor's gross external area. */
  readonly area: number
  /** The length of the outline's edge, every piece and ring, in metres. */
  readonly perimeter: number
  /** The edge, wall by wall, in plan order. Every stretch goes to the wall it runs along, else to the nearest one. */
  readonly faces: readonly OuterFace[]
  /** The part of the outline no floor above covers, in m²; null when a floor above has no outline (`openWhy`). */
  readonly open: number | null
  readonly openWhy: string | null
  /** The outline, piece by piece, as `FloorSpaces.outline`. */
  readonly outline: readonly (readonly (readonly Vec2[])[])[]
}

export interface FloorShellUnknown {
  readonly floor: string
  readonly level: number
  readonly reason: string
}

export type ShellFloor = FloorShell | FloorShellUnknown

export function shellKnown(floor: ShellFloor): floor is FloorShell {
  return !('reason' in floor)
}

export interface ShellOptions {
  readonly index?: PlanIndex
  /** Parts the drawing's checks leave out; worked out when not given. */
  readonly broken?: ReadonlySet<string>
}

interface Run {
  readonly wall: Wall
  readonly start: Vec2
  readonly dir: Vec2
  readonly normal: Vec2
  readonly length: number
  readonly half: number
}

/**
 * A stretch of an edge, from `from` to `to` metres along it, that lies on a wall's outer face,
 * and the stretch between the wall's own ends (`start` to `end`), where two walls in a row meet.
 */
interface Cover {
  readonly run: number
  readonly from: number
  readonly to: number
  readonly start: number
  readonly end: number
}

/** Where along edge `a`–`b` it lies on the outer face of `run`, or null. */
function coverOf(a: Vec2, b: Vec2, length: number, run: Run): Omit<Cover, 'run'> | null {
  const slack = tolerance('gap')
  const da = dot(sub(a, run.start), run.normal)
  const db = dot(sub(b, run.start), run.normal)
  if (da * db < 0) return null
  if (Math.abs(Math.abs(da) - run.half) > slack || Math.abs(Math.abs(db) - run.half) > slack) return null
  const sa = dot(sub(a, run.start), run.dir)
  const sb = dot(sub(b, run.start), run.dir)
  // Along the wall, not across its end.
  if (Math.abs(sb - sa) < length / 2) return null
  const sign = sb > sa ? 1 : -1
  const lo = (-run.half - slack - sa) * sign
  const hi = (run.length + run.half + slack - sa) * sign
  const from = Math.max(0, Math.min(lo, hi))
  const to = Math.min(length, Math.max(lo, hi))
  const ends = [-sa * sign, (run.length - sa) * sign]
  return to - from > tolerance('noLength') ? { from, to, start: Math.min(...ends), end: Math.max(...ends) } : null
}

/** How far a point along an edge is from a cover's stretch between its wall's ends. */
const offEnds = (cover: Cover, at: number): number => Math.max(0, cover.start - at, at - cover.end)

/** How far a point is from a wall's body, in metres. */
function distanceToRun(p: Vec2, run: Run): number {
  const along = Math.max(0, Math.min(run.length, dot(sub(p, run.start), run.dir)))
  const across = dot(sub(p, run.start), run.normal)
  const dx = dot(sub(p, run.start), run.dir) - along
  return Math.max(0, Math.hypot(dx, across) - run.half)
}

/** The outline's edge shared out wall by wall. */
function facesOf(outline: FloorShell['outline'], runs: readonly Run[]): { faces: OuterFace[]; perimeter: number } {
  const byWall = new Map<number, number>()
  let perimeter = 0
  for (const piece of outline) {
    for (const ring of piece) {
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!
        const length = Math.hypot(b.x - a.x, b.y - a.y)
        if (length < tolerance('noLength')) return
        perimeter += length
        const covers: Cover[] = []
        runs.forEach((run, r) => {
          const cover = coverOf(a, b, length, run)
          if (cover) covers.push({ run: r, ...cover })
        })
        // Cut the edge where any cover or wall starts or ends. Each piece goes to the wall over it
        // whose own ends hold it, so two walls in a row share the edge where they meet.
        const inside = (at: number): boolean => at > 0 && at < length
        const cuts = [...new Set([0, length, ...covers.flatMap((c) => [c.from, c.to, c.start, c.end].filter(inside))])].sort((x, y) => x - y)
        for (let k = 0; k + 1 < cuts.length; k++) {
          const from = cuts[k]!
          const to = cuts[k + 1]!
          if (to - from < tolerance('noLength')) continue
          const mid = (from + to) / 2
          const over = covers.filter((c) => c.from <= mid && mid <= c.to)
          let owner = over.length === 0 ? undefined : over.reduce((best, c) => (offEnds(c, mid) < offEnds(best, mid) ? c : best)).run
          if (owner === undefined && runs.length > 0) {
            // A wall's end, or an edge no face runs along: the nearest wall stands there.
            const at = { x: a.x + ((b.x - a.x) * mid) / length, y: a.y + ((b.y - a.y) * mid) / length }
            let best = Infinity
            runs.forEach((run, r) => {
              const d = distanceToRun(at, run)
              if (d < best) {
                best = d
                owner = r
              }
            })
          }
          if (owner !== undefined) byWall.set(owner, (byWall.get(owner) ?? 0) + (to - from))
        }
      })
    }
  }
  const faces = [...byWall.entries()]
    .sort(([x], [y]) => x - y)
    .map(([r, length]) => ({ wall: runs[r]!.wall.id, length, height: runs[r]!.wall.height }))
  return { faces, perimeter }
}

const closed = (ring: readonly Vec2[]): Pair[] => [...ring.map((p): Pair => [p.x, p.y]), [ring[0]!.x, ring[0]!.y]]
const asMulti = (outline: FloorShell['outline']): MultiPolygon => outline.map((piece): Polygon => piece.map(closed))

/**
 * Each floor's outline, the stretches of it along each wall, and the part of it no floor above
 * covers, lowest floor first.
 */
export function planShell(plan: FloorPlan, options: ShellOptions = {}): ShellFloor[] {
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? validatePlan(plan, index, { spaces: false }).broken
  const floors = planFloors(plan)
  const drawn = floors.map((floor) => {
    const spaces = floorSpaces(plan, floor.id, { index, broken })
    if (!spacesKnown(spaces)) return { floor: floor.id, level: floor.level, reason: spaces.reason }
    // LVL-5: a wall through floors runs along each floor's outline, as its stretch on that floor.
    const runs: Run[] = wallsOnFloor(plan, floor.id)
      .filter((wall) => !broken.has(wall.id) && wall.virtual !== true && wall.thickness > 0)
      .filter((wall) => Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) >= tolerance('noLength'))
      .map((wall) => {
        const axis = wallAxis(wall)
        return { wall, start: axis.start, dir: axis.dir, normal: axis.normal, length: axis.length, half: wall.thickness / 2 }
      })
    return { floor: floor.id, level: floor.level, area: spaces.outlineArea, outline: spaces.outline, ...facesOf(spaces.outline, runs) }
  })
  return drawn.map((floor): ShellFloor => {
    if (!('outline' in floor)) return floor
    const above = drawn.filter((other) => other.level > floor.level)
    const unknown = above.find((other) => !('outline' in other))
    if (unknown !== undefined) {
      return { ...floor, open: null, openWhy: `the floor above, ${JSON.stringify(unknown.floor)}, has no outline Grid can work out` }
    }
    const covers = above.flatMap((other) => ('outline' in other && other.outline.length > 0 ? [asMulti(other.outline)] : []))
    if (covers.length === 0 || floor.outline.length === 0) return { ...floor, open: floor.area, openWhy: null }
    try {
      return { ...floor, open: multiArea(polygonClipping.difference(asMulti(floor.outline), ...covers)), openWhy: null }
    } catch (error) {
      return { ...floor, open: null, openWhy: `the floors above could not be cut from it (${error instanceof Error ? error.message : String(error)})` }
    }
  })
}
