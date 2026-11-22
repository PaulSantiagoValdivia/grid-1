/**
 * CNT-3: which way the building faces on the earth.
 *
 * The plan may state its real north (`north`, degrees counter-clockwise from +Y, C7) and which
 * way its y runs (`yAxis`): `up` is C4, `down` says the coordinates are the building's mirror
 * image. From the two, a direction on the plan becomes a bearing: degrees clockwise from north,
 * as a compass reads it. A rotation alone cannot undo a mirror, which is why the y direction is
 * stated apart from north.
 *
 * Which side of a wall is outside comes from the one answer every view uses (`wallSides`,
 * MSG-13): a stretch of a wall with a room on one face only faces outside, away from that room.
 * So each outside wall's stretches, each opening in one, and each room behind them get the way
 * they face. A plan that states no north gets the same answer with north taken as the top of
 * the page it was drawn on, and says so (`northStated: false`): never a north it did not state.
 *
 * Pure: no DOM, no network.
 */
import type { FloorPlan, PlanIndex } from './plan'
import { indexPlan } from './plan'
import { floorOf } from './floors'
import { isFiniteWall } from './elevations'
import { planWallSides, stretchAt } from './exposure'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { wallAxis, wallFrameAt } from './wall'
import type { WallCurve } from './arc'
import { curveFault, curveStationsBetween, wallCurve } from './arc'

/** The eight points of the compass, clockwise from north. */
export const COMPASS_POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const
export type CompassPoint = (typeof COMPASS_POINTS)[number]

/** How the plan sits on the earth, as it states it. */
export interface PlanOrientation {
  /** The plan's north, in degrees counter-clockwise from +Y, from 0 up to 360. Null when the plan states none. */
  readonly north: number | null
  /** Which way +Y runs on the drawing, with +X to the right: `up` (C4) when the plan does not say. */
  readonly yAxis: 'up' | 'down'
  readonly yAxisStated: boolean
}

/** Degrees from 0 up to 360, with no negative zero. */
export function wrapDegrees(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360
  return wrapped === 360 ? 0 : wrapped + 0
}

export function planOrientation(plan: Pick<FloorPlan, 'north' | 'yAxis'>): PlanOrientation {
  const north = typeof plan.north === 'number' && Number.isFinite(plan.north) ? wrapDegrees(plan.north) : null
  return { north, yAxis: plan.yAxis ?? 'up', yAxisStated: plan.yAxis !== undefined }
}

const QUARTER_TURNS: readonly Vec2[] = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 }
]

/**
 * The unit direction `degrees` counter-clockwise from +Y on the plan: the way a north of that
 * many degrees points. Exact at each quarter turn, so a file never says 6e-17 for 0.
 */
export function directionOfTurn(degrees: number): Vec2 {
  const turn = wrapDegrees(degrees)
  if (turn % 90 === 0) return QUARTER_TURNS[turn / 90]!
  const radians = (turn * Math.PI) / 180
  return { x: -Math.sin(radians), y: Math.cos(radians) }
}

/** Degrees counter-clockwise from +Y to a direction on the plan. */
function turnOf(direction: Vec2): number {
  return (Math.atan2(-direction.x, direction.y) * 180) / Math.PI
}

/**
 * The bearing of a direction on the plan: degrees clockwise from north, from 0 up to 360. With y
 * up, a turn counter-clockwise on the drawing is a turn anticlockwise on the earth; with y down
 * the drawing is the mirror image, and it is the other way. `north` overrides the plan's own,
 * for the stated fallback (the top of the drawing, 0) when it states none.
 */
