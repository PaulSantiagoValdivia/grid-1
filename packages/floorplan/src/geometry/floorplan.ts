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
import { add, area, centroid, fromTuple, scale } from './vec2'
import { openingSpan, pointAlong, wallAxis, wallCenterline, wallPlanSlices } from './wall'
import type { WallExposure } from './room'
import { tryRoomPolygon, wallExposure } from './room'
import type { Issue } from './validate'
import { validatePlan } from './validate'

export interface PlanWall {
  readonly id: string
  readonly virtual: boolean
  /**
   * Whether it faces the outside or separates two rooms. Derived from the
   * geometry rather than read from the file — it is what gives each wall its
   * line weight.
   */
  readonly exposure: WallExposure
  /** Solid runs, with the openings already taken out. Empty for virtual walls. */
  readonly slices: readonly Vec2[][]
  /** The axis, for drawing virtual walls as a line. */
  readonly centerline: readonly [Vec2, Vec2]
}

export interface PlanRoom {
  readonly id: string
  readonly name: string
  readonly polygon: readonly Vec2[]
  /** Square meters, computed from the polygon. */
  readonly area: number
  /** Where to place the name label. */
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

export interface Bounds {
  readonly min: Vec2
  readonly max: Vec2
  readonly width: number
  readonly height: number
}

/** The plan's geometry, resolved. Not the model — what gets drawn. */
export interface PlanDrawing {
  readonly walls: readonly PlanWall[]
  readonly rooms: readonly PlanRoom[]
  readonly openings: readonly PlanOpening[]
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

  for (const wall of plan.walls) {
    if (broken.has(wall.id)) continue

    const axis = wallAxis(wall)
    const usable = openingsOf(index, wall.id).filter((o) => !broken.has(o.id))
    const slices = wall.virtual ? [] : wallPlanSlices(wall, usable)

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
        thickness: wall.thickness,
        width: opening.width,
        // Only what the plan states: an undecided door has no key, so nothing downstream guesses.
        ...(opening.hinge !== undefined && { hinge: opening.hinge }),
        ...(opening.swing !== undefined && { swing: opening.swing })
      })
    }
  }

  const rooms: PlanRoom[] = []
  for (const room of plan.rooms) {
    if (broken.has(room.id)) continue
    const polygon = tryRoomPolygon(room, index)
    if (!polygon) continue
    rooms.push({
      id: room.id,
      name: room.name,
      polygon,
      area: area(polygon),
      labelAt: centroid(polygon)
    })
    extent.push(...polygon)
  }

  return { walls, rooms, openings, bounds: computeBounds(extent), issues }
}

/** Envelope with a margin, in meters, so the drawing is not flush to the edge. */
export function padBounds(bounds: Bounds, margin: number): Bounds {
  const offset = scale({ x: 1, y: 1 }, margin)
  const min = add(bounds.min, scale(offset, -1))
  const max = add(bounds.max, offset)
  return { min, max, width: max.x - min.x, height: max.y - min.y }
}
