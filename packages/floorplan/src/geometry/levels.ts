/**
 * Floor levels and heights (LVL-1, lab VE-2, VE-3, MS-10, S-2): what a plan says about where
 * its floors stand, checked. Warnings, except a floor id the plan does not know, which is an
 * error; none of them changes what is drawn or where it stands.
 *
 * A floor may state its `elevation`, `height` and `slab` (C5, reopened); what it leaves out is
 * derived by `stackFloors` in `elevations.ts`. These checks read only what the plan states and
 * the order of `level`, so they never need the derived heights.
 */

import type { Floor, FloorPlan, Wall } from './plan'
import { floorHasGeometry, floorOf, isFloorSlice, planFloors } from './floors'
import type { Issue } from './validate'
import { limit, tolerance } from './tolerances'
import { metresText } from './rounding'
import { quoted } from '../types/planText'
import { closestId, idEdits } from '../types/nearest'
import { WALL_DEFAULTS } from '../types/floorplan'

const issue = (entity: Issue['entity'], id: string, code: string, message: string, severity: Issue['severity'] = 'warning'): Issue => ({
  entity,
  id,
  code,
  message,
  severity
})

const m = (value: number): string => `${metresText(value)} m`

/** `a`, `a and b`, `a, b and c`. */
function and(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

// ── Floor ids ─────────────────────────────────────────────────────────────────────────────────

// The edit count and the closest floor id are the shared helper's (MSG-7, `types/nearest.ts`).
export { idEdits, closestId as nearestFloorId }

/**
 * How many edits make an id that the plan does not list "spelt like" another, by the shorter
 * id's length: none for ids of three letters or fewer (`b1`, `g`, `l2` are labels, not words),
 * one up to seven, two past that. Counts of letters, not sizes, so they are not in the
 * tolerance table.
 */
function editsAllowed(a: string, b: string): number {
  const shorter = Math.min(a.length, b.length)
  return shorter <= 3 ? 0 : shorter <= 7 ? 1 : 2
}

/** Ids that differ only in their digits number a series of floors (`f1`, `f2`), never a slip. */
const sameButDigits = (a: string, b: string): boolean =>
  a.replace(/\d+/g, '#').toLowerCase() === b.replace(/\d+/g, '#').toLowerCase()

/**
 * In a plan with no floor list, the floor ids that look like a slip for another (lab MS-10):
 * spelt within a few edits of a floor id more parts use, and not just numbered differently.
 * Each maps to the id it looks like. Ids that differ only in capitals or spacing are
 * `plan/similar-floor-id`'s, not these.
 */
export function misspeltFloorIds(plan: FloorPlan): Map<string, string> {
  const uses = new Map<string, number>()
  for (const part of [...plan.walls, ...plan.rooms]) uses.set(floorOf(part), (uses.get(floorOf(part)) ?? 0) + 1)
  const shape = (id: string): string => id.trim().toLowerCase().replace(/\s+/g, ' ')
  const slips = new Map<string, string>()
  for (const [id, count] of uses) {
    let like: string | null = null
    let likeCount = count
    for (const [other, otherCount] of uses) {
      if (other === id || shape(other) === shape(id) || sameButDigits(id, other)) continue
      const allowed = editsAllowed(id, other)
      if (allowed === 0 || otherCount <= likeCount || idEdits(id, other, allowed) > allowed) continue
      like = other
      likeCount = otherCount
    }
    if (like !== null) slips.set(id, like)
  }
  return slips
}

/**
 * A wall or room on a floor the plan does not know. With a floor list, an id it does not list,
 * named outright, is an error with the nearest listed id; a part that names no floor sits on
 * the ground floor, which C5 makes implicit, so a list without it stays a warning. With no
 * list, an id spelt like another the plan uses more is an error with that id.
 */
export function unknownFloorIssues(plan: FloorPlan, declared: ReadonlySet<string>): Issue[] {
  const issues: Issue[] = []
  const listed = [...declared]
  const slips = declared.size > 0 ? new Map<string, string>() : misspeltFloorIds(plan)
  const parts: Array<{ entity: 'wall' | 'room'; part: { readonly id: string; readonly floor?: string } }> = [
    ...plan.walls.map((part) => ({ entity: 'wall' as const, part })),
    ...plan.rooms.map((part) => ({ entity: 'room' as const, part }))
  ]
  for (const { entity, part } of parts) {
    const floor = floorOf(part)
    const code = `${entity}/unknown-floor`
    const noun = entity === 'wall' ? 'Wall' : 'Room'
    if (declared.size > 0) {
      if (declared.has(floor)) continue
      if (part.floor === undefined) {
        issues.push(issue(entity, part.id, code, `${noun} ${quoted(part.id)} sits on floor ${quoted(floor)}, which the plan does not list`))
        continue
      }
      const nearest = closestId(floor, listed)
      issues.push(
        issue(
          entity,
          part.id,
          code,
          `${noun} ${quoted(part.id)} sits on floor ${quoted(floor)}, which the plan does not list` +
            (nearest === null ? '.' : `; the nearest floor it lists is ${quoted(nearest)}.`) +
            ` Name a listed floor, or add ${quoted(floor)} to the floors.`,
          'error'
        )
      )
      continue
    }
    const like = slips.get(floor)
    if (like === undefined) continue
    issues.push(
      issue(
        entity,
        part.id,
        code,
        `${noun} ${quoted(part.id)} sits on floor ${quoted(floor)}, which the plan does not know: it lists no ` +
          `floors, and ${quoted(floor)} is spelt like floor ${quoted(like)}, which more of the plan uses. A floor ` +
          `spelt differently is a floor of its own, at level 0. If it is ${quoted(like)}, correct the floor; ` +
          `if it is a floor of its own, list the plan's floors.`,
        'error'
      )
    )
  }
  return issues
}

// ── Levels and heights ────────────────────────────────────────────────────────────────────────

const levelText = (level: number): string => String(level)

const statesElevation = (floor: Floor): boolean => floor.elevation !== undefined && Number.isFinite(floor.elevation)

/**
 * Whole levels with no floor between the ground and the farthest floor (lab VE-3: levels 0, 1
 * and 3 stack as 0, 1 and 2, and a flat on level 3 alone stands on the ground). One warning per
 * run of missing levels, unless every floor past it states where it stands.
 */
function levelGaps(floors: readonly Floor[], issues: Issue[]): void {
  const levels = floors.map((floor) => floor.level).filter(Number.isFinite)
  if (levels.length === 0) return
  // A whole level k is held when a floor's level lies in [k, k + 1). Only the held ones are
  // walked, so a level typed as 1e9 costs no more than one typed as 3.
  const held = [...new Set(levels.map(Math.floor))]
  const runs: Array<[number, number]> = []
  let prev = -1
  for (const k of held.filter((k) => k >= 0).sort((a, b) => a - b)) {
    if (k > prev + 1) runs.push([prev + 1, k - 1])
    prev = k
  }
  prev = 0
  for (const k of held.filter((k) => k < 0).sort((a, b) => b - a)) {
    if (k < prev - 1) runs.push([k + 1, prev - 1])
    prev = k
  }

  for (const [from, to] of runs) {
    const upward = from >= 0
    // The floors the gap misplaces: past it, away from the ground.
    const past = floors.filter((floor) => (upward ? floor.level >= to + 1 : floor.level < from))
    const unstated = past.filter((floor) => !statesElevation(floor))
    if (unstated.length === 0) continue
    const nearestLevel = upward ? Math.min(...unstated.map((f) => f.level)) : Math.max(...unstated.map((f) => f.level))
    const named = unstated.filter((floor) => floor.level === nearestLevel)
    const ids = named.map((floor) => quoted(floor.id))
    const which = named.length === 1 ? `floor ${ids[0]} is` : `floors ${and(ids)} are`
    const alone = upward && !floors.some((floor) => floor.level >= 0 && floor.level < from)
    const where = alone
      ? `${named.length === 1 ? 'it stands' : 'they stand'} at 0.00 m, on the ground`
      : `${named.length === 1 ? 'it is' : 'they are'} stacked as if no level were missing`
    const count = to - from + 1
    const missing =
      count === 1
        ? `level ${levelText(from)}`
        : count <= 3
          ? `levels ${and(Array.from({ length: count }, (_, i) => levelText(from + i)))}`
          : `levels ${levelText(from)} to ${levelText(to)}`
    issues.push(
      issue(
        'plan',
        'plan',
        'plan/level-gap',
        `The plan has no floor at ${missing}, but ${which} at level ` +
          `${levelText(nearestLevel)}. A level only orders the floors, so ${where}. If a floor is missing, add it; ` +
          `if not, state where ${named.length === 1 ? 'it stands' : 'each stands'} with an elevation in metres.`
      )
    )
  }
}

interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

function boxOf(walls: readonly Wall[]): Box | null {
  const points = walls.flatMap((wall) => [wall.start, wall.end]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (points.length === 0) return null
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

const boxArea = (b: Box): number => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)

/** The share of the smaller box that the two have in common; 0 when the smaller has no area. */
function sharedShare(a: Box, b: Box): number {
  const smaller = Math.min(boxArea(a), boxArea(b))
  if (!(smaller > tolerance('areaEqual'))) return 0
  const common = boxArea({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) })
  return common / smaller
}

/**
 * Floors that stand at one height, one inside the other (lab MS-10: two floors with no floor
 * list both stand at 0): the same level, the same stated elevation or none, and drawings that
 * mostly overlap. Floors side by side at one level, such as the two halves of a pair of houses,
 * are not asked about.
 */
function sameLevel(plan: FloorPlan, floors: readonly Floor[], issues: Issue[]): void {
  const groups = new Map<string, Floor[]>()
  for (const floor of floors) {
    const key = `${floor.level}|${statesElevation(floor) ? floor.elevation : ''}`
    groups.set(key, [...(groups.get(key) ?? []), floor])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const boxes = group.map((floor) => ({ floor, box: boxOf(plan.walls.filter((wall) => floorOf(wall) === floor.id)) }))
    const clashing = new Set<Floor>()
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        if (a.box === null || b.box === null) continue
        if (sharedShare(a.box, b.box) <= tolerance('sameLevelOverlap')) continue
        clashing.add(a.floor)
        clashing.add(b.floor)
      }
    }
    if (clashing.size === 0) continue
    const ids = group.filter((floor) => clashing.has(floor)).map((floor) => quoted(floor.id))
    const first = group.find((floor) => clashing.has(floor))!
    const stated = statesElevation(first) ? ` and the same elevation, ${m(first.elevation!)}` : ''
    issues.push(
      issue(
        'plan',
        first.id,
        'plan/same-level',
        `Floors ${and(ids)} are all at level ${levelText(first.level)}${stated}, so they stand at the same height, one ` +
          `over the other. Give each floor its own level, or state where each stands with an elevation in metres.`
      )
    )
  }
}

