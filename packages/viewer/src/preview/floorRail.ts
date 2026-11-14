import type { Floor } from '@ongrid/floorplan/types/floorplan'

/**
 * The floor rail's model: which rows it
 * shows, in what order and with what labels, which slice of them fits, and how
 * the keyboard moves between them. Pure, so `FloorRail` only draws it and a
 * later view area can mount one rail per view unchanged.
 */

/** A row of the rail. The Whole building row has no floor id: 3D focuses nothing. */
export type RailRow =
  | {
      readonly kind: 'building'
      readonly id: null
      readonly label: string
      readonly name: string
    }
  | {
      readonly kind: 'floor'
      readonly id: string
      readonly label: string
      readonly name: string
      readonly level: number
    }

export const WHOLE_BUILDING = 'Whole building'

/** How many rows the rail shows at once, at most. */
export const RAIL_SIZE = 9

/** Characters typed this close together are read as one label ("4", "5" → 45). */
export const TYPE_RESET_MS = 1000

/** "G" for level 0, the number above it, "B" and the number below it. */
function levelLabel(level: number): string {
  if (level === 0) return 'G'
  return level > 0 ? String(level) : `B${-level}`
}

/**
 * The rail's rows, top floor first. Floors sharing a level keep the order the
 * plan gives them, and show their names, since one label would read twice. In
 * 3D (`building`), a Whole building row comes first.
 */
export function railRows(floors: readonly Floor[], options: { building: boolean }): RailRow[] {
  const perLevel = new Map<number, number>()
  for (const floor of floors) perLevel.set(floor.level, (perLevel.get(floor.level) ?? 0) + 1)

  // Stable: floors sharing a level keep their order.
  const ordered = floors
    .map((floor, order) => ({ floor, order }))
    .sort((a, b) => b.floor.level - a.floor.level || a.order - b.order)

  const rows: RailRow[] = ordered.map(({ floor }) => ({
    kind: 'floor',
    id: floor.id,
    label: (perLevel.get(floor.level) ?? 0) > 1 ? floor.name : levelLabel(floor.level),
    name: floor.name,
    level: floor.level
  }))

  if (!options.building) return rows
  return [{ kind: 'building', id: null, label: WHOLE_BUILDING, name: WHOLE_BUILDING }, ...rows]
}

/** The rows `[start, end)` the rail shows, and how many are beyond each end. */
export interface RailWindow {
  readonly start: number
  readonly end: number
  readonly above: number
  readonly below: number
}

/**
 * The slice of `rows` around `active` (an index, or -1 for none) that fits in
 * `size` rows, clamped to both ends. The active row is always inside it.
 */
export function railWindow(rows: readonly RailRow[], active: number, size = RAIL_SIZE): RailWindow {
  const count = rows.length
  const shown = Math.min(count, size)
  const centred = active < 0 ? 0 : active - Math.floor(shown / 2)
  const start = Math.max(0, Math.min(centred, count - shown))
  const end = start + shown
  return { start, end, above: start, below: count - end }
}

/** The index of `active` (a floor id, or null for the Whole building), or -1. */
function indexOf(rows: readonly RailRow[], active: string | null): number {
  return rows.findIndex((row) => row.id === active)
}

/**
 * The row one step up (-1) or down (+1) from `active`, or null when there is
 * none: the rail stops at its ends. In 3D the Whole building is the top row.
 */
export function stepRow(
  rows: readonly RailRow[],
  active: string | null,
  step: -1 | 1
): RailRow | null {
  const next = indexOf(rows, active) + step
  return next >= 0 && next < rows.length ? rows[next]! : null
}

/** What the user has typed on the rail so far, and when they last typed. */
export interface TypedBuffer {
  readonly text: string
  readonly at: number
}

/** The buffer after typing `char` at `now`: it starts again after a pause. */
export function typed(previous: TypedBuffer | null, char: string, now: number): TypedBuffer {
  const fresh = !previous || now - previous.at > TYPE_RESET_MS
  return { text: (fresh ? '' : previous.text) + char, at: now }
}

/**
 * The row the typed text names: a label that is exactly it, else the first
 * label that starts with it, else the first name that does. Case does not
 * matter ("b1" is the basement). Null when nothing matches.
 */
export function matchTyped(rows: readonly RailRow[], text: string): RailRow | null {
  const wanted = text.trim().toLowerCase()
  if (wanted === '') return null
  const lower = (s: string): string => s.toLowerCase()

  return (
    rows.find((row) => lower(row.label) === wanted) ??
    rows.find((row) => lower(row.label).startsWith(wanted)) ??
    rows.find((row) => lower(row.name).startsWith(wanted)) ??
    null
  )
}

/**
 * Typing `char` on the rail: the new buffer and the row it names. When the
 * text typed before no longer matches anything, the key starts a fresh buffer,
 * so "3" (no such floor) then "2" still lands on floor 2.
 */
export function typeToJump(
  rows: readonly RailRow[],
  previous: TypedBuffer | null,
  char: string,
  now: number
): { buffer: TypedBuffer; match: RailRow | null } {
  const buffer = typed(previous, char, now)
  const match = matchTyped(rows, buffer.text)
  if (match || buffer.text.length === 1) return { buffer, match }
  const fresh = typed(null, char, now)
  return { buffer: fresh, match: matchTyped(rows, fresh.text) }
}
