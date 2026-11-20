/**
 * Geometric validation.
 *
 * Mind the split: STRUCTURAL validation — is this valid JSON, are the fields
 * there, are they numbers — is handled by the Zod schema before the plan ever
 * reaches here. This is a different thing: a plan can be structurally perfect
 * and geometrically impossible. A 90 cm door on a 50 cm wall, a window that
 * pokes through the ceiling, two overlapping openings.
 *
 * Getting the AI to produce valid plans consistently is the project's number
 * one risk, so this is not an edge case — it is the normal case. That is why
 * problems come back as a list instead of throwing: what cannot be drawn is
 * skipped and reported, and the rest of the plan still gets drawn.
 */

import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { indexPlan, openingsOf } from './plan'
import { floorOf, planFloors } from './floors'
import { area } from './vec2'
import { openingSpan, wallAxis } from './wall'
import { RoomOutlineError, roomPolygon } from './room'

export type EntityKind = 'wall' | 'room' | 'opening' | 'plan'

/**
 * `error` is something that cannot be drawn and gets skipped.
 * `warning` still gets drawn, but is worth a look.
 */
export type Severity = 'error' | 'warning'

export interface Issue {
  /** Stable identifier for the kind of problem, so they can be filtered. */
  readonly code: string
  readonly entity: EntityKind
  readonly id: string
  readonly message: string
  readonly severity: Severity
}

export interface ValidationResult {
  readonly issues: readonly Issue[]
  /** Ids of entities that cannot be drawn and must be skipped. */
  readonly broken: ReadonlySet<string>
}

function issue(
  entity: EntityKind,
  id: string,
  code: string,
  message: string,
  severity: Severity = 'error'
): Issue {
  return { entity, id, code, message, severity }
}

/**
 * How far from the origin the farthest point of the plan sits.
 *
 * C4 · the origin is the point the 3D rises from, same as SketchUp's: the plan
 * lives on XY and z=0 is floor level. A plan that shows up hundreds of meters
 * away is still drawable, but it almost always means the agent lost the scale.
 */
const ORIGIN_WARNING_DISTANCE = 500

function validateOrigin(plan: FloorPlan, issues: Issue[]): void {
  let farthest = 0
  for (const wall of plan.walls) {
    for (const [x, y] of [wall.start, wall.end]) {
      const distance = Math.hypot(x, y)
      if (distance > farthest) farthest = distance
    }
  }

  if (farthest > ORIGIN_WARNING_DISTANCE) {
    issues.push(
      issue(
        'plan',
        'plan',
        'plan/far-from-origin',
        `The plan reaches ${farthest.toFixed(0)} m from the origin. The origin is where the ` +
          `3D rises from; at this distance there is most likely a scale or unit error.`,
        'warning'
      )
    )
  }
}

function validateWall(wall: Wall, issues: Issue[]): boolean {
  const [sx, sy] = wall.start
  const [ex, ey] = wall.end

  if (sx === ex && sy === ey) {
    issues.push(issue('wall', wall.id, 'wall/zero-length', `Wall ${wall.id} has start === end`))
    return false
  }

  if (wall.virtual) return true

  let ok = true
  if (wall.thickness <= 0) {
    issues.push(
      issue(
        'wall',
        wall.id,
        'wall/no-thickness',
        `Wall ${wall.id} has thickness ${wall.thickness}; only a virtual wall may be zero`
      )
    )
    ok = false
  }
  if (wall.height <= 0) {
    issues.push(
      issue(
        'wall',
        wall.id,
        'wall/no-height',
        `Wall ${wall.id} has height ${wall.height}; only a virtual wall may be zero`
      )
    )
    ok = false
  }
  return ok
}

