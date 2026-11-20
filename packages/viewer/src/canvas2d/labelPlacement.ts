/**
 * Keeps dimension numbers off the room labels.
 *
 * Dimension lines live in metres, but every label is drawn at a fixed size in screen pixels,
 * so whether a number lands on a room's name or area depends on the zoom. This works it out
 * for the current zoom, in plan metres (y up): text boxes are estimated from the font sizes
 * in plan.css (`estimateTextWidth`), the number slides along its own dimension line to the clear spot
 * nearest the middle, and with no clear spot it is hidden (the line stays).
 *
 * Pure: no DOM measuring, so it runs in tests and on every render without layout reads.
 */
import type { Dimension, Vec2 } from '@ongrid/floorplan/geometry'
import { TEXT_PX } from '../picture/look'

export interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

// Font sizes and offsets, in screen pixels.
const ROOM_NAME_PX = TEXT_PX.roomName
const ROOM_AREA_PX = TEXT_PX.roomArea
export const ROOM_AREA_DY = 16
const DIMENSION_PX = { room: TEXT_PX.roomDimension, other: TEXT_PX.dimension }
export const DIMENSION_DY = -5
// A generous average glyph width and the usual ascent/descent split, plus breathing room.
const CHAR_WIDTH = 0.62
const ASCENT = 0.75
const DESCENT = 0.25
const PADDING_PX = 2
const SEARCH_STEPS = 48

/**
 * How wide a line of text is, in pixels, without measuring it: every character counts as
 * 0.62 of the font size. That is a little wider than the average letter of a sans-serif face,
 * so a box built on it errs on the side of keeping text apart. The same in a browser, a test
 * and a picture, whatever fonts the machine has.
 */
export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * fontPx * CHAR_WIDTH
}

export function formatArea(area: number): string {
  return `${area.toFixed(2)} m²`
}

/** Name and area as drawn at `labelAt`: name on the baseline, area 16 px below. */
export function roomLabelBox(
  room: { name: string; area: number; labelAt: Vec2; /** The area line as drawn, when it isn't the plain area. */ areaText?: string },
  metersPerPixel: number
): Box {
  const area = room.areaText ?? formatArea(room.area)
  const width = Math.max(estimateTextWidth(room.name, ROOM_NAME_PX), estimateTextWidth(area, ROOM_AREA_PX))
  const top = ASCENT * ROOM_NAME_PX + PADDING_PX
  const bottom = ROOM_AREA_DY + DESCENT * ROOM_AREA_PX + PADDING_PX
  const half = width / 2 + PADDING_PX
  return {
    minX: room.labelAt.x - half * metersPerPixel,
    maxX: room.labelAt.x + half * metersPerPixel,
    minY: room.labelAt.y - bottom * metersPerPixel,
    maxY: room.labelAt.y + top * metersPerPixel,
  }
}

/** A dimension's number anchored at `at`, drawn 5 px above it and centred. */
export function dimensionTextBox(at: Vec2, dim: Pick<Dimension, 'kind' | 'value'>, metersPerPixel: number): Box {
  const px = dim.kind === 'room' ? DIMENSION_PX.room : DIMENSION_PX.other
  const half = estimateTextWidth(dim.value.toFixed(2), px) / 2 + PADDING_PX
  // Screen y grows down and plan y up: 5 px above the line is +5 px in the plan.
  const baseline = -DIMENSION_DY
  return {
    minX: at.x - half * metersPerPixel,
    maxX: at.x + half * metersPerPixel,
    minY: at.y + (baseline - DESCENT * px - PADDING_PX) * metersPerPixel,
    maxY: at.y + (baseline + ASCENT * px + PADDING_PX) * metersPerPixel,
  }
}

export function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

/**
 * Where to draw the number: `dim.labelAt` when it is clear, else the clear point on the
 * dimension line nearest its middle, else `null` (hide the number). A point is usable only
 * when the whole number stays within the line's two ends.
 */
export function placeDimensionLabel(dim: Dimension, blocks: readonly Box[], metersPerPixel: number): Vec2 | null {
  const clear = (at: Vec2): boolean => {
    const box = dimensionTextBox(at, dim, metersPerPixel)
    return !blocks.some((block) => overlaps(box, block))
  }
  if (clear(dim.labelAt)) return dim.labelAt

  const a = { x: dim.from.x + dim.normal.x * dim.offset, y: dim.from.y + dim.normal.y * dim.offset }
  const b = { x: dim.to.x + dim.normal.x * dim.offset, y: dim.to.y + dim.normal.y * dim.offset }
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length === 0) return null
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const box = dimensionTextBox({ x: 0, y: 0 }, dim, metersPerPixel)
  // Half the number's extent along the line: it must not run past either end.
  const reach = Math.abs(dir.x) * (box.maxX - box.minX) / 2 + Math.abs(dir.y) * (box.maxY - box.minY) / 2
  const lo = reach / length
  const hi = 1 - lo
  if (lo > hi) return null

  for (let step = 1; step <= SEARCH_STEPS; step++) {
    const delta = (step / SEARCH_STEPS) * 0.5
    for (const t of [0.5 - delta, 0.5 + delta]) {
      if (t < lo || t > hi) continue
      const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (clear(at)) return at
    }
  }
  return null
}
