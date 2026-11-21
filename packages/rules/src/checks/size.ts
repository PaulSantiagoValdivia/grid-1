/**
 * The room-size check: rooms people live or sleep in that are under the minimum area.
 *
 * Reads `Room.use` as declared and never guesses it from the name or the shape.
 * A room that doesn't say what it's for is not checked, and is said to be
 * not checked.
 */

import { indexPlan, roomFloorArea, shownAgainst, underFigure, type FloorPlan } from '@ongrid/floorplan/geometry'
import { roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { ROOM_USES, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { HABITABLE_USES } from './catalogue'
import { messages } from './messages'
import type { AppliedFigure, NotChecked, RuleFinding } from './types'

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A plan built by hand, unparsed, can still carry a value the schema would drop. */
const stated = (use: unknown): RoomUse | null =>
  (ROOM_USES as readonly unknown[]).includes(use) ? (use as RoomUse) : null

export function sizeCheck(
  storey: FloorPlan,
  leftOut: ReadonlySet<string>,
  floor: string,
  /** The floor's name, as its notice names it. */
  floorLabel: string,
  roomName: (id: string) => string,
  /** The minimum net area of a habitable room. */
  minimum: AppliedFigure
): { findings: RuleFinding[]; notChecked: NotChecked[] } {
  const index = indexPlan(storey)
  const outlines = roomOutlines(storey, index, leftOut)
  const findings: RuleFinding[] = []
  const unstated: string[] = []

  for (const room of storey.rooms) {
    const outline = outlines.get(room.id)
    // Rooms that don't close are already named as not checked.
    if (outline === undefined) continue
    const use = stated(room.use)
    if (use === null) {
      unstated.push(room.id)
      continue
    }
    if (!HABITABLE_USES.includes(use)) continue
    // Net of any room marked `inside` that sits in it, as Grid measures every room (ARE-5).
    // Compared as measured, never rounded first (ARE-7): 6.4951 m² is under 6.5 m².
    const net = roomFloorArea(room, index, outline.polygon)
    if (!underFigure(net, minimum.value, 'm²')) continue
    findings.push({
      code: 'room_too_small',
      ruleId: 'habitable-room-area',
      floor,
      rooms: [room.id],
      openings: [],
      message: messages.roomTooSmall(roomName(room.id), minimum.value),
      // To 0.01 m², or to the digits that keep it under the minimum: 6.495, never 6.50.
      area: shownAgainst(net, minimum.value, 2, 'm²'),
      minimum: minimum.value,
      figures: [minimum]
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
  return { findings, notChecked }
}
