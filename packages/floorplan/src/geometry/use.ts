/**
 * Use indicators (CNT-13): what the plan's fixtures leave of a room for using it. Is the way
 * through wide enough for a body or a trolley, is there a turning circle, how much floor is in
 * front of and beside a fixture, how much of a doorway a fixture and an open leaf leave clear,
 * and whether a fixture stands in front of a window.
 *
 * Each is a measure, never a rule: it says what it measured and how, and the caller sets it
 * against a width the person gives or one of Grid's own indicator figures (`useDoorwayClear`,
 * `usePassageWidth`, `useTurningCircle`, `useClearSpace` in `tolerances.ts`), and says which.
 * Nothing here cites a document.
 *
 * Pure: shapes in, figures out. A fixture is its footprint (`itemFootprint`); a room is the
 * outline and holes its shape gives.
 */

import { floorOf } from './floors'
import type { Holes } from './innerPoint'
import { pointInPolygon, poleOfInaccessibility } from './innerPoint'
import { isItemKind, itemFootprint, itemName, itemNoun, type Item } from './items'
import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { quoted } from '../types/planText'
import { metresText } from './rounding'
import { limit, tolerance } from './tolerances'
import type { Issue } from './validate'
import type { Vec2 } from './vec2'
import { add, cross, dot, length, lerp, scale, signedArea, sub, vec } from './vec2'
import { openingChord, wallLength, wallPointAt, wallSegments } from './wall'
import { curveFault } from './arc'

/** The indicators, by code, each with what it measures in Grid's words and the figure it is set against when the person gives none. */
export const USE_INDICATORS = {
  'use/doorway-clear-width': {
    name: 'clear width of a doorway',
    measures: 'the widest stretch of the hole in the wall that no fixture stands in front of, less what an open leaf and its stop take for a door',
    figure: 'useDoorwayClear'
  },
  'use/passage-width': {
    name: 'way through a room',
    measures: 'the widest body or trolley that gets from one doorway of the room to another, or to its widest point, keeping clear of its walls and fixtures',
    figure: 'usePassageWidth'
  },
  'use/turning-space': {
    name: 'turning space',
    measures: 'the widest circle the room\'s free floor holds, clear of its walls and fixtures',
    figure: 'useTurningCircle'
  },
  'use/space-by-fixture': {
    name: 'space in front of and beside a fixture',
    measures: 'the clear floor straight out from the front and from each side of a fixture to the nearest wall face, doorway or other fixture, the least along that face',
    figure: 'useClearSpace'
  },
  'use/window-blocked': {
    name: 'window blocked',
    measures: 'how much of a window\'s width a fixture higher than its sill stands in front of, within the approach depth',
    figure: 'useApproachDepth'
  }
} as const

export type UseCode = keyof typeof USE_INDICATORS

/** Said with every indicator: what it is, and what it is not. */
export const INDICATOR_NOTE =
  'An indicator, measured on the plan: it says what was measured and the width it was set against. Grid\'s own figures are indicators, not a rule from any code or standard.'

export type Segment = readonly [Vec2, Vec2]

/** Something standing on the floor that a body keeps clear of: a fixture's footprint, by its id. */
export interface Obstacle {
  readonly id: string
  readonly outline: readonly Vec2[]
}

/** The fixtures of a plan held as obstacles on one floor: the kinds it holds, each by its footprint. */
export function fixtureObstacles(items: readonly Item[], floor: string): Obstacle[] {
  return items.filter((item) => isItemKind(item.kind) && floorOf(item) === floor).map((item) => ({ id: item.id, outline: itemFootprint(item) }))
}

// ── Small shapes ─────────────────────────────────────────────────────────────────────────────

function distanceToSegment(p: Vec2, [a, b]: Segment): number {
  const ab = sub(b, a)
  const span = dot(ab, ab)
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
  return length(sub(p, add(a, scale(ab, t))))
}

/** Where a ray from `origin` along unit `dir` first meets a segment, as a distance, or null. */
function rayHits(origin: Vec2, dir: Vec2, [a, b]: Segment): number | null {
  const s = sub(b, a)
  const denominator = cross(dir, s)
  if (Math.abs(denominator) < tolerance('parallel')) return null
  const w = sub(a, origin)
  const t = cross(w, s) / denominator
  const u = cross(w, dir) / denominator
  if (t < -tolerance('noLength') || u < -tolerance('relativeNoise') || u > 1 + tolerance('relativeNoise')) return null
  return Math.max(0, t)
}

