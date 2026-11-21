/**
 * What a plan written rooms first records about how it was written (WRT-2).
 *
 * The plan file is the source of truth; the rooms text is a way of writing and reading it. Two
 * things are kept in the plan's `written`:
 *
 * - `revision`: the plan's fingerprint as Grid wrote it from rooms text. Rooms text that says
 *   it was read from another revision, or a plan changed since by other means, is refused by
 *   `grid write` with the difference, so nothing done to the plan in between is lost unseen.
 * - `boundaries`: each room's boundary fingerprint. A room's boundary (the walls round it, in
 *   order) is derived: Grid works it out from where the rooms are, and no one writes it. One
 *   that no longer matches was edited by hand, and the drawing check refuses it with its own
 *   code, `room/derived-edited`.
 *
 * Pure: plain data in, strings out.
 */
import type { FloorPlan, Room } from '../types/floorplan'

/** 32-bit FNV-1a, as eight hex digits. */
function fnv(text: string, seed = 0x811c9dc5): string {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const n4 = (v: number): string => (Math.round(v * 10000) / 10000).toFixed(4)

function canonical(value: unknown): string {
  if (typeof value === 'number') return n4(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * The plan's fingerprint: its floors, walls, rooms and openings, numbers to a tenth of a
 * millimetre, in any key order. Sixteen hex digits.
 */
export function planRevision(plan: Pick<FloorPlan, 'walls' | 'rooms' | 'openings' | 'floors'>): string {
  const text = canonical({ floors: plan.floors ?? [], walls: plan.walls, rooms: plan.rooms, openings: plan.openings })
  return fnv(text) + fnv(text, 0x01000193)
}

/** A room's boundary fingerprint: its wall ids in order. */
export function boundaryPrint(room: Pick<Room, 'boundary'>): string {
  return fnv(room.boundary.join('\u0000'))
}

/** What a plan written from rooms text keeps in `written`. */
export interface WrittenStamp {
  readonly from: 'rooms'
  readonly revision: string
  readonly boundaries: Readonly<Record<string, string>>
}

export function stampFor(plan: Pick<FloorPlan, 'walls' | 'rooms' | 'openings' | 'floors'>): WrittenStamp {
  const boundaries: Record<string, string> = {}
  for (const room of plan.rooms) boundaries[room.id] = boundaryPrint(room)
  return { from: 'rooms', revision: planRevision(plan), boundaries }
}

/** The rooms of a plan written rooms first whose boundary was changed since Grid worked it out. */
export function boundariesEdited(plan: Pick<FloorPlan, 'rooms'> & { readonly written?: WrittenStamp | undefined }): Room[] {
  const written = plan.written
  if (written === undefined) return []
  return plan.rooms.filter((room) => {
    const print = written.boundaries[room.id]
    return print !== undefined && print !== boundaryPrint(room)
  })
}

/**
 * The stamp after Grid itself changed some rooms' boundaries (its own edits keep the derived
 * parts derived): those rooms' prints are taken again, every other print and the revision stay.
 */
export function restamped(written: WrittenStamp, rooms: readonly Pick<Room, 'id' | 'boundary'>[], changed: ReadonlySet<string>): WrittenStamp {
  const boundaries: Record<string, string> = { ...written.boundaries }
  for (const room of rooms) if (changed.has(room.id) && boundaries[room.id] !== undefined) boundaries[room.id] = boundaryPrint(room)
  return { ...written, boundaries }
}
