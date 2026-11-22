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

import { boundariesEdited } from '../rooms/stamp'
import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { indexPlan, openingsOf, roomWallIds } from './plan'
import { floorOf, isFloorSlice, planFloors } from './floors'
import { area } from './vec2'
import { openingSpan, wallLength } from './wall'
import { curveFault } from './arc'
import { RoomOutlineError, roomNesting, roomPolygon } from './room'
import type { FloorPiece, FloorSpaces, RoomMismatch } from './spaces'
import { planSpaces, spacesKnown } from './spaces'
import type { RoomOverlap } from './overlaps'
import { MAX_CUTS, roomOverlaps } from './overlaps'
import type { ToleranceChanges } from './tolerances'
import { tolerance, withTolerances } from './tolerances'
import { fixedText, metresText } from './rounding'
import { quoted, quotedList } from '../types/planText'
import { likelyId } from '../types/nearest'
import { validatePlausibility } from './plausible'
import { wallFaults } from './wallFaults'
import { kindDisagreements } from './exposure'
import { levelIssues, unknownFloorIssues } from './levels'
import { buildingKind } from './plausible'
import { planStairs } from './stairs'
import { itemIssues } from './items'
import { pointInPolygon } from './innerPoint'
import type { LeftOutPart } from '../types/readParts'
import { itemUseIssues } from './use'
import { openingPlaceIssues } from './openingPlaces'
import { roomZones } from './zones'

/**
 * `floor` issues are about a floor as a whole; their id is the floor's id. `item` is a fixture
 * (CNT-12); `stair` (LVL-3), a stated stair.
 */
export type EntityKind = 'wall' | 'room' | 'opening' | 'plan' | 'floor' | 'item' | 'stair'

/**
 * `error` is something that cannot be drawn, or sits on a floor the plan does not know, and gets
 * skipped. `warning` still gets drawn, but is worth a look.
 */
export type Severity = 'error' | 'warning'

export interface Issue {
  /** Stable identifier for the kind of problem, so they can be filtered. */
  readonly code: string
  readonly entity: EntityKind
  readonly id: string
  readonly message: string
  readonly severity: Severity
  /**
   * MSG-7: each change to one part that would clear this problem, as data, when there is one. The
   * tool server turns each into the call that makes it.
   */
  readonly fixes?: readonly PlanFix[]
  /**
   * MSG-5: the id of the issue this one follows from, set where it is raised: the wall a door
   * hangs off or a room rests on, the room a piece of unclaimed floor most likely belongs to (and
   * a fixture said to stand in no room, whose middle is on that floor), or
   * `plan` (the id of the plan's own issues) for a plan with no walls. The cause may be a part the
   * reader left out (`leftOutWalls`, `leftOutParts`), whose line is the reader's. Fixing the cause
   * clears this issue too.
   */
  readonly causedBy?: string
}

/**
 * MSG-7: one change to an opening that clears a problem with it. `width` keeps the end nearer
 * the wall's start where it is; `offset` moves it, keeping its width; `wall` is the id most
 * likely meant. Lengths in metres, rounded
 * down to the tenth of a millimetre, so the change stays inside what fits.
 */
export interface PlanFix {
  readonly part: 'opening'
  readonly id: string
  readonly width?: number
  readonly offset?: number
  readonly height?: number
  readonly sill?: number
  /** The wall most likely meant, for an opening on a wall the plan does not have. */
  readonly wall?: string
}

/** A length rounded down to the tenth of a millimetre, for a fix that must stay inside a limit. */
const down = (metres: number): number => Math.floor(Math.round(metres * 10_000_000) / 1000) / 10_000

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
  severity: Severity = 'error',
  fixes: readonly PlanFix[] = []
): Issue {
  return fixes.length > 0 ? { entity, id, code, message, severity, fixes } : { entity, id, code, message, severity }
}

/** MSG-5: an issue that follows from another, by that one's id. */
const followOn = (found: Issue, cause: string | null): Issue => (cause === null ? found : { ...found, causedBy: cause })

/**
 * How far from the origin the farthest point of the plan sits.
 *
 * C4 · the origin is the point the 3D rises from, same as SketchUp's: the plan
 * lives on XY and z=0 is floor level. A plan that shows up hundreds of meters
 * away (`farFromOrigin`) is still drawable, but it almost always means the agent
 * lost the scale.
 */
function validateOrigin(plan: FloorPlan, issues: Issue[]): void {
  let farthest = 0
  for (const wall of plan.walls) {
    for (const [x, y] of [wall.start, wall.end]) {
      const distance = Math.hypot(x, y)
      // A number past `largest` is refused on its own wall (`validateWall`).
      if (distance > farthest && distance <= tolerance('largest')) farthest = distance
    }
  }

  if (farthest > tolerance('farFromOrigin')) {
    issues.push(
      issue(
        'plan',
        'plan',
        'plan/far-from-origin',
        `The plan reaches ${fixedText(farthest, 0)} m from the origin. The origin is where the ` +
          `3D rises from; at this distance there is most likely a scale or unit error.`,
        'warning'
      )
    )
  }
}

/**
 * A length as stated, to as many decimals as it takes (at least two, at most six), so that two
 * lengths that differ are never printed alike: 4.8996, not 4.90.
 */