/** The part of a convex polygon inside another convex polygon (Sutherland–Hodgman), or `[]`. */
function convexOverlap(subject: readonly Vec2[], clip: readonly Vec2[]): Vec2[] {
  const inward = Math.sign(signedArea(clip))
  let out = [...subject]
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const p = clip[i]!
    const edge = sub(clip[(i + 1) % clip.length]!, p)
    if (dot(edge, edge) === 0) continue
    const side = (x: Vec2): number => inward * cross(edge, sub(x, p))
    const next: Vec2[] = []
    for (let j = 0; j < out.length; j++) {
      const a = out[j]!
      const b = out[(j + 1) % out.length]!
      const sa = side(a)
      const sb = side(b)
      if (sa >= 0) next.push(a)
      if (sa >= 0 !== sb >= 0) next.push(lerp(a, b, sa / (sa - sb)))
    }
    out = next
  }
  return out
}

const edgesOf = (ring: readonly Vec2[]): Segment[] => ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as const)

// ── A hole in a wall ─────────────────────────────────────────────────────────────────────────

interface WallFrame {
  /** Where a distance along the wall's axis lands on the line the frame measures along. */
  readonly at: (s: number) => Vec2
  /** The distance along the wall's axis a point on that line stands for. */
  readonly along: (p: Vec2) => number
  readonly dir: Vec2
  /** 90° counter-clockwise from `dir`. */
  readonly normal: Vec2
  readonly half: number
}

/**
 * The line a hole is measured along. On a straight wall it is the wall's axis; on a curved wall
 * (CNT-18) it is the opening's own chord, its hole being straight between its edges (C15), with
 * its edges where the opening's offset and far edge are along the curve.
 */
function frameOf(wall: Wall, opening?: Opening): WallFrame | null {
  const half = wall.virtual === true ? 0 : wall.thickness / 2
  if (wall.arc !== undefined) {
    if (curveFault(wall) !== null) return null
    const from = opening?.offset ?? 0
    const to = opening === undefined ? wallLength(wall) : opening.offset + opening.width
    const chord = openingChord(wall, from, to)
    if (chord.length < tolerance('noLength')) return null
    const k = chord.length / (to - from)
    return {
      at: (s) => add(chord.start, scale(chord.dir, (s - from) * k)),
      along: (p) => from + dot(sub(p, chord.start), chord.dir) / k,
      dir: chord.dir,
      normal: chord.normal,
      half
    }
  }
  const start = vec(wall.start[0], wall.start[1])
  const delta = sub(vec(wall.end[0], wall.end[1]), start)
  const len = length(delta)
  if (len < tolerance('noLength')) return null
  const dir = scale(delta, 1 / len)
  return { at: (s) => add(start, scale(dir, s)), along: (p) => dot(sub(p, start), dir), dir, normal: vec(-dir.y, dir.x), half }
}

/** The hole's edge on one face of the wall: `side` 1 is the face the normal points at, -1 the other. */
function holeFace(frame: WallFrame, opening: Opening, side: 1 | -1): Segment {
  const across = scale(frame.normal, side * frame.half)
  return [add(frame.at(opening.offset), across), add(frame.at(opening.offset + opening.width), across)]
}

/** The floor in front of one face of a hole, `depth` deep, as a counter-clockwise box. */
function approachZone(frame: WallFrame, face: Segment, side: 1 | -1, depth: number): Vec2[] {
  const out = scale(frame.normal, side * depth)
  const box = [face[0], face[1], add(face[1], out), add(face[0], out)]
  return signedArea(box) < 0 ? box.reverse() : box
}

/** The stretches of the hole, as offsets along the wall, that the fixtures cover within the approach depth on either face. */
function coveredSpans(frame: WallFrame, opening: Opening, fixtures: readonly Obstacle[]): { id: string; from: number; to: number }[] {
  const depth = limit('useApproachDepth')
  const spans: { id: string; from: number; to: number }[] = []
  for (const side of [1, -1] as const) {
    const zone = approachZone(frame, holeFace(frame, opening, side), side, depth)
    for (const fixture of fixtures) {
      const part = convexOverlap(fixture.outline, zone)
      if (part.length < 3 || Math.abs(signedArea(part)) < tolerance('noArea')) continue
      const along = part.map((p) => frame.along(p))
      const from = Math.max(opening.offset, Math.min(...along))
      const to = Math.min(opening.offset + opening.width, Math.max(...along))
      if (to - from > tolerance('noLength')) spans.push({ id: fixture.id, from, to })
    }
  }
  return spans
}

