/**
 * The escape-opening check: a bedroom needs a window or a door to the outside that
 * someone can climb through.
 *
 * Reads `Room.use` and `Wall.kind` as declared and never guesses either. A window is
 * measured as drawn: the plan does not say how much of it opens, so a note says "as
 * drawn", and a window that opens only in part needs a bigger frame than these figures.
 */

import { indexPlan, type FloorPlan, type Opening } from '@ongrid/floorplan/geometry'
import { openingSides, outsideTest, roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { ESCAPE_TOP_LEVEL } from './figures'
import { messages } from './messages'
import type { AppliedFigure, RuleFinding } from './types'

/** The figures of the check. One that is `null` is not tested. */
export interface EscapeFigures {
  readonly minArea: AppliedFigure | null
  /** For an opening on the ground floor. Falls back to `minArea`. */
  readonly minAreaGrade: AppliedFigure | null
  readonly minWidth: AppliedFigure | null
  readonly minHeight: AppliedFigure | null
  readonly maxSill: AppliedFigure | null
}

/** Whether there is anything to test a window against. */
export const hasEscapeFigures = (figures: EscapeFigures): boolean => Object.values(figures).some((f) => f !== null)

/** Lengths to the millimetre and areas to 0.01 m² before comparing, so a note shows what was compared. */
const toThousandths = (value: number): number => Math.round(value * 1000) / 1000
const toHundredths = (value: number): number => Math.round(value * 100) / 100

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Measured {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly sill: number
  readonly area: number
}

const measure = (opening: Opening): Measured => ({
  id: opening.id,
  width: toThousandths(opening.width),
  height: toThousandths(opening.height),
  sill: toThousandths(opening.sill),
  area: toHundredths(opening.width * opening.height)
})

/** Largest by area, then by id: the window a note describes. */
const largest = (windows: readonly Measured[]): Measured =>
  [...windows].sort((a, b) => b.area - a.area || byText(a.id, b.id))[0]!

const present = (figures: readonly (AppliedFigure | null)[]): AppliedFigure[] =>
  figures.filter((f): f is AppliedFigure => f !== null)

export function escapeCheck(
  storey: FloorPlan,
  leftOut: ReadonlySet<string>,
  floor: string,
  level: number,
  roomName: (id: string) => string,
  figures: EscapeFigures
): RuleFinding[] {
  // Above the third storey the rule asks nothing, so there is nothing to say.
  if (level > ESCAPE_TOP_LEVEL.level || !hasEscapeFigures(figures)) return []

  const index = indexPlan(storey)
  const outlines = roomOutlines(storey, index, leftOut)
  const minArea = level === 0 ? (figures.minAreaGrade ?? figures.minArea) : figures.minArea
  const { minWidth, minHeight, maxSill } = figures
  const bigEnough = (w: Measured): boolean =>
    (minWidth === null || w.width >= minWidth.value) &&
    (minHeight === null || w.height >= minHeight.value) &&
    (minArea === null || w.area >= minArea.value)
  const lowEnough = (w: Measured): boolean => maxSill === null || w.sill <= maxSill.value

  // Windows and doors to the outside, by the rooms on their sides: on a wall stated exterior, or
  // with a room on one side only and no enclosed floor on the other (MSG-13, `outsideTest`).
  const outside = new Map<string, Opening[]>()
  const facesOutside = outsideTest(storey, index)
  for (const opening of storey.openings) {
    if (opening.type === 'opening') continue
    const wall = index.wallsById.get(opening.wall)
    if (wall === undefined) continue
    const [left, right] = openingSides(opening, index, outlines)
    const along = opening.offset + opening.width / 2
    const rooms =
      wall.kind === 'exterior'
        ? [left, right]
        : left !== null && right === null && facesOutside(wall, along, 'right')
          ? [left]
          : right !== null && left === null && facesOutside(wall, along, 'left')
            ? [right]
            : []
    for (const side of new Set(rooms)) {
      if (side === null) continue
      const list = outside.get(side)
      if (list) list.push(opening)
      else outside.set(side, [opening])
    }
  }

  const findings: RuleFinding[] = []
  for (const room of storey.rooms) {
    if (room.use !== 'bedroom' || !outlines.has(room.id)) continue
    const openings = outside.get(room.id) ?? []
    // A door straight outside is enough.
    if (openings.some((o) => o.type === 'door')) continue

    const windows = openings.map(measure)
    if (windows.some((w) => bigEnough(w) && lowEnough(w))) continue

    const base = { ruleId: 'escape-opening', floor, rooms: [room.id] }
    if (windows.length === 0) {
      findings.push({ ...base, code: 'no_escape_opening', openings: [], message: messages.noEscapeOpening(roomName(room.id)) })
      continue
    }
    const sized = windows.filter(bigEnough)
    if (sized.length > 0 && maxSill !== null) {
      const w = largest(sized)
      findings.push({
        ...base,
        code: 'escape_window_too_high',
        openings: [w.id],
        message: messages.escapeWindowTooHigh(roomName(room.id)),
        sill: w.sill,
        maximum: maxSill.value,
        figures: [maxSill]
      })
      continue
    }
    const w = largest(windows)
    findings.push({
      ...base,
      code: 'escape_window_too_small',
      openings: [w.id],
      message: messages.escapeWindowTooSmall(roomName(room.id)),
      area: w.area,
      ...(minArea === null ? {} : { minimum: minArea.value }),
      width: w.width,
      height: w.height,
      figures: present([minArea, minWidth, minHeight])
    })
  }
  return findings
}