export function exactMetres(value: number): string {
  const fixed = value.toFixed(6).replace(/0+$/, '')
  const [whole, decimals = ''] = fixed.split('.')
  return `${whole}.${decimals.padEnd(2, '0')}`
}

/** Whether a number is one Grid accepts: finite, and no larger than `largest`. */
const held = (value: number): boolean => Math.abs(value) <= tolerance('largest')

const kilometres = (metres: number): string => `${(metres / 1000).toLocaleString('en')} km`

function tooLarge(what: string, value: number): string {
  return Number.isFinite(value)
    ? `${what} is ${String(value)} m, past the ${kilometres(tolerance('largest'))} Grid accepts`
    : `${what} is not a finite number`
}

const REFUSED_NUMBER =
  'A number this large is no building: most likely a digit or a unit slipped. Give every size in metres.'

/**
 * Coordinates and sizes past `largest`, and numbers that are not finite (a plan built in code
 * skips the schema, which refuses those). The part is refused: past that size the arithmetic
 * loses the precision the checks need, and a sum of two such numbers can stop being a number.
 */
function validateWallNumbers(wall: Wall, issues: Issue[]): boolean {
  const named: [string, number][] = [
    ['a coordinate of its start', wall.start[0]],
    ['a coordinate of its start', wall.start[1]],
    ['a coordinate of its end', wall.end[0]],
    ['a coordinate of its end', wall.end[1]],
    ['its thickness', wall.thickness],
    ['its height', wall.height],
    // CNT-18: a curved wall's centre is a point of the plan too.
    ...(wall.arc === undefined ? [] : ([
      ['a coordinate of its centre', wall.arc.centre[0]],
      ['a coordinate of its centre', wall.arc.centre[1]],
      ['its sweep', wall.arc.sweep]
    ] as [string, number][]))
  ]
  const bad = named.find(([, value]) => !held(value))
  if (bad === undefined) return true
  issues.push(issue('wall', wall.id, 'wall/too-large', `Wall ${quoted(wall.id)}: ${tooLarge(bad[0], bad[1])}. ${REFUSED_NUMBER}`))
  return false
}

function validateOpeningNumbers(opening: Opening, issues: Issue[]): boolean {
  const named: [string, number][] = [
    ['its offset', opening.offset],
    ['its width', opening.width],
    ['its height', opening.height],
    ['its sill', opening.sill]
  ]
  const bad = named.find(([, value]) => !held(value))
  if (bad === undefined) return true
  issues.push(
    issue('opening', opening.id, 'opening/too-large', `Opening ${quoted(opening.id)}: ${tooLarge(bad[0], bad[1])}. ${REFUSED_NUMBER}`)
  )
  return false
}

function validateWall(wall: Wall, issues: Issue[]): boolean {
  if (!validateWallNumbers(wall, issues)) return false

  const [sx, sy] = wall.start
  const [ex, ey] = wall.end

  // CNT-18: a whole circle starts and ends at one point; a curve that cannot be built says why.
  const curved = curveFault(wall)
  if (curved !== null) {
    issues.push(issue('wall', wall.id, curved.code, curved.message))
    return false
  }

  if (sx === ex && sy === ey && wall.arc === undefined) {
    issues.push(
      issue('wall', wall.id, 'wall/zero-length', `Wall ${quoted(wall.id)} starts and ends at the same point, (${exactMetres(sx)}, ${exactMetres(sy)}), so it has no length`)
    )
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
        `Wall ${quoted(wall.id)} has thickness ${wall.thickness}; only a virtual wall may be zero`
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
        `Wall ${quoted(wall.id)} has height ${wall.height}; only a virtual wall may be zero`
      )
    )
    ok = false
  }
  return ok
}

/** C2: an opening's offset and width are along its wall's axis, curved or not (CNT-18). */
const lengthOf = (wall: Wall): number => wallLength(wall)