/** The longest stretch of [from, to] that none of the spans covers. */
function longestFree(from: number, to: number, spans: readonly { from: number; to: number }[]): number {
  const sorted = [...spans].sort((a, b) => a.from - b.from)
  let best = 0
  let at = from
  for (const span of sorted) {
    if (span.from > at) best = Math.max(best, span.from - at)
    at = Math.max(at, span.to)
  }
  return Math.max(best, to - at)
}

export interface DoorwayClearance {
  readonly opening: string
  /** The hole in the wall, as the plan states its width. */
  readonly hole: number
  /** What an open leaf and its stop take (`useOpenLeaf`); 0 for a doorless opening. */
  readonly leaf: number
  /** How much of the hole fixtures stand in front of, within `useApproachDepth` on either face, joined where they overlap. */
  readonly covered: number
  /** The widest stretch of the hole no fixture stands in front of. */
  readonly run: number
  /** What is left: the run less the leaf, never below 0. */
  readonly clear: number
  /** The fixtures standing in front of the hole, by id, in plan order. */
  readonly narrowedBy: readonly string[]
}

/** The clear width a door or doorless opening leaves (`use/doorway-clear-width`). */
export function doorwayClearance(wall: Wall, opening: Opening, fixtures: readonly Obstacle[]): DoorwayClearance {
  const frame = frameOf(wall, opening)
  const spans = frame === null ? [] : coveredSpans(frame, opening, fixtures)
  const run = longestFree(opening.offset, opening.offset + opening.width, spans)
  const leaf = opening.type === 'door' ? limit('useOpenLeaf') : 0
  const by = new Set(spans.map((s) => s.id))
  const covered = spans.length === 0 ? 0 : Math.max(0, opening.width - longestFreeTotal(opening.offset, opening.offset + opening.width, spans))
  return { opening: opening.id, hole: opening.width, leaf, covered, run, clear: Math.max(0, run - leaf), narrowedBy: fixtures.filter((f) => by.has(f.id)).map((f) => f.id) }
}

export interface WindowCover {
  readonly window: string
  readonly width: number
  readonly sill: number
  /** How much of the window's width fixtures higher than its sill stand in front of, joined where they overlap. */
  readonly covered: number
  /** Each such fixture, with its height and the stretch of the window it covers. */
  readonly by: readonly { readonly id: string; readonly height: number; readonly covers: number }[]
}

/**
 * How much of a window fixtures block (`use/window-blocked`): those standing within
 * `useApproachDepth` of its hole on either face that are higher than its sill.
 */
export function windowCover(wall: Wall, opening: Opening, fixtures: readonly (Obstacle & { readonly height: number })[]): WindowCover {
  const frame = frameOf(wall, opening)
  const higher = fixtures.filter((f) => f.height > opening.sill + tolerance('itemAboveRoom'))
  const spans = frame === null ? [] : coveredSpans(frame, opening, higher)
  const by = higher.flatMap((f) => {
    const own = spans.filter((s) => s.id === f.id)
    if (own.length === 0) return []
    const covers = opening.width - longestFreeTotal(opening.offset, opening.offset + opening.width, own)
    return [{ id: f.id, height: f.height, covers }]
  })
  const covered = spans.length === 0 ? 0 : Math.max(0, opening.width - longestFreeTotal(opening.offset, opening.offset + opening.width, spans))
  return { window: opening.id, width: opening.width, sill: opening.sill, covered, by }
}

/** The total length of [from, to] that none of the spans covers. */
function longestFreeTotal(from: number, to: number, spans: readonly { from: number; to: number }[]): number {
  const sorted = [...spans].sort((a, b) => a.from - b.from)
  let free = 0
  let at = from
  for (const span of sorted) {
    if (span.from > at) free += span.from - at
    at = Math.max(at, span.to)
  }
  return free + Math.max(0, to - at)
}

/**
 * Where a hole meets a room: the hole's edge on the face of its wall the room is on, or null
 * when the room is on neither face.
 */
export function openingMouth(wall: Wall, opening: Opening, polygon: readonly Vec2[], holes: Holes = []): Segment | null {
  const frame = frameOf(wall, opening)
  if (frame === null) return null
  const step = tolerance('useRaster')
  for (const side of [1, -1] as const) {
    const face = holeFace(frame, opening, side)
    const inward = add(lerp(face[0], face[1], 0.5), scale(frame.normal, side * step))
    if (pointInPolygon(inward, polygon, holes)) return face
  }
  return null
}

