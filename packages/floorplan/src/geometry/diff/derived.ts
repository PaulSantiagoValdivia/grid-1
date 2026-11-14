/**
 * Openings that moved only because their wall did.
 *
 * An opening is measured from its wall's start (C2), so a wall that moves, or
 * is cut at its start, carries its openings with it, while one that is only
 * extended at the far end does not. What counts is where the opening sits on
 * the plan, not whether its numbers changed.
 */

import type { Opening, PlanIndex, Wall } from '../plan'
import { floorOf } from '../floors'
import { add, fromTuple, scale, sub } from '../vec2'
import type { Vec2 } from '../vec2'
import { wallAxis } from '../wall'
import type { PlanChange } from './types'

/** Where the middle of the opening sits on the plan, or null if its wall has no axis. */
function centreOnPlan(opening: Opening, wall: Wall): Vec2 | null {
  try {
    const axis = wallAxis(wall)
    return add(fromTuple(wall.start), scale(axis.dir, opening.offset + opening.width / 2))
  } catch {
    return null
  }
}

/** `pairs` are the openings in both versions with no change of their own. */
export function derivedOpenings(
  pairs: readonly (readonly [before: Opening, after: Opening])[],
  baseIndex: PlanIndex,
  headIndex: PlanIndex,
  wallChanges: ReadonlyMap<string, PlanChange>,
  epsilon: number
): PlanChange[] {
  const derived: PlanChange[] = []

  for (const [before, after] of pairs) {
    const hostChange = wallChanges.get(after.wall)
    if (hostChange === undefined) continue

    const wallBefore = baseIndex.wallsById.get(before.wall)
    const wallAfter = headIndex.wallsById.get(after.wall)
    if (wallBefore === undefined || wallAfter === undefined) continue

    const was = centreOnPlan(before, wallBefore)
    const is = centreOnPlan(after, wallAfter)
    if (was === null || is === null) continue

    const moved = sub(is, was)
    if (Math.abs(moved.x) <= epsilon && Math.abs(moved.y) <= epsilon) continue

    derived.push({
      id: `opening:${after.id}:modified`,
      entity: { type: 'opening', id: after.id },
      floor: floorOf(wallAfter),
      kind: 'modified',
      props: [],
      summary: '',
      dependsOn: [hostChange.id],
      derived: true
    })
  }

  return derived
}
