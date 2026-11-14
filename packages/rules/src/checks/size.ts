/**
 * The room-size check: rooms people live or sleep in that are under the minimum area.
 *
 * Reads `Room.use` as declared and never guesses it from the name or the shape.
 * A room that doesn't say what it's for is not checked, and is said to be
 * not checked.
 */

import { area, indexPlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { ROOM_USES, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { HABITABLE_USES } from './catalogue'
import { messages } from './messages'
import type { AppliedFigure, NotChecked, RuleFinding } from './types'

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A plan built by hand, unparsed, can still carry a value the schema would drop. */
const stated = (use: unknown): RoomUse | null =>
  (ROOM_USES as readonly unknown[]).includes(use) ? (use as RoomUse) : null

/** Rounded to 0.01 m² before comparing, so a note can never read "It measures 6.50 m²". */
const toHundredths = (value: number): number => Math.round(value * 100) / 100

export function sizeCheck(
  storey: FloorPlan,
  leftOut: ReadonlySet<string>,
  floor: string,
  /** The floor's name, or null in a plan with only one floor. */
  floorLabel: string | null,
  roomName: (id: string) => string,
  /** The minimum net area of a habitable room. */
  minimum: AppliedFigure
): { findings: RuleFinding[]; notChecked: NotChecked[] } {
  const outlines = roomOutlines(storey, indexPlan(storey), leftOut)
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
    const net = toHundredths(area([...outline.polygon]))
    if (net >= minimum.value) continue
    findings.push({
      code: 'room_too_small',
      ruleId: 'habitable-room-area',
      floor,
      rooms: [room.id],
      openings: [],
      message: messages.roomTooSmall(roomName(room.id), minimum.value),
      area: net,
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
            message: messages.noUse(floorLabel, unstated.length)
          }
        ]
  return { findings, notChecked }
}
