/**
 * Revision keys: a short string that changes only when the geometry does.
 *
 * The watcher hands over a brand new FloorPlan object every time the file is
 * touched, even when nothing meaningful moved — a reformat, an unrelated
 * property, a room rename. Comparing objects by identity therefore rebuilds
 * everything on every write.
 *
 * Comparing these keys instead answers the question that actually matters:
 * would this produce a different shape? In 2D the difference is a few wasted
 * microseconds, but in 3D each rebuilt wall means retriangulating an extrusion
 * and re-uploading it to the GPU.
 */

import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { indexPlan, openingsOf } from './plan'
import type { WallEnds } from './wall'

/**
 * Millimeter precision, which is finer than any plan needs and coarse enough
 * that floating-point noise does not invent changes.
 */
function num(value: number): string {
  return value.toFixed(4)
}

function openingKey(opening: Opening): string {
  // `type` is in here because a door and a window of identical size still cut
  // the same hole but are drawn differently in plan.
  return [
    opening.id,
    opening.type,
    num(opening.offset),
    num(opening.width),
    num(opening.height),
    num(opening.sill)
  ].join(':')
}

/**
 * Everything that changes a wall's shape, and nothing else.
 *
 * `kind` is deliberately absent: it changes the line weight, never the mesh.
 * Including it would rebuild the geometry on a purely cosmetic edit.
 */
export function wallRevision(wall: Wall, openings: readonly Opening[] = [], ends?: WallEnds): string {
  const base = [
    wall.id,
    num(wall.start[0]),
    num(wall.start[1]),
    num(wall.end[0]),
    num(wall.end[1]),
    num(wall.thickness),
    num(wall.height),
    wall.virtual === true ? 'v' : '-'
  ].join(':')

  // A wall joined to others changes shape when they move (SHT-2), so its corners are part of it.
  const corners =
    ends === undefined ? '' : `@${[ends.start.left, ends.start.right, ends.end.left, ends.end.right].map(num).join(':')}`

  if (openings.length === 0) return `${base}${corners}`

  // Sorted so the key does not depend on the order the file happens to list
  // openings in.
  const cuts = openings.map(openingKey).sort().join('|')
  return `${base}${corners}#${cuts}`
}

/** Revision of every wall in the plan, keyed by wall id. */
export function wallRevisions(
  plan: FloorPlan,
  index: PlanIndex = indexPlan(plan)
): Map<string, string> {
  const revisions = new Map<string, string>()
  for (const wall of plan.walls) {
    revisions.set(wall.id, wallRevision(wall, openingsOf(index, wall.id)))
  }
  return revisions
}

/**
 * Revision of a room's outline. Rooms depend on the walls they reference, so
 * the key folds in those walls' revisions.
 */
export function roomRevision(
  roomId: string,
  boundary: readonly string[],
  wallKeys: ReadonlyMap<string, string>
): string {
  const walls = boundary.map((id) => wallKeys.get(id) ?? `?${id}`).join('|')
  return `${roomId}#${walls}`
}

/**
 * Which floor everything is on, plus how the floors are named and ordered.
 *
 * Deliberately absent from `wallRevision`: moving a wall to another storey does
 * not change its shape, and that key drives the 3D geometry cache. It belongs
 * here, because it does change what the plan draws.
 *
 * Sorted, so listing the same floors in another order is not a change. Empty for
 * a plan that never mentions floors, so its key stays what it always was.
 */
function floorPart(plan: FloorPlan): string {
  const assignments = [
    ...plan.walls.map((wall) => `${wall.id}=${wall.floor ?? ''}`),
    ...plan.rooms.map((room) => `${room.id}=${room.floor ?? ''}`)
  ]
  const named = assignments.filter((entry) => !entry.endsWith('='))

  const registry = (plan.floors ?? []).map(
    (floor) => `${floor.id}:${floor.name}:${floor.level}`
  )

  if (named.length === 0 && registry.length === 0) return ''
  return [...named.sort(), ...registry.sort()].join('|')
}

/** Revision of the whole plan: changes when any wall, room or floor does. */
export function planRevision(plan: FloorPlan): string {
  const index = indexPlan(plan)
  const walls = wallRevisions(plan, index)

  const wallPart = [...walls.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, key]) => key)
    .join('|')

  const roomPart = [...plan.rooms]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((room) => roomRevision(room.id, room.boundary, walls))
    .join('|')

  return `${plan.version}#${wallPart}#${roomPart}#${floorPart(plan)}`
}

/**
 * Which walls actually changed between two revision maps.
 *
 * `changed` covers both new and modified walls; `removed` are the ones whose
 * geometry can be released.
 */
export function diffRevisions(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>
): { changed: string[]; removed: string[] } {
  const changed: string[] = []
  const removed: string[] = []

  for (const [id, key] of next) {
    if (previous.get(id) !== key) changed.push(id)
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) removed.push(id)
  }

  return { changed, removed }
}