/**
 * The top floor has nothing drawn on it, yet still counts as a storey, so the roof stands that
 * much higher (lab VE-3: an empty floor named "roof" adds a phantom 2.70 m storey).
 */
function emptyTop(plan: FloorPlan, floors: readonly Floor[], issues: Issue[]): void {
  if (floors.length < 2) return
  const drawn = floors.filter((floor) => floorHasGeometry(plan, floor.id))
  if (drawn.length === 0) return
  const top = Math.max(...floors.map((floor) => floor.level).filter(Number.isFinite))
  const atTop = floors.filter((floor) => floor.level === top)
  if (atTop.some((floor) => floorHasGeometry(plan, floor.id))) return
  for (const floor of atTop) {
    const height = floor.height !== undefined && Number.isFinite(floor.height) ? `${m(floor.height)} high, as it states` : `${m(WALL_DEFAULTS.solid.height)} high, the default`
    issues.push(
      issue(
        'floor',
        floor.id,
        'floor/empty-top',
        `Floor ${quoted(floor.id)} is the top floor and has nothing drawn on it, but it still counts as a storey ` +
          `${height}, and the roof stands on it. Remove the floor if nothing is on it yet.`
      )
    )
  }
}

/**
 * A floor that states its height, and a wall on it that rises past it (lab S-2: 11 m racking in a
 * 10 m shed lifted the roof to 11 m, with no message). The storey keeps the height it states.
 */
