/**
 * A facade from the model (LVL-8): what a person standing outside one side of the building sees,
 * looking straight at it, every floor stacked at its level.
 *
 * The sides are the drawing's (C4, C7): `north` is the side toward +Y, the top of the drawing, as
 * rooms text, the anchors and `grid describe` name them, whatever north the plan states. The
 * facade of a side is a view along the opposite way: a face is seen when it turns toward that side
 * (by at least `facadeFacing`), and is drawn as it projects onto the plane across the view, with
 * `u` running left to right as the person sees it and `z` up from the ground floor's floor level.
 *
 * What is seen comes from the core's own answers, never worked out again here:
 *
 * - **the outside of each floor** is the edge of its outline (`planEnvelope`, LVL-4): the floor its
 *   walls enclose, walls and all, so a facade's corners are the building's corners. Which side of
 *   a wall is outside is the same answer, MSG-13's and CNT-3's: the outline holds the rooms, and
 *   its edge is every wall's outside face;
 * - **the wall behind each stretch of that edge** is the solid wall whose outside face lies on it
 *   (within `facadeOnFace`): its height, from its floor's level (`floorElevations`, LVL-1), and its
 *   doors and windows, at their sills and heads. A short stretch with no wall on it (a corner, a
 *   wall end) is part of the wall beside it; a long one (a dividing line on the outline, an open
 *   side) is open, and drawn as nothing;
 * - **each floor's slab edge**, the band it stands on, under its walls; **each roof's edge** over
 *   the parts with nothing above, and **each parapet** on it (LVL-4);
 * - **the ground**, at the level the site states (`site.ground`), else the ground floor's floor
 *   level, 0, as LVL-4 reads it. Nothing below it is seen.
 *
 * Every face carries how far it stands behind the nearest (`depth`) and its plane (`tier`: 0 the
 * front, 1 the next set back, 2 anything further), for its line weight, and the faces come
 * farthest first, the order they are drawn in, so a nearer face hides what stands behind it.
 * `outline` is the facade's silhouette above the ground. Stairs stand inside the building and are
 * not seen.
 *
 * Opening patterns (C11) are expanded first (`withPatterns`). Pure, and never throws.
 */

import type { MultiPolygon, Polygon } from 'polygon-clipping'
import polygonClipping from 'polygon-clipping'
import type { FloorPlan, Opening, Wall } from './plan'
import { COMPASS_SIDES } from '../types/floorplan'
import { floorElevations, isFiniteWall } from './elevations'
import { planEnvelope } from './envelope'
import { planFloors, planForFloor } from './floors'
import { groundLevel } from './ground'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import { withPatterns } from './patterns'
import { tolerance } from './tolerances'
import { brokenOnFloor } from './validate'
import type { Vec2 } from './vec2'

/** The sides a facade is drawn for: the drawing's four (C4). */
export const FACADE_SIDES = COMPASS_SIDES
export type FacadeSide = (typeof FACADE_SIDES)[number]

/** The way each side lies from the building, on the plan. */
const SIDE_DIRECTION: Readonly<Record<FacadeSide, Vec2>> = {
  north: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: -1 },
  west: { x: -1, y: 0 }
}

/** What a face of a facade is: a wall's outside face, or the edge of a slab, a roof or a parapet. */
export type FacadeFaceKind = 'wall' | 'slab' | 'roof' | 'parapet'

/** A door, window or doorless opening in a wall face, where it is seen. */
export interface FacadeOpening {
  readonly id: string
  readonly type: Opening['type']
  readonly wall: string
  /** Across the facade, left to right as seen, in metres. */
  readonly u0: number
  readonly u1: number
  /** Its sill and its head, from the ground floor's floor level. */
  readonly bottom: number
  readonly top: number
}

/** One face of a facade: a rectangle across the view, `u0` to `u1`, from `bottom` to `top`. */
export interface FacadeFace {
  readonly kind: FacadeFaceKind
  readonly floor: string
  /** The wall it is the outside face of; null for a slab, a roof or a parapet. */
  readonly wall: string | null
  readonly u0: number
  readonly u1: number
  readonly bottom: number
  readonly top: number
  /** How far it stands behind the nearest face of the facade, in metres, at its middle. */
  readonly depth: number
  /** Its plane, front to back: 0 the front, 1 the next set back, 2 anything further. */
  readonly tier: 0 | 1 | 2
  readonly openings: readonly FacadeOpening[]
}