/** Where a dividing line meets a room: the stretch of its outline that lies on the line, or null. */
export function lineMouth(wall: Wall, polygon: readonly Vec2[]): Segment | null {
  if (wall.arc !== undefined && curveFault(wall) !== null) return null
  if (wall.arc === undefined && frameOf(wall) === null) return null
  const near = tolerance('wallContact')
  const along: number[] = []
  // A curved line is looked along piece by piece (CNT-18); its mouth is the chord between the
  // ends of the stretch the room's outline runs along.
  for (const piece of wallSegments(wall)) {
    const k = piece.length === 0 ? 1 : (piece.to - piece.from) / piece.length
    for (const [a, b] of edgesOf(polygon)) {
      const off = (p: Vec2): number => Math.abs(dot(sub(p, piece.start), piece.normal))
      if (off(a) > near || off(b) > near || length(sub(b, a)) < tolerance('noLength')) continue
      const sa = dot(sub(a, piece.start), piece.dir)
      const sb = dot(sub(b, piece.start), piece.dir)
      // A piece's line runs on past it, where the curve does not.
      if (wall.arc !== undefined && (Math.max(sa, sb) < -near || Math.min(sa, sb) > piece.length + near)) continue
      along.push(piece.from + sa * k, piece.from + sb * k)
    }
  }
  if (along.length === 0) return null
  const from = Math.min(...along)
  const to = Math.max(...along)
  return [wallPointAt(wall, from), wallPointAt(wall, to)]
}

// ── A turning circle ─────────────────────────────────────────────────────────────────────────

/** The widest circle a room's free floor holds (`use/turning-space`): its diameter and middle. */
export function turningSpace(polygon: readonly Vec2[], holes: Holes, fixtures: readonly Obstacle[]): { readonly diameter: number; readonly at: Vec2 } {
  const pole = poleOfInaccessibility(polygon, undefined, [...holes, ...fixtures.map((f) => f.outline)])
  return { diameter: 2 * pole.distance, at: pole.point }
}

// ── The floor round a fixture ────────────────────────────────────────────────────────────────

export interface FixtureSpace {
  readonly fixture: string
  /** The clear floor straight out from its front, and from its left and right as seen from its front, in metres; null when nothing bounds it there. */
  readonly front: number | null
  readonly left: number | null
  readonly right: number | null
}

/**
 * The clear floor in front of and beside a fixture (`use/space-by-fixture`): from each face, the
 * least distance straight out to the room's outline (a wall face, or the line across a
 * doorway), a hole or another fixture, tried at points along the face `useRaster` apart.
 */
export function fixtureSpace(item: Item, polygon: readonly Vec2[], holes: Holes, others: readonly Obstacle[]): FixtureSpace {
  const [backLeft, backRight, frontRight, frontLeft] = itemFootprint(item)
  const walls: Segment[] = [...edgesOf(polygon), ...holes.flatMap(edgesOf), ...others.filter((o) => o.id !== item.id).flatMap((o) => edgesOf(o.outline))]
  const unit = (v: Vec2): Vec2 => scale(v, 1 / length(v))
  const clear = (a: Vec2, b: Vec2, out: Vec2): number | null => {
    const pieces = Math.max(1, Math.min(200, Math.ceil(length(sub(b, a)) / tolerance('useRaster'))))
    let least = Infinity
    for (let i = 0; i < pieces; i++) {
      const origin = lerp(a, b, (i + 0.5) / pieces)
      for (const wall of walls) {
        const t = rayHits(origin, out, wall)
        if (t !== null && t < least) least = t
      }
    }
    return least === Infinity ? null : least
  }
  const front = unit(sub(frontLeft!, backLeft!))
  const across = unit(sub(backRight!, backLeft!))
  return {
    fixture: item.id,
    front: clear(frontLeft!, frontRight!, front),
    left: clear(backLeft!, frontLeft!, scale(across, -1)),
    right: clear(backRight!, frontRight!, across)
  }
}

// ── The way through a room ───────────────────────────────────────────────────────────────────

export interface Passage {
  /** The widest body that gets from one mouth to the other, in metres. */
  readonly width: number
  /** Where it is narrowest. */
  readonly at: Vec2
  /** What stands either side of the narrowest point: the fixtures, by id, and whether a wall does. */
  readonly beside: { readonly fixtures: readonly string[]; readonly wall: boolean }
  /** True when the narrowest point is a doorway itself: nothing inside the room is narrower. */
  readonly atDoorway: boolean
  /** The step of the grid it was measured on, in metres. */
  readonly step: number
}