function wallsAboveStorey(plan: FloorPlan, floors: readonly Floor[], broken: ReadonlySet<string>, issues: Issue[]): void {
  const stated = new Map<string, number>()
  for (const floor of floors) {
    if (floor.height !== undefined && Number.isFinite(floor.height) && floor.height > 0) stated.set(floor.id, floor.height)
  }
  if (stated.size === 0) return
  for (const wall of plan.walls) {
    if (wall.virtual || broken.has(wall.id) || !Number.isFinite(wall.height)) continue
    const storey = stated.get(floorOf(wall))
    if (storey === undefined || wall.height <= storey + tolerance('wallAboveStorey')) continue
    issues.push(
      issue(
        'wall',
        wall.id,
        'wall/above-storey',
        `Wall ${quoted(wall.id)} is ${m(wall.height)} high, ${m(wall.height - storey)} higher than floor ` +
          `${quoted(floorOf(wall))}, which states it is ${m(storey)} high. The storey and the roof stay where the ` +
          `floor puts them; if the wall really is taller, raise the floor's height.`
      )
    )
  }
}

/** A floor's stated height far outside a storey's, the same questions a wall's height gets. */
function floorHeightQuestions(floors: readonly Floor[], building: 'any' | 'home', issues: Issue[]): void {
  for (const floor of floors) {
    if (floor.height === undefined || !Number.isFinite(floor.height)) continue
    const highest = limit('wallHighest', building)
    const lowest = limit('wallLowest', building)
    if (floor.height <= highest && floor.height >= lowest) continue
    const bound = floor.height > highest ? `higher than ${m(highest)}` : `lower than ${m(lowest)}`
    issues.push(
      issue(
        'floor',
        floor.id,
        'floor/size-question',
        `Floor ${quoted(floor.id)} states it is ${m(floor.height)} high: is that meant? Grid asks about a storey ` +
          `${bound}${building === 'home' ? ' in a home' : ''}, and its walls with no height of their own take it. ` +
          `The limit is Grid's own, for catching a slipped digit or unit, and no rule.`
      )
    )
  }
}

