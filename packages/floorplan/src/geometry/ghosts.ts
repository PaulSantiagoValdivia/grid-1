/**
 * Ghosts: what the version before drew of the things that were removed or
 * changed.
 *
 * A review shows a proposal on the plan, and for a wall that moved it has to show
 * where the wall used to be. That is the base version's own drawing of the wall,
 * not a new computation: this picks which of its elements to keep, so the canvas
 * never invents geometry and the rule for what counts as a ghost is testable
 * without a DOM.
 *
 * The input is a `PlanDrawing` already built for the active floor, so a base
 * entity on another floor, or one the base could not draw, is simply not there.
 */

import type { Bounds, PlanDrawing, PlanOpening, PlanRoom, PlanWall } from './floorplan'
import { computeBounds } from './floorplan'
import type { Vec2 } from './vec2'

/** What happened to an entity between the version before and this one. */
export type DiffStatus = 'added' | 'removed' | 'modified'

/** By entity id; an id that is absent is unchanged. Ids share one namespace in a plan. */
export type DiffStatusMap = Readonly<Record<string, DiffStatus>>

export interface Ghosts {
  readonly walls: readonly PlanWall[]
  readonly rooms: readonly PlanRoom[]
  readonly openings: readonly PlanOpening[]
  /** Envelope of the ghosts alone: zero-sized when there are none. */
  readonly bounds: Bounds
}

const isGhost = (status: DiffStatusMap, id: string): boolean =>
  status[id] === 'removed' || status[id] === 'modified'

/** The four corners of an opening's footprint across the wall. */
function openingCorners(opening: PlanOpening): Vec2[] {
  const half = opening.thickness / 2
  const side = { x: opening.normal.x * half, y: opening.normal.y * half }
  return [opening.from, opening.to].flatMap((end) => [
    { x: end.x + side.x, y: end.y + side.y },
    { x: end.x - side.x, y: end.y - side.y }
  ])
}

/**
 * The elements of `base` whose status is `removed` or `modified`, in the order the
 * base drew them. They are the base's own objects, not copies.
 */
export function ghostsOf(base: PlanDrawing, status: DiffStatusMap): Ghosts {
  const walls = base.walls.filter((wall) => isGhost(status, wall.id))
  const rooms = base.rooms.filter((room) => isGhost(status, room.id))
  const openings = base.openings.filter((opening) => isGhost(status, opening.id))

  const bounds = computeBounds([
    ...walls.flatMap((wall) => [...wall.slices.flat(), ...wall.centerline]),
    ...rooms.flatMap((room) => room.polygon),
    ...openings.flatMap(openingCorners)
  ])

  return { walls, rooms, openings, bounds }
}

/**
 * `bounds` grown to hold the ghosts. With no ghosts it is `bounds` itself:
 * their own bounds then sit at 0,0, which would drag the frame to the origin.
 */
export function boundsWithGhosts(bounds: Bounds, ghosts: Ghosts): Bounds {
  if (ghosts.walls.length + ghosts.rooms.length + ghosts.openings.length === 0) return bounds
  return computeBounds([bounds.min, bounds.max, ghosts.bounds.min, ghosts.bounds.max])
}