function validateOpening(
  opening: Opening,
  index: PlanIndex,
  brokenWalls: ReadonlySet<string>,
  issues: Issue[],
  leftOut: ReadonlySet<string> = new Set(),
  /** MSG-5: the plan has no walls, so an opening on one that is not in the plan follows from that. */
  noWalls = false
): boolean {
  // If the wall is already broken there is nothing to measure against, and its
  // geometry cannot be built either.
  if (brokenWalls.has(opening.wall)) {
    const why = leftOut.has(opening.wall) ? 'which was left out when the plan was read' : 'which is invalid'
    issues.push(
      followOn(
        issue('opening', opening.id, 'opening/broken-wall', `Opening ${quoted(opening.id)} hangs off wall ${quoted(opening.wall)}, ${why}`),
        opening.wall
      )
    )
    return false
  }

  const wall = index.wallsById.get(opening.wall)
  if (!wall) {
    // MSG-7: the wall most likely meant, from the one nearest-id helper.
    const meant = likelyId(opening.wall, [...index.wallsById.keys()])
    issues.push(
      followOn(
        issue(
          'opening',
          opening.id,
          'opening/missing-wall',
          `Opening ${quoted(opening.id)} points at wall ${quoted(opening.wall)}, which is not in the plan` +
            (meant === null ? '' : `: did you mean ${quoted(meant)}?`),
          'error',
          meant === null ? [] : [{ part: 'opening', id: opening.id, wall: meant }]
        ),
        noWalls ? 'plan' : null
      )
    )
    return false
  }

  if (!validateOpeningNumbers(opening, issues)) return false

  let ok = true

  if (opening.width <= 0 || opening.height <= 0) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/degenerate',
        `Opening ${quoted(opening.id)} measures ${opening.width} × ${opening.height} m`
      )
    )
    return false
  }

  const span = openingSpan(opening)
  const wallLength = lengthOf(wall)
  // MS-16: a wall whose ends were rounded to the millimetre is a hair shorter than meant, so an
  // opening may run `openingOverrun` past it and still fit.
  const overrun = tolerance('openingOverrun')
  const before = -span.from
  const after = span.to - wallLength

  if (before > overrun || after > overrun) {
    const past = after >= before ? `${millimetres(after)} past the end of the wall` : `${millimetres(before)} before its start`
    const fits = wallLength - opening.width
    // MSG-7 (lab MS-13): what would be right, not only what is wrong. Keeping its width, the
    // offsets that fit; keeping its offset, the widest that fits there.
    const room = wallLength - opening.offset
    const fixes: PlanFix[] = []
    if (fits >= 0) fixes.push({ part: 'opening', id: opening.id, offset: down(fits) })
    if (room > 0 && opening.offset >= 0) fixes.push({ part: 'opening', id: opening.id, width: down(room) })
    const keepWidth = fits >= 0 ? `An offset from 0.00 to ${exactMetres(fits)} m fits` : `It is ${millimetres(-fits)} wider than the wall is long`
    const keepOffset = room > 0 && opening.offset >= 0 ? `; at its offset of ${exactMetres(opening.offset)} m, a width up to ${exactMetres(room)} m fits` : ''
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/out-of-wall',
        `Opening ${quoted(opening.id)} runs from ${exactMetres(span.from)} to ${exactMetres(span.to)} m ` +
          `on wall ${quoted(wall.id)}, which is ${exactMetres(wallLength)} m long: it runs ${past}, more ` +
          `than the ${millimetres(overrun)} Grid allows. ${keepWidth}${keepOffset}.`,
        'error',
        fixes
      )
    )
    ok = false
  }

  // A dividing line stands no height (0 unless it says otherwise), so a gap in it cannot be
  // too tall for it.
  const head = opening.sill + opening.height
  if (!wall.virtual && head > wall.height + overrun) {
    // MSG-7: the tallest it can be at its sill, when it can be any height at all there.
    const tallest = wall.height - Math.max(opening.sill, 0)
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/too-tall',
        `Opening ${quoted(opening.id)} reaches ${exactMetres(head)} m on a wall ` +
          `${exactMetres(wall.height)} m high` +
          (tallest > 0 ? `: at its sill of ${exactMetres(opening.sill)} m, a height up to ${exactMetres(tallest)} m fits` : ''),
        'error',
        tallest > 0 ? [{ part: 'opening', id: opening.id, height: down(tallest) }] : []
      )
    )
    ok = false
  }

  if (opening.sill < -overrun) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/negative-sill',
        `Opening ${quoted(opening.id)} has its sill ${exactMetres(-opening.sill)} m below the floor: a sill of 0.00 m, at the floor, or above fits`,
        'error',
        [{ part: 'opening', id: opening.id, sill: 0 }]
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
      if (current.from < kept!.to - tolerance('openingOverrun')) {
        issues.push(
          issue(
            'opening',
            current.opening.id,
            'opening/overlap',
            `Openings ${quoted(kept!.opening.id)} and ${quoted(current.opening.id)} overlap on wall ${quoted(wall.id)}`
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
  const parts = [
    ...plan.walls.map(({ id }) => ({ id, noun: 'wall' })),
    ...plan.rooms.map(({ id }) => ({ id, noun: 'room' })),
    ...plan.openings.map(({ id }) => ({ id, noun: 'opening' }))
  ]

  for (const { id } of parts) {
    if (seen.has(id)) duplicated.add(id)
    else seen.add(id)
  }

  for (const id of duplicated) {
    // MSG-6: both parts named, and a free id to rename one to.
    const named = parts.filter((part) => part.id === id).map((part) => part.noun)
    const counts = [...new Set(named)].map((noun) => {
      const n = named.filter((m) => m === noun).length
      return n === 1 ? `a ${noun}` : `${n} ${noun}s`
    })
    let free = 2
    while (seen.has(`${id}-${free}`)) free++
    issues.push(
      issue(
        'plan',
        id,
        'plan/duplicate-id',
        `Id ${quoted(id)} names ${counts.join(' and ')}. Every lookup resolves to only one of them, so ` +
          `all of them are skipped. Rename one, for example to ${quoted(`${id}-${free}`)}, and update what points at it`
      )
    )
    broken.add(id)
  }

  return duplicated
}

/**
 * MSG-6 (lab MS-9): a blank id, and an id that differs from an earlier one only in capitals or
 * spaces (`W1` and `w1`, `s` and `s `). Ids are unique across the whole plan, and these are
 * refused: the part is skipped and named. Of two ids alike, the first in the order walls, rooms,
 * openings keeps its id and the other is skipped, so what points at the first still finds it.
 * The two ids differ as text, so skipping one never skips the other. Two parts with exactly one
 * id are `plan/duplicate-id`'s.
 */
function validateIdSpelling(plan: FloorPlan, issues: Issue[], broken: Set<string>): void {
  const parts: [EntityKind, string, string][] = [
    ...plan.walls.map((p): [EntityKind, string, string] => ['wall', 'Wall', p.id]),
    ...plan.rooms.map((p): [EntityKind, string, string] => ['room', 'Room', p.id]),
    ...plan.openings.map((p): [EntityKind, string, string] => ['opening', 'Opening', p.id])
  ]
  const shapes = new Map<string, { noun: string; id: string }>()
  for (const [entity, noun, id] of parts) {
    if (id.trim() === '') {
      issues.push(
        issue(entity, id, 'plan/blank-id', `${noun} ${quoted(id)} has a blank id. Every part needs an id of its own, so it is skipped`)
      )
      broken.add(id)
      continue
    }
    const shape = id.trim().toLowerCase().replace(/\s+/g, ' ')
    const first = shapes.get(shape)
    if (first === undefined) {
      shapes.set(shape, { noun, id })
      continue
    }
    if (first.id === id) continue
    issues.push(
      issue(
        entity,
        id,
        'plan/similar-id',
        `${noun} ${quoted(id)} has an id that differs from the id of ${first.noun.toLowerCase()} ${quoted(first.id)} only in ` +
          `capitals or spaces, so it is skipped. If it is ${quoted(first.id)}, use that id letter for letter; if not, rename it`
      )
    )
    broken.add(id)
  }
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
          `Floor ${quoted(floor.id)} is listed more than once; the first entry is the one used`,
          'warning'
        )
      )
      continue
    }
    declared.add(floor.id)
  }

  // LVL-1 (lab MS-10): a part on a floor id the plan does not know is left out, with the nearest
  // id it does know. Without a floor list, only an id spelt like a more used one is unknown.
  for (const found of unknownFloorIssues(plan, declared)) {
    issues.push(found)
    if (found.severity === 'error') broken.add(found.id)
  }

  // Runs whether or not there is a registry: a room and its walls must agree.
  for (const room of plan.rooms) {
    const floor = floorOf(room)
    const strays = roomWallIds(room).filter((wallId) => {
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
        `Room ${quoted(room.id)} is on floor ${quoted(floor)} but rests on ${quotedList(strays)}, on another floor`
      )
    )
    broken.add(room.id)
  }
}

