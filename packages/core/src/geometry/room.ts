/**
 * Room geometry.
 *
 * A room carries no coordinates of its own: it carries a list of the walls
 * around it. Turning that list into a polygon is what this module does.
 *
 * The key is how the polygon is built. Wall endpoints are never joined;
 * instead the LINES of their inner faces are intersected, pairwise and in
 * order. That has two consequences worth knowing:
 *
 *  - One wall can border several rooms along different stretches without
 *    having to be split, because only its line is used, never its endpoints.
 *  - Walls of different thickness produce the right corner on their own, with
 *    no special cases.
 */

import type { PlanIndex, Room, Wall } from './plan'
import type { Line, Vec2 } from './vec2'
import { EPS, area, centroid, cross, intersectLines, isCounterClockwise, lerp, sub } from './vec2'
import { wallAxis, wallFaces } from './wall'

/**
 * The wall face looking into the room.
 *
 * It is decided by which side an interior reference point falls on, not by the
 * order of `boundary`. That way a boundary listed clockwise produces the same
 * polygon as one listed counter-clockwise.
 */
function innerFace(wall: Wall, inside: Vec2): Line {
  const axis = wallAxis(wall)
  const faces = wallFaces(wall)
  // cross > 0 means the point falls to the left of the wall direction, which
  // is where the normal points.
  return cross(axis.dir, sub(inside, axis.start)) > 0 ? faces.left : faces.right
}

/**
 * The corners of the room along the wall axes: where each wall's line meets the
 * next one's. Null when two neighbours are parallel and make no corner, or fewer
 * than three distinct lines are left.
 *
 * Neighbours on one line are a single side, as in `mergeCollinear`.
 */
function axisCorners(walls: readonly Wall[]): Vec2[] | null {
  const lines: Line[] = []
  for (const wall of walls) {
    const axis = wallAxis(wall)
    const line = { point: axis.start, dir: axis.dir }
    const previous = lines[lines.length - 1]
    if (!previous || !sameLine(previous, line)) lines.push(line)
  }
  while (lines.length > 1 && sameLine(lines[lines.length - 1]!, lines[0]!)) lines.pop()
  if (lines.length < 3) return null

  const corners: Vec2[] = []
  for (let i = 0; i < lines.length; i++) {
    const corner = intersectLines(lines[i]!, lines[(i + 1) % lines.length]!)
    if (!corner) return null
    corners.push(corner)
  }
  return corners
}

/**
 * Interior reference point: the middle of the room's corners along the wall
 * axes.
 *
 * It is not the middle of the walls. A wall can run past the room it borders,
 * and then its midpoint drags the average away, or onto another wall's axis,
 * where `innerFace` cannot tell which side is the room. The corners do not
 * depend on how far a wall extends. When the walls make no corners (the
 * boundary is out of order), the midpoints are the fallback and the error
 * comes from the intersection that follows.
 */
function approximateInterior(walls: readonly Wall[]): Vec2 {
  const corners = axisCorners(walls)
  if (corners) return centroid(corners)
  return centroid(
    walls.map((wall) => {
      const axis = wallAxis(wall)
      return lerp(axis.start, axis.end, 0.5)
    })
  )
}

interface Side {
  readonly wall: Wall
  readonly face: Line
}

/** The same line: parallel, and no further apart than `EPS`. */
function sameLine(a: Line, b: Line): boolean {
  return Math.abs(cross(a.dir, b.dir)) < 1e-9 && Math.abs(cross(a.dir, sub(b.point, a.point))) < EPS
}

/**
 * One straight wall drawn as two pieces has one inner face, not two. Two
 * neighbours on the same line are not a corner, so they count as one side.
 * The first piece of a run stands for it, which keeps the wall named
 * in an error the one the reader sees first. Parallel faces that sit apart are
 * not merged: that is a step the boundary does not describe.
 */
