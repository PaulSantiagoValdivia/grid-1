/**
 * The plan, ready to draw.
 *
 * This is the boundary with the UI: shapes and coordinates come out of here,
 * and nothing else. Not one color, line weight or typeface. The consumer emits
 * a `<path>` per polygon and the CSS decides how it looks.
 */

import type { FloorPlan, Opening } from './plan'
import { indexPlan, openingsOf } from './plan'
import type { Vec2 } from './vec2'
import { add, centroid, dot, fromTuple, intersectLines, scale, sub } from './vec2'
import { tolerance } from './tolerances'
import type { WallAxis } from './wall'
import { openingSpan, pointAlong, wallAxis, wallCenterline, wallPlanSlices } from './wall'
import { wallJoints } from './joints'
import type { WallExposure } from './exposure'
import { roomFloorArea, tryRoomShape } from './room'
import { poleOfInaccessibility } from './innerPoint'
import { wallExposure } from './exposure'
import type { Issue } from './validate'
import { validatePlan } from './validate'
import type { PlanStep } from './steps'
import type { PlanNote, PlanSketch } from './writing'
import { planNotes, planSketch, sketchExtent } from './writing'
import { planSteps } from './steps'
import type { ItemKind } from './items'
import { ITEM_KIND_WORDS, isItemKind, itemFootprint, itemRoom, itemSymbol, roomShapes } from './items'

export interface PlanWall {
  readonly id: string
  readonly virtual: boolean
  /**
   * Whether it faces the outside or separates two rooms. Derived from the
   * geometry rather than read from the file — it is what gives each wall its
   * line weight.
   */
  readonly exposure: WallExposure
  /**
   * Solid runs, with the openings already taken out and the corners joined to the walls it
   * meets (SHT-2). Empty for virtual walls.
   */
  readonly slices: readonly Vec2[][]
  /** The axis, for drawing virtual walls as a line. */
  readonly centerline: readonly [Vec2, Vec2]
}

export interface PlanRoom {
  readonly id: string
  readonly name: string
  readonly polygon: readonly Vec2[]
  /**
   * The room's holes (ARE-6), clockwise where the outline is counter-clockwise, so a path of
   * the outline and its holes leaves them open. Empty for a room with none.
   */
  readonly holes: readonly (readonly Vec2[])[]
  /**
   * Square meters, computed from the polygon, less its holes and the floor of any room marked
   * `inside` that sits in it (`roomArea`). The polygon stays the whole outline: the inner room is
   * drawn over it.
   */
  readonly area: number
  /** Where to place the name label. In a room with holes, a point on its floor, never in a hole. */
  readonly labelAt: Vec2
}

export interface PlanOpening {
  readonly id: string
  readonly wallId: string
  readonly type: Opening['type']
  /** Ends of the opening on the wall axis. */
  readonly from: Vec2
  readonly to: Vec2
  /** Unit normal of the wall: which way a door symbol swings. */
  readonly normal: Vec2
  readonly thickness: number
  readonly width: number
  /** The jamb a door hangs from, when the plan states it (C2: `start` is nearer `wall.start`). */
  readonly hinge?: Opening['hinge']
  /** The face a door opens toward, when the plan states it (`left` is the face `normal` points at). */
  readonly swing?: Opening['swing']
}

/** A fixture, ready to draw (CNT-12): its footprint and its symbol inside it, to scale. */
export interface PlanItem {
  readonly id: string
  readonly kind: ItemKind
  /** What it is called: its label, else its kind's word. */
  readonly label: string
  /** The room it stands in, or null. */
  readonly room: string | null
  /** The floor it covers, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** Rings to fill with the paper and outline, in order, then lines over them (`itemSymbol`). */
  readonly rings: readonly (readonly Vec2[])[]
  readonly lines: readonly (readonly Vec2[])[]
}

export interface Bounds {
  readonly min: Vec2
  readonly max: Vec2
  readonly width: number
  readonly height: number
}

/**
 * A room the drawing could not draw (MSG-8): it has no outline of its own, so it stands as the
 * box round the walls it lists, to their faces, so a reader sees where it should be.
 */
export interface UndrawnRoom {
  readonly id: string
  readonly name: string
  readonly box: Bounds
}

