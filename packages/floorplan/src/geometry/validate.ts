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
import { RoomOutlineError, roomNesting, roomPolygon } from './room'
import type { FloorPiece, FloorSpaces, RoomMismatch } from './spaces'
import { SPACE_AREA_TOLERANCE, planSpaces, spacesKnown } from './spaces'
import type { RoomOverlap } from './overlaps'
import { MAX_CUTS, roomOverlaps } from './overlaps'

/** `floor` issues are about a floor as a whole; their id is the floor's id. */
export type EntityKind = 'wall' | 'room' | 'opening' | 'plan' | 'floor'

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

  // A dividing line stands no height (0 unless it says otherwise), so a gap in it cannot be
  // too tall for it.
  const head = opening.sill + opening.height
  if (!wall.virtual && head > wall.height + 1e-9) {
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

/**
 * Square metres to two decimals, a half rounded up. Read to twelve figures first, so that an
 * area of exactly 13.585 that the arithmetic left at 13.58499999… still reads 13.59.
 */
const two = (value: number): string => (Math.round(Number((value * 100).toPrecision(12))) / 100).toFixed(2)
const m2 = (value: number): string => `${two(value)} m²`
const at = (p: { readonly x: number; readonly y: number }): string => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`

/** `a, b and c`, or the first few and how many more. */
function names(ids: readonly string[], most = 6): string {
  const shown = ids.length > most ? [...ids.slice(0, most), `${ids.length - most} more`] : [...ids]
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
}

function unclaimedMessage(floor: string, piece: FloorPiece): string {
  const walls = piece.walls.length > 0 ? `, between walls ${names(piece.walls)}` : ''
  return (
    `Floor ${floor} has ${m2(piece.area)} of enclosed floor that no room claims, around ` +
    `${at(piece.at)}${walls}. It is in no room's area. If it is a room, draw it as one.`
  )
}

/**
 * A refused room that lists the walls around a piece of unclaimed floor: most likely the room
 * meant to claim it. Its own issue already says why it was left out, so the piece is not
 * reported a second time. "Lists the walls" means that every wall it lists is around the piece
 * (a wall list with one missing), or that it lists every wall around the piece (a wall list out
 * of order, or with a wall too many).
 */
function refusedRoomFor(floor: string, piece: FloorPiece, plan: FloorPlan, broken: ReadonlySet<string>): boolean {
  const around = new Set(piece.walls)
  if (around.size === 0) return false
  return plan.rooms.some((room) => {
    if (!broken.has(room.id) || floorOf(room) !== floor || room.boundary.length === 0) return false
    const listed = new Set(room.boundary)
    return [...listed].every((id) => around.has(id)) || [...around].every((id) => listed.has(id))
  })
}

function mismatchMessage(m: RoomMismatch): string {
  if (m.enclosed < SPACE_AREA_TOLERANCE) {
    return (
      `Room ${m.room} is not enclosed by its walls: none of its ${m2(m.area)} is floor that ` +
      `walls close off. Its outline is closed only by carrying the walls' lines on until they ` +
      `meet. Check that its walls reach each other.`
    )
  }
  const parts: string[] = []
  const unlisted = m.onWalls.filter((w) => !w.listed)
  const listed = m.onWalls.filter((w) => w.listed)
  const sum = (list: readonly { area: number }[]): number => list.reduce((s, w) => s + w.area, 0)
  if (unlisted.length > 0) {
    parts.push(`${m2(sum(unlisted))} of it lies on ${unlisted.length === 1 ? 'wall' : 'walls'} ${names(unlisted.map((w) => w.wall))}, which its wall list leaves out`)
  }
  if (listed.length > 0) {
    parts.push(`${m2(sum(listed))} lies on its own ${listed.length === 1 ? 'wall' : 'walls'} ${names(listed.map((w) => w.wall))}`)
  }
  if (m.outside >= SPACE_AREA_TOLERANCE) parts.push(`${m2(m.outside)} lies outside the walls`)
  if (m.spaces.length > 1) {
    const lines = m.lines.length > 0
      ? `, split by ${m.lines.length === 1 ? 'dividing line' : 'dividing lines'} ${names(m.lines)}, which its wall list leaves out`
      : ''
    parts.push(`it covers parts of ${m.spaces.length} enclosed spaces (${names(m.spaces.map(two), 4)} m²)${lines}`)
  }
  if (m.sharedWith.length > 0) {
    parts.push(
      `it lies in one enclosed space with ${m.sharedWith.length === 1 ? 'room' : 'rooms'} ` +
        `${names(m.sharedWith)}, and no wall or dividing line divides that space between them`
    )
  }
  return (
    `Room ${m.room} does not match the space its walls enclose. Its outline measures ` +
    `${m2(m.area)}: ${parts.join('; ')}. Its area counts all of it. Check its wall list.`
  )
}

/**
 * The spaces the walls enclose, floor by floor (`spaces.ts`): floor no room claims, and rooms
 * whose outline is not the space their walls enclose. Warnings only: nothing is skipped.
 */
function validateSpaces(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  let floors: ReturnType<typeof planSpaces>
  try {
    floors = planSpaces(plan, { index, broken })
  } catch {
    return
  }
  for (const result of floors) {
    if (!spacesKnown(result)) {
      issues.push(
        issue(
          'floor',
          result.floor,
          'floor/spaces-unknown',
          `The spaces the walls enclose on floor ${result.floor} could not be worked out: ` +
            `${result.reason}. Floor that no room claims is not looked for there.`,
          'warning'
        )
      )
      continue
    }
    reportSpaces(plan, result, broken, issues)
  }
}

