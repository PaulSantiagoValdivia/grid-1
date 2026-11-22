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
import { roomZones } from './zones'
import { roomFloorOffset } from './steps'
import { wallExposure } from './exposure'
import { wallRevision } from './revision'
import type { Bounds } from './floorplan'
import { computeBounds } from './floorplan'
import type { Issue } from './validate'
import { brokenOnFloor, validatePlan } from './validate'
import type { StairLayout } from './stairs'
import { planStairs } from './stairs'
import { floorElevations } from './elevations'
import { planFloors, wholePlan } from './floors'
import { wholeWall } from './through'
import { floorEnvelope, type FloorRoof } from './envelope'
import { wallTopProfile, type RoofPlane, type WallTopPoint } from './roofs'
import { piecesAsRings } from './polygons'
import type { MultiPolygon } from 'polygon-clipping'

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
  /**
   * How far the room's floor stands above its storey's floor level, in metres (LVL-7), when it
   * states an offset other than 0; absent, it stands on the storey's floor. The slab's top is at
   * this height, and a raised room's slab is solid down to the storey's floor, so a stage reads
   * as a platform.
   */
  readonly offset?: number
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

/** One block of a stair: a tread or a landing, solid from the stair's foot to its top (LVL-3). */
export interface SceneStairBlock {
  /** On the model's XY plane, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** Heights above the storey's floor level, in metres. */
  readonly bottom: number
  readonly top: number
}

/**
 * A stair the plan states, in the scene of the floor it rises from (LVL-3): one block per tread
 * and per landing, each standing on the floor at the stair's foot and as high as the riser it
 * tops. The last riser rises onto the floor above, which is that storey's own slab.
 */
export interface SceneStair {
  readonly id: string
  readonly name: string
  readonly blocks: readonly SceneStairBlock[]
}

/** A laid-out stair as blocks, with heights from `floorLevel`, the level of the storey it rises from. */
export function stairBlocks(stair: StairLayout, floorLevel: number): SceneStair {
  const base = stair.lower.level - floorLevel
  const blocks: SceneStairBlock[] = []
  for (const flight of stair.flights) {
    for (let k = 0; k + 1 < flight.riserLines.length; k++) {
      const [a, b] = flight.riserLines[k]!
      const [c, d] = flight.riserLines[k + 1]!
      // Left to right across the flight, looking up it: counter-clockwise is right, up, left, down.
      blocks.push({ outline: [b, d, c, a], bottom: base, top: base + (flight.risersBelow + k + 1) * stair.riserHeight })
    }
  }
  for (const landing of stair.landings) {
    blocks.push({ outline: landing.outline, bottom: base, top: base + landing.risersBelow * stair.riserHeight })
  }
  return { id: stair.id, name: stair.name, blocks }
}

/** A piece of a flat solid on the plan: its outline counter-clockwise, its holes clockwise. */
export interface ScenePiece {
  readonly outline: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
  /**
   * LVL-6: a piece of a sloped roof is not level: its bottom and its top are raised, over each
   * point, by this plane's height there (`z0 + gx·x + gy·y`), so the piece lies on the roof's
   * slope, as thick as the solid. Absent on a level piece.
   */
  readonly rise?: RoofPlane
}

/**
 * A flat solid of the building's shell (LVL-4): pieces on the plan, solid between two heights,
 * in metres above the storey's floor level.
 */
export interface SceneSolid {
  readonly pieces: readonly ScenePiece[]
  readonly bottom: number
  readonly top: number
}

/**
 * What closes a storey (LVL-4): the slab it stands on, from its outline, open over its stairs,
 * lifts and voids (`envelope.ts`), and the roof over every part of it with nothing above, with its
 * parapet. Heights are the storey's own, so the slab lies under z = 0 and fills the space between
 * this storey and the one below it when the two are stacked.
 */
export interface SceneShell {
  readonly floor: string
  /** The slab, then a piece lower down under each room whose floor is set below the storey's. */
  readonly slab: readonly SceneSolid[]
  readonly roof: SceneSolid | null
  readonly parapet: SceneSolid | null
}

const scenePieces = (pieces: MultiPolygon): ScenePiece[] => piecesAsRings(pieces)

/**
 * The shell of the storey `plan` is, or of the only floor of a plan that is no slice (LVL-4). Null
 * for a plan of several floors that is no slice: its floors would all stand at z = 0 (C5), and a
 * slab or a roof can only be placed on one.
 */
export function sceneShell(plan: FloorPlan): SceneShell | null {
  const { whole, floor } = wholePlan(plan)
  const floors = planFloors(whole)
  const id = floor ?? (floors.length === 1 ? floors[0]!.id : null)
  if (id === null) return null
  const elevations = floorElevations(whole)
  const envelope = floorEnvelope(whole, id, elevations)
  if (envelope === null) return null
  const base = elevations.floors.get(id)?.floorLevel ?? 0
  const slab: SceneSolid[] = []
  if (envelope.slab !== null) {
    const { thickness } = envelope.slab
    if (envelope.slab.pieces.length > 0 && thickness > 0) slab.push({ pieces: scenePieces(envelope.slab.pieces), bottom: -thickness, top: 0 })
    for (const sunk of envelope.slab.sunken) {
      if (thickness > 0) slab.push({ pieces: scenePieces(sunk.pieces), bottom: sunk.offset - thickness, top: sunk.offset })
    }
  }
  const roof = envelope.roof
  const roofSolid: SceneSolid | null = roof === null ? null : roofSolidOf(roof, base)
  const parapet: SceneSolid | null =
    roof?.parapet == null || roofSolid === null
      ? null
      : { pieces: scenePieces(roof.parapet.pieces), bottom: roofSolid.top, top: roofSolid.top + roof.parapet.height }
  return { floor: id, slab, roof: roofSolid, parapet }
}