/**
 * Square metres to two decimals, a half rounded up. Read to twelve figures first, so that an
 * area of exactly 13.585 that the arithmetic left at 13.58499999… still reads 13.59.
 */
/** A length in millimetres, to a tenth where that is what tells it apart. */
function millimetres(metres: number): string {
  const mm = metres * 1000
  return `${mm >= 10 ? fixedText(mm, 0) : Number(mm.toPrecision(2)).toString()} mm`
}

const two = (value: number): string => fixedText(value, 2)
const m2 = (value: number): string => `${two(value)} m²`
const at = (p: { readonly x: number; readonly y: number }): string => `(${metresText(p.x)}, ${metresText(p.y)})`

/** `a, b and c`, or the first few and how many more. */
function names(ids: readonly string[], most = 6): string {
  const shown = ids.length > most ? [...ids.slice(0, most), `${ids.length - most} more`] : [...ids]
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
}

function unclaimedMessage(floor: string, piece: FloorPiece): string {
  const walls = piece.walls.length > 0 ? `, between walls ${names(piece.walls.map(quoted))}` : ''
  return (
    `Floor ${quoted(floor)} has ${m2(piece.area)} of enclosed floor that no room claims, around ` +
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
  return refusedRoomOf(floor, piece, plan, broken) !== null
}

/** The refused room `refusedRoomFor` finds, by id, or null. */
function refusedRoomOf(floor: string, piece: FloorPiece, plan: FloorPlan, broken: ReadonlySet<string>): string | null {
  const around = new Set(piece.walls)
  if (around.size === 0) return null
  const room = plan.rooms.find((room) => {
    if (!broken.has(room.id) || floorOf(room) !== floor || room.boundary.length === 0) return false
    const listed = new Set(room.boundary)
    return [...listed].every((id) => around.has(id)) || [...around].every((id) => listed.has(id))
  })
  return room?.id ?? null
}

/**
 * MSG-5: the room a piece of unclaimed floor most likely belongs to, when that room could not be
 * drawn or was left out when the plan was read: one that lists at least two of the walls around
 * it. Its line says why it is not there, and the piece goes with it.
 */
function unclaimedCause(piece: FloorPiece, plan: FloorPlan, broken: ReadonlySet<string>, leftOut: readonly LeftOutPart[]): string | null {
  const around = new Set(piece.walls)
  const lists = (walls: readonly string[]): boolean => new Set(walls.filter((id) => around.has(id))).size >= 2
  // A room on another floor may name this floor's walls (`room/cross-floor`): the walls tell.
  const room = plan.rooms.find((r) => broken.has(r.id) && lists(r.boundary))
  if (room !== undefined) return room.id
  return leftOut.find((part) => part.kind === 'room' && part.id !== null && lists(part.walls))?.id ?? null
}

function mismatchMessage(m: RoomMismatch): string {
  if (m.enclosed < tolerance('areaReported')) {
    return (
      `Room ${quoted(m.room)} is not enclosed by its walls: none of its ${m2(m.area)} is floor that ` +
      `walls close off. Its outline is closed only by carrying the walls' lines on until they ` +
      `meet. Check that its walls reach each other.`
    )
  }
  const parts: string[] = []
  const unlisted = m.onWalls.filter((w) => !w.listed)
  const listed = m.onWalls.filter((w) => w.listed)
  const sum = (list: readonly { area: number }[]): number => list.reduce((s, w) => s + w.area, 0)
  if (unlisted.length > 0) {
    parts.push(`${m2(sum(unlisted))} of it lies on ${unlisted.length === 1 ? 'wall' : 'walls'} ${names(unlisted.map((w) => quoted(w.wall)))}, which its wall list leaves out`)
  }
  if (listed.length > 0) {
    parts.push(`${m2(sum(listed))} lies on its own ${listed.length === 1 ? 'wall' : 'walls'} ${names(listed.map((w) => quoted(w.wall)))}`)
  }
  if (m.outside >= tolerance('areaReported')) parts.push(`${m2(m.outside)} lies outside the walls`)
  if (m.spaces.length > 1) {
    const lines = m.lines.length > 0
      ? `, split by ${m.lines.length === 1 ? 'dividing line' : 'dividing lines'} ${names(m.lines.map(quoted))}, which its wall list leaves out`
      : ''
    parts.push(`it covers parts of ${m.spaces.length} enclosed spaces (${names(m.spaces.map(two), 4)} m²)${lines}`)
  }
  if (m.sharedWith.length > 0) {
    parts.push(
      `it lies in one enclosed space with ${m.sharedWith.length === 1 ? 'room' : 'rooms'} ` +
        `${names(m.sharedWith.map(quoted))}, and no wall or dividing line divides that space between them`
    )
  }
  return (
    `Room ${quoted(m.room)} does not match the space its walls enclose. Its outline measures ` +
    `${m2(m.area)}: ${parts.join('; ')}. Its area counts all of it. Check its wall list.`
  )
}

/**
 * The spaces the walls enclose, floor by floor (`spaces.ts`): floor no room claims, and rooms
 * whose outline is not the space their walls enclose. Warnings only: nothing is skipped.
 */
function validateSpaces(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[], leftOut: readonly LeftOutPart[]): FloorSpaces[] {
  let floors: ReturnType<typeof planSpaces>
  try {
    floors = planSpaces(plan, { index, broken })
  } catch {
    return []
  }
  for (const result of floors) {
    if (!spacesKnown(result)) {
      issues.push(
        issue(
          'floor',
          result.floor,
          'floor/spaces-unknown',
          `The spaces the walls enclose on floor ${quoted(result.floor)} could not be worked out: ` +
            `${result.reason}. Floor that no room claims is not looked for there.`,
          'warning'
        )
      )
      continue
    }
    reportSpaces(plan, result, broken, issues, leftOut)
  }
  return floors.filter(spacesKnown)
}

/**
 * MSG-5: a fixture said to stand in no room (`item/outside-rooms`, CNT-12) whose middle is on
 * enclosed floor no room claims, when the room meant to claim that floor could not be drawn or
 * was left out when the plan was read: the room `floor/unclaimed` would follow from. Its line
 * says why the room is not there, and the fixture's line goes with it. The fixture's other lines
 * (`item/blocks-doorway`, `item/blocks-window`, CNT-13) are measured from the wall, the opening
 * and the fixture alone, never the room, so they follow from nothing here; and they are not
 * given at all for an opening or a wall that cannot be drawn (`itemUseIssues` skips them).
 */
function traceItemRooms(plan: FloorPlan, spaces: readonly FloorSpaces[], broken: ReadonlySet<string>, leftOut: readonly LeftOutPart[], issues: Issue[]): void {
  for (const [i, found] of issues.entries()) {
    if (found.code !== 'item/outside-rooms' || found.causedBy !== undefined) continue
    const item = (plan.items ?? []).find((it) => it.id === found.id)
    if (item === undefined) continue
    const floor = floorOf(item)
    const at = { x: item.at[0], y: item.at[1] }
    const piece = spaces
      .find((result) => result.floor === floor)
      ?.unclaimed.find((p) => p.rings[0] !== undefined && pointInPolygon(at, p.rings[0], p.rings.slice(1)))
    if (piece === undefined) continue
    issues[i] = followOn(found, refusedRoomOf(floor, piece, plan, broken) ?? unclaimedCause(piece, plan, broken, leftOut))
  }
}

function reportSpaces(plan: FloorPlan, result: FloorSpaces, broken: ReadonlySet<string>, issues: Issue[], leftOut: readonly LeftOutPart[]): void {
  for (const piece of result.unclaimed) {
    if (refusedRoomFor(result.floor, piece, plan, broken)) continue
    const found = issue('floor', result.floor, 'floor/unclaimed', unclaimedMessage(result.floor, piece), 'warning')
    issues.push(followOn(found, unclaimedCause(piece, plan, broken, leftOut)))
  }
  for (const m of result.mismatches) {
    const code = m.enclosed < tolerance('areaReported') ? 'room/not-enclosed' : 'room/space-mismatch'
    issues.push(issue('room', m.room, code, mismatchMessage(m), 'warning'))
  }
}

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
          ? `${m2(inner.nearest.outside)} of it lies outside room ${quoted(inner.nearest.room)}, the room that holds most of it`
          : `no room on floor ${quoted(floor)} covers any of it`
    issues.push(
      issue(
        'room',
        inner.room,
        'room/inside-no-host',
        `Room ${quoted(inner.room)} is marked as inside another room, but no room on floor ${quoted(floor)} holds ` +
          `it: ${why}. Its floor is counted on its own and taken off no room. Draw it within the ` +
          `room it sits in, or leave out ${quoted('inside')}.`,
        'warning'
      )
    )
  }
}