export function bearingOf(direction: Vec2, orientation: PlanOrientation, north: number | null = orientation.north): number | null {
  if (north === null || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return null
  if (direction.x === 0 && direction.y === 0) return null
  const turn = turnOf(direction)
  return wrapDegrees(orientation.yAxis === 'up' ? north - turn : turn - north)
}

/** The nearest of the eight points of the compass to a bearing. */
export function compassPoint(bearing: number): CompassPoint {
  return COMPASS_POINTS[Math.round(wrapDegrees(bearing) / 45) % 8]!
}

/** One stretch of a wall that faces outside, and the way it faces. */
export interface WallFacing {
  readonly wall: string
  readonly floor: string
  /** Where the stretch runs, in metres along the wall from its start. */
  readonly from: number
  readonly to: number
  /** The rooms on its inside face. */
  readonly rooms: readonly string[]
  /** The unit normal of its outside face, on the plan. */
  readonly outward: Vec2
  /** Degrees clockwise from north. */
  readonly bearing: number
  readonly faces: CompassPoint
}

/** An opening in a stretch of wall that faces outside. */
export interface OpeningFacing {
  readonly opening: string
  readonly type: FloorPlan['openings'][number]['type']
  readonly wall: string
  readonly floor: string
  /** The rooms it lets onto the outside from. */
  readonly rooms: readonly string[]
  readonly bearing: number
  readonly faces: CompassPoint
}

/** The ways one room faces: each point of the compass its outside walls face, longest first. */
export interface RoomFacing {
  readonly room: string
  readonly floor: string
  /** Each way its outside walls face, with how long they are that way, longest first. */
  readonly walls: readonly { readonly faces: CompassPoint; readonly length: number }[]
  /** The ways its windows face, in the order of `walls`. */
  readonly windows: readonly CompassPoint[]
}

/** The front, as the plan names it, and the way it faces; or why it cannot be said. */
export type FrontFacing =
  | { readonly part: 'wall' | 'opening'; readonly id: string; readonly wall: string; readonly bearing: number; readonly faces: CompassPoint }
  | { readonly part: 'wall' | 'opening'; readonly id: string; readonly wall: string | null; readonly missing: 'no-such-part' | 'not-outside' }

export interface PlanFacing {
  readonly orientation: PlanOrientation
  /**
   * Whether the bearings are from the plan's own north. False: north is taken as the top of the
   * page the plan was drawn on, +Y (C4), or -Y when its y runs down.
   */
  readonly northStated: boolean
  /** The north the bearings use, in degrees counter-clockwise from +Y: the plan's, else 0, or 180 when y runs down. */
  readonly northUsed: number
  readonly walls: readonly WallFacing[]
  readonly openings: readonly OpeningFacing[]
  /** Every room with an outside wall, in plan order. */
  readonly rooms: readonly RoomFacing[]
  /** Null when the plan names no front. */
  readonly front: FrontFacing | null
}

/** A stretch of a curved wall in its straight pieces, each with the normal at its middle. */
function stationParts(wall: FloorPlan['walls'][number], curve: WallCurve, from: number, to: number): { from: number; to: number; normal: Vec2 }[] {
  const stations = curveStationsBetween(curve, from, to)
  return stations.slice(1).map((end, i) => ({ from: stations[i]!, to: end, normal: wallFrameAt(wall, (stations[i]! + end) / 2).normal }))
}

/**
 * Which way each outside wall, each opening in one and each room behind them faces. Walls that
 * are dividing lines, broken, or without a room on either face face nowhere and are not listed.
 * A stretch shorter than `lineInside` is not counted, as the exposure does not count it.
 */
export function planFacing(plan: FloorPlan, index: PlanIndex = indexPlan(plan)): PlanFacing {
  const orientation = planOrientation(plan)
  // With no north stated, the top of the page the plan was drawn on: +Y, or -Y when y runs down.
  const northUsed = orientation.north ?? (orientation.yAxis === 'down' ? 180 : 0)
  const sides = planWallSides(index)
  const shortest = tolerance('lineInside')
  const walls: WallFacing[] = []
  const byWall = new Map<string, WallFacing[]>()
  for (const wall of plan.walls) {
    if (wall.virtual === true || !isFiniteWall(wall)) continue
    const found = sides.get(wall.id)
    if (found === undefined) continue
    const axis = (() => {
      try {
        if (curveFault(wall) !== null) return null
        return wall.arc === undefined ? wallAxis(wall) : wallCurve(wall)
      } catch {
        return null
      }
    })()
    if (axis === null) continue
    for (const stretch of found.stretches) {
      if (stretch.worked !== 'exterior' || stretch.to - stretch.from < shortest) continue
      // The room is on one face: the outside is the other. `normal` points at the left face.
      const inLeft = stretch.left.length > 0
      // A curved wall turns as it runs (CNT-18): its stretch is cut where it comes to face
      // another of the compass points, each part facing the way its middle faces.
      const parts: { from: number; to: number; normal: Vec2 }[] =
        'normal' in axis
          ? [{ from: stretch.from, to: stretch.to, normal: axis.normal }]
          : stationParts(wall, axis, stretch.from, stretch.to)
      const facings: WallFacing[] = []
      for (const part of parts) {
        const outward = inLeft ? { x: -part.normal.x + 0, y: -part.normal.y + 0 } : part.normal
        const bearing = bearingOf(outward, orientation, northUsed)
        if (bearing === null) continue
        const faces = compassPoint(bearing)
        const last = facings.at(-1)
        if (last !== undefined && last.faces === faces && Math.abs(last.to - part.from) <= tolerance('noLength')) {
          facings[facings.length - 1] = { ...last, to: part.to }
          continue
        }
        facings.push({ wall: wall.id, floor: floorOf(wall), from: part.from, to: part.to, rooms: inLeft ? stretch.left : stretch.right, outward, bearing, faces })
      }
      for (const facing of facings) {
        walls.push(facing)
        byWall.set(wall.id, [...(byWall.get(wall.id) ?? []), facing])
      }
    }
  }

  const curved = new Set(plan.walls.filter((wall) => wall.arc !== undefined).map((wall) => wall.id))
  const facingAt = (wallId: string, s: number): WallFacing | null => {
    // A curved wall's stretch is in parts: the part the place is in.
    if (curved.has(wallId)) return (byWall.get(wallId) ?? []).find((f) => f.from - tolerance('noLength') <= s && s <= f.to + tolerance('noLength')) ?? null
    const stretches = sides.get(wallId)
    const at = stretches === undefined ? null : stretchAt(stretches, s)
    if (at === null) return null
    return (byWall.get(wallId) ?? []).find((f) => f.from === at.from && f.to === at.to) ?? null
  }

  const openings: OpeningFacing[] = []
  for (const opening of plan.openings) {
    if (!Number.isFinite(opening.offset) || !Number.isFinite(opening.width)) continue
    const facing = facingAt(opening.wall, opening.offset + opening.width / 2)
    if (facing === null) continue
    openings.push({ opening: opening.id, type: opening.type, wall: opening.wall, floor: facing.floor, rooms: facing.rooms, bearing: facing.bearing, faces: facing.faces })
  }

  const rooms: RoomFacing[] = []
  for (const room of plan.rooms) {
    const lengths = new Map<CompassPoint, number>()
    for (const facing of walls) {
      if (facing.rooms.includes(room.id)) lengths.set(facing.faces, (lengths.get(facing.faces) ?? 0) + (facing.to - facing.from))
    }
    if (lengths.size === 0) continue
    const order = [...lengths].sort((a, b) => b[1] - a[1] || COMPASS_POINTS.indexOf(a[0]) - COMPASS_POINTS.indexOf(b[0]))
    const windowWays = new Set(openings.filter((o) => o.type === 'window' && o.rooms.includes(room.id)).map((o) => o.faces))
    rooms.push({
      room: room.id,
      floor: floorOf(room),
      walls: order.map(([faces, length]) => ({ faces, length })),
      windows: order.map(([faces]) => faces).filter((faces) => windowWays.has(faces))
    })
  }

  return { orientation, northStated: orientation.north !== null, northUsed, walls, openings, rooms, front: frontFacing(plan, byWall) }
}

/** The front: the longest outside stretch of the wall it names, or the stretch its opening is in. */
function frontFacing(plan: FloorPlan, byWall: ReadonlyMap<string, readonly WallFacing[]>): FrontFacing | null {
  const front = plan.front
  if (front === undefined) return null
  if (front.opening !== undefined) {
    const opening = plan.openings.find((o) => o.id === front.opening)
    if (opening === undefined) return { part: 'opening', id: front.opening, wall: null, missing: 'no-such-part' }
    const s = opening.offset + opening.width / 2
    const facing = (byWall.get(opening.wall) ?? []).find((f) => f.from <= s && s <= f.to)
    if (facing === undefined) return { part: 'opening', id: opening.id, wall: opening.wall, missing: 'not-outside' }
    return { part: 'opening', id: opening.id, wall: opening.wall, bearing: facing.bearing, faces: facing.faces }
  }
  const id = front.wall!
  if (!plan.walls.some((w) => w.id === id)) return { part: 'wall', id, wall: null, missing: 'no-such-part' }
  const longest = [...(byWall.get(id) ?? [])].sort((a, b) => b.to - b.from - (a.to - a.from))[0]
  if (longest === undefined) return { part: 'wall', id, wall: id, missing: 'not-outside' }
  return { part: 'wall', id, wall: id, bearing: longest.bearing, faces: longest.faces }
}