/** The plan's geometry, resolved. Not the model — what gets drawn. */
export interface PlanDrawing {
  readonly walls: readonly PlanWall[]
  readonly rooms: readonly PlanRoom[]
  readonly openings: readonly PlanOpening[]
  /**
   * Where a room at one level meets a room at another (LVL-7): a line across each door or
   * doorless opening between them, and along a dividing line between them. Empty when every
   * room stands on its storey's floor.
   */
  readonly steps: readonly PlanStep[]
  /**
   * The rooms that could not be drawn, each as the box round the walls it lists that the plan
   * holds (MSG-8). A room none of whose walls can be found has no box and is not here.
   */
  readonly undrawn: readonly UndrawnRoom[]
  /** The fixtures (CNT-12), drawn over the room fills and under the walls. Empty when the plan has none. */
  readonly items: readonly PlanItem[]
  /** SHT-7: the sketch layer, drawn only: never measured, checked or taken as a wall. */
  readonly sketch: readonly PlanSketch[]
  /** SHT-7: the notes, tags, symbols and key written on the drawing. */
  readonly notes: readonly PlanNote[]
  /** SHT-7: the box round the sketch layer, so a view frames it too; null with none. */
  readonly sketchBounds: Bounds | null
  /** Envelope of the whole drawing, for computing the viewBox. */
  readonly bounds: Bounds
  /** What could not be drawn and why. Never a reason to skip the rest. */
  readonly issues: readonly Issue[]
}

const EMPTY_BOUNDS: Bounds = {
  min: { x: 0, y: 0 },
  max: { x: 0, y: 0 },
  width: 0,
  height: 0
}