/**
 * Rooms that state `partOf` but are not zones of that room (CNT-8, `zones.ts`): it is not on
 * their floor, is a zone itself, or does not hold them. They are counted as rooms of their own,
 * which is what the plan said not to do.
 */
function validateZones(index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  for (const fault of roomZones(index).faults) {
    if (broken.has(fault.zone)) continue
    issues.push(
      issue(
        'room',
        fault.zone,
        'room/zone-not-in-room',
        `Room ${quoted(fault.zone)} is marked as a zone of room ${quoted(fault.room)}, but ${fault.why}. It is counted ` +
          `as a room of its own. Draw it within the room it is part of, on the same floor, or leave out ${quoted('partOf')}.`,
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
      `Rooms ${quoted(a)} and ${quoted(b)} cover the same ${m2(o.shared)} of floor${walls}, so that floor is counted ` +
      `twice, once in each. If one is a copy of the other, remove it; if not, check their wall lists.`
    )
  }
  if (o.kind === 'inside') {
    const [inner, outer] = areaA <= areaB ? [a, b] : [b, a]
    const [innerArea, outerArea] = areaA <= areaB ? [areaA, areaB] : [areaB, areaA]
    return (
      `Room ${quoted(inner)} (${m2(innerArea)}) lies wholly inside room ${quoted(outer)} (${m2(outerArea)}), so ` +
      `${m2(o.shared)} of floor around ${at(o.at)} is counted twice, once in each. If ${quoted(inner)} ` +
      `sits inside ${quoted(outer)}, as a wardrobe pod or an en-suite does, mark ${quoted(inner)} with ` +
      `${quoted('inside')}: true and its floor is taken off ${quoted(outer)}. If not, check the wall list ` +
      `of ${quoted(outer)}: it most likely names a wall it should not.`
    )
  }
  return (
    `Rooms ${quoted(a)} (${m2(areaA)}) and ${quoted(b)} (${m2(areaB)}) overlap: ${m2(o.shared)} of floor around ` +
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
    const on = o.kind === 'same' || o.areas[1] > o.areas[0] - tolerance('areaEqual') ? b : a
    issues.push(issue('room', on, 'room/overlap', overlapMessage(o), 'warning'))
  }
  for (const floor of found.stopped) {
    issues.push(
      issue(
        'floor',
        floor,
        'floor/overlaps-unknown',
        `The rooms on floor ${quoted(floor)} were not all compared to see whether they overlap: the plan has ` +
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
        `Rooms ${quoted(a)} and ${quoted(b)} could not be compared to see whether they overlap: ${u.reason}.`,
        'warning'
      )
    )
  }
}

/**
 * Wall faults (`wallFaults.ts`, MSG-12): walls that stop short of their corner or run on past it,
 * walls on top of walls, a wall listed twice, a wall across a room that does not list it. One
 * warning each, on the wall (on the room for a wall it lists twice), ending with its fix.
 */
/** MSG-5: what is wrong with a room measured as if it were closed, and so follows from the wall that leaves it open. */
const OUTLINE_CODES = new Set(['room/space-mismatch', 'room/not-enclosed', 'room/overlap'])

function validateWallFaults(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  const faults = wallFaults(plan, { index, broken })
  // MSG-5: a wall that stops short of its corner, or leaves a gap, leaves its rooms open; Grid
  // measures each as if it were closed. What is then wrong with those rooms' outlines, and the
  // walls found standing in them, follows from that wall: the first such wall of each room.
  const openedBy = new Map<string, string>()
  for (const fault of faults) {
    if (fault.kind !== 'short' && fault.kind !== 'gap') continue
    for (const room of fault.rooms) if (!openedBy.has(room)) openedBy.set(room, fault.walls[0]!)
  }
  for (const [i, found] of issues.entries()) {
    if (found.causedBy !== undefined || !OUTLINE_CODES.has(found.code)) continue
    const cause = openedBy.get(found.id)
    if (cause !== undefined) issues[i] = followOn(found, cause)
  }
  for (const fault of faults) {
    const onRoom = fault.kind === 'listed-twice'
    const inRoom = fault.kind === 'crosses-room' || fault.kind === 'stands-in-room'
    const cause = inRoom ? fault.rooms.map((room) => openedBy.get(room)).find((wall) => wall !== undefined && wall !== fault.walls[0]) ?? null : null
    issues.push(
      followOn(
        issue(
          onRoom ? 'room' : 'wall',
          onRoom ? fault.rooms[0]! : fault.walls[0]!,
          onRoom ? 'room/wall-listed-twice' : `wall/${fault.kind}`,
          fault.message,
          'warning'
        ),
        cause
      )
    )
  }
}

/**
 * Walls whose stated kind and worked-out kind disagree (`exposure.ts`, MSG-13), in one line each:
 * a wall stated `exterior` with rooms on both sides keeps its kind; a wall stated `partition`
 * that faces outside is treated as an outside wall.
 */
function validateKinds(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  for (const sides of kindDisagreements(plan, index)) {
    if (broken.has(sides.wall) || sides.differs === null) continue
    const length = `${metresText(sides.differs.length)} m`
    const inside = [...new Set(sides.stretches.filter((s) => s.worked === 'interior').flatMap((s) => [...s.left, ...s.right]))]
    const facing = [...new Set(sides.stretches.filter((s) => s.worked === 'exterior').flatMap((s) => [...s.left, ...s.right]))]
    const message =
      sides.differs.stands === 'kept'
        ? `Wall ${quoted(sides.wall)} is stated exterior, but rooms lie on both its sides along ${length} ` +
          `(${names(inside.map(quoted))}). It is kept as an outside wall, as stated; if it is an inside wall, leave out its kind.`
        : `Wall ${quoted(sides.wall)} is stated a partition, but faces outside along ${length}: room ` +
          `${names(facing.map(quoted))} lies on one side and no room on the other. It is treated as an outside wall.`
    issues.push(issue('wall', sides.wall, 'wall/kind-differs', message, 'warning'))
  }
}

/**
 * Stairs that cannot be laid out, and ends of a stair in no room (`planStairs`, LVL-3). An error
 * leaves the stair out of every view and of the way-out check; it never makes a wall or a room
 * broken. A floor's slice says the problems of the stairs that start or end on it.
 */
function validateStairs(plan: FloorPlan, broken: ReadonlySet<string>, issues: Issue[]): void {
  // A slice keeps the plan's stairs (`planForFloor`), so this costs nothing in a plan with none.
  if ((plan.stairs ?? []).length === 0) return
  for (const problem of planStairs(plan, isFloorSlice(plan) ? brokenOnFloor : () => broken).problems) {
    issues.push(issue('stair', problem.stair, problem.code, problem.message, problem.severity))
  }
}

/** The rooms, walls and openings validation leaves out of one floor's slice, without the checks on the whole plan. */
export function brokenOnFloor(slice: FloorPlan): ReadonlySet<string> {
  return validatePlan(slice, undefined, { spaces: false }).broken
}

export interface ValidateOptions {
  /**
   * Whether to work out the spaces the walls enclose and report floor no room claims and rooms
   * that do not match their space (`validateSpaces`), rooms that overlap (`validateRoomOverlaps`)
   * rooms marked `inside` that no room holds (`validateNesting`), the wall faults
   * (`validateWallFaults`) and walls whose stated kind disagrees with the rooms on their sides
   * (`validateKinds`), and the checks on floor levels and heights (`levelIssues`, LVL-1), which
   * read the whole plan: run them on the plan, not on one floor's slice. On by default. Those lines
   * are warnings and never change `broken`, so a caller that only needs `broken` can leave them
   * out: joining every wall of a floor costs more than every other check together.
   */
  readonly spaces?: boolean
  /**
   * Entries of the tolerance table changed for this check, for a survey or a scan that is less
   * exact than a drawing (`withTolerances` in `tolerances.ts`).
   */
  readonly tolerances?: ToleranceChanges
  /**
   * MSG-6: the ids of walls the reader left out (`readPlanParts`). A room or an opening that rests
   * on one is left out too, and its line names the wall and why it is not there, instead of a
   * wall the plan does not have.
   */
  readonly leftOutWalls?: ReadonlySet<string>
  /**
   * MSG-5: every wall, room and opening the reader left out (`readPlanParts`), for the issues that
   * follow from one to name it as their cause: floor no room claims where a left-out room was.
   */
  readonly leftOutParts?: readonly LeftOutPart[]
}

/**
 * WRT-2: in a plan written rooms first, each room's boundary is derived: Grid worked it out from
 * where the rooms are, and `written` keeps its fingerprint. A boundary that no longer matches
 * was edited by hand, and is refused with its own code; the room is left out until the rooms
 * text is written again, or `written` is taken out to keep the plan as a hand-written one.
 */
function validateDerived(plan: FloorPlan, issues: Issue[], broken: Set<string>): void {
  for (const room of boundariesEdited(plan)) {
    if (broken.has(room.id)) continue
    issues.push(
      issue(
        'room',
        room.id,
        'room/derived-edited',
        `Room ${quoted(room.id)}'s boundary was changed by hand, but this plan was written rooms first and Grid works out each room's walls from where the rooms are. Change the rooms text and write it again (grid write), or take "written" out of the plan to keep it as a hand-written one`
      )
    )
    broken.add(room.id)
  }
}

/**
 * Checks the whole plan. Never throws, except for a `tolerances` change that is not one
 * (`withTolerances`).
 */
export function validatePlan(
  plan: FloorPlan,
  index: PlanIndex = indexPlan(plan),
  options: ValidateOptions = {}
): ValidationResult {
  if (options.tolerances !== undefined && Object.keys(options.tolerances).length > 0) {
    const { tolerances, ...rest } = options
    return withTolerances(tolerances, () => validatePlan(plan, index, rest))
  }
  const issues: Issue[] = []
  const broken = new Set<string>()
  // MSG-6: a wall the reader left out is not in the plan; what rests on it is left out with it.
  // An id a part of the plan still has is not one of them.
  const present = new Set([...plan.walls, ...plan.rooms, ...plan.openings].map((part) => part.id))
  const leftOut = new Set([...(options.leftOutWalls ?? [])].filter((id) => !present.has(id)))
  for (const id of leftOut) broken.add(id)
  // MSG-5: a plan with no walls whose rooms and openings name walls. Every one of them is left
  // out for that one reason, and its line follows from this one.
  const noWalls = plan.walls.length === 0 && leftOut.size === 0 && plan.rooms.length + plan.openings.length > 0

  validateOrigin(plan, issues)
  if (noWalls) {
    issues.push(
      issue(
        'plan',
        'plan',
        'plan/no-walls',
        `The plan has no walls, but ${plan.rooms.length} ${plan.rooms.length === 1 ? 'room' : 'rooms'} and ${plan.openings.length} ${plan.openings.length === 1 ? 'opening' : 'openings'} name walls. Nothing can be drawn or measured until the walls are in the plan`
      )
    )
  }
  // First: every check below resolves entities by id, so it has to know which
  // ids cannot be resolved at all.
  const duplicated = validateDuplicateIds(plan, issues, broken)
  validateIdSpelling(plan, issues, broken)
  validateFloorIdSpelling(plan, issues)
  validateFloors(plan, index, duplicated, issues, broken)

  for (const wall of plan.walls) {
    if (!validateWall(wall, issues)) broken.add(wall.id)
  }

  for (const opening of plan.openings) {
    if (!validateOpening(opening, index, broken, issues, leftOut, noWalls)) broken.add(opening.id)
  }

  validateOverlaps(index, broken, issues)

  for (const room of plan.rooms) {
    // Already faulted (e.g. it reaches across floors) — one fault, one issue.
    if (broken.has(room.id)) continue

    if (roomWallIds(room).some((wallId) => broken.has(wallId))) {
      const gone = roomWallIds(room).filter((wallId) => leftOut.has(wallId))
      const message =
        gone.length > 0
          ? `Room ${quoted(room.id)} rests on ${gone.length === 1 ? 'wall' : 'walls'} ${quotedList([...new Set(gone)])}, left out when the plan was read`
          : `Room ${quoted(room.id)} rests on an invalid wall`
      // MSG-5: it follows from the first of those walls, a wall left out first.
      const cause = gone[0] ?? roomWallIds(room).find((wallId) => broken.has(wallId))!
      issues.push(followOn(issue('room', room.id, 'room/broken-wall', message), cause))
      broken.add(room.id)
      continue
    }

    try {
      const polygon = roomPolygon(room, index)
      if (area(polygon) < tolerance('areaEqual')) {
        issues.push(issue('room', room.id, 'room/empty', `Room ${quoted(room.id)} encloses zero area`))
        broken.add(room.id)
      }
    } catch (error) {
      issues.push(
        followOn(
          issue(
            'room',
            room.id,
            // The outline says why it failed: not closable, out of order, inside out, or a hole
            // that does not lie inside it (ARE-6).
            error instanceof RoomOutlineError ? error.code : 'room/unclosed',
            error instanceof Error ? error.message : String(error)
          ),
          noWalls ? 'plan' : null
        )
      )
      broken.add(room.id)
    }
  }

  validateDerived(plan, issues, broken)
  validatePlausibility(plan, index, broken, issues)
  // CNT-12: after the rooms, which a fixture is matched to, and the walls it may run into.
  issues.push(...itemIssues(plan, index, broken))
  // CNT-13: a fixture standing in front of a doorway, or of a window higher than its sill.
  issues.push(...itemUseIssues(plan, index, broken))

  if (options.spaces !== false) issues.push(...levelIssues(plan, broken, buildingKind(plan)))
  if (options.spaces !== false) validateStairs(plan, broken, issues)

  if (options.spaces !== false) {
    const spaces = validateSpaces(plan, index, broken, issues, options.leftOutParts ?? [])
    traceItemRooms(plan, spaces, broken, options.leftOutParts ?? [], issues)
    validateNesting(plan, index, broken, issues)
    validateZones(index, broken, issues)
    validateRoomOverlaps(plan, index, broken, issues)
    validateWallFaults(plan, index, broken, issues)
    // MSG-16: where each opening stands, against the walls that meet its wall.
    issues.push(...openingPlaceIssues(plan, index, broken))
    validateKinds(plan, index, broken, issues)
  }

  return { issues, broken }
}
