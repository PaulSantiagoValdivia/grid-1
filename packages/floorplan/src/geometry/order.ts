/**
 * QAR-5: one order for a plan's parts, so that an export does not depend on the order the
 * file lists them in (lab MS-21, L-12).
 *
 * Walls, rooms, openings and stairs are put in id order before an export is written. Two exports of
 * one building then compare line by line, and a real change shows up as a real difference.
 * The floors list is kept as written, because floors of one level are stacked in that order;
 * each room's outline is kept as written, because it is the room's own description.
 */
import type { FloorPlan } from '../types/floorplan'

const PIECES = /(\d+)/

/**
 * The order of two ids: piece by piece, a run of digits by its value (`w2` before `w10`) and
 * the rest by character code. Ids that read as the same number (`w01`, `w1`) are then put in
 * character order, so no two different ids compare equal and the order never hangs on the
 * order it was given.
 */
export function compareIds(a: string, b: string): number {
  if (a === b) return 0
  const x = a.split(PIECES)
  const y = b.split(PIECES)
  const shared = Math.min(x.length, y.length)
  for (let i = 0; i < shared; i++) {
    let p = x[i]!
    let q = y[i]!
    if (p === q) continue
    // `split` with a captured pattern puts the runs of digits at the odd places.
    if (i % 2 === 1) {
      p = p.replace(/^0+/, '')
      q = q.replace(/^0+/, '')
      if (p.length !== q.length) return p.length - q.length
      if (p === q) continue
    }
    return p < q ? -1 : 1
  }
  if (x.length !== y.length) return x.length - y.length
  return a < b ? -1 : 1
}

/** The part as text with its keys in order: what breaks a tie between two parts of one id. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)))
      : inner,
  )
}

function byId<T extends { readonly id: string }>(parts: readonly T[]): T[] {
  const keyed = parts.map((part) => ({ part, text: '' }))
  return keyed
    .sort((p, q) => {
      const order = compareIds(p.part.id, q.part.id)
      if (order !== 0) return order
      // Two parts with one id (a fault validation reports): the same one comes first either way.
      if (p.text === '') p.text = canonical(p.part)
      if (q.text === '') q.text = canonical(q.part)
      return p.text < q.text ? -1 : p.text > q.text ? 1 : 0
    })
    .map(({ part }) => part)
}

/** The plan with its walls, rooms, openings, items, stairs, flat types, flats, columns, grids, bays and ramps in id order. The plan given is not changed. */
export function inIdOrder(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    walls: byId(plan.walls),
    rooms: byId(plan.rooms),
    openings: byId(plan.openings),
    ...(plan.items !== undefined && { items: byId(plan.items) }),
    // LVL-3: only a plan that states stairs gains the key.
    ...(plan.stairs !== undefined && { stairs: byId(plan.stairs) }),
    // CNT-4: the flat types and the flats, so the IFC's zones do not hang on the list's order.
    ...(plan.flatTypes !== undefined && { flatTypes: byId(plan.flatTypes) }),
    ...(plan.flats !== undefined && { flats: byId(plan.flats) }),
    // CNT-16: the columns and the structural grids.
    ...(plan.columns !== undefined && { columns: byId(plan.columns) }),
    ...(plan.grids !== undefined && { grids: byId(plan.grids) }),
    // CNT-19: the parking bays and the ramps.
    ...(plan.bays !== undefined && { bays: byId(plan.bays) }),
    ...(plan.ramps !== undefined && { ramps: byId(plan.ramps) })
  }
}
