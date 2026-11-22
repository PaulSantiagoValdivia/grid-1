/**
 * SHT-7: writing on the drawing and the sketch layer, ready to draw.
 *
 * Both are drawn and exported, and nothing else: no area, check, wall count or room outline
 * reads them. This turns what the plan file says into what a view or an export needs, so the
 * viewer only draws: a rectangle becomes its four corners, an arc's degrees become radians,
 * and a note in a room is told where the room is.
 */
import type { Annotation, AnnotationKind, SketchItem, SketchKind } from '../types/floorplan'
import { DEFAULT_FLOOR_ID } from '../types/floorplan'
import type { FloorPlan } from './plan'
import type { SwingArc } from './door'
import type { Vec2 } from './vec2'
import { fromTuple } from './vec2'

/** One sketch item, as a view or an export draws it. */
export interface PlanSketch {
  readonly id: string
  readonly kind: SketchKind
  /** The author's word for what it is: it names its export layer and its entry in the key. */
  readonly category: string
  /** A line's points, open; a rect's or a shape's corners, closed back to the first. Empty for an arc or text. */
  readonly points: readonly Vec2[]
  /** Whether `points` close back to the first. */
  readonly closed: boolean
  /** An arc, running counter-clockwise from `from` to `to`, in radians. */
  readonly arc: SwingArc | null
  /** Text, centred on `at`. */
  readonly text: { readonly at: Vec2; readonly text: string } | null
}

/** One annotation, as a view or an export draws it. */
export interface PlanNote {
  readonly id: string
  readonly kind: AnnotationKind
  readonly text: string | null
  readonly symbol: Annotation['symbol'] | null
  /** Where it goes in plan metres: the point given, or the room's label point. Null for a key placed nowhere. */
  readonly at: Vec2 | null
  /** The room it is in, when placed by room: a view puts it under that room's name. */
  readonly room: string | null
  /** A symbol's turn, in radians counter-clockwise. */
  readonly turn: number
}

const RADIANS = Math.PI / 180

const finitePoint = ([x, y]: readonly [number, number]): boolean => Number.isFinite(x) && Number.isFinite(y)

/** The plan's sketch items, in the plan's order, each as it is drawn. */
export function planSketch(plan: FloorPlan): PlanSketch[] {
  return (plan.sketch ?? []).flatMap((item): PlanSketch[] => {
    const base = { id: item.id, kind: item.kind, category: item.category, points: [] as Vec2[], closed: false, arc: null, text: null }
    switch (item.kind) {
      case 'line':
      case 'shape': {
        const points = (item.points ?? []).filter(finitePoint).map(fromTuple)
        return points.length >= (item.kind === 'line' ? 2 : 3) ? [{ ...base, points, closed: item.kind === 'shape' }] : []
      }
      case 'rect': {
        if (!item.from || !item.to || !finitePoint(item.from) || !finitePoint(item.to)) return []
        const [x1, y1] = item.from
        const [x2, y2] = item.to
        const points = [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 }
        ]
        return [{ ...base, points, closed: true }]
      }
      case 'arc': {
        if (!item.at || !finitePoint(item.at) || item.radius === undefined || item.start === undefined || item.end === undefined) return []
        const arc: SwingArc = { center: fromTuple(item.at), radius: item.radius, from: item.start * RADIANS, to: item.end * RADIANS, counterClockwise: true }
        return [{ ...base, arc }]
      }
      case 'text':
        return item.at && finitePoint(item.at) && item.text ? [{ ...base, text: { at: fromTuple(item.at), text: item.text } }] : []
    }
  })
}

/**
 * The plan's annotations, in the plan's order. `labelAt` gives a drawn room's label point; a
 * note in a room the drawing does not hold has no place and is left out.
 */
export function planNotes(plan: FloorPlan, labelAt: (room: string) => Vec2 | undefined): PlanNote[] {
  return (plan.annotations ?? []).flatMap((note): PlanNote[] => {
    let at: Vec2 | null = null
    if (note.at) {
      if (!finitePoint(note.at)) return []
      at = fromTuple(note.at)
    } else if (note.room !== undefined) {
      at = labelAt(note.room) ?? null
      if (at === null) return []
    } else if (note.kind !== 'key') return []
    return [
      {
        id: note.id,
        kind: note.kind,
        text: note.text ?? null,
        symbol: note.symbol ?? null,
        at,
        room: note.room ?? null,
        turn: (note.turn ?? 0) * RADIANS
      }
    ]
  })
}

/** Every point a sketch item reaches, for framing a view: an arc by its circle's box. */
export function sketchExtent(sketch: readonly PlanSketch[]): Vec2[] {
  return sketch.flatMap((item) => {
    if (item.arc) {
      const { center: c, radius: r } = item.arc
      return [
        { x: c.x - r, y: c.y - r },
        { x: c.x + r, y: c.y + r }
      ]
    }
    return item.text ? [item.text.at] : item.points
  })
}

/** Whether an annotation or a sketch item is on this floor (C5). A note in a room is on its room's floor. */
export function onFloor(entry: Pick<Annotation, 'floor' | 'room'> | Pick<SketchItem, 'floor'>, floor: string, roomFloor: (id: string) => string | undefined): boolean {
  if ('room' in entry && entry.room !== undefined) return roomFloor(entry.room) === floor
  return (entry.floor ?? DEFAULT_FLOOR_ID) === floor
}