/**
 * The roof as a solid of the storey: level pieces at its underside, or (LVL-6) each plane's pieces
 * raised onto that plane, as thick as the roof.
 */
function roofSolidOf(roof: FloorRoof, base: number): SceneSolid {
  const sloped = roof.facets.some((f) => f.plane.gx !== 0 || f.plane.gy !== 0)
  if (!sloped) {
    const pieces = roof.facets.length === 1 ? roof.facets[0]!.pieces : roof.pieces
    return { pieces: scenePieces(pieces), bottom: roof.bottom - base, top: roof.bottom - base + roof.thickness }
  }
  const pieces = roof.facets.flatMap((facet) => scenePieces(facet.pieces).map((piece) => ({ ...piece, rise: facet.plane })))
  return { pieces, bottom: 0, top: roof.thickness }
}

export interface Scene3D {
  readonly walls: readonly SceneWall[]
  readonly slabs: readonly SceneSlab[]
  readonly dividers: readonly SceneDivider[]
  /** The stairs that rise from this floor (LVL-3); empty when the plan states none. */
  readonly stairs: readonly SceneStair[]
  /** The slab under this floor and the roof over its parts with nothing above (LVL-4), or null. */
  readonly shell: SceneShell | null
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
  ends: WallEnds = SQUARE_ENDS,
  top: readonly WallTopPoint[] | null = null
): WallElevation | null {
  if (wall.virtual) return null

  const length = wallAxis(wall).length

  // Counter-clockwise, starting at the foot of `start`. LVL-6: a wall the roof cuts has the top the
  // roof leaves it (`wallTopProfile`), walked back from the far end.
  const outline: Vec2[] =
    top === null
      ? [
          { x: 0, y: 0 },
          { x: length, y: 0 },
          { x: length, y: wall.height },
          { x: 0, y: wall.height }
        ]
      : [{ x: 0, y: 0 }, { x: length, y: 0 }, ...[...top].reverse().map((p) => ({ x: p.u, y: p.z }))]
  const height = top === null ? wall.height : Math.max(...top.map((p) => p.z))

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
  const offset = roomFloorOffset(room)
  return { roomId: room.id, name: room.name, polygon: shape.polygon, holes: shape.holes, ...(offset !== 0 && { offset }) }
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
export interface SceneOptions {
  /** The shell, when the caller has worked it out already (`sceneShell`). */
  readonly shell?: SceneShell | null
}

export function buildScene(plan: FloorPlan, options: SceneOptions = {}): Scene3D {
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

    // LVL-5 (C15): a wall through floors is raised once, whole, from its own floor, with its
    // openings as stated; on the floors above it is there already.
    const whole = wholeWall(wall, openingsOf(index, wall.id).filter((o) => !broken.has(o.id)))
    if (whole === null) continue
    const usable = whole.openings
    const ends = joints.get(wall.id)
    const top = whole.wall === wall ? wallTopProfile(plan, wall) : null
    const elevation = wallElevation(whole.wall, usable, ends, top)
    if (!elevation) continue

    walls.push({
      id: wall.id,
      elevation,
      basis: wallBasis(wall),
      exposure: wallExposure(index, wall.id),
      revision: wallRevision(whole.wall, usable, ends, top)
    })
    if (elevation.height > height) height = elevation.height
  }

  const slabs: SceneSlab[] = []
  // A zone's floor is its room's (CNT-8): one slab, the room's.
  const zones = roomZones(index)
  for (const room of plan.rooms) {
    if (broken.has(room.id) || zones.zoneOf.has(room.id)) continue
    const slab = roomSlab(room, index)
    if (!slab) continue
    slabs.push(slab)
    extent.push(...slab.polygon)
  }

  // The stairs that rise from this floor, read from the plan it was cut from (LVL-3). A plan that
  // is no slice draws every stair, each rising from its lower floor's z = 0, as its walls do (C5).
  const stairs: SceneStair[] = []
  if ((plan.stairs ?? []).length > 0) {
    const { whole, floor } = wholePlan(plan)
    const levels = floorElevations(whole).floors
    for (const stair of planStairs(plan, floor === null ? () => broken : brokenOnFloor).stairs) {
      if (floor !== null && stair.lower.floor !== floor) continue
      const scene = stairBlocks(stair, levels.get(stair.lower.floor)?.floorLevel ?? 0)
      stairs.push(scene)
      for (const block of scene.blocks) extent.push(...block.outline)
    }
  }

  // The bounds stay the walls' axes and the rooms, as before: the shell reaches out to the walls'
  // faces, which the bounds do not frame either.
  const shell = options.shell !== undefined ? options.shell : sceneShell(plan)

  return { walls, slabs, dividers, stairs, shell, bounds: computeBounds(extent), height, issues }
}