/** A floor of a facade, at its level. */
export interface FacadeLevel {
  readonly floor: string
  readonly name: string
  /** Its floor level, from the ground floor's (0). */
  readonly level: number
  readonly height: number
}

export interface Facade {
  readonly side: FacadeSide
  /** The way the side lies from the building, on the plan: the facade is seen looking against it. */
  readonly direction: Vec2
  /** Left to right as seen, on the plan: `u` is a point's distance along it. */
  readonly across: Vec2
  /** The way the side faces on the earth, when the plan states its north; else null. */
  readonly compass: { readonly bearing: number; readonly faces: CompassPoint } | null
  /** Farthest first: the order they are drawn in. */
  readonly faces: readonly FacadeFace[]
  /** The facade's silhouette above the ground: rings of `[u, z]` points, each closed. */
  readonly outline: readonly (readonly (readonly [number, number])[])[]
  readonly ground: { readonly level: number; readonly stated: boolean }
  /** The floors with a face on this facade, lowest first. */
  readonly levels: readonly FacadeLevel[]
  /** What the facade spans, or null when nothing faces this side. */
  readonly extent: { readonly u0: number; readonly u1: number; readonly bottom: number; readonly top: number } | null
  /** The walls and the openings it shows, by id, in plan order. */
  readonly walls: readonly string[]
  readonly openings: readonly string[]
}

type Pair = readonly [number, number]

const dot = (p: Vec2, d: Vec2): number => p.x * d.x + p.y * d.y

/** Kept to the micrometre, so the join of the walls leaves no hair on a facade's corners. */
const fine = (metres: number): number => Number(metres.toFixed(6)) + 0

/** A face before its depth is known: its two ends on the plan. */
interface Seen {
  readonly kind: FacadeFaceKind
  readonly floor: string
  readonly wall: string | null
  readonly a: Vec2
  readonly b: Vec2
  readonly bottom: number
  readonly top: number
  readonly openings: readonly FacadeOpening[]
  readonly order: number
}

/**
 * A ring of an outline with the points that only bend it by a hair taken out: the join of the
 * walls leaves a corner a little off square, with a notch a hair wide, and cuts a straight side
 * into pieces there. A point within `facadeOnFace` of the line through its neighbours is not a
 * corner, whether it lies between them or past one, at the tip of a notch with no width.
 */
function straightened(ring: readonly Pair[]): Vec2[] {
  const closed = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
  const points = (closed ? ring.slice(0, -1) : ring).map(([x, y]) => ({ x, y }))
  const near = tolerance('facadeOnFace')
  for (let changed = true; changed && points.length > 3; ) {
    changed = false
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length]!
      const here = points[i]!
      const next = points[(i + 1) % points.length]!
      const length = Math.hypot(next.x - prev.x, next.y - prev.y)
      const off = length > 0 ? Math.abs((here.x - prev.x) * (next.y - prev.y) - (here.y - prev.y) * (next.x - prev.x)) / length : Math.hypot(here.x - prev.x, here.y - prev.y)
      if (off <= near) {
        points.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return points
}

/** Each edge of an outline that turns toward the side, and shows some width across the view. */
function edgesFacing(pieces: MultiPolygon, direction: Vec2): { a: Vec2; b: Vec2; e: Vec2; length: number }[] {
  const out: { a: Vec2; b: Vec2; e: Vec2; length: number }[] = []
  const across = { x: -direction.y, y: direction.x }
  for (const polygon of pieces) {
    for (const ring of polygon) {
      const points = straightened(ring)
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!
        const b = points[(i + 1) % points.length]!
        const length = Math.hypot(b.x - a.x, b.y - a.y)
        if (!(length > tolerance('noLength'))) continue
        const e = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
        // Outer rings run counter-clockwise and holes clockwise, so the solid is on the left of
        // every edge and the outside on its right.
        const outward = { x: e.y, y: -e.x }
        if (dot(outward, direction) <= tolerance('facadeFacing')) continue
        if (Math.abs(dot(e, across)) * length <= tolerance('facadeOnFace')) continue
        out.push({ a, b, e, length })
      }
    }
  }
  return out
}

/** A wall's outside face along an edge: the stretch of the edge it covers, from the edge's start. */
interface Cover {
  readonly wall: Wall
  readonly t0: number
  readonly t1: number
}