function mergeCollinear(sides: readonly Side[]): Side[] {
  const merged: Side[] = []
  for (const side of sides) {
    const previous = merged[merged.length - 1]
    if (!previous || !sameLine(previous.face, side.face)) merged.push(side)
  }
  // The run can wrap around the end of the boundary.
  while (merged.length > 1 && sameLine(merged[merged.length - 1]!.face, merged[0]!.face)) {
    merged.pop()
  }
  return merged
}

function resolveWalls(room: Room, index: PlanIndex): Wall[] {
  return room.boundary.map((wallId) => {
    const wall = index.wallsById.get(wallId)
    if (!wall) {
      throw new Error(`Room ${room.id} references wall ${wallId}, which does not exist`)
    }
    return wall
  })
}

/**
 * The room polygon, along the inner faces of its walls.
 *
 * Vertices come out counter-clockwise. Throws when the boundary does not
 * describe a closable outline — use `tryRoomPolygon` when the plan may be
 * malformed, which during most of development is always.
 */
export function roomPolygon(room: Room, index: PlanIndex): Vec2[] {
  const walls = resolveWalls(room, index)
  if (walls.length < 3) {
    throw new Error(`Room ${room.id} has ${walls.length} walls; at least 3 are needed to close`)
  }

  const inside = approximateInterior(walls)
  const sides = mergeCollinear(walls.map((wall) => ({ wall, face: innerFace(wall, inside) })))
  if (sides.length < 3) {
    throw new Error(
      `Room ${room.id} has ${sides.length} distinct sides; at least 3 are needed to close`
    )
  }

  const vertices: Vec2[] = []
  for (let i = 0; i < sides.length; i++) {
    const current = sides[i]!
    const next = sides[(i + 1) % sides.length]!
    const corner = intersectLines(current.face, next.face)
    if (!corner) {
      const wallA = current.wall
      const wallB = next.wall
      throw new Error(
        `In room ${room.id}, walls ${wallA.id} and ${wallB.id} are parallel and form no ` +
          `corner. The boundary may be out of order.`
      )
    }
    vertices.push(corner)
  }

  return isCounterClockwise(vertices) ? vertices : vertices.reverse()
}

/** Same as `roomPolygon`, but returns `null` instead of throwing. */
export function tryRoomPolygon(room: Room, index: PlanIndex): Vec2[] | null {
  try {
    return roomPolygon(room, index)
  } catch {
    return null
  }
}

/**
 * Room area in square meters.
 *
 * It is derived data and that is why it does not live in the plan file: it is
 * computed every time. Derived data that gets stored is data that drifts.
 */
export function roomArea(room: Room, index: PlanIndex): number {
  return area(roomPolygon(room, index))
}

/**
 * Whether the wall separates two rooms or faces the outside.
 *
 * The wall's declared `kind` says what the file claims; this says what the
 * geometry shows. Thickness decides nothing — an interior wall can be thick
 * and an exterior one thin.
 *
 * Note the criterion: it is NOT how many rooms name the wall. A long
 * perimeter wall can border several rooms and still face the outside, because
 * all of them fall on the same side. What makes a wall interior is having
 * rooms on BOTH sides of its axis.
 */
export type WallExposure = 'exterior' | 'interior' | 'detached'

export function wallExposure(index: PlanIndex, wallId: string): WallExposure {
  const rooms = index.roomsByWall.get(wallId)
  const wall = index.wallsById.get(wallId)
  if (!wall || !rooms || rooms.length === 0) return 'detached'

  const axis = wallAxis(wall)
  let left = false
  let right = false

  for (const room of rooms) {
    const polygon = tryRoomPolygon(room, index)
    if (!polygon) continue
    const side = cross(axis.dir, sub(centroid(polygon), axis.start))
    if (side > 0) left = true
    else if (side < 0) right = true
  }

  if (left && right) return 'interior'
  if (left || right) return 'exterior'
  return 'detached'
}
