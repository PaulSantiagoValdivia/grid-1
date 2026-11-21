/**
 * Did an edit stay inside the area the assistant said it was editing?
 *
 * Targets come from the assistant, not from parsing what the user typed: this
 * only checks a list. What may change is the named rooms, every wall on their
 * boundary in either version, the openings on those walls, the rooms that
 * share one of those walls (a bigger kitchen has to push into its neighbour),
 * and everything on a named floor. Everything else must stay as it was.
 *
 * Three refinements. A neighbour may change shape,
 * because the named room pushes into it, but not disappear or be renamed. An
 * entity outside the area that the edit broke is returned as an issue, since
 * it was fine before the turn. And an id that changed with nothing else is not
 * an edit the user should see: the pair's changes are dropped and the
 * `suspected_id_churn` issue stays, so the id can be logged or fixed.
 *
 * A wall outside the area that was only trimmed to stay joined to a wall inside
 * it is not an edit either: one end moved along its own
 * axis and sat on the same inside wall before and after, with nothing else
 * changed. A bigger study shortens the living room wall that meets it, and
 * putting that wall back would leave the living room open.
 *
 * Movements under a centimetre are not edits, so rounding noise does not raise
 * a warning. Nothing named means nothing checked: no area is guessed.
 */

import type { FloorPlan, Opening, Room, Wall } from '../plan'
import { roomWallIds } from '../plan'
import { DEFAULT_FLOOR, floorOf } from '../floors'
import { compareIssues } from './order'
import { openingProps, roomProps, wallProps } from './props'
import { assess, assessmentIssues } from './validity'
import { TOLERANCES, tolerance } from '../tolerances'
import type {
  DiffIssue,
  EntityRef,
  PlanChange,
  PlanDiff,
  PropChange,
  PropValue,
  ScopeOptions,
  ScopeResult,
  ScopeTargets
} from './types'

/** A centimetre: below this, a movement is rounding, not an edit. */
export const MIN_MOVEMENT_M = TOLERANCES.diffMovement.value

/** How far a numeric property moved, or null if it is not a number or a point. */
function distanceOf(before: PropValue, after: PropValue): number | null {
  if (typeof before === 'number' && typeof after === 'number') return Math.abs(after - before)
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === 2 &&
    after.length === 2 &&
    typeof before[0] === 'number' &&
    typeof after[0] === 'number'
  ) {
    return Math.max(
      Math.abs((after[0] as number) - (before[0] as number)),
      Math.abs((after[1] as number) - (before[1] as number))
    )
  }
  return null
}

/** True when every property moved less than `minMovement`; true for no properties. */
function allTiny(props: readonly PropChange[], minMovement: number): boolean {
  return props.every((prop) => {
    const moved = distanceOf(prop.before, prop.after)
    return moved !== null && moved < minMovement
  })
}

/** True when the change is nothing but small movements. */
function onlyTinyMovements(change: PlanChange, minMovement: number): boolean {
  if (change.kind !== 'modified' || change.props.length === 0) return false
  return allTiny(change.props, minMovement)
}

/** Whether `p` lies on the segment from `a` to `b`, within `tolerance`. */
function onSegment(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  tolerance: number
): boolean {
  const ax = b[0] - a[0]
  const ay = b[1] - a[1]
  const lengthSquared = ax * ax + ay * ay
  const along = lengthSquared === 0 ? 0 : ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / lengthSquared
  const t = Math.min(1, Math.max(0, along))
  return Math.hypot(a[0] + t * ax - p[0], a[1] + t * ay - p[1]) <= tolerance
}

/**
 * A wall change that is only one end sliding along the wall's own axis while it
 * stays on the same wall from `area`, in both versions and on the same floor.
 */
