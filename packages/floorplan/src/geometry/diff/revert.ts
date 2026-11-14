/**
 * Puts changes back: the later plan with each named change undone from the
 * earlier one. Used to undo what the assistant changed outside the ask.
 *
 * Added entities leave, removed ones come back as they were (at the end of
 * their list), modified ones are replaced by their earlier version in place.
 * Ids name entities across the whole file (C5), so no floor is looked up.
 * Everything not named stays exactly as in `head`, the same objects.
 */

import type { FloorPlan } from '../plan'
import type { EntityType, PlanChange } from './types'

type Lists = Pick<FloorPlan, 'walls' | 'openings' | 'rooms'> & { floors?: FloorPlan['floors'] }
type ListKey = keyof Lists

const LIST: Record<EntityType, ListKey> = {
  wall: 'walls',
  opening: 'openings',
  room: 'rooms',
  floor: 'floors'
}

function revertList<T extends { readonly id: string }>(
  before: readonly T[],
  after: readonly T[],
  changes: readonly PlanChange[]
): T[] {
  const byId = new Map(before.map((item) => [item.id, item]))
  const drop = new Set<string>()
  const restore = new Set<string>()
  for (const change of changes) {
    if (change.kind === 'added') drop.add(change.entity.id)
    else restore.add(change.entity.id)
  }
  const kept = after
    .filter((item) => !drop.has(item.id))
    .map((item) => (restore.has(item.id) ? (byId.get(item.id) ?? item) : item))
  const present = new Set(kept.map((item) => item.id))
  for (const change of changes) {
    if (change.kind !== 'removed' || present.has(change.entity.id)) continue
    const earlier = byId.get(change.entity.id)
    if (earlier) {
      kept.push(earlier)
      present.add(earlier.id)
    }
  }
  return kept
}

export function revertChanges(base: FloorPlan, head: FloorPlan, changes: readonly PlanChange[]): FloorPlan {
  const result: FloorPlan = { ...head }
  for (const type of Object.keys(LIST) as EntityType[]) {
    const ofType = changes.filter((change) => change.entity.type === type)
    if (ofType.length === 0) continue
    const key = LIST[type]
    const reverted = revertList<{ readonly id: string }>(base[key] ?? [], head[key] ?? [], ofType)
    if (key === 'floors' && head.floors === undefined && reverted.length === 0) continue
    ;(result as Record<ListKey, unknown>)[key] = reverted
  }
  return result
}
