/**
 * The statuses the 2D canvas takes, read off a diff for one floor.
 *
 * The canvas draws one floor at a time and marks each wall, opening and room
 * by id, so this is a lookup and nothing more: the diff already decided what
 * changed and on which floor (the later one, for a wall that changed floor).
 */

import type { ChangeKind, PlanDiff } from './types'

/**
 * Each wall, opening and room changed on `floor`, by id, with its change's kind.
 * A derived change (an opening that followed its wall, a room its walls
 * resized) is `modified` like any other. An unchanged entity is absent.
 *
 * Floors themselves are left out: the canvas does not draw them, and a floor id
 * is not in the id namespace that walls, openings and rooms share.
 *
 * The result has the shape of the canvas's `DiffStatusMap`.
 *
 * Ids are unique within a plan, not across two versions: a wall removed and a
 * room added under the same id share one key, and the later change in the
 * diff's order (rooms after walls) wins. The diff itself keeps both changes.
 */
export function statusOf(diff: PlanDiff, floor: string): Readonly<Record<string, ChangeKind>> {
  const status: Record<string, ChangeKind> = {}
  for (const change of diff.changes) {
    if (change.floor !== floor || change.entity.type === 'floor') continue
    status[change.entity.id] = change.kind
  }
  return status
}
