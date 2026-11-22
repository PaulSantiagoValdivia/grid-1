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
 *
 * CNT-15 (C24): so do a wall's, a door's and a window's named type and a room's finishes, which
 * rooms text does not hold either. A value the text writes that its type gives the same is left to
 * the type (`typed`), so a change to the type still reaches the part; one it gives otherwise is
 * the part's own.
 */
import type { FloorPlan, TypedValue } from '../types/floorplan'
import { planDoorTypes, planWallTypes, planWindowTypes } from '../geometry/partTypes'

type Part = {
  readonly id: string
  readonly properties?: Readonly<Record<string, string | number | boolean>> | undefined
  readonly number?: string | undefined
  readonly finishes?: Readonly<Record<string, string | undefined>> | undefined
  readonly wallType?: string | undefined
  readonly doorType?: string | undefined
  readonly windowType?: string | undefined
}

export interface FactsCarried {
  /** The plan written, with the facts carried onto it. */
  readonly plan: FloorPlan
  /** How many parts kept their facts or number. */
  readonly kept: number
  /** The parts that carried facts or a number and are not in the text, as `room "office"`. */
  readonly lost: readonly string[]
}

const carries = (part: Part): boolean =>
  part.number !== undefined || Object.keys(part.properties ?? {}).length > 0 || part.finishes !== undefined || part.wallType !== undefined || part.doorType !== undefined || part.windowType !== undefined

/** The values of a part its type gives the same, which the type is left to give. */
function sameAsType(part: Record<string, unknown>, type: Readonly<Record<string, unknown>> | undefined, fields: readonly TypedValue[]): TypedValue[] {
  if (type === undefined) return []
  return fields.filter((field) => type[field] !== undefined && JSON.stringify(type[field]) === JSON.stringify(part[field]))
}

export function carryFacts(before: FloorPlan, written: FloorPlan): FactsCarried {
  let kept = 0
  const lost: string[] = []
  const walls = planWallTypes(before)
  const doors = planDoorTypes(before)
  const windows = planWindowTypes(before)
  const carry = <T extends Part>(kind: string, old: readonly Part[], now: readonly T[]): T[] => {
    const byId = new Map(old.filter(carries).map((part) => [part.id, part] as const))
    const ids = new Set(now.map((part) => part.id))
    for (const id of byId.keys()) if (!ids.has(id)) lost.push(`${kind} ${JSON.stringify(id)}`)
    return now.map((part) => {
      const was = byId.get(part.id)
      if (was === undefined) return part
      const next: Record<string, unknown> = { ...part }
      let changed = false
      if (part.properties === undefined && was.properties !== undefined) { next['properties'] = was.properties; changed = true }
      if (kind === 'room' && part.number === undefined && was.number !== undefined) { next['number'] = was.number; changed = true }
      if (kind === 'room' && part.finishes === undefined && was.finishes !== undefined) { next['finishes'] = was.finishes; changed = true }
      // CNT-15: the type, and what the text writes that the type gives the same.
      const typed: TypedValue[] = []
      if (kind === 'wall' && part.wallType === undefined && was.wallType !== undefined) {
        next['wallType'] = was.wallType
        typed.push(...sameAsType(next, walls.get(was.wallType), ['thickness', 'height', 'kind']))
        changed = true
      }
      const field = kind !== 'opening' ? null : (next['type'] === 'door' ? 'doorType' : next['type'] === 'window' ? 'windowType' : null)
      if (field !== null && part[field] === undefined && was[field] !== undefined) {
        next[field] = was[field]
        typed.push(...sameAsType(next, (field === 'doorType' ? doors : windows).get(was[field]!), ['width', 'height', 'sill', 'kind', 'opens']))
        changed = true
      }
      if (typed.length > 0) next['typed'] = typed
      if (!changed) return part
      kept += 1
      return next as T
    })
  }
  // A part the text writes with its type (a raw line) leaves to the type what it gives the same.
  const leftToType = <T extends Part & { readonly typed?: readonly TypedValue[] | undefined }>(parts: readonly T[]): T[] =>
    parts.map((part) => {
      if (part.typed !== undefined) return part
      const record = part as unknown as Record<string, unknown>
      const typed =
        part.wallType !== undefined
          ? sameAsType(record, walls.get(part.wallType), ['thickness', 'height', 'kind'])
          : part.doorType !== undefined && record['type'] === 'door'
            ? sameAsType(record, doors.get(part.doorType), ['width', 'height', 'kind', 'opens'])
            : part.windowType !== undefined && record['type'] === 'window'
              ? sameAsType(record, windows.get(part.windowType), ['width', 'height', 'sill', 'kind', 'opens'])
              : []
      return typed.length === 0 ? part : ({ ...part, typed } as T)
    })
  const plan: FloorPlan = {
    ...written,
    ...(written.types === undefined && before.types !== undefined ? { types: before.types } : {}),
    walls: leftToType(carry('wall', before.walls, written.walls)),
    openings: leftToType(carry('opening', before.openings, written.openings)),
    rooms: carry('room', before.rooms, written.rooms),
    ...(written.floors === undefined ? {} : { floors: carry('floor', before.floors ?? [], written.floors) }),
  }
  if (written.floors === undefined) for (const floor of (before.floors ?? []).filter(carries)) lost.push(`floor ${JSON.stringify(floor.id)}`)
  return { plan, kept, lost }
}
