/**
 * Data for raising the plan into volume.
 *
 * Like `floorplan.ts`, this module does NOT import Three: it returns numbers.
 * Three lives in the consumer. That keeps the geometry testable without a
 * browser, and lets a glTF exporter reuse it tomorrow without dragging the
 * whole renderer along.
 *
 * The technique: every wall is described by its ELEVATION — the rectangle you
 * would see head-on, with doors and windows as holes. The consumer extrudes it
 * by the thickness and places it in space. No boolean operations needed: the
 * opening is a hole in the outline, and Three triangulates it on extrusion.
 */

import type { FloorPlan, Opening, PlanIndex, Room, Wall } from './plan'
import { indexPlan, openingsOf } from './plan'
import type { Vec2 } from './vec2'
import { signedArea } from './vec2'
import type { WallEnds } from './wall'
import { SQUARE_ENDS, openingSpan, wallAxis } from './wall'
import { wallJoints } from './joints'
import type { WallExposure } from './exposure'
import { tryRoomShape } from './room'
import { wallExposure } from './exposure'
import { wallRevision } from './revision'
import type { Bounds } from './floorplan'
import { computeBounds } from './floorplan'
import type { Issue } from './validate'
import { validatePlan } from './validate'

/** A point in model space: XY is the plan, Z is height. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The wall seen head-on, in local coordinates:
 *   u = distance along the wall from `start`
 *   v = height above the floor
 *
 * The outline winds counter-clockwise and the holes wind clockwise. That
 * inversion is not a detail: if the holes wind the same way as the outline,
 * they do not open. It is the classic mistake with this technique, which is
 * why a test compares the signs of the areas.
 */
export interface WallElevation {
  readonly wallId: string
  readonly outline: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
  /** Extrusion depth. */
  readonly thickness: number
  readonly length: number
  readonly height: number
  /**
   * How far each face reaches past the ends of the axis where the wall meets others (SHT-2):
   * the outline is the wall's elevation on its axis, and each face's ends move by these to
   * the joint (`alongFace`). Zero at an end cut square.
   */
  readonly ends: WallEnds
}

/**
 * Where a point of the elevation at `u` lies along the wall on one of its faces, once the
 * corners are joined: a point at either end of the wall moves with that face's end. `left` is
 * the face the wall's normal points at, the one at `−across`.
 */
export function alongFace(elevation: WallElevation, u: number, face: 'left' | 'right'): number {
  if (u <= 0) return u - elevation.ends.start[face]
  if (u >= elevation.length) return u + elevation.ends.end[face]
  return u
}

/**
 * How the elevation is planted in space.
 *
 * The three vectors are orthonormal and form the wall's basis: the consumer
 * uses them to build the matrix that takes local coordinates (u, v, thickness)
 * into the world. They are in MODEL coordinates (Z up); converting to Three's
 * convention (Y up) is the consumer's job.
 */
export interface WallBasis {
  /** The wall's `start` point, at floor level. */
  readonly origin: Vec3
  /** Where u grows. */
  readonly along: Vec3
  /** Where v grows. Always (0, 0, 1). */
  readonly up: Vec3
  /**
   * Where the thickness grows. The extrusion is centered on the axis, so the
   * side is geometrically irrelevant — what matters is that
   * `along × up = across`, i.e. that the basis is right-handed. Using the
   * normal from `wallFaces()` here would mirror the basis and leave the
   * extrusion with its normals inside out (the wall would look black).
   */
  readonly across: Vec3
}

export interface SceneWall {
  readonly id: string
  readonly elevation: WallElevation
  readonly basis: WallBasis
  /** Derived from the geometry: how many rooms it borders. */
  readonly exposure: WallExposure
  /**
   * Changes only when this wall's shape does. The consumer keeps its built
   * mesh while the revision holds, instead of retriangulating an extrusion and
   * re-uploading it on every write to the plan file.
   */
  readonly revision: string
}

/**
 * The slab under one room — the floor surface it stands on.
 *
 * Named "slab", not "floor", because a floor plan's `floor` is a storey (C5).
 * One SceneSlab per room; a storey's worth of them is what a 3D scene draws.
 */
export interface SceneSlab {
  readonly roomId: string
  readonly name: string
  /** Polygon on the model's XY plane, at z = 0. */
  readonly polygon: readonly Vec2[]
  /** The room's holes (ARE-6), clockwise: the floor is open there. Empty for a room with none. */
  readonly holes: readonly (readonly Vec2[])[]
}

/**
 * A dividing line (a virtual wall): no substance to raise, so the scene draws it on the
 * floor, between the slabs of the rooms either side, which meet on it.
 */
