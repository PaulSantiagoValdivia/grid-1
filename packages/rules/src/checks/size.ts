/**
 * The room-size check: rooms people live or sleep in that are under the minimum area.
 *
 * Reads `Room.use` as declared and never guesses it from the name or the shape.
 * A room that doesn't say what it's for is not checked, and is said to be
 * not checked.
 *
 * CNT-8: a room with zones is checked as a whole, at its whole area, with its own use or a
 * zone's (`zoned.ts`), and a zone is never checked on its own: the studio drawn with a sleeping
 * corner and the studio drawn as one bedroom give the same result (lab EL-13).
 */

import { indexPlan, roomFloorArea, roomZones, shownAgainst, underFigure, type FloorPlan } from '@ongrid/floorplan/geometry'
import { roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { HABITABLE_USES } from './catalogue'
import { messages } from './messages'
import type { AppliedFigure, NotChecked, RuleFinding, WholeRoom } from './types'
import type { FloorScope } from './coverage'
import { appliedUse } from './zoned'

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function sizeCheck(
  storey: FloorPlan,
  leftOut: ReadonlySet<string>,
  floor: string,
  /** The floor's name, as its notice names it. */
  floorLabel: string,
  roomName: (id: string) => string,
  /** The minimum net area of a habitable room. */
  minimum: AppliedFigure
): { findings: RuleFinding[]; notChecked: NotChecked[]; scope: FloorScope; wholeRooms: WholeRoom[] } {
  const index = indexPlan(storey)
  const outlines = roomOutlines(storey, index, leftOut)
  const zones = roomZones(index)
  const findings: RuleFinding[] = []
  const unstated: string[] = []
  const wholeRooms: WholeRoom[] = []
  // MSG-2: every room of the floor is looked at or skipped, with the reason.
  const scope: FloorScope = { lookedAt: [], skipped: { cannot_be_drawn: [], use_not_covered: [] } }

  for (const room of storey.rooms) {
    const outline = outlines.get(room.id)
    // Rooms that don't close are already named as not checked.
    if (outline === undefined) {
      scope.skipped.cannot_be_drawn!.push(room.id)
      continue
    }
    const applied = appliedUse(room, storey.rooms, zones, HABITABLE_USES)
    if (applied.kind === 'zone') {
      ;(scope.skipped.part_of_room ??= []).push(room.id)
      continue
    }
    if (applied.kind === 'no_use') {
      unstated.push(room.id)
      continue
    }
    if (applied.kind === 'not_covered') {
      scope.skipped.use_not_covered!.push(room.id)
      continue
    }
    scope.lookedAt.push(room.id)
    const zoned = zones.zones.has(room.id)
    if (zoned) wholeRooms.push({ floor, room: room.id, use: applied.use, zone: applied.zone })
    // Net of any room marked `inside` that sits in it, as Grid measures every room (ARE-5).
    // Compared as measured, never rounded first (ARE-7): 6.4951 m² is under 6.5 m².
    const net = roomFloorArea(room, index, outline.polygon)
    if (!underFigure(net, minimum.value, 'm²')) continue
    findings.push({
      code: 'room_too_small',
      ruleId: 'habitable-room-area',
      floor,
      rooms: applied.zone === null ? [room.id] : [room.id, applied.zone],
      openings: [],
      message: messages.roomTooSmall(roomName(room.id), minimum.value),
      // To 0.01 m², or to the digits that keep it under the minimum: 6.495, never 6.50.
      area: shownAgainst(net, minimum.value, 2, 'm²'),
      minimum: minimum.value,
      figures: [minimum],
      ...(zoned ? { use: applied.use, ...(applied.zone === null ? {} : { zone: applied.zone }) } : {})
    })
  }

  const notChecked: NotChecked[] =
    unstated.length === 0
      ? []
      : [
          {
            reason: 'no_use',
            floor,
            rooms: [...new Set(unstated)].sort(byText),
            openings: [],
            // The rooms it names, counted once each, as the record counts them.
            message: messages.noUse(floorLabel, new Set(unstated).size)
          }
        ]
  scope.skipped.no_use = unstated
  return { findings, notChecked, scope, wholeRooms }
}