/** The walls whose face lies on the edge, and where along it. */
function coversOf(edge: { a: Vec2; e: Vec2; length: number }, walls: readonly Wall[]): Cover[] {
  const near = tolerance('facadeOnFace')
  const outward = { x: edge.e.y, y: -edge.e.x }
  const along = (p: Vec2): number => (p.x - edge.a.x) * edge.e.x + (p.y - edge.a.y) * edge.e.y
  const off = (p: Vec2): number => Math.abs((p.x - edge.a.x) * outward.x + (p.y - edge.a.y) * outward.y)
  const covers: Cover[] = []
  for (const wall of walls) {
    const sx = wall.start[0]
    const sy = wall.start[1]
    const dx = wall.end[0] - sx
    const dy = wall.end[1] - sy
    const length = Math.hypot(dx, dy)
    const normal = { x: -dy / length, y: dx / length }
    // The face that looks out the way the edge does.
    const sign = dot(normal, outward) >= 0 ? 1 : -1
    const half = (wall.thickness / 2) * sign
    const p = { x: sx + normal.x * half, y: sy + normal.y * half }
    const q = { x: wall.end[0] + normal.x * half, y: wall.end[1] + normal.y * half }
    if (off(p) > near || off(q) > near) continue
    const t0 = Math.max(0, Math.min(along(p), along(q)))
    const t1 = Math.min(edge.length, Math.max(along(p), along(q)))
    if (t1 - t0 > tolerance('noLength')) covers.push({ wall, t0, t1 })
  }
  return covers
}

/**
 * The edge cut into stretches, each with the wall it shows: the tallest wall over it, or, for a
 * stretch no wall covers that is no longer than a wall is thick (a corner, a wall end), the wall
 * beside it. A longer stretch with no wall is open and left out.
 */
function stretchesOf(edge: { length: number }, covers: readonly Cover[], thickest: number): { wall: Wall; t0: number; t1: number }[] {
  const points = [...new Set([0, edge.length, ...covers.flatMap((c) => [c.t0, c.t1])])].sort((x, y) => x - y)
  const pieces: { wall: Wall | null; t0: number; t1: number }[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const t0 = points[i]!
    const t1 = points[i + 1]!
    if (!(t1 - t0 > tolerance('noLength'))) continue
    const mid = (t0 + t1) / 2
    const over = covers.filter((c) => c.t0 <= mid && mid <= c.t1).sort((x, y) => y.wall.height - x.wall.height)
    pieces.push({ wall: over[0]?.wall ?? null, t0, t1 })
  }
  const reach = thickest + tolerance('gap')
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!
    if (piece.wall !== null || piece.t1 - piece.t0 > reach) continue
    const before = pieces[i - 1]?.wall ?? null
    const after = pieces[i + 1]?.wall ?? null
    const taller = before !== null && after !== null ? (before.height >= after.height ? before : after) : (before ?? after)
    pieces[i] = { ...piece, wall: taller }
  }
  const out: { wall: Wall; t0: number; t1: number }[] = []
  for (const piece of pieces) {
    if (piece.wall === null) continue
    const last = out[out.length - 1]
    if (last !== undefined && last.wall === piece.wall && Math.abs(last.t1 - piece.t0) <= tolerance('noLength')) out[out.length - 1] = { ...last, t1: piece.t1 }
    else out.push({ wall: piece.wall, t0: piece.t0, t1: piece.t1 })
  }
  return out
}