function validateOpening(
  opening: Opening,
  index: PlanIndex,
  brokenWalls: ReadonlySet<string>,
  issues: Issue[]
): boolean {
  // If the wall is already broken there is nothing to measure against, and its
  // geometry cannot be built either.
  if (brokenWalls.has(opening.wall)) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/broken-wall',
        `Opening ${opening.id} hangs off wall ${opening.wall}, which is invalid`
      )
    )
    return false
  }

  const wall = index.wallsById.get(opening.wall)
  if (!wall) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/missing-wall',
        `Opening ${opening.id} points at wall ${opening.wall}, which does not exist`
      )
    )
    return false
  }

  let ok = true

  if (opening.width <= 0 || opening.height <= 0) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/degenerate',
        `Opening ${opening.id} measures ${opening.width} × ${opening.height} m`
      )
    )
    return false
  }

  const span = openingSpan(opening)
  const wallLength = wallAxis(wall).length

  if (span.from < -1e-9 || span.to > wallLength + 1e-9) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/out-of-wall',
        `Opening ${opening.id} runs from ${span.from.toFixed(2)} to ${span.to.toFixed(2)} m ` +
          `on a wall ${wallLength.toFixed(2)} m long`
      )
    )
    ok = false
  }

  const head = opening.sill + opening.height
  if (head > wall.height + 1e-9) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/too-tall',
        `Opening ${opening.id} reaches ${head.toFixed(2)} m on a wall ` +
          `${wall.height.toFixed(2)} m high`
      )
    )
    ok = false
  }

  if (opening.sill < -1e-9) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/negative-sill',
        `Opening ${opening.id} has its sill below the floor (${opening.sill} m)`
      )
    )
    ok = false
  }

  return ok
}

/**
 * Two openings cannot share a stretch of wall: drawing both cuts two holes in one place.
 * Spans are sorted by offset; the one nearer `wall.start` is kept, and any later opening
 * that starts before the farthest kept end is reported and skipped. Comparing against the
 * farthest end, not only the previous span, catches an opening inside a wider one.
 */
function validateOverlaps(index: PlanIndex, broken: Set<string>, issues: Issue[]): void {
  for (const wall of index.plan.walls) {
    if (broken.has(wall.id)) continue
    const spans = openingsOf(index, wall.id)
      .filter((opening) => !broken.has(opening.id))
      .map(openingSpan)
    let kept = spans[0]
    for (const current of spans.slice(1)) {
      if (current.from < kept!.to - 1e-9) {
        issues.push(
          issue(
            'opening',
            current.opening.id,
            'opening/overlap',
            `Openings ${kept!.opening.id} and ${current.opening.id} overlap on wall ${wall.id}`
          )
        )
        broken.add(current.opening.id)
      } else if (current.to > kept!.to) {
        kept = current
      }
    }
  }
}

/**
 * Ids used more than once.
 *
 * An id is the only handle anything has on anything else, and `indexPlan`
 * builds its maps with `set()` — so the last duplicate silently wins every
 * lookup. The visible damage is worst across storeys: a room resolves its
 * boundary to another floor's wall, and `planForFloor` carries an opening into
 * every floor that happens to reuse the id.
 *
 * All of them are skipped rather than one being picked, because when two walls
 * answer to `w1` nobody can know which one the room meant, and drawing one is
 * drawing something the user never described. One namespace for the whole file:
 * `broken` is a flat set of ids, so a room named after a wall really does
 * inherit that wall's fate.
 */
function validateDuplicateIds(
  plan: FloorPlan,
  issues: Issue[],
  broken: Set<string>
): ReadonlySet<string> {
  const seen = new Set<string>()
  const duplicated = new Set<string>()

  for (const { id } of [...plan.walls, ...plan.rooms, ...plan.openings]) {
    if (seen.has(id)) duplicated.add(id)
    else seen.add(id)
  }

  for (const id of duplicated) {
    issues.push(
      issue(
        'plan',
        id,
        'plan/duplicate-id',
        `Id ${id} names more than one wall, room or opening. Every lookup resolves to ` +
          `only one of them, so all of them are skipped`
      )
    )
    broken.add(id)
  }

  return duplicated
}

/**
 * Floor ids that differ only in capitalisation or spacing.
 *
 * Deliberately a warning and not a normalisation: folding `"Ground"` into
 * `"ground"` would merge two storeys the file keeps apart, and which name then
 * wins is unanswerable. How a floor id is matched is part of C5, a closed
 * convention — changing it is a team decision, not a bug fix. Naming the
 * collision is the part that belongs here.
 */
function validateFloorIdSpelling(plan: FloorPlan, issues: Issue[]): void {
  const byShape = new Map<string, string[]>()
  for (const floor of planFloors(plan)) {
    const shape = floor.id.trim().toLowerCase().replace(/\s+/g, ' ')
    const list = byShape.get(shape)
    if (list) list.push(floor.id)
    else byShape.set(shape, [floor.id])
  }

  for (const ids of byShape.values()) {
    if (ids.length < 2) continue
    issues.push(
      issue(
        'plan',
        ids[0]!,
        'plan/similar-floor-id',
        `Floors ${ids.map((id) => JSON.stringify(id)).join(' and ')} differ only in ` +
          `capitalisation or spacing, and are treated as separate floors`,
        'warning'
      )
    )
  }
}