/**
 * The widest body or trolley that gets through a room from one mouth to another
 * (`use/passage-width`), keeping clear of its walls, its holes and the fixtures: the floor is
 * tried on a grid of points `useRaster` apart (coarser for a room that would take more than
 * `useRasterCells` points), and the way is the one whose narrowest point is widest. A mouth is a
 * doorway's edge on the room's face (`openingMouth`), a dividing line's stretch (`lineMouth`), a
 * point, such as the room's widest point (`pointMouth`), or null for anywhere in the room, where a
 * way starts or ends for a person already in it. The room's outline is open along the two mouths.
 * Null when the mouths are not joined by free floor at all.
 */
export function passageWidth(polygon: readonly Vec2[], holes: Holes, fixtures: readonly Obstacle[], from: Segment | null, to: Segment | null): Passage | null {
  if (polygon.length < 3) return null
  const contact = tolerance('wallContact')
  const mouths = [from, to].filter((mouth): mouth is Segment => mouth !== null && length(sub(mouth[1], mouth[0])) > tolerance('noLength'))

  // What a body keeps clear of: the outline less the mouths, the holes, the fixtures.
  const obstacles: { readonly segment: Segment; readonly owner: string | null }[] = []
  for (const [a, b] of edgesOf(polygon)) {
    const len = length(sub(b, a))
    if (len < tolerance('noLength')) continue
    const dir = scale(sub(b, a), 1 / len)
    const normal = vec(-dir.y, dir.x)
    const cuts: [number, number][] = []
    for (const [p, q] of mouths) {
      if (Math.abs(dot(sub(p, a), normal)) > contact || Math.abs(dot(sub(q, a), normal)) > contact) continue
      const s = dot(sub(p, a), dir)
      const t = dot(sub(q, a), dir)
      cuts.push([Math.max(0, Math.min(s, t)), Math.min(len, Math.max(s, t))])
    }
    let at = 0
    for (const [s, t] of cuts.filter(([s, t]) => t > s).sort((x, y) => x[0] - y[0])) {
      if (s > at) obstacles.push({ segment: [add(a, scale(dir, at)), add(a, scale(dir, s))], owner: null })
      at = Math.max(at, t)
    }
    if (len > at) obstacles.push({ segment: [add(a, scale(dir, at)), b], owner: null })
  }
  for (const hole of holes) for (const segment of edgesOf(hole)) obstacles.push({ segment, owner: null })
  for (const fixture of fixtures) for (const segment of edgesOf(fixture.outline)) obstacles.push({ segment, owner: fixture.id })

  // The grid.
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of polygon) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const step = Math.max(tolerance('useRaster'), Math.sqrt(((x1 - x0) * (y1 - y0)) / limit('useRasterCells')))
  const columns = Math.max(1, Math.ceil((x1 - x0) / step))
  const rows = Math.max(1, Math.ceil((y1 - y0) / step))
  const cells = columns * rows
  const clearance = new Float64Array(cells).fill(-1)
  const centre = (i: number): Vec2 => vec(x0 + ((i % columns) + 0.5) * step, y0 + (Math.floor(i / columns) + 0.5) * step)
  const free: number[] = []
  for (let i = 0; i < cells; i++) {
    const p = centre(i)
    if (!pointInPolygon(p, polygon, holes)) continue
    if (fixtures.some((f) => pointInPolygon(p, f.outline))) continue
    let least = Infinity
    for (const o of obstacles) least = Math.min(least, distanceToSegment(p, o.segment))
    clearance[i] = least
    free.push(i)
  }

  // Where a body starts and ends: the free points beside each mouth.
  const reach = step * 1.5
  const beside = (mouth: Segment | null): Set<number> => new Set(mouth === null ? free : free.filter((i) => distanceToSegment(centre(i), mouth) <= reach))
  const starts = beside(from)
  const ends = beside(to)
  if (starts.size === 0 || ends.size === 0) return null

  // The widest way: add the points widest first, joining neighbours, until a start meets an end.
  const parent = new Int32Array(cells + 2).map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }
  const join = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  const START = cells
  const END = cells + 1
  const added = new Uint8Array(cells)
  const order = [...free].sort((a, b) => clearance[b]! - clearance[a]!)
  for (const i of order) {
    added[i] = 1
    const cx = i % columns
    const cy = Math.floor(i / columns)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue
        const j = ny * columns + nx
        if (added[j]) join(i, j)
      }
    }
    if (starts.has(i)) join(i, START)
    if (ends.has(i)) join(i, END)
    if (find(START) !== find(END)) continue

    const at = centre(i)
    const half = clearance[i]!
    const near = obstacles.filter((o) => distanceToSegment(at, o.segment) <= half + step)
    const fixtureIds = fixtures.filter((f) => near.some((o) => o.owner === f.id)).map((f) => f.id)
    const width = 2 * half
    const narrowMouth = Math.min(...mouths.map(([a, b]) => length(sub(b, a))), Infinity)
    const atDoorway = fixtureIds.length === 0 && mouths.some((m) => distanceToSegment(at, m) <= 2 * step) && width >= narrowMouth - 2 * step
    return { width, at, beside: { fixtures: fixtureIds, wall: near.some((o) => o.owner === null) }, atDoorway, step }
  }
  return null
}