export function computeBounds(points: readonly Vec2[]): Bounds {
  if (points.length === 0) return EMPTY_BOUNDS
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * The envelope of every wall in the plan, across all floors.
 *
 * Unlike the per-floor `bounds` a drawing or scene carries, this does not depend
 * on which floor is showing — which is what the 3D camera needs, since framing
 * and orbiting around a per-floor centre would move the pivot every time the
 * user changed storey.
 *
 * Reads the raw `start`/`end` tuples rather than going through `wallAxis`, so a
 * zero-length wall gives no bounds rather than throwing. No validation, and no
 * elevations — there is no z in the file (C5).
 */
export function planBounds(plan: FloorPlan): Bounds {
  const points: Vec2[] = []
  for (const wall of plan.walls) {
    points.push(fromTuple(wall.start), fromTuple(wall.end))
  }
  return computeBounds(points)
}

/**
 * Turns the plan model into drawable shapes.
 *
 * A broken plan does not make this fail: whatever cannot be built is skipped
 * and recorded in `issues`.
 */
export function buildFloorPlan(plan: FloorPlan): PlanDrawing {
  const index = indexPlan(plan)
  const { issues, broken } = validatePlan(plan, index)

  const walls: PlanWall[] = []
  const openings: PlanOpening[] = []
  const extent: Vec2[] = []
  // The corners, joined once for the walls this drawing holds (SHT-2).
  const joints = wallJoints(plan.walls.filter((wall) => !broken.has(wall.id)))

  for (const wall of plan.walls) {
    if (broken.has(wall.id)) continue

    const axis = wallAxis(wall)
    const usable = openingsOf(index, wall.id).filter((o) => !broken.has(o.id))
    const slices = wall.virtual ? [] : wallPlanSlices(wall, usable, joints.get(wall.id))

    walls.push({
      id: wall.id,
      virtual: wall.virtual === true,
      exposure: wallExposure(index, wall.id),
      slices,
      centerline: wallCenterline(wall)
    })

    for (const slice of slices) extent.push(...slice)
    extent.push(axis.start, axis.end)

    for (const opening of usable) {
      const span = openingSpan(opening)
      openings.push({
        id: opening.id,
        wallId: wall.id,
        type: opening.type,
        from: pointAlong(axis, span.from),
        to: pointAlong(axis, span.to),
        normal: axis.normal,
        // A dividing line has no width, so neither has a gap in it: it must not paint the
        // written thickness across the floor.
        thickness: wall.virtual ? 0 : wall.thickness,
        width: opening.width,
        // Only what the plan states: an undecided door has no key, so nothing downstream guesses.
        ...(opening.hinge !== undefined && { hinge: opening.hinge }),
        ...(opening.swing !== undefined && { swing: opening.swing })
      })
    }
  }

  const rooms: PlanRoom[] = []
  const undrawn: UndrawnRoom[] = []
  for (const room of plan.rooms) {
    const shape = broken.has(room.id) ? null : tryRoomShape(room, index)
    if (!shape) {
      const box = boxRoundWalls(room, index)
      if (box) undrawn.push({ id: room.id, name: room.name, box })
      continue
    }
    const { polygon, holes } = shape
    rooms.push({
      id: room.id,
      name: room.name,
      polygon,
      holes,
      // Less its holes (ARE-6) and the floor of any room marked `inside` that sits in it (ARE-5).
      area: roomFloorArea(room, index, polygon),
      // The middle of the corners of a ring lies in its hole: there, the point of its floor
      // farthest from every edge.
      labelAt: holes.length === 0 ? centroid(polygon) : poleOfInaccessibility(polygon, undefined, holes).point
    })
    extent.push(...polygon)
  }

  const items: PlanItem[] = []
  if ((plan.items ?? []).length > 0) {
    const shapes = roomShapes(index, broken)
    for (const item of plan.items ?? []) {
      if (broken.has(item.id) || !isItemKind(item.kind)) continue
      const kind = item.kind
      const outline = itemFootprint(item)
      const symbol = itemSymbol({ ...item, kind })
      items.push({
        id: item.id,
        kind,
        label: item.label ?? ITEM_KIND_WORDS[kind],
        room: itemRoom(item, shapes)?.id ?? null,
        outline,
        rings: symbol.rings,
        lines: symbol.lines
      })
      extent.push(...outline)
    }
  }

  const sketch = planSketch(plan)
  const notes = planNotes(plan, (id) => rooms.find((room) => room.id === id)?.labelAt)
  const sketchBounds = sketch.length === 0 ? null : computeBounds(sketchExtent(sketch))
  return { walls, rooms, openings, steps: planSteps(plan, index, broken), items, undrawn, sketch, notes, sketchBounds, bounds: computeBounds(extent), issues }
}

/**
 * The box round the walls a room lists, round it and its holes (MSG-8), to their faces.
 *
 * Where two of the walls meet, their axes cross within both walls (give or take half the other
 * wall's thickness and `wallContact`): those corners bound the room, so a long outside wall the
 * room shares with others does not stretch its box. With fewer corners than make a box, it is
 * the box round the whole walls. Null when the room lists no wall the plan holds.
 */
function boxRoundWalls(room: FloorPlan['rooms'][number], index: ReturnType<typeof indexPlan>): Bounds | null {
  const walls: { axis: WallAxis; half: number }[] = []
  for (const id of new Set([...room.boundary, ...(room.holes ?? []).flat()])) {
    const wall = index.wallsById.get(id)
    if (!wall || ![...wall.start, ...wall.end].every(Number.isFinite)) continue
    if (wall.start[0] === wall.end[0] && wall.start[1] === wall.end[1]) continue
    walls.push({ axis: wallAxis(wall), half: Number.isFinite(wall.thickness) && wall.thickness > 0 ? wall.thickness / 2 : 0 })
  }
  if (walls.length === 0) return null
  const half = Math.max(...walls.map((wall) => wall.half))
  const widen = (points: readonly Vec2[]): Bounds =>
    computeBounds(points.flatMap((p) => [{ x: p.x - half, y: p.y - half }, { x: p.x + half, y: p.y + half }]))

  const contact = tolerance('wallContact')
  const within = (p: Vec2, axis: WallAxis, slack: number): boolean => {
    const along = dot(sub(p, axis.start), axis.dir)
    return along >= -slack && along <= axis.length + slack
  }
  const corners: Vec2[] = []
  walls.forEach((a, i) => {
    for (const b of walls.slice(i + 1)) {
      const p = intersectLines({ point: a.axis.start, dir: a.axis.dir }, { point: b.axis.start, dir: b.axis.dir })
      if (p && within(p, a.axis, b.half + contact) && within(p, b.axis, a.half + contact)) corners.push(p)
    }
  })
  const box = computeBounds(corners)
  if (corners.length >= 3 && box.width > 0 && box.height > 0) return widen(corners)
  return widen(walls.flatMap((wall) => [wall.axis.start, wall.axis.end]))
}

/** Envelope with a margin, in meters, so the drawing is not flush to the edge. */
export function padBounds(bounds: Bounds, margin: number): Bounds {
  const offset = scale({ x: 1, y: 1 }, margin)
  const min = add(bounds.min, scale(offset, -1))
  const max = add(bounds.max, offset)
  return { min, max, width: max.x - min.x, height: max.y - min.y }
}