/**
 * Floors · C5.
 *
 * Ids stay globally unique across storeys, which is what keeps the 3D mesh
 * cache correct — but it also means nothing structural stops a room on one
 * floor from naming a wall on another. That reference is the real fault here;
 * the registry checks are only warnings, because a floor named by geometry but
 * missing from the registry is still drawn (see `planFloors`).
 */
function validateFloors(
  plan: FloorPlan,
  index: PlanIndex,
  duplicated: ReadonlySet<string>,
  issues: Issue[],
  broken: Set<string>
): void {
  const declared = new Set<string>()
  for (const floor of plan.floors ?? []) {
    if (declared.has(floor.id)) {
      issues.push(
        issue(
          'plan',
          floor.id,
          'plan/duplicate-floor',
          `Floor ${floor.id} is listed more than once; the first entry is the one used`,
          'warning'
        )
      )
      continue
    }
    declared.add(floor.id)
  }

  // With no registry there is nothing for a floor to be absent from.
  if (declared.size > 0) {
    for (const wall of plan.walls) {
      const floor = floorOf(wall)
      if (declared.has(floor)) continue
      issues.push(
        issue(
          'wall',
          wall.id,
          'wall/unknown-floor',
          `Wall ${wall.id} sits on floor ${floor}, which the plan does not list`,
          'warning'
        )
      )
    }

    for (const room of plan.rooms) {
      const floor = floorOf(room)
      if (declared.has(floor)) continue
      issues.push(
        issue(
          'room',
          room.id,
          'room/unknown-floor',
          `Room ${room.id} sits on floor ${floor}, which the plan does not list`,
          'warning'
        )
      )
    }
  }

  // Runs whether or not there is a registry: a room and its walls must agree.
  for (const room of plan.rooms) {
    const floor = floorOf(room)
    const strays = room.boundary.filter((wallId) => {
      // An ambiguous id resolves to whichever wall happened to come last, so the
      // floor read off it is a coin flip. `plan/duplicate-id` already reports
      // the real fault and has marked the id broken.
      if (duplicated.has(wallId)) return false
      const wall = index.wallsById.get(wallId)
      return wall !== undefined && floorOf(wall) !== floor
    })
    if (strays.length === 0) continue

    issues.push(
      issue(
        'room',
        room.id,
        'room/cross-floor',
        `Room ${room.id} is on floor ${floor} but rests on ${strays.join(', ')}, on another floor`
      )
    )
    broken.add(room.id)
  }
}

/** Checks the whole plan. Never throws. */
export function validatePlan(
  plan: FloorPlan,
  index: PlanIndex = indexPlan(plan)
): ValidationResult {
  const issues: Issue[] = []
  const broken = new Set<string>()

  validateOrigin(plan, issues)
  // First: every check below resolves entities by id, so it has to know which
  // ids cannot be resolved at all.
  const duplicated = validateDuplicateIds(plan, issues, broken)
  validateFloorIdSpelling(plan, issues)
  validateFloors(plan, index, duplicated, issues, broken)

  for (const wall of plan.walls) {
    if (!validateWall(wall, issues)) broken.add(wall.id)
  }

  for (const opening of plan.openings) {
    if (!validateOpening(opening, index, broken, issues)) broken.add(opening.id)
  }

  validateOverlaps(index, broken, issues)

  for (const room of plan.rooms) {
    // Already faulted (e.g. it reaches across floors) — one fault, one issue.
    if (broken.has(room.id)) continue

    if (room.boundary.some((wallId) => broken.has(wallId))) {
      issues.push(
        issue('room', room.id, 'room/broken-wall', `Room ${room.id} rests on an invalid wall`)
      )
      broken.add(room.id)
      continue
    }

    try {
      const polygon = roomPolygon(room, index)
      if (area(polygon) < 1e-6) {
        issues.push(issue('room', room.id, 'room/empty', `Room ${room.id} encloses zero area`))
        broken.add(room.id)
      }
    } catch (error) {
      issues.push(
        issue(
          'room',
          room.id,
          // The outline says why it failed: not closable, out of order or inside out.
          error instanceof RoomOutlineError ? error.code : 'room/unclosed',
          error instanceof Error ? error.message : String(error)
        )
      )
      broken.add(room.id)
    }
  }

  return { issues, broken }
}