/** The openings of a wall seen in a stretch of its face: the ones whose middle lies in it. */
function openingsIn(
  wall: Wall,
  openings: readonly Opening[],
  edge: { a: Vec2; e: Vec2 },
  stretch: { t0: number; t1: number },
  across: Vec2,
  floorLevel: number
): FacadeOpening[] {
  const sx = wall.start[0]
  const sy = wall.start[1]
  const dx = wall.end[0] - sx
  const dy = wall.end[1] - sy
  const length = Math.hypot(dx, dy)
  const at = (s: number): Vec2 => ({ x: sx + (dx / length) * s, y: sy + (dy / length) * s })
  const along = (p: Vec2): number => (p.x - edge.a.x) * edge.e.x + (p.y - edge.a.y) * edge.e.y
  const point = (t: number): Vec2 => ({ x: edge.a.x + edge.e.x * t, y: edge.a.y + edge.e.y * t })
  const out: FacadeOpening[] = []
  for (const opening of openings) {
    if (!Number.isFinite(opening.offset) || !Number.isFinite(opening.width)) continue
    const middle = along(at(opening.offset + opening.width / 2))
    if (middle < stretch.t0 - tolerance('noLength') || middle > stretch.t1 + tolerance('noLength')) continue
    const ends = [along(at(opening.offset)), along(at(opening.offset + opening.width))].map((t) => dot(point(t), across))
    out.push({
      id: opening.id,
      type: opening.type,
      wall: wall.id,
      u0: fine(Math.min(...ends)),
      u1: fine(Math.max(...ends)),
      bottom: fine(floorLevel + opening.sill),
      top: fine(floorLevel + opening.sill + opening.height)
    })
  }
  return out
}

/** The silhouette of the faces above the ground: their union. Empty when it cannot be worked out. */
function silhouette(faces: readonly FacadeFace[], ground: number): (readonly (readonly [number, number])[])[] {
  const rects: Polygon[] = faces
    .filter((f) => f.top > ground && f.u1 > f.u0)
    .map((f) => {
      const bottom = Math.max(f.bottom, ground)
      return [[[f.u0, bottom], [f.u1, bottom], [f.u1, f.top], [f.u0, f.top], [f.u0, bottom]]]
    })
  if (rects.length === 0) return []
  try {
    return polygonClipping.union(rects[0]!, ...rects.slice(1)).flatMap((polygon) => polygon.map((ring) => ring.map(([u, z]) => [u, z] as const)))
  } catch {
    return []
  }
}

/** The plane of each depth, front to back, faces within `facadeSameDepth` of each other sharing one. */
function tiersOf(depths: readonly number[]): Map<number, 0 | 1 | 2> {
  const sorted = [...new Set(depths)].sort((x, y) => x - y)
  const tiers = new Map<number, 0 | 1 | 2>()
  let rank = 0
  let start: number | null = null
  for (const depth of sorted) {
    if (start !== null && depth - start > tolerance('facadeSameDepth')) {
      rank++
      start = depth
    }
    start ??= depth
    tiers.set(depth, Math.min(rank, 2) as 0 | 1 | 2)
  }
  return tiers
}

const KIND_ORDER: Readonly<Record<FacadeFaceKind, number>> = { slab: 0, wall: 1, roof: 2, parapet: 3 }