function trimmedToStayJoined(
  change: PlanChange,
  base: FloorPlan,
  head: FloorPlan,
  area: ReadonlySet<string>,
  tolerance: number
): boolean {
  if (change.entity.type !== 'wall' || change.kind !== 'modified' || change.motion?.kind !== 'resized') return false
  const moved = change.motion.fixedEnd === 'start' ? 'end' : 'start'
  if (change.props.length !== 1 || change.props[0]!.key !== moved) return false
  const id = change.entity.id
  const was = base.walls.find((w) => w.id === id)
  const is = head.walls.find((w) => w.id === id)
  if (!was || !is) return false
  return [...area].some((joinedId) => {
    if (joinedId === id) return false
    const joinedWas = base.walls.find((w) => w.id === joinedId)
    const joinedIs = head.walls.find((w) => w.id === joinedId)
    if (!joinedWas || !joinedIs) return false
    if (floorOf(joinedWas) !== floorOf(was) || floorOf(joinedIs) !== floorOf(is)) return false
    return (
      onSegment(was[moved], joinedWas.start, joinedWas.end, tolerance) &&
      onSegment(is[moved], joinedIs.start, joinedIs.end, tolerance)
    )
  })
}

const reversed = (wall: Wall): Wall => ({ ...wall, start: wall.end, end: wall.start })

/**
 * The churn pairs that are the same entity apart from its id, as earlier id ->
 * later id. Walls first, so a door or a room on a renamed wall is read through
 * the new id. A wall may also be listed end to start.
 */
function idOnlyRenames(
  diff: PlanDiff,
  base: FloorPlan,
  head: FloorPlan,
  minMovement: number
): Map<string, string> {
  const renames = new Map<string, string>()
  const pairs = diff.issues
    .filter((issue) => issue.code === 'suspected_id_churn' && issue.entities.length === 2)
    .map((issue) => [issue.entities[0]!, issue.entities[1]!] as const)
  const find = <T extends { readonly id: string }>(items: readonly T[], id: string) =>
    items.find((item) => item.id === id)

  for (const [removed, added] of pairs) {
    if (removed.type !== 'wall') continue
    const was = find<Wall>(base.walls, removed.id)
    const is = find<Wall>(head.walls, added.id)
    if (!was || !is) continue
    const same =
      allTiny(wallProps(was, is, 0), minMovement) ||
      allTiny(wallProps(reversed(was), is, 0), minMovement)
    if (same) renames.set(removed.id, added.id)
  }
  for (const [removed, added] of pairs) {
    if (removed.type === 'opening') {
      const was = find<Opening>(base.openings, removed.id)
      const is = find<Opening>(head.openings, added.id)
      if (was && is && allTiny(residual(openingProps(was, is, 0), renames), minMovement)) {
        renames.set(removed.id, added.id)
      }
    } else if (removed.type === 'room') {
      const was = find<Room>(base.rooms, removed.id)
      const is = find<Room>(head.rooms, added.id)
      if (was && is && allTiny(residual(roomProps(was, is, 0), renames), minMovement)) {
        renames.set(removed.id, added.id)
      }
    }
  }
  return renames
}

/** The properties left once a host or a boundary that only changed ids is set aside. */
function residual(props: readonly PropChange[], renames: ReadonlyMap<string, string>): PropChange[] {
  const renamed = (id: string): string => renames.get(id) ?? id
  return props.filter((prop) => {
    if (prop.key === 'wall' && typeof prop.before === 'string') {
      return renamed(prop.before) !== prop.after
    }
    if (prop.key === 'boundary' && Array.isArray(prop.before) && Array.isArray(prop.after)) {
      const before = (prop.before as readonly string[]).map(renamed)
      const after = prop.after as readonly string[]
      return before.length !== after.length || before.some((id, i) => id !== after[i])
    }
    return true
  })
}

