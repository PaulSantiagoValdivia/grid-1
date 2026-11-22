/**
 * The use a figure check applies to a room (CNT-8, lab EL-13).
 *
 * A zone is part of its room (`partOf`, `zones.ts` in the core), so a figure check never looks
 * at a zone on its own: it looks at the room as a whole, and the uses that apply to it are the
 * room's own and its zones'. A studio with a sleeping corner is checked as a room people sleep
 * in, at its whole size, whether its own use is stated or not; drawn as one room with the use
 * `bedroom`, it gets the same result.
 *
 * Which use applies: the room's own, when the check covers it; else the first use the check
 * covers, in the check's own order, that one of its zones has, and that zone is named. Uses are
 * read as stated and never guessed from a name.
 */

import type { Room, RoomUse } from '@ongrid/floorplan/types/floorplan'
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import type { RoomZones } from '@ongrid/floorplan/geometry'
import { isOutdoor } from '@ongrid/floorplan/geometry/outdoor'

/** A plan built by hand, unparsed, can still carry a value the schema would drop. */
const stated = (use: unknown): RoomUse | null => ((ROOM_USES as readonly unknown[]).includes(use) ? (use as RoomUse) : null)

/** What a figure check does with one room. */
export type AppliedUse =
  /** A zone of another room: looked at as part of that room. */
  | { readonly kind: 'zone'; readonly room: string }
  /** Looked at with this use: the room's own (`zone` null) or one of its zones'. */
  | { readonly kind: 'checked'; readonly use: RoomUse; readonly zone: string | null }
  /** The room and its zones state uses, none of them one the check covers. */
  | { readonly kind: 'not_covered' }
  /** Neither the room nor any of its zones states a use. */
  | { readonly kind: 'no_use' }

/** How each room of one floor is checked by a check that covers `covers`, in that order. */
export function appliedUse(room: Room, rooms: readonly Room[], zones: RoomZones, covers: readonly RoomUse[]): AppliedUse {
  const of = zones.zoneOf.get(room.id)
  if (of !== undefined) return { kind: 'zone', room: of }
  const own = stated(room.use)
  // CNT-7 (C26): an outdoor space is no room of any use a check covers, whatever its use says.
  if (isOutdoor(room)) return own !== null ? { kind: 'not_covered' } : { kind: 'no_use' }
  if (own !== null && covers.includes(own)) return { kind: 'checked', use: own, zone: null }
  const ids = zones.zones.get(room.id) ?? []
  const parts = ids.flatMap((id) => rooms.filter((r) => r.id === id).slice(0, 1))
  for (const use of covers) {
    const zone = parts.find((part) => stated(part.use) === use)
    if (zone !== undefined) return { kind: 'checked', use, zone: zone.id }
  }
  return own !== null || parts.some((part) => stated(part.use) !== null) ? { kind: 'not_covered' } : { kind: 'no_use' }
}