export interface SceneDivider {
  readonly wallId: string
  /** The wall's axis on the model's XY plane, at z = 0. */
  readonly from: Vec2
  readonly to: Vec2
}

export interface Scene3D {
  readonly walls: readonly SceneWall[]
  readonly slabs: readonly SceneSlab[]
  readonly dividers: readonly SceneDivider[]
  /** Plan envelope, for framing the camera. */
  readonly bounds: Bounds
  /** Height of the tallest wall. */
  readonly height: number
  readonly issues: readonly Issue[]
}

/**
 * The opening rectangle in local coordinates, winding clockwise.
 *
 * The order of the points is deliberate: up the left edge, across the top and
 * down the right. That yields a negative area, opposite to the outline's.
 */
function holeFrom(opening: Opening): Vec2[] {
  const span = openingSpan(opening)
  const top = opening.sill + opening.height
  return [
    { x: span.from, y: opening.sill },
    { x: span.from, y: top },
    { x: span.to, y: top },
    { x: span.to, y: opening.sill }
  ]
}

/**
 * The wall elevation, with its holes.
 *
 * Returns `null` for a virtual wall: there is no substance to raise.
 */
export function wallElevation(
  wall: Wall,
  openings: readonly Opening[] = [],
  ends: WallEnds = SQUARE_ENDS
): WallElevation | null {
  if (wall.virtual) return null

  const length = wallAxis(wall).length
  const height = wall.height

  // Counter-clockwise, starting at the foot of `start`.
  const outline: Vec2[] = [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: height },
    { x: 0, y: height }
  ]

  return {
    wallId: wall.id,
    outline,
    holes: openings.map(holeFrom),
    thickness: wall.thickness,
    length,
    height,
    ends
  }
}

/** The wall's orthonormal basis, in model coordinates. */
export function wallBasis(wall: Wall): WallBasis {
  const axis = wallAxis(wall)
  return {
    origin: { x: axis.start.x, y: axis.start.y, z: 0 },
    along: { x: axis.dir.x, y: axis.dir.y, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    across: { x: -axis.normal.x, y: -axis.normal.y, z: 0 }
  }
}

/** A room's slab polygon, with its holes. The same ones the plan view draws. */
export function roomSlab(room: Room, index: PlanIndex): SceneSlab | null {
  const shape = tryRoomShape(room, index)
  if (!shape) return null
  return { roomId: room.id, name: room.name, polygon: shape.polygon, holes: shape.holes }
}

/**
 * Elevation area with the holes taken out.
 *
 * It exists for the tests: multiplied by the thickness it gives the wall
 * volume, and that equality catches any arithmetic slip in the elevation.
 */
export function elevationArea(elevation: WallElevation): number {
  const solid = Math.abs(signedArea(elevation.outline))
  const holes = elevation.holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0)
  return solid - holes
}

/**
 * Builds the whole scene.
 *
 * Mirrors `buildFloorPlan()`: it leans on the same validation and skips what
 * cannot be built instead of failing.
 */
export function buildScene(plan: FloorPlan): Scene3D {
  const index = indexPlan(plan)
  const { issues, broken } = validatePlan(plan, index)

  const walls: SceneWall[] = []
  const dividers: SceneDivider[] = []
  const extent: Vec2[] = []
  let height = 0
  // The corners, joined as the drawing joins them (SHT-2).
  const joints = wallJoints(plan.walls.filter((wall) => !broken.has(wall.id)))

  for (const wall of plan.walls) {
    if (broken.has(wall.id)) continue

    const axis = wallAxis(wall)
    extent.push(axis.start, axis.end)
    if (wall.virtual) {
      dividers.push({ wallId: wall.id, from: axis.start, to: axis.end })
      continue
    }

    const usable = openingsOf(index, wall.id).filter((o) => !broken.has(o.id))
    const ends = joints.get(wall.id)
    const elevation = wallElevation(wall, usable, ends)
    if (!elevation) continue

    walls.push({
      id: wall.id,
      elevation,
      basis: wallBasis(wall),
      exposure: wallExposure(index, wall.id),
      revision: wallRevision(wall, usable, ends)
    })
    if (wall.height > height) height = wall.height
  }

  const slabs: SceneSlab[] = []
  for (const room of plan.rooms) {
    if (broken.has(room.id)) continue
    const slab = roomSlab(room, index)
    if (!slab) continue
    slabs.push(slab)
    extent.push(...slab.polygon)
  }

  return { walls, slabs, dividers, bounds: computeBounds(extent), height, issues }
}
