/**
 * WRT-6 (lab WR-15, AE-4): where the plan's values came from, read from its `marks` (C8).
 *
 * A mark names a part (a wall, room, opening, floor or fixture) by id and, when it is about one
 * value of it, that value: `{ part: 'wall', id: 'w1', value: 'height', source: 'assumed' }`. A
 * mark on a value wins over a mark on the whole part; of two marks on the same thing, the first
 * is read, as the first of two floors with one id is. A part no mark names says nothing about
 * where it came from: it is not "given" by default.
 *
 * Pure: a plan in, plain data out.
 */
import { DEFAULT_FLOOR_ID, type FloorPlan, type Mark, type MarkedPart, type MarkSource } from '../types/floorplan'

const key = (part: MarkedPart, id: string, value: string | null): string => `${part}\u0000${id}\u0000${value ?? ''}`

/** The plan's marks, found by part, id and value. */
export interface PlanMarks {
  /** Every mark, in the plan's order. */
  readonly all: readonly Mark[]
  /** The mark on this value, else on the whole part; null when neither is marked. */
  readonly of: (part: MarkedPart, id: string, value?: string) => Mark | null
  /** Whether the part, or any value of it, is marked assumed. */
  readonly assumed: (part: MarkedPart, id: string) => boolean
}

const NO_MARKS: PlanMarks = { all: [], of: () => null, assumed: () => false }

export function planMarks(plan: Pick<FloorPlan, 'marks'>): PlanMarks {
  const all = plan.marks ?? []
  if (all.length === 0) return NO_MARKS
  const found = new Map<string, Mark>()
  const assumed = new Set<string>()
  for (const mark of all) {
    const at = key(mark.part, mark.id, mark.value ?? null)
    if (!found.has(at)) found.set(at, mark)
  }
  // Only the mark read for each value counts: a later one on the same value is not read.
  for (const mark of found.values()) if (mark.source === 'assumed') assumed.add(`${mark.part}\u0000${mark.id}`)
  return {
    all,
    of: (part, id, value) => (value === undefined ? null : found.get(key(part, id, value))) ?? found.get(key(part, id, null)) ?? null,
    assumed: (part, id) => assumed.has(`${part}\u0000${id}`),
  }
}

/** The ids of each kind of part the plan has, for the marks to name. */
function partIds(plan: FloorPlan): Record<MarkedPart, ReadonlySet<string>> {
  const floors = new Set<string>([DEFAULT_FLOOR_ID, ...(plan.floors ?? []).map((f) => f.id)])
  for (const part of [...plan.walls, ...plan.rooms, ...(plan.items ?? [])]) if (part.floor !== undefined) floors.add(part.floor)
  return {
    wall: new Set(plan.walls.map((w) => w.id)),
    room: new Set(plan.rooms.map((r) => r.id)),
    opening: new Set(plan.openings.map((o) => o.id)),
    floor: floors,
    item: new Set((plan.items ?? []).map((i) => i.id)),
  }
}

/** A value, or a whole part, marked assumed: for the person to confirm. */
export interface AssumedValue {
  readonly part: MarkedPart
  readonly id: string
  /** The value assumed; null when the whole part is. */
  readonly value: string | null
  readonly tolerance: number | null
}

/**
 * What the plan marks assumed, in the order of its marks, once each: the list to confirm. A mark
 * on a part the plan does not have is not here (`marksWithNoPart`), nor one that a mark before
 * it on the same value overrides.
 */
export function assumedValues(plan: FloorPlan): AssumedValue[] {
  const ids = partIds(plan)
  const seen = new Set<string>()
  const out: AssumedValue[] = []
  for (const mark of plan.marks ?? []) {
    const at = key(mark.part, mark.id, mark.value ?? null)
    if (seen.has(at)) continue
    seen.add(at)
    if (mark.source !== 'assumed' || !ids[mark.part].has(mark.id)) continue
    out.push({ part: mark.part, id: mark.id, value: mark.value ?? null, tolerance: mark.tolerance ?? null })
  }
  return out
}

/** The marks that name a part the plan does not have: a part renamed or taken out since. */
export function marksWithNoPart(plan: FloorPlan): Mark[] {
  const ids = partIds(plan)
  return (plan.marks ?? []).filter((mark) => !ids[mark.part].has(mark.id))
}

/** How sure a wall's place is (AE-4): the source and tolerance of its mark, or of its ends'. */
export interface WallSureness {
  readonly source: MarkSource | null
  /** Metres, give or take, on where its faces are; null when no mark says. */
  readonly tolerance: number | null
}

/**
 * Where a wall's place came from and how sure it is: the mark on the whole wall, else the marks
 * on its ends (the larger tolerance; scanned before any other source). Thickness and height do
 * not move a face along the floor, so their marks are not read here.
 */
export function wallSureness(marks: PlanMarks, wallId: string): WallSureness {
  const whole = marks.of('wall', wallId)
  const ends = [marks.of('wall', wallId, 'start'), marks.of('wall', wallId, 'end')].filter((m): m is Mark => m !== null && m.value !== undefined)
  if (ends.length === 0) return { source: whole?.source ?? null, tolerance: whole?.tolerance ?? null }
  const tolerances = ends.map((m) => m.tolerance).filter((t): t is number => t !== undefined)
  return {
    source: ends.some((m) => m.source === 'scanned') ? 'scanned' : ends[0]!.source,
    tolerance: tolerances.length === 0 ? null : Math.max(...tolerances),
  }
}
