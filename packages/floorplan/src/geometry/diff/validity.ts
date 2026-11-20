/**
 * What in a plan cannot be compared.
 *
 * `validatePlan` already says what cannot be drawn. The diff compares only what
 * is valid wherever it exists, and names the rest, so one bad wall never hides
 * the rest of an edit and never makes the diff throw.
 *
 * Only an entity that is itself invalid is skipped. Validation cascades a bad
 * wall to the rooms and openings resting on it, because a view cannot draw
 * them; the diff does not draw, and their name, boundary, offset and width are
 * plain data. Skipping them would let one bad wall hide a rename and a door
 * edit made in the same turn. A room that merely fails to close is kept for the
 * same reason: "this room stopped closing" is exactly what a person reviewing
 * the edit needs to hear, and it is reported through its area.
 */

import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { compareRefs } from './order'
import type { DiffIssue, EntityRef } from './types'

/** Faults that follow from something else (a room's outline, a wall it rests on), not from the entity's own data. */
const FOLLOW_ON_FAULTS = new Set([
  'room/unclosed',
  'room/out-of-order',
  'room/inside-out',
  'room/empty',
  'room/broken-wall',
  'opening/broken-wall'
])

export interface Assessment {
  /** Ids to leave out of the comparison. */
  readonly skipped: ReadonlySet<string>
  readonly invalid: readonly EntityRef[]
  /** Openings whose wall does not exist. */
  readonly dangling: readonly EntityRef[]
}


export function assess(plan: FloorPlan): Assessment {
  const index = indexPlan(plan)
  const { issues, broken } = validatePlan(plan, index)

  // An id is skipped when any error names it for a fault of its own. One with no error at
  // all is skipped too: validation said it was broken, and the diff does not second-guess it.
  const ownFault = new Set<string>()
  const named = new Set<string>()
  for (const issue of issues) {
    if (issue.severity !== 'error') continue
    named.add(issue.id)
    if (!FOLLOW_ON_FAULTS.has(issue.code)) ownFault.add(issue.id)
  }

  const dangling = plan.openings
    .filter((opening) => !index.wallsById.has(opening.wall))
    .map((opening): EntityRef => ({ type: 'opening', id: opening.id }))
  const danglingIds = new Set(dangling.map((ref) => ref.id))

  const skipped = new Set<string>([...broken].filter((id) => ownFault.has(id) || !named.has(id)))
  for (const id of danglingIds) skipped.add(id)

  // A shared id is called a wall first, then an opening, then a room: the later sets win.
  const types = new Map<string, EntityRef['type']>()
  for (const [type, items] of [
    ['room', plan.rooms],
    ['opening', plan.openings],
    ['wall', plan.walls]
  ] as const) {
    for (const item of items) types.set(item.id, type)
  }
  const invalid: EntityRef[] = []
  for (const id of skipped) {
    const type = types.get(id)
    if (type !== undefined && !danglingIds.has(id)) invalid.push({ type, id })
  }

  return { skipped, invalid: invalid.sort(compareRefs), dangling: dangling.sort(compareRefs) }
}

/** The plan without the entities in `skip`. Floors are kept as they are. */
export function without(plan: FloorPlan, skip: ReadonlySet<string>): FloorPlan {
  return {
    ...plan,
    walls: plan.walls.filter((w) => !skip.has(w.id)),
    rooms: plan.rooms.filter((r) => !skip.has(r.id)),
    openings: plan.openings.filter((o) => !skip.has(o.id))
  }
}

type Side = 'base' | 'head'

const SIDE_NAME: Record<Side, string> = { base: 'earlier', head: 'later' }

export function assessmentIssues(side: Side, assessment: Assessment): DiffIssue[] {
  const issues: DiffIssue[] = []
  const name = SIDE_NAME[side]

  if (assessment.invalid.length > 0) {
    issues.push({
      code: side === 'base' ? 'invalid_base' : 'invalid_head',
      message:
        `In the ${name} plan, ${assessment.invalid.map((e) => e.id).join(', ')} cannot be ` +
        `drawn, so ${assessment.invalid.length === 1 ? 'it was' : 'they were'} not compared`,
      entities: assessment.invalid
    })
  }
  for (const ref of assessment.dangling) {
    issues.push({
      code: 'dangling_host',
      message: `In the ${name} plan, opening ${ref.id} sits on a wall that does not exist`,
      entities: [ref]
    })
  }
  return issues
}