/** A point as a mouth: where a way starts or ends inside a room. */
export function pointMouth(p: Vec2): Segment {
  return [p, p]
}

/** The fixtures of a list by id, named in a sentence (`itemName`), in the list's order. */
export function fixtureNames(items: readonly Item[], ids: readonly string[]): string[] {
  const wanted = new Set(ids)
  return items.filter((item) => wanted.has(item.id)).map(itemName)
}

// ── What is worth a look ─────────────────────────────────────────────────────────────────────

/** A line about a fixture that names the opening it stands in front of (`hits`, as a door sweep names what it hits). */
export interface ItemUseIssue extends Issue {
  readonly hits: readonly string[]
}

const m = (value: number): string => `${metresText(value)} m`

/**
 * The drawing's use checks on the fixtures (CNT-13), both worth a look: a fixture standing in
 * front of a doorway, within `useApproachDepth` of its hole (`item/blocks-doorway`), and one
 * higher than a window's sill standing in front of it (`item/blocks-window`). Each says what it
 * measured and with what depth, as an indicator. Fixtures and openings already left out are
 * skipped; the lines come in the order of the fixtures, then of the openings.
 */
export function itemUseIssues(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>): ItemUseIssue[] {
  const items = (plan.items ?? []).filter((item) => !broken.has(item.id) && isItemKind(item.kind))
  if (items.length === 0) return []
  const depth = limit('useApproachDepth')
  const found: { item: number; opening: number; issue: ItemUseIssue }[] = []
  const say = (item: Item, opening: Opening, code: string, message: string): void => {
    found.push({
      item: items.indexOf(item),
      opening: plan.openings.indexOf(opening),
      issue: { entity: 'item', id: item.id, code, message, severity: 'warning', hits: [opening.id] }
    })
  }
  for (const opening of plan.openings) {
    if (broken.has(opening.id)) continue
    const wall = index.wallsById.get(opening.wall)
    if (wall === undefined || broken.has(wall.id) || wall.virtual === true) continue
    const floor = floorOf(wall)
    const here = items.filter((item) => floorOf(item) === floor)
    if (here.length === 0) continue
    const obstacles = here.map((item) => ({ id: item.id, outline: itemFootprint(item), height: item.height }))
    if (opening.type === 'window') {
      for (const by of windowCover(wall, opening, obstacles).by) {
        const item = here.find((i) => i.id === by.id)!
        say(
          item,
          opening,
          'item/blocks-window',
          `${itemNoun(item)}, ${m(item.height)} high, stands in front of window ${quoted(opening.id)}, whose sill is at ${m(opening.sill)}: it covers ${m(by.covers)} of the window's ${m(opening.width)}. Measured within Grid's own approach depth of ${m(depth)}: an indicator, not a rule.`
        )
      }
      continue
    }
    const all = doorwayClearance(wall, opening, obstacles)
    for (const id of all.narrowedBy) {
      const item = here.find((i) => i.id === id)!
      const alone = doorwayClearance(wall, opening, obstacles.filter((o) => o.id === id))
      const leaf = all.leaf > 0 ? `, less ${m(all.leaf)} for the open leaf` : ''
      say(
        item,
        opening,
        'item/blocks-doorway',
        `${itemNoun(item)} stands in front of ${opening.type} ${quoted(opening.id)}: it covers ${m(alone.covered)} of its ${m(opening.width)} hole, and the doorway leaves ${m(all.clear)} clear${leaf}. Measured within Grid's own approach depth of ${m(depth)}: an indicator, not a rule.`
      )
    }
  }
  return found.sort((a, b) => a.item - b.item || a.opening - b.opening).map((f) => f.issue)
}
