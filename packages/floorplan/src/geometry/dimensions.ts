/**
 * Dimension strings.
 *
 * A dimension measures a distance and says where to draw it. This module owns
 * the first half — what is measured, how much it is, and where the line goes —
 * and stops there. The drafting conventions that turn that into a dimension
 * that reads like architecture (extension lines, tick marks, text placement,
 * typography) belong to the design side.
 *
 * Everything here is derived: nothing about dimensions is stored in the plan
 * file, because a stored measurement is a measurement that drifts from the
 * geometry it describes.
 */

import type { PlanDrawing, PlanRoom, Bounds } from './floorplan'
import { computeBounds } from './floorplan'
import type { Vec2 } from './vec2'
import { add, distance, normalize, perp, scale, sub } from './vec2'

export type DimensionKind = 'overall' | 'room' | 'opening'

/**
 * One dimension, in plan coordinates (meters).
 *
 * `from` and `to` are the two points being measured. The dimension line itself
 * is drawn parallel to them, pushed `offset` meters along `normal` — that
 * offset is what keeps stacked dimensions from sitting on top of each other.
 */
export interface Dimension {
  readonly id: string
  readonly kind: DimensionKind
  readonly from: Vec2
  readonly to: Vec2
  /** Distance in meters. This is the number that gets drawn. */
  readonly value: number
  /** Unit direction the dimension line is pushed along. */
  readonly normal: Vec2
  /** How far it is pushed, in meters. */
  readonly offset: number
  /** Midpoint of the dimension line, where the text belongs. */
  readonly labelAt: Vec2
}

/** How far the first dimension line sits from what it measures, in meters. */
const BASE_OFFSET = 0.6

/** A room narrower than this is not worth dimensioning — the text will not fit. */
const MIN_ROOM_SIDE = 0.8

/**
 * Where a room's dimension lines sit inside it, as a fraction of the room.
 *
 * Not the middle: the room name and its area already live at the centroid, and
 * three labels stacked on the same point is unreadable. A quarter in keeps
 * each dimension clear of the name and of the other dimension.
 */
const ROOM_DIMENSION_INSET = 0.25

function makeDimension(
  id: string,
  kind: DimensionKind,
  from: Vec2,
  to: Vec2,
  normal: Vec2,
  offset: number
): Dimension {
  const shift = scale(normal, offset)
  const a = add(from, shift)
  const b = add(to, shift)
  return {
    id,
    kind,
    from,
    to,
    value: distance(from, to),
    normal,
    offset,
    labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
}

/**
 * Overall dimensions: the width and height of the whole plan, placed outside
 * the envelope — below it and to its left, the usual spots on a floor plan.
 */
export function overallDimensions(bounds: Bounds): Dimension[] {
  if (bounds.width <= 0 || bounds.height <= 0) return []

  return [
    makeDimension(
      'overall-width',
      'overall',
      { x: bounds.min.x, y: bounds.min.y },
      { x: bounds.max.x, y: bounds.min.y },
      { x: 0, y: -1 },
      BASE_OFFSET
    ),
    makeDimension(
      'overall-height',
      'overall',
      { x: bounds.min.x, y: bounds.min.y },
      { x: bounds.min.x, y: bounds.max.y },
      { x: -1, y: 0 },
      BASE_OFFSET
    )
  ]
}

/**
 * Room dimensions: the width and depth of each room, drawn inside it.
 *
 * They use the room's bounding box rather than its outline, so an L-shaped
 * room gets its overall extents. That is what a floor plan shows anyway, and
 * dimensioning every leg of a concave room needs decisions that belong to
 * whoever draws the conventions.
 */
export function roomDimensions(room: PlanRoom): Dimension[] {
  const box = computeBounds(room.polygon)
  if (box.width < MIN_ROOM_SIDE || box.height < MIN_ROOM_SIDE) return []

  const widthAt = box.min.y + box.height * ROOM_DIMENSION_INSET
  const depthAt = box.min.x + box.width * ROOM_DIMENSION_INSET

  return [
    makeDimension(
      `${room.id}-width`,
      'room',
      { x: box.min.x, y: widthAt },
      { x: box.max.x, y: widthAt },
      { x: 0, y: 1 },
      0
    ),
    makeDimension(
      `${room.id}-depth`,
      'room',
      { x: depthAt, y: box.min.y },
      { x: depthAt, y: box.max.y },
      { x: 1, y: 0 },
      0
    )
  ]
}

/**
 * Opening dimensions: the width of each door and window, on its own wall.
 *
 * The line is pushed out along the wall normal so it clears the wall body
 * instead of being swallowed by it.
 */
export function openingDimensions(drawing: PlanDrawing): Dimension[] {
  return drawing.openings.map((opening) =>
    makeDimension(
      `${opening.id}-width`,
      'opening',
      opening.from,
      opening.to,
      opening.normal,
      opening.thickness / 2 + 0.25
    )
  )
}

export interface DimensionOptions {
  readonly overall?: boolean
  readonly rooms?: boolean
  readonly openings?: boolean
}

/**
 * Every dimension for a drawing.
 *
 * They come in layers because a plan showing all of them at once is unreadable
 * at small scale — the consumer decides which ones to show at which zoom.
 */
export function buildDimensions(
  drawing: PlanDrawing,
  options: DimensionOptions = {}
): Dimension[] {
  const { overall = true, rooms = true, openings = false } = options
  const result: Dimension[] = []

  if (overall) result.push(...overallDimensions(drawing.bounds))
  if (rooms) for (const room of drawing.rooms) result.push(...roomDimensions(room))
  if (openings) result.push(...openingDimensions(drawing))

  return result
}

/**
 * The extent a drawing needs once its dimensions are placed.
 *
 * Dimensions sit outside the walls, so framing on the plan bounds alone would
 * clip them.
 */
export function boundsWithDimensions(drawing: PlanDrawing, dims: readonly Dimension[]): Bounds {
  const points: Vec2[] = [drawing.bounds.min, drawing.bounds.max]
  for (const dim of dims) {
    const shift = scale(dim.normal, dim.offset)
    points.push(add(dim.from, shift), add(dim.to, shift))
  }
  return computeBounds(points)
}

/**
 * Direction along the dimension, and the one perpendicular to it. Handy for a
 * consumer drawing extension lines and tick marks.
 */
export function dimensionAxes(dim: Dimension): { along: Vec2; across: Vec2 } {
  const along = normalize(sub(dim.to, dim.from))
  return { along, across: perp(along) }
}
