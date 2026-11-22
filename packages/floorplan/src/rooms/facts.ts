/**
 * CNT-9: the facts of the person's own when a plan is written again from rooms text.
 *
 * Rooms text says where the rooms, walls and openings are; it does not hold the facts a part
 * carries (a fire rating, a department) or a room's stated number. So a plan read back as rooms
 * text and written again keeps them by id: a wall, opening, room or floor the text writes with
 * the id of one the plan had keeps that part's facts, and a room keeps its number, unless the
 * text states its own (a `raw` line does). A part the text no longer has takes its facts with it,
 * and `carryFacts` says which, so none is lost unseen.
 *
 * Pure: two plans in, a plan out.
 */
import type { FloorPlan } from '../types/floorplan'

type Part = { readonly id: string; readonly properties?: Readonly<Record<string, string | number | boolean>> | undefined; readonly number?: string | undefined }

export interface FactsCarried {
  /** The plan written, with the facts carried onto it. */
  readonly plan: FloorPlan
  /** How many parts kept their facts or number. */
  readonly kept: number
  /** The parts that carried facts or a number and are not in the text, as `room "office"`. */
  readonly lost: readonly string[]
}

const carries = (part: Part): boolean => part.number !== undefined || Object.keys(part.properties ?? {}).length > 0

export function carryFacts(before: FloorPlan, written: FloorPlan): FactsCarried {
  let kept = 0
  const lost: string[] = []
  const carry = <T extends Part>(kind: string, old: readonly Part[], now: readonly T[]): T[] => {
    const byId = new Map(old.filter(carries).map((part) => [part.id, part] as const))
    const ids = new Set(now.map((part) => part.id))
    for (const id of byId.keys()) if (!ids.has(id)) lost.push(`${kind} ${JSON.stringify(id)}`)
    return now.map((part) => {
      const was = byId.get(part.id)
      if (was === undefined) return part
      const next: Record<string, unknown> = { ...part }
      if (part.properties === undefined && was.properties !== undefined) next['properties'] = was.properties
      if (kind === 'room' && part.number === undefined && was.number !== undefined) next['number'] = was.number
      if (next['properties'] === part.properties && next['number'] === part.number) return part
      kept += 1
      return next as T
    })
  }
  const plan: FloorPlan = {
    ...written,
    walls: carry('wall', before.walls, written.walls),
    openings: carry('opening', before.openings, written.openings),
    rooms: carry('room', before.rooms, written.rooms),
    ...(written.floors === undefined ? {} : { floors: carry('floor', before.floors ?? [], written.floors) }),
  }
  if (written.floors === undefined) for (const floor of (before.floors ?? []).filter(carries)) lost.push(`floor ${JSON.stringify(floor.id)}`)
  return { plan, kept, lost }
}