/**
 * A room set far off its storey (LVL-7): more likely a floor of its own, or a slipped digit or
 * sign. The limit is Grid's own (`floorOffsetLargest`). Where the room's floor states its height,
 * a room raised to its ceiling is asked about too.
 */
function floorOffsetQuestions(plan: FloorPlan, floors: readonly Floor[], broken: ReadonlySet<string>, issues: Issue[]): void {
  const largest = limit('floorOffsetLargest')
  for (const room of plan.rooms) {
    const offset = room.floorOffset
    if (offset === undefined || !Number.isFinite(offset) || broken.has(room.id)) continue
    const storey = floors.find((floor) => floor.id === floorOf(room))?.height
    const toCeiling = storey !== undefined && offset >= storey
    if (Math.abs(offset) <= largest && !toCeiling) continue
    const way = offset > 0 ? 'above' : 'below'
    const why = toCeiling
      ? `which reaches the ${m(storey)} its floor ${quoted(floorOf(room))} states it is high`
      : `and Grid asks about a room set more than ${m(largest)} off its storey`
    issues.push(
      issue(
        'room',
        room.id,
        'room/offset-question',
        `Room ${quoted(room.id)} stands ${m(Math.abs(offset))} ${way} its storey's floor: is that meant? It is ` +
          `drawn and counted at that level, ${why}. A level that far off may be a floor of its own: ` +
          `give it its own entry in the floor list with its elevation. The limit is Grid's own, for ` +
          `catching a slipped digit or unit, and no rule.`
      )
    )
  }
}

/** The checks on levels and heights, in the order docs/plan-file.md lists them. */
export function levelIssues(
  plan: FloorPlan,
  broken: ReadonlySet<string>,
  building: 'any' | 'home'
): Issue[] {
  const issues: Issue[] = []
  const floors = planFloors(plan)
  // A floor's slice keeps the whole list but one floor's parts: the checks that set floors
  // against each other belong to the whole plan, which is checked as well.
  if (!isFloorSlice(plan)) {
    levelGaps(floors, issues)
    sameLevel(plan, floors, issues)
    emptyTop(plan, floors, issues)
  }
  wallsAboveStorey(plan, floors, broken, issues)
  floorHeightQuestions(floors, building, issues)
  floorOffsetQuestions(plan, floors, broken, issues)
  return issues
}
