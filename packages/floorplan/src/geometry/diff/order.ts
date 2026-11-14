/**
 * The one order every list in a diff is sorted by, so the same two plans give
 * byte-identical output and no module drifts from another.
 */

import type { DiffIssue, EntityRef } from './types'

export const ENTITY_ORDER: Record<EntityRef['type'], number> = {
  floor: 0,
  wall: 1,
  opening: 2,
  room: 3
}

/** A byte comparison, so the order does not depend on the machine's locale. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function compareRefs(a: EntityRef, b: EntityRef): number {
  return ENTITY_ORDER[a.type] - ENTITY_ORDER[b.type] || compareText(a.id, b.id)
}

function entityKey(issue: DiffIssue): string {
  return issue.entities.map((e) => `${e.type}:${e.id}`).join(',')
}

/** By code, then by the entities it names, then by its text: never by file order. */
export function compareIssues(a: DiffIssue, b: DiffIssue): number {
  return (
    compareText(a.code, b.code) ||
    compareText(entityKey(a), entityKey(b)) ||
    compareText(a.message, b.message)
  )
}