function reportSpaces(plan: FloorPlan, result: FloorSpaces, broken: ReadonlySet<string>, issues: Issue[]): void {
  for (const piece of result.unclaimed) {
    if (refusedRoomFor(result.floor, piece, plan, broken)) continue
    issues.push(issue('floor', result.floor, 'floor/unclaimed', unclaimedMessage(result.floor, piece), 'warning'))
  }
  for (const m of result.mismatches) {
    const code = m.enclosed < SPACE_AREA_TOLERANCE ? 'room/not-enclosed' : 'room/space-mismatch'
    issues.push(issue('room', m.room, code, mismatchMessage(m), 'warning'))
  }
}

const quoted = (id: string): string => JSON.stringify(id)

/**
 * Rooms marked `inside` that no room on their floor holds (`nesting.ts`). Their floor is
 * counted on its own and taken off nothing, which is what the plan said not to do.
 */
function validateNesting(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  const nesting = roomNesting(index)
  const floors = new Map(plan.rooms.map((room) => [room.id, floorOf(room)] as const))
  for (const inner of nesting.inner.values()) {
    if (inner.host !== null || broken.has(inner.room)) continue
    const floor = floors.get(inner.room) ?? ''
    const why =
      inner.reason !== undefined
        ? `the room it sits in could not be worked out: ${inner.reason}`
        : inner.nearest !== null
          ? `${m2(inner.nearest.outside)} of it lies outside room ${inner.nearest.room}, the room that holds most of it`
          : `no room on floor ${floor} covers any of it`
    issues.push(
      issue(
        'room',
        inner.room,
        'room/inside-no-host',
        `Room ${inner.room} is marked as inside another room, but no room on floor ${floor} holds ` +
          `it: ${why}. Its floor is counted on its own and taken off no room. Draw it within the ` +
          `room it sits in, or leave out ${quoted('inside')}.`,
        'warning'
      )
    )
  }
}

function overlapMessage(o: RoomOverlap): string {
  const [a, b] = o.rooms
  const [areaA, areaB] = o.areas
  if (o.kind === 'same') {
    const walls = o.sameWalls ? ' and list the same walls' : ''
    return (
      `Rooms ${a} and ${b} cover the same ${m2(o.shared)} of floor${walls}, so that floor is counted ` +
      `twice, once in each. If one is a copy of the other, remove it; if not, check their wall lists.`
    )
  }
  if (o.kind === 'inside') {
    const [inner, outer] = areaA <= areaB ? [a, b] : [b, a]
    const [innerArea, outerArea] = areaA <= areaB ? [areaA, areaB] : [areaB, areaA]
    return (
      `Room ${inner} (${m2(innerArea)}) lies wholly inside room ${outer} (${m2(outerArea)}), so ` +
      `${m2(o.shared)} of floor around ${at(o.at)} is counted twice, once in each. If ${inner} ` +
      `sits inside ${outer}, as a wardrobe pod or an en-suite does, mark ${inner} with ` +
      `${quoted('inside')}: true and its floor is taken off ${outer}. If not, check the wall list ` +
      `of ${outer}: it most likely names a wall it should not.`
    )
  }
  return (
    `Rooms ${a} (${m2(areaA)}) and ${b} (${m2(areaB)}) overlap: ${m2(o.shared)} of floor around ` +
    `${at(o.at)} lies in both, so it is counted twice. Check their wall lists: one of them most ` +
    `likely names a wall of the other.`
  )
}

/**
 * Rooms on one floor that cover the same floor (`overlaps.ts`). One line per pair, on the room
 * whose area the shared floor most likely makes wrong: the larger of the two, which grew over
 * the other, or the later when both are the same size. Warnings only: both rooms are still drawn
 * and measured.
 */
function validateRoomOverlaps(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  const found = roomOverlaps(plan, { index, broken })
  for (const o of found.overlaps) {
    const [a, b] = o.rooms
    // The larger room; the later one when the two are the same size within the tolerance.
    const on = o.kind === 'same' || o.areas[1] > o.areas[0] - SPACE_AREA_TOLERANCE ? b : a
    issues.push(issue('room', on, 'room/overlap', overlapMessage(o), 'warning'))
  }
  for (const floor of found.stopped) {
    issues.push(
      issue(
        'floor',
        floor,
        'floor/overlaps-unknown',
        `The rooms on floor ${floor} were not all compared to see whether they overlap: the plan has ` +
          `more than ${MAX_CUTS.toLocaleString('en')} pairs of rooms lying over each other, and Grid ` +
          `stopped there. The overlaps it found are listed.`,
        'warning'
      )
    )
  }
  for (const u of found.uncompared) {
    const [a, b] = u.rooms
    issues.push(
      issue(
        'room',
        b,
        'room/overlap-unknown',
        `Rooms ${a} and ${b} could not be compared to see whether they overlap: ${u.reason}.`,
        'warning'
      )
    )
  }
}

export interface ValidateOptions {
  /**
   * Whether to work out the spaces the walls enclose and report floor no room claims and rooms
   * that do not match their space (`validateSpaces`), rooms that overlap (`validateRoomOverlaps`)
   * and rooms marked `inside` that no room holds (`validateNesting`). On by default. Those lines
   * are warnings and never change `broken`, so a caller that only needs `broken` can leave them
   * out: joining every wall of a floor costs more than every other check together.
   */
  readonly spaces?: boolean
}

/** Checks the whole plan. Never throws. */
export function validatePlan(
  plan: FloorPlan,
  index: PlanIndex = indexPlan(plan),
  options: ValidateOptions = {}
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

  if (options.spaces !== false) {
    validateSpaces(plan, index, broken, issues)
    validateNesting(plan, index, broken, issues)
    validateRoomOverlaps(plan, index, broken, issues)
  }

  return { issues, broken }
}
