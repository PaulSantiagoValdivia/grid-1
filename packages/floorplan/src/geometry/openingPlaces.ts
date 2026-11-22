/**
 * Where each opening stands (MSG-16): checks that an opening fits the clear run of its wall.
 *
 * An opening is cut through its own wall only, in the drawing and in every export (`wallParts`,
 * the IFC void). So where another wall meets its wall, that wall's body stands across the opening
 * and nothing says so. Here each wall's clear run is worked out between the bodies of the walls
 * that meet it, and every opening and every wall end is tested against it. Every finding is a
 * warning: the opening is still drawn, cut through its own wall.
 *
 * - `opening/crosses-wall`: the opening runs into the body of a wall that meets its wall at a
 *   corner or a junction, or crosses it.
 * - `wall/ends-in-opening`: a wall ends on another wall inside one of its openings.
 * - `opening/fills-wall`: the opening is as long as its wall; nothing of the wall is left.
 * - `opening/on-dividing-line`: a door or a window on a dividing line, which has no wall to hang
 *   it in. A warning, not a refusal: an open-plan opening is sometimes drawn that way.
 * - `opening/window-between-rooms`: a window in a wall with rooms on both sides, unless the wall
 *   is stated as an outside wall. It may be a borrowed light, so it is a warning, not a refusal.
 *
 * Walls meet as the wall faults have them meet: an end within half the other wall's thickness
 * plus `gap` of its line. A meeting sharper than `mitreReach` half thicknesses is left out, as the
 * corners leave it square (SHT-2). An opening runs into a body when it overlaps it by more than
 * `openingOverrun`.
 */

import type { Issue } from './validate'
import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { openingsOf } from './plan'
import { floorOf } from './floors'
import { cross, sub } from './vec2'
import type { WallAxis } from './wall'
import { openingSpan, wallAxis } from './wall'
import { tolerance } from './tolerances'
import { metresText } from './rounding'
import { wallSides } from './exposure'
import { boxIndex, boxOfPoints, widenBox } from './boxIndex'
import { quoted } from '../types/planText'

/** An `Issue`, plus the other things it names, so the result can list them. */
export interface PlaceIssue extends Issue {
  readonly hits: readonly string[]
}

/** Where another wall's body stands across a wall, along its axis. */
interface Cover {
  /** The wall that stands there. */
  readonly wall: string
  readonly from: number
  readonly to: number
  /** `end`: that wall ends on this one, inside its length. `across`: this wall ends on it, or it passes through. */
  readonly how: 'end' | 'across'
  /** How high that wall stands. */
  readonly height: number
}

const half = (wall: Wall): number => (wall.virtual ? 0 : wall.thickness / 2)

/** Walls that cannot be measured are validation's to report, and are left out here. */
function axisOf(wall: Wall): WallAxis | null {
  if (![...wall.start, ...wall.end].every(Number.isFinite)) return null
  if (wall.start[0] === wall.end[0] && wall.start[1] === wall.end[1]) return null
  return wallAxis(wall)
}

/**
 * Where `other`'s body stands across `wall`, or null when they do not meet. The two axes' lines
 * cross at `s` along `wall` and `u` along `other`; they meet when that point lies on both walls,
 * each reaching half the other's thickness plus `gap` past its ends.
 */
function coverOf(wall: Wall, a: WallAxis, other: Wall, b: WallAxis): Cover | null {
  const sine = cross(a.dir, b.dir)
  if (Math.abs(sine) < tolerance('parallel')) return null
  const gap = tolerance('gap')
  const reachOnWall = (half(other) + gap) / Math.abs(sine)
  const reachOnOther = (half(wall) + gap) / Math.abs(sine)
  // Sharper than the corners join: left square, and not a meeting here either.
  const most = tolerance('mitreReach') * (Math.max(half(wall), half(other)) + gap)
  if (reachOnWall > most || reachOnOther > most) return null

  const d = sub(b.start, a.start)
  const s = cross(d, b.dir) / sine
  const u = cross(d, a.dir) / sine
  if (s < -reachOnWall || s > a.length + reachOnWall) return null
  if (u < -reachOnOther || u > b.length + reachOnOther) return null

  const body = half(other) / Math.abs(sine)
  const otherEnds = u <= reachOnOther || u >= b.length - reachOnOther
  const wallEnds = s <= reachOnWall || s >= a.length - reachOnWall
  return {
    wall: other.id,
    from: Math.max(0, s - body),
    to: Math.min(a.length, s + body),
    how: otherEnds && !wallEnds ? 'end' : 'across',
    height: other.height
  }
}

