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
import { tolerance } from './tolerances'
import type { WallEnds } from './wall'
import { SQUARE_ENDS, openingSpan, wallAxis, wallLength, wallParts, wallPath, wallPointAt, wallSegments } from './wall'
import { curveStationsBetween, wallCurve } from './arc'
import { cross, dot, fromTuple, normalize, sub } from './vec2'
import { wallJoints } from './joints'
import type { WallExposure } from './exposure'
import { tryRoomShape } from './room'
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
import { wholePlan } from './floors'

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
  /**
   * CNT-18: a curved wall, raised as straight pieces that follow its curve: each a flat prism
   * of its own, mitred to the next, solid between openings and a lintel or a sill over each.
   * A consumer raises these and not `elevation`, which is then the wall unrolled along its
   * curve (its holes where its openings are, for measuring). Absent for a straight wall.
   */
  readonly pieces?: readonly SceneWallPiece[]
}

/** One straight piece of a curved wall in 3D (CNT-18): a rectangle on its own basis, no holes. */
export interface SceneWallPiece {
  readonly elevation: WallElevation
  readonly basis: WallBasis
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
  /** CNT-18: a curved dividing line's axis by its stations, from `from` to `to`; absent when straight. */
  readonly path?: readonly Vec2[]
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

export interface Scene3D {
  readonly walls: readonly SceneWall[]
  readonly slabs: readonly SceneSlab[]
  readonly dividers: readonly SceneDivider[]
  /** The stairs that rise from this floor (LVL-3); empty when the plan states none. */
  readonly stairs: readonly SceneStair[]
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

  const length = wallLength(wall)
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

/** The wall's orthonormal basis, in model coordinates. A curved wall's is its first piece's (CNT-18). */
export function wallBasis(wall: Wall): WallBasis {
  if (wall.arc !== undefined) {
    const first = wallSegments(wall)[0]!
    return basisOf(first.start, first.end)
  }
  const axis = wallAxis(wall)
  return {
    origin: { x: axis.start.x, y: axis.start.y, z: 0 },
    along: { x: axis.dir.x, y: axis.dir.y, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    across: { x: -axis.normal.x, y: -axis.normal.y, z: 0 }
  }
}

function basisOf(from: Vec2, to: Vec2): WallBasis {
  const dir = normalize(sub(to, from))
  return {
    origin: { x: from.x, y: from.y, z: 0 },
    along: { x: dir.x, y: dir.y, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    across: { x: dir.y, y: -dir.x, z: 0 }
  }
}

/**
 * A curved wall's straight pieces in 3D (CNT-18). Each run of `wallParts` is followed by chords:
 * a solid run by its stations, an opening's lintel and sill by the one chord its hole is, so the
 * hole stays straight. Where two chords meet, both are mitred on the line that halves the turn,
 * so their faces meet edge to edge; at an end of the wall, the joint's reach is taken along the
 * end chord.
 */
export function curvedWallPieces(wall: Wall, openings: readonly Opening[] = [], ends: WallEnds = SQUARE_ENDS): SceneWallPiece[] {
  const curve = wallCurve(wall)
  if (curve === null || wall.virtual) return []
  const parts = wallParts(wall, openings)
  // Every chord, by where it runs along the curve; a lintel and its sill share theirs.
  const runs: { from: number; to: number; zFrom: number; zTo: number }[] = []
  for (const part of parts) {
    const stations = part.kind === 'solid' ? curveStationsBetween(curve, part.from, part.to) : [part.from, part.to]
    for (let k = 0; k + 1 < stations.length; k++) runs.push({ from: stations[k]!, to: stations[k + 1]!, zFrom: part.zFrom, zTo: part.zTo })
  }
  const breaks = [...new Set(runs.flatMap((run) => [run.from, run.to]))].sort((a, b) => a - b)
  const point = (s: number): Vec2 => wallPointAt(wall, s)
  const none = tolerance('noLength')
  const chordAt = (from: number): Vec2 | null => {
    const i = breaks.findIndex((b) => Math.abs(b - from) <= none)
    if (i < 0) return null
    const next = breaks[i + 1] ?? (curve.closed ? breaks[1] : undefined)
    if (next === undefined) return null
    const to = next < from ? next + curve.length : next
    return normalize(sub(point(to), point(from)))
  }
  const chordTo = (to: number): Vec2 | null => {
    const i = breaks.findIndex((b) => Math.abs(b - to) <= none)
    if (i < 0) return null
    const prev = i > 0 ? breaks[i - 1] : curve.closed ? breaks[breaks.length - 2] : undefined
    if (prev === undefined) return null
    return normalize(sub(point(to), point(prev > to ? prev - curve.length : prev)))
  }
  const half = wall.thickness / 2
  const mitre = (a: Vec2 | null, b: Vec2 | null): { left: number; right: number } => {
    if (a === null || b === null) return { left: 0, right: 0 }
    const reach = half * Math.tan(Math.atan2(cross(a, b), dot(a, b)) / 2)
    return { left: -reach, right: reach }
  }
  const total = curve.length
  return runs.flatMap((run) => {
    const a = point(run.from)
    const b = point(run.to)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length <= none || run.zTo - run.zFrom <= none) return []
    const dir = normalize(sub(b, a))
    const atStart = !curve.closed && run.from <= none
    const atEnd = !curve.closed && run.to >= total - none
    const pieceEnds: WallEnds = {
      start: atStart ? ends.start : mitre(chordTo(run.from), dir),
      end: atEnd ? ends.end : mitre(dir, chordAt(run.to))
    }
    const elevation: WallElevation = {
      wallId: wall.id,
      outline: [
        { x: 0, y: run.zFrom },
        { x: length, y: run.zFrom },
        { x: length, y: run.zTo },
        { x: 0, y: run.zTo }
      ],
      holes: [],
      thickness: wall.thickness,
      length,
      height: run.zTo - run.zFrom,
      ends: pieceEnds
    }
    return [{ elevation, basis: basisOf(a, b) }]
  })
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

    const path = wallPath(wall)
    extent.push(...path)
    if (wall.virtual) {
      const [from, to] = [fromTuple(wall.start), fromTuple(wall.end)]
      dividers.push({ wallId: wall.id, from, to, ...(wall.arc !== undefined && { path }) })
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
      revision: wallRevision(wall, usable, ends),
      ...(wall.arc !== undefined && { pieces: curvedWallPieces(wall, usable, ends) })
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

  return { walls, slabs, dividers, stairs, bounds: computeBounds(extent), height, issues }
}
