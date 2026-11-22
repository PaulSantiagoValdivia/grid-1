/**
 * The escape-opening check: a bedroom needs a window or a door to the outside that
 * someone can climb through.
 *
 * Reads `Room.use` and `Wall.kind` as declared and never guesses either. A window is
 * measured as drawn: the plan does not say how much of it opens, so a note says "as
 * drawn", and a window that opens only in part needs a bigger frame than these figures.
 */

import { indexPlan, overFigure, rounded, shownAgainst, underFigure, type FloorPlan, type Opening } from '@ongrid/floorplan/geometry'
import { openingSides, outsideTest, roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import type { FloorScope } from './coverage'
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

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Measured {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly sill: number
  readonly area: number
}

/** A window as drawn, compared as it is and never rounded first (ARE-7). */
const measure = (opening: Opening): Measured => ({
  id: opening.id,
  width: opening.width,
  height: opening.height,
  sill: opening.sill,
  area: opening.width * opening.height
})

/**
 * What a finding carries: lengths to the millimetre and areas to 0.01 m², or to the digits
 * that keep each on its side of the figure it was checked against, so a note shows what was
 * compared and never hides a shortfall.
 */
const length = (value: number, figure: AppliedFigure | null): number =>
  figure === null ? rounded(value, 3) : shownAgainst(value, figure.value, 3, 'm')
const surface = (value: number, figure: AppliedFigure | null): number =>
  figure === null ? rounded(value, 2) : shownAgainst(value, figure.value, 2, 'm²')

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
): { findings: RuleFinding[]; scope: FloorScope } {
  const index = indexPlan(storey)
  const outlines = roomOutlines(storey, index, leftOut)
  // MSG-2: every room of the floor is looked at or skipped, with the reason. Only bedrooms are
  // looked at; a room with no use stated may be one, so it is said apart.
  const above = level > ESCAPE_TOP_LEVEL.level
  const scope: FloorScope = { lookedAt: [], skipped: { cannot_be_drawn: [], no_use: [], use_not_covered: [], above_escape_storeys: [] } }
  for (const room of storey.rooms) {
    const reason = !outlines.has(room.id)
      ? 'cannot_be_drawn'
      : !(ROOM_USES as readonly unknown[]).includes(room.use)
        ? 'no_use'
        : room.use !== 'bedroom'
          ? 'use_not_covered'
          : above
            ? 'above_escape_storeys'
            : null
    if (reason === null) scope.lookedAt.push(room.id)
    else scope.skipped[reason]!.push(room.id)
  }
  // Above the third storey the figures here stop: the bedrooms are said to be not checked (CH-4).
  if (above || !hasEscapeFigures(figures)) return { findings: [], scope }

  const minArea = level === 0 ? (figures.minAreaGrade ?? figures.minArea) : figures.minArea
  const { minWidth, minHeight, maxSill } = figures
  const bigEnough = (w: Measured): boolean =>
    (minWidth === null || !underFigure(w.width, minWidth.value, 'm')) &&
    (minHeight === null || !underFigure(w.height, minHeight.value, 'm')) &&
    (minArea === null || !underFigure(w.area, minArea.value, 'm²'))
  const lowEnough = (w: Measured): boolean => maxSill === null || !overFigure(w.sill, maxSill.value, 'm')

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
        sill: length(w.sill, maxSill),
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
      area: surface(w.area, minArea),
      ...(minArea === null ? {} : { minimum: minArea.value }),
      width: length(w.width, minWidth),
      height: length(w.height, minHeight),
      figures: present([minArea, minWidth, minHeight])
    })
  }
  return { findings, scope }
}