/** The covers on every wall, by wall id, for the walls given (one floor's, not broken). */
function coversOf(walls: readonly Wall[]): Map<string, Cover[]> {
  const axes = walls.map(axisOf)
  const boxes = walls.map((wall, i) => {
    const axis = axes[i]
    if (!axis) return boxOfPoints([])
    const reach = tolerance('mitreReach') * (half(wall) + tolerance('gap'))
    return widenBox(boxOfPoints([axis.start, axis.end]), reach)
  })
  const near = boxIndex(boxes)
  const covers = new Map<string, Cover[]>()
  walls.forEach((wall, i) => {
    const a = axes[i]
    if (!a) return
    const list: Cover[] = []
    for (const j of near.near(boxes[i]!)) {
      const other = walls[j]!
      const b = axes[j]
      if (j === i || !b || other.virtual || other.id === wall.id) continue
      const cover = coverOf(wall, a, other, b)
      if (cover && cover.to > cover.from) list.push(cover)
    }
    covers.set(wall.id, list)
  })
  return covers
}

/** The stretches of `0..length` that no cover takes, in order. */
function clearRuns(length: number, covers: readonly { from: number; to: number }[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = []
  let at = 0
  for (const c of [...covers].sort((x, y) => x.from - y.from)) {
    if (c.from > at) runs.push({ from: at, to: c.from })
    at = Math.max(at, c.to)
  }
  if (length > at) runs.push({ from: at, to: length })
  return runs
}

/** What to say about where an opening of `width` fits on its wall, clear of `covers`. */
function whereItFits(length: number, covers: readonly Cover[], width: number, middle: number): string {
  const fits = clearRuns(length, covers).filter((run) => run.to - run.from >= width)
  if (fits.length === 0) return 'No stretch of the wall clear of the walls that meet it is that wide.'
  const best = fits.reduce((x, y) =>
    Math.abs((x.from + x.to) / 2 - middle) <= Math.abs((y.from + y.to) / 2 - middle) ? x : y
  )
  return `An offset from ${metresText(best.from)} to ${metresText(best.to - width)} m keeps it clear.`
}

const WORD: Record<Opening['type'], string> = { door: 'Door', window: 'Window', opening: 'Opening' }

const warning = (entity: Issue['entity'], id: string, code: string, message: string, hits: readonly string[]): PlaceIssue => ({
  entity,
  id,
  code,
  message,
  severity: 'warning',
  hits
})

/**
 * The checks on where each opening stands, for the walls and openings that are not broken.
 * Never throws: a wall that cannot be measured is validation's to report.
 */
export function openingPlaceIssues(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>): PlaceIssue[] {
  const issues: PlaceIssue[] = []
  const overrun = tolerance('openingOverrun')
  const byFloor = new Map<string, Wall[]>()
  for (const wall of plan.walls) {
    if (broken.has(wall.id) || index.wallsById.get(wall.id) !== wall) continue
    const list = byFloor.get(floorOf(wall))
    if (list) list.push(wall)
    else byFloor.set(floorOf(wall), [wall])
  }

  for (const walls of byFloor.values()) {
    const covers = coversOf(walls)
    for (const wall of walls) {
      const axis = axisOf(wall)
      if (!axis) continue
      const here = covers.get(wall.id) ?? []
      for (const opening of openingsOf(index, wall.id)) {
        if (broken.has(opening.id)) continue
        const what = `${WORD[opening.type]} ${quoted(opening.id)}`
        const span = openingSpan(opening)

        if (wall.virtual && opening.type !== 'opening') {
          issues.push(
            warning(
              'opening',
              opening.id,
              'opening/on-dividing-line',
              `${what} is on dividing line ${quoted(wall.id)}, which has no wall to ${opening.type === 'door' ? 'hang it in' : 'set it in'}. ` +
                `If the rooms are open to each other there, make it a doorless opening; otherwise put it on a wall.`,
              [wall.id]
            )
          )
        }

        if (span.from <= overrun && span.to >= axis.length - overrun) {
          issues.push(
            warning(
              'opening',
              opening.id,
              'opening/fills-wall',
              `${what} is as long as wall ${quoted(wall.id)} (${metresText(axis.length)} m): nothing of the wall is left either side of it.`,
              [wall.id]
            )
          )
          continue
        }

        for (const cover of here) {
          const into = Math.min(span.to, cover.to) - Math.max(span.from, cover.from)
          if (!(into > overrun)) continue
          // A wall no higher than the sill stands under the window, not across it.
          if (cover.height <= opening.sill + overrun) continue
          if (cover.how === 'end') {
            issues.push(
              warning(
                'wall',
                cover.wall,
                'wall/ends-in-opening',
                `Wall ${quoted(cover.wall)} ends on wall ${quoted(wall.id)} inside ${what.toLowerCase()}, which runs from ` +
                  `${metresText(span.from)} to ${metresText(span.to)} m along it. Move the wall or the ${opening.type} so they do not meet.`,
                [opening.id, wall.id]
              )
            )
          } else {
            issues.push(
              warning(
                'opening',
                opening.id,
                'opening/crosses-wall',
                `${what} on wall ${quoted(wall.id)} runs ${metresText(into)} m into wall ${quoted(cover.wall)}, which meets it there: ` +
                  `it is cut through its own wall only, so wall ${quoted(cover.wall)} stands across it. ` +
                  whereItFits(axis.length, here, opening.width, (span.from + span.to) / 2),
                [cover.wall, wall.id]
              )
            )
          }
        }

        if (opening.type === 'window' && !wall.virtual) {
          const sides = wallSides(index, wall.id)
          // A wall stated as outside is kept so (MSG-13), and a window in it is what was meant:
          // onto a light well drawn as a room, say.
          const left = new Set<string>()
          const right = new Set<string>()
          for (const stretch of sides && sides.exposure !== 'exterior' ? sides.stretches : []) {
            if (!(Math.min(span.to, stretch.to) - Math.max(span.from, stretch.from) > overrun)) continue
            stretch.left.forEach((room) => left.add(room))
            stretch.right.forEach((room) => right.add(room))
          }
          const a = [...left][0]
          const b = [...right].find((room) => room !== a)
          if (a !== undefined && b !== undefined) {
            issues.push(
              warning(
                'opening',
                opening.id,
                'opening/window-between-rooms',
                `${what} in wall ${quoted(wall.id)} has rooms on both sides, ${quoted(a)} and ${quoted(b)}: ` +
                  `it may be a borrowed light. If it is meant to look outside, the wall is not an outside wall.`,
                [wall.id, a, b]
              )
            )
          }
        }
      }
    }
  }
  return issues
}

/**
 * Whether a wall `thickness` thick ending on wall `wallId` at `s` along it stays clear of that
 * wall's openings, for the edit commands (WRT-3). Null when it is clear; otherwise the opening it
 * would land in and the nearest place along the wall where it would not.
 */
export function wallEndInOpening(
  index: PlanIndex,
  wallId: string,
  s: number,
  thickness: number
): { readonly opening: Opening; readonly nearest: number | null } | null {
  const wall = index.wallsById.get(wallId)
  if (!wall) return null
  const axis = axisOf(wall)
  if (!axis) return null
  const halfWidth = thickness / 2
  const overrun = tolerance('openingOverrun')
  const spans = openingsOf(index, wallId).map(openingSpan)
  const hit = spans.find((span) => Math.min(span.to, s + halfWidth) - Math.max(span.from, s - halfWidth) > overrun)
  if (!hit) return null
  // The places the wall's middle may stand: the clear runs between openings, less half its thickness.
  const places = clearRuns(axis.length, spans)
    .map((run) => ({ from: run.from + halfWidth, to: run.to - halfWidth }))
    .filter((run) => run.to >= run.from)
  const nearest = places
    .map((run) => Math.min(Math.max(s, run.from), run.to))
    .reduce<number | null>((best, at) => (best === null || Math.abs(at - s) < Math.abs(best - s) ? at : best), null)
  return { opening: hit.opening, nearest }
}