export function changesOutsideScope(
  diff: PlanDiff,
  base: FloorPlan,
  head: FloorPlan,
  targets: ScopeTargets,
  options: ScopeOptions = {}
): ScopeResult {
  const named = [...new Set(targets.rooms)]
  const floors = new Set(targets.floors ?? [])
  if (named.length === 0 && floors.size === 0) return { checked: false, changes: [], issues: [] }

  const minMovement = options.minMovement ?? tolerance('diffMovement')
  const issues: DiffIssue[] = []

  // The named rooms, as either version has them.
  const roomsIn = [...base.rooms, ...head.rooms]
  const known = new Set(roomsIn.map((r) => r.id))
  for (const id of named) {
    if (known.has(id)) continue
    issues.push({
      code: 'unknown_target',
      message: `The assistant named room ${id}, which is in neither plan`,
      entities: [{ type: 'room', id }]
    })
  }
  const namedRooms = new Set(named.filter((id) => known.has(id)))

  const walls = new Set<string>()
  for (const room of roomsIn) {
    if (namedRooms.has(room.id)) for (const id of roomWallIds(room)) walls.add(id)
  }
  const rooms = new Set(namedRooms)
  for (const room of roomsIn) {
    if (roomWallIds(room).some((id) => walls.has(id))) rooms.add(room.id)
  }
  const openings = new Set<string>()
  for (const opening of [...base.openings, ...head.openings]) {
    if (walls.has(opening.wall)) openings.add(opening.id)
  }

  const wallFloor = new Map<string, string>()
  for (const wall of [...base.walls, ...head.walls]) wallFloor.set(wall.id, floorOf(wall))
  const roomFloor = new Map<string, string>()
  for (const room of [...base.rooms, ...head.rooms]) roomFloor.set(room.id, floorOf(room))
  const openingFloor = new Map<string, string>()
  for (const opening of [...base.openings, ...head.openings]) {
    openingFloor.set(opening.id, wallFloor.get(opening.wall) ?? DEFAULT_FLOOR.id)
  }

  /** Whether one entity, changed or not, is in the area the assistant named. */
  const inside = (ref: EntityRef): boolean => {
    switch (ref.type) {
      case 'wall':
        return walls.has(ref.id) || floors.has(wallFloor.get(ref.id) ?? '')
      case 'opening':
        return openings.has(ref.id) || floors.has(openingFloor.get(ref.id) ?? '')
      case 'room':
        return rooms.has(ref.id) || floors.has(roomFloor.get(ref.id) ?? '')
      case 'floor':
        return floors.has(ref.id)
    }
  }

  // An id that changed and nothing else: neither of the pair's changes is an edit.
  const renames = idOnlyRenames(diff, base, head, minMovement)
  const renamedIds = new Set([...renames.keys(), ...renames.values()])
  const onlyRenamed = (change: PlanChange): boolean =>
    renamedIds.has(change.entity.id) ||
    (change.kind === 'modified' &&
      change.props.length > 0 &&
      allTiny(residual(change.props, renames), minMovement))

  // A room in the area only because it borders a named one.
  const neighbourOnly = (change: PlanChange): boolean =>
    change.entity.type === 'room' &&
    !namedRooms.has(change.entity.id) &&
    !floors.has(roomFloor.get(change.entity.id) ?? '') &&
    !floors.has(change.floor)

  const returned = new Set<string>()
  for (const change of diff.changes) {
    if (change.derived || onlyRenamed(change)) continue
    const vanishedOrRenamed =
      change.kind === 'removed' || change.props.some((prop) => prop.key === 'name')
    if (neighbourOnly(change) && vanishedOrRenamed) {
      returned.add(change.id)
      continue
    }
    if (inside(change.entity) || floors.has(change.floor)) continue
    if (trimmedToStayJoined(change, base, head, walls, minMovement)) continue
    if (!onlyTinyMovements(change, minMovement)) returned.add(change.id)
  }
  // A derived change is only as loud as the change it follows.
  for (const change of diff.changes) {
    if (!change.derived || inside(change.entity) || floors.has(change.floor)) continue
    if (change.dependsOn.some((id) => returned.has(id))) returned.add(change.id)
  }

  // Issues that are about something the edit did: a possible id change, a room that broke.
  for (const issue of diff.issues) {
    if (issue.code !== 'suspected_id_churn' && issue.code !== 'room_unclosed') continue
    if (issue.entities.some((ref) => !inside(ref))) issues.push(issue)
  }

  // What the edit broke outside the area: fine in the earlier plan, not in the later one.
  const before = assess(base)
  const after = assess(head)
  const key = (ref: EntityRef): string => `${ref.type}:${ref.id}`
  const wasBroken = new Set([...before.invalid, ...before.dangling].map(key))
  const newlyBroken = (ref: EntityRef): boolean => !wasBroken.has(key(ref)) && !inside(ref)
  issues.push(
    ...assessmentIssues('head', {
      skipped: new Set(),
      invalid: after.invalid.filter(newlyBroken),
      dangling: after.dangling.filter(newlyBroken)
    })
  )

  return {
    checked: true,
    changes: diff.changes.filter((c) => returned.has(c.id)),
    issues: issues.sort(compareIssues)
  }
}