/** The facade of one side of the building. See the module's header. */
export function planFacade(stated: FloorPlan, side: FacadeSide): Facade {
  const plan = withPatterns(stated)
  const direction = SIDE_DIRECTION[side]
  // Looking against the side's way, the right hand points this way.
  const across = { x: -direction.y + 0, y: direction.x + 0 }
  const orientation = planOrientation(plan)
  const bearing = orientation.north === null ? null : bearingOf(direction, orientation)
  const compass = bearing === null ? null : { bearing, faces: compassPoint(bearing) }
  const elevations = floorElevations(plan)
  const ground = (() => {
    try {
      const found = groundLevel(plan, elevations)
      return { level: found.level, stated: found.stated }
    } catch {
      return { level: 0, stated: false }
    }
  })()
  const empty: Facade = { side, direction, across, compass, faces: [], outline: [], ground, levels: [], extent: null, walls: [], openings: [] }

  let floors: ReturnType<typeof planFloors>
  try {
    floors = planFloors(plan)
  } catch {
    return empty
  }
  const envelope = planEnvelope(plan, { elevations })
  const seen: Seen[] = []
  const add = (face: Omit<Seen, 'order'>): void => {
    seen.push({ ...face, order: seen.length })
  }

  for (const floor of floors) {
    const env = envelope.floors.find((f) => f.floor === floor.id)
    const storey = elevations.floors.get(floor.id)
    if (env === undefined || env.outline === null || env.outline.length === 0 || storey === undefined) continue
    const slice = planForFloor(plan, floor.id)
    const broken = brokenOnFloor(slice)
    const walls = slice.walls.filter((w) => w.virtual !== true && !broken.has(w.id) && isFiniteWall(w) && w.thickness > 0 && (w.start[0] !== w.end[0] || w.start[1] !== w.end[1]))
    const thickest = Math.max(0, ...walls.map((w) => w.thickness))
    const openingsOf = new Map<string, Opening[]>()
    for (const opening of slice.openings) {
      if (broken.has(opening.id)) continue
      openingsOf.set(opening.wall, [...(openingsOf.get(opening.wall) ?? []), opening])
    }
    const edges = edgesFacing(env.outline, direction)
    for (const edge of edges) {
      for (const stretch of stretchesOf(edge, coversOf(edge, walls), thickest)) {
        const a = { x: edge.a.x + edge.e.x * stretch.t0, y: edge.a.y + edge.e.y * stretch.t0 }
        const b = { x: edge.a.x + edge.e.x * stretch.t1, y: edge.a.y + edge.e.y * stretch.t1 }
        add({
          kind: 'wall',
          floor: floor.id,
          wall: stretch.wall.id,
          a,
          b,
          bottom: storey.floorLevel,
          top: storey.floorLevel + stretch.wall.height,
          openings: openingsIn(stretch.wall, openingsOf.get(stretch.wall.id) ?? [], edge, stretch, across, storey.floorLevel)
        })
      }
    }
    if (env.slab !== null) {
      for (const edge of edges) add({ kind: 'slab', floor: floor.id, wall: null, a: edge.a, b: edge.b, bottom: env.slab.top - env.slab.thickness, top: env.slab.top, openings: [] })
    }
    if (env.roof !== null) {
      const roofTop = env.roof.bottom + env.roof.thickness
      for (const edge of edgesFacing(env.roof.pieces, direction)) add({ kind: 'roof', floor: floor.id, wall: null, a: edge.a, b: edge.b, bottom: env.roof.bottom, top: roofTop, openings: [] })
      if (env.roof.parapet !== null) {
        const { height, pieces } = env.roof.parapet
        for (const edge of edgesFacing(pieces, direction)) add({ kind: 'parapet', floor: floor.id, wall: null, a: edge.a, b: edge.b, bottom: roofTop, top: roofTop + height, openings: [] })
      }
    }
  }
  if (seen.length === 0) return empty

  // The nearest point of the facade stands furthest the side's way.
  const front = Math.max(...seen.flatMap((s) => [dot(s.a, direction), dot(s.b, direction)]))
  const depthOf = (s: Seen): number => front - (dot(s.a, direction) + dot(s.b, direction)) / 2
  const tiers = tiersOf(seen.map(depthOf))
  const faces: FacadeFace[] = seen
    .map((s) => {
      const ua = dot(s.a, across)
      const ub = dot(s.b, across)
      const depth = depthOf(s)
      return { s, face: { kind: s.kind, floor: s.floor, wall: s.wall, u0: fine(Math.min(ua, ub)), u1: fine(Math.max(ua, ub)), bottom: fine(s.bottom), top: fine(s.top), depth: fine(depth), tier: tiers.get(depth)!, openings: s.openings } }
    })
    .sort((x, y) => y.face.depth - x.face.depth || KIND_ORDER[x.face.kind] - KIND_ORDER[y.face.kind] || x.s.order - y.s.order)
    .map(({ face }) => face)

  const levels: FacadeLevel[] = floors
    .filter((f) => faces.some((face) => face.floor === f.id))
    .map((f) => {
      const storey = elevations.floors.get(f.id)!
      return { floor: f.id, name: f.name || f.id, level: storey.floorLevel, height: storey.clearHeight }
    })
    .sort((x, y) => x.level - y.level)
  const wallIds = new Set(faces.flatMap((f) => (f.wall === null ? [] : [f.wall])))
  const openingIds = new Set(faces.flatMap((f) => f.openings.map((o) => o.id)))
  return {
    side,
    direction,
    across,
    compass,
    faces,
    outline: silhouette(faces, ground.level),
    ground,
    levels,
    extent: {
      u0: Math.min(...faces.map((f) => f.u0)),
      u1: Math.max(...faces.map((f) => f.u1)),
      bottom: Math.min(ground.level, ...faces.map((f) => f.bottom)),
      top: Math.max(...faces.map((f) => f.top))
    },
    walls: plan.walls.filter((w) => wallIds.has(w.id)).map((w) => w.id).filter((id, i, all) => all.indexOf(id) === i),
    openings: plan.openings.filter((o) => openingIds.has(o.id)).map((o) => o.id)
  }
}
