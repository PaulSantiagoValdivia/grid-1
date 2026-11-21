/**
 * Room geometry.
 *
 * A room carries no coordinates of its own: it carries a list of the walls
 * around it. Turning that list into a polygon is what this module does.
 *
 * The polygon is built in two passes.
 *
 *  1. The outline along the wall AXES. Wall endpoints are never joined;
 *     the LINES of neighbouring walls are intersected, in the order listed.
 *     One wall can therefore border several rooms along different stretches
 *     without being split, because only its line is used.
 *  2. The outline along the inner FACES. Which face of a wall looks into the
 *     room follows from the way the axis outline turns: going round a
 *     counter-clockwise outline the room is always on the left. Each wall is
 *     moved half its thickness to that side and neighbours are intersected
 *     again.
 *
 * The face is decided wall by wall, from the direction the outline travels
 * along that wall. It is NOT decided from one reference point inside the room:
 * a room with an inside corner (an L, a T, a U) has walls that such a point
 * lies behind, and the room then came out too large by the thickness of those
 * walls, by an amount that changed when the plan was turned.
 *
 * Two more things follow from working wall by wall:
 *
 *  - Walls of different thickness produce the right corner on their own.
 *  - Walls in a row with different thickness (a party wall that carries on as
 *    a partition, a solid wall that carries on as a virtual line) are one
 *    straight side of the room with a step in it. The step sits at the end of
 *    the wall that stands further into the room.
 */

import type { PlanIndex, Room, Wall } from './plan'
import type { Line, Vec2 } from './vec2'
import { area, centroid, cross, dot, intersectLines, scale, signedArea, sub } from './vec2'
import { tolerance, tolerancesAsStated } from './tolerances'
import type { WallAxis } from './wall'
import { wallAxis, wallFaces } from './wall'
import type { RoomNesting } from './nesting'
import { NO_NESTING, nestRooms } from './nesting'

/**
 * Why a room has no usable outline. `code` is the validation code the fault is
 * reported under.
 *
 *  - `room/unclosed`: the wall list cannot be closed at all.
 *  - `room/out-of-order`: it closes, but not round the walls it names.
 *  - `room/inside-out`: the walls are thicker than the gap between them.
 */
export type RoomFaultCode = 'room/unclosed' | 'room/out-of-order' | 'room/inside-out'

export class RoomOutlineError extends Error {
  readonly code: RoomFaultCode

  constructor(code: RoomFaultCode, message: string) {
    super(message)
    this.name = 'RoomOutlineError'
    this.code = code
  }
}

/** A corner of the outline, and how far it lies from the two walls that make it. */
export interface RoomCorner {
  /** Where the two wall axes cross. */
  readonly at: Vec2
  readonly wallA: string
  readonly wallB: string
  /** Distance from `at` to each wall's own axis segment. 0 when the wall reaches the corner. */
  readonly offA: number
  readonly offB: number
}

export interface RoomSide {
  readonly wallId: string
  /** The face of the wall that looks into the room. */
  readonly face: 'left' | 'right'
}

export interface RoomOutline {
  /** Along the inner faces, counter-clockwise. */
  readonly polygon: Vec2[]
  /** One entry per wall in `boundary`, in the same order. */
  readonly sides: readonly RoomSide[]
  /** One per corner of the axis outline. */
  readonly corners: readonly RoomCorner[]
  /** Set when the outline is not one a room can have. `roomPolygon` throws it. */
  readonly fault: RoomOutlineError | null
}

/** A virtual wall is a line: it has no substance and takes no floor. */
function thicknessOf(wall: Wall): number {
  return wall.virtual ? 0 : wall.thickness
}

/**
 * How far a corner may lie from a wall that is still said to reach it: the
 * thicker of the two walls, plus one tolerance. A wall drawn up to its
 * neighbour's face instead of its axis stops half a thickness short, more at
 * a sharp angle.
 */
export function cornerReach(a: Wall, b: Wall): number {
  return Math.max(thicknessOf(a), thicknessOf(b)) + tolerance('wallContact')
}

/** One wall of the boundary, with what the outline needs to know about it. */
interface Piece {
  readonly wall: Wall
  readonly axis: WallAxis
  readonly line: Line
  /** Filled in once the direction of travel is known. */
  face: Line
  side: 'left' | 'right'
}

/**
 * Two walls in a row that show the room exactly one face. Deliberately tight:
 * faces a few millimetres apart are joined by a step of that size, so the
 * floor between them is neither lost nor counted twice.
 */
function sameFace(a: Line, b: Line): boolean {
  return Math.abs(cross(a.dir, b.dir)) < tolerance('parallel') && Math.abs(cross(a.dir, sub(b.point, a.point))) < tolerance('sameFace')
}

/** One edge of the face outline: a wall's inner face, or a step between two of them. */
interface Edge {
  readonly line: Line
  /** The way the outline travels along it. A face edge that runs the other way has been crossed. */
  readonly dir: Vec2
  readonly wall: Wall
  /** Not to be judged by its direction: a step, or a side of no length. */
  readonly fixed: boolean
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t))
}

/**
 * Two neighbours that are one straight side of the room.
 *
 * Exactly parallel: on one line, or so close that their bodies touch. One
 * straight wall drawn as two pieces is the first case; a thick wall carrying on
 * as a thin one with one face flush is the second. Parallel walls that sit
 * further apart than that are a step the boundary does not describe.
 *
 * Nearly parallel (a surveyed building is never square): the same two cases,
 * when the walls touch end to end but their lines cross somewhere else, away
 * from those two ends. Such a crossing is not a corner of the room.
 */
function inRow(a: Piece, b: Piece): boolean {
  const sine = Math.abs(cross(a.line.dir, b.line.dir))
  const contact = tolerance('wallContact')
  const bodies = (thicknessOf(a.wall) + thicknessOf(b.wall)) / 2 + contact
  if (sine < tolerance('parallel')) {
    const apart = Math.abs(cross(a.line.dir, sub(b.line.point, a.line.point)))
    return apart < contact || apart <= bodies
  }
  if (sine > tolerance('nearlyParallel')) return false
  // The two ends that face each other, and how far the lines' crossing is from them.
  let gap = Infinity
  let ends: [Vec2, Vec2] = [a.axis.end, b.axis.start]
  for (const p of [a.axis.start, a.axis.end]) {
    for (const q of [b.axis.start, b.axis.end]) {
      const d = Math.hypot(p.x - q.x, p.y - q.y)
      if (d < gap) {
        gap = d
        ends = [p, q]
      }
    }
  }
  if (gap > bodies) return false
  const crossing = intersectLines(a.line, b.line)!
  const limit = cornerReach(a.wall, b.wall)
  return ends.every((end) => Math.hypot(crossing.x - end.x, crossing.y - end.y) > limit)
}

/**
 * The first pair of edges of a closed polygon that properly cross, or null.
 * Edges that only touch, or share a corner, do not count.
 */
function selfCrossing(points: readonly Vec2[]): [number, number] | null {
  const n = points.length
  const side = (a: Vec2, b: Vec2, c: Vec2): number => {
    const value = cross(sub(b, a), sub(c, a))
    return Math.abs(value) < tolerance('onLine') ? 0 : Math.sign(value)
  }
  for (let i = 0; i < n; i++) {
    const a = points[i]!
    const b = points[(i + 1) % n]!
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // neighbours across the end of the list
      const c = points[j]!
      const d = points[(j + 1) % n]!
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return [i, j]
    }
  }
  return null
}

function resolveWalls(room: Room, index: PlanIndex): Wall[] {
  return room.boundary.map((wallId) => {
    const wall = index.wallsById.get(wallId)
    if (!wall) {
      throw new RoomOutlineError(
        'room/unclosed',
        `Room ${room.id} references wall ${wallId}, which does not exist`
      )
    }
    return wall
  })
}

const metres = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${value.toFixed(2)} m`

/**
 * How the inner faces of two neighbouring walls join, going round the room
 * from `a` to `b`.
 *
 * Usually they simply cross, and that point is the corner: nothing is returned
 * and the caller intersects the two faces. But a face stops where its wall
 * stops. When the crossing lies beyond the end of one of the walls, the outline
 * follows that wall's end instead, across to the other face: a step. That is
 * what happens where a thick wall carries on as a thin one, or as a virtual
 * line, whether the two are exactly in line or a few millimetres off.
 *
 * A crossing that overshoots an end by no more than two wall thicknesses is
 * still the corner. Two walls that end at one point leave a small notch between
 * their square ends, on the inside of an inside corner and wherever a thick
 * wall turns into a thin one; a built corner has no such notch.
 *
 * Returns the step as an edge, `null` for a plain corner, `'none'` when the
 * faces are parallel and no step joins them.
 */
function joint(
  a: Piece,
  forwardA: Vec2,
  b: Piece,
  forwardB: Vec2
): Edge | null | 'none' {
  const along = (p: Vec2, dir: Vec2): number => dot(p, dir)
  const endA = along(a.axis.end, forwardA) > along(a.axis.start, forwardA) ? a.axis.end : a.axis.start
  const startB = along(b.axis.start, forwardB) < along(b.axis.end, forwardB) ? b.axis.start : b.axis.end
  const crossing = intersectLines(a.face, b.face)
  if (crossing) {
    const contact = tolerance('wallContact')
    const pastA = dot(sub(crossing, endA), forwardA) > contact
    const beforeB = dot(sub(startB, crossing), forwardB) > contact
    if (!pastA && !beforeB) return null
    // A corner made good: a crossing this close to the end it overshoots is the corner.
    const near = 2 * Math.max(thicknessOf(a.wall), thicknessOf(b.wall)) + contact
    const off = (p: Vec2): number => Math.hypot(crossing.x - p.x, crossing.y - p.y)
    if ((!pastA || off(endA) <= near) && (!beforeB || off(startB) <= near)) return null
  }
  // The end of wall A, as a line square to it; then the same for the start of B.
  // The step is real only if the other wall's face crosses that end within the
  // wall's own thickness.
  const ends: [Piece, Vec2][] = [
    [a, endA],
    [b, startB]
  ]
  for (const [wall, end] of ends) {
    const cap: Line = { point: end, dir: wall.axis.normal }
    const from = intersectLines(a.face, cap)
    const to = intersectLines(cap, b.face)
    const met = wall === a ? to : from
    if (!from || !to || !met) continue
    if (Math.abs(dot(sub(met, end), wall.axis.normal)) > thicknessOf(wall.wall) / 2 + tolerance('wallContact')) continue
    const span = sub(to, from)
    const length = Math.hypot(span.x, span.y)
    if (length < tolerance('noLength')) return null
    return { line: cap, dir: scale(span, 1 / length), wall: wall.wall, fixed: true }
  }
  return crossing ? null : 'none'
}

/**
 * The room's outline and how it was reached.
 *
 * Throws `RoomOutlineError` when the wall list cannot be closed at all. An
 * outline that closes but cannot be a room (out of order, inside out) comes
 * back with `fault` set, so a caller that reports problems still has the
 * corners to point at; `roomPolygon` throws that fault.
 */
export function roomOutline(room: Room, index: PlanIndex): RoomOutline {
  const walls = resolveWalls(room, index)
  if (walls.length < 3) {
    throw new RoomOutlineError(
      'room/unclosed',
      `Room ${room.id} has ${walls.length} walls; at least 3 are needed to close`
    )
  }

  const pieces: Piece[] = walls.map((wall) => {
    const axis = wallAxis(wall)
    const line = { point: axis.start, dir: axis.dir }
    return { wall, axis, line, face: line, side: 'left' }
  })

  // 1 · Straight runs. Neighbours in a row are one side of the room.
  const runs: Piece[][] = []
  for (const piece of pieces) {
    const run = runs[runs.length - 1]
    if (run && inRow(run[run.length - 1]!, piece)) run.push(piece)
    else runs.push([piece])
  }
  // A run can wrap around the end of the boundary.
  while (runs.length > 1 && inRow(runs[runs.length - 1]!.at(-1)!, runs[0]![0]!)) {
    const tail = runs.pop()!
    runs[0] = [...tail, ...runs[0]!]
  }
  if (runs.length < 3) {
    throw new RoomOutlineError(
      'room/unclosed',
      `Room ${room.id} has ${runs.length} distinct sides; at least 3 are needed to close`
    )
  }

  // 2 · The outline along the axes: where each run's line meets the next one's.
  const count = runs.length
  const axisCorners: Vec2[] = []
  const corners: RoomCorner[] = []
  for (let r = 0; r < count; r++) {
    const a = runs[r]!.at(-1)!
    const b = runs[(r + 1) % count]![0]!
    const at = intersectLines(a.line, b.line)
    if (!at) {
      throw new RoomOutlineError(
        'room/unclosed',
        `In room ${room.id}, walls ${a.wall.id} and ${b.wall.id} are parallel and form no ` +
          `corner. The boundary may be out of order.`
      )
    }
    axisCorners.push(at)
    corners.push({
      at,
      wallA: a.wall.id,
      wallB: b.wall.id,
      offA: distanceToSegment(at, a.axis.start, a.axis.end),
      offB: distanceToSegment(at, b.axis.start, b.axis.end)
    })
  }

  // 3 · Which way the outline turns decides which face of each wall is inside.
  const turn = signedArea(axisCorners)
  const counterClockwise = turn > 0
  const middle = centroid(axisCorners)
  const travels: Vec2[] = []
  for (let r = 0; r < count; r++) {
    const travel = sub(axisCorners[r]!, axisCorners[(r + count - 1) % count]!)
    travels.push(travel)
    for (const piece of runs[r]!) {
      const along = dot(travel, piece.axis.dir)
      // A side of no length has no direction of travel. Which side the middle
      // of the corners falls on is the best that is left.
      const roomOnLeft =
        Math.abs(along) < tolerance('noLength')
          ? cross(piece.axis.dir, sub(middle, piece.axis.start)) > 0
          : along > 0 === counterClockwise
      const faces = wallFaces(piece.wall)
      piece.side = roomOnLeft ? 'left' : 'right'
      piece.face = roomOnLeft ? faces.left : faces.right
    }
  }

  // 4 · The outline along the faces: one edge per face, and one per step
  // where a face stops at the end of its wall (see `joint`).
  const ordered: { piece: Piece; forward: Vec2; fixed: boolean }[] = []
  for (let r = 0; r < count; r++) {
    for (const piece of runs[r]!) {
      const along = dot(travels[r]!, piece.axis.dir)
      const fixed = Math.abs(along) < tolerance('noLength')
      ordered.push({ piece, forward: along < 0 ? scale(piece.axis.dir, -1) : piece.axis.dir, fixed })
    }
  }
  // One straight wall drawn as two pieces shows the room one face, not two.
  // The first piece of such a group stands for it; the step out of the group
  // is taken from its last piece, the one that meets the next wall.
  const groups: { first: (typeof ordered)[number]; last: (typeof ordered)[number] }[] = []
  for (const entry of ordered) {
    const group = groups[groups.length - 1]
    if (group && sameFace(group.last.piece.face, entry.piece.face)) group.last = entry
    else groups.push({ first: entry, last: entry })
  }
  const edges: Edge[] = []
  for (let g = 0; g < groups.length; g++) {
    const { first, last } = groups[g]!
    const next = groups[(g + 1) % groups.length]!.first
    edges.push({ line: first.piece.face, dir: first.forward, wall: first.piece.wall, fixed: first.fixed })
    const step = joint(last.piece, last.forward, next.piece, next.forward)
    if (step === 'none') {
      throw new RoomOutlineError(
        'room/unclosed',
        `In room ${room.id}, walls ${last.piece.wall.id} and ${next.piece.wall.id} are parallel ` +
          `and form no corner. The boundary may be out of order.`
      )
    }
    if (step) edges.push(step)
  }
  // Never null: every pair of neighbours left here has been shown to cross.
  let vertices: Vec2[] = edges.map(
    (edge, i) => intersectLines(edge.line, edges[(i + 1) % edges.length]!.line)!
  )

  const sides: RoomSide[] = pieces.map((piece) => ({ wallId: piece.wall.id, face: piece.side }))
  const done = (fault: RoomOutlineError | null): RoomOutline => ({
    polygon: counterClockwise ? vertices : [...vertices].reverse(),
    sides,
    corners,
    fault
  })

  // 5 · An outline that closes, but not round the walls it names.
  //
  // Lines always cross somewhere unless they are exactly parallel, so a wall
  // list in the wrong order still "closes": two walls on opposite sides of a
  // room that is a few centimetres out of square meet kilometres away, and that
  // point becomes a corner. A corner of a real room lies on its walls.
  let stray: RoomCorner | null = null
  for (let r = 0; r < count; r++) {
    const corner = corners[r]!
    const limit = Math.max(
      tolerance('strayCorner'),
      cornerReach(runs[r]!.at(-1)!.wall, runs[(r + 1) % count]![0]!.wall)
    )
    const off = Math.min(corner.offA, corner.offB)
    if (off > limit && (!stray || off > Math.min(stray.offA, stray.offB))) stray = corner
  }
  if (stray) {
    return done(
      new RoomOutlineError(
        'room/out-of-order',
        `In room ${room.id}, walls ${stray.wallA} and ${stray.wallB} are listed one after the ` +
          `other but do not meet: their lines cross ${metres(Math.min(stray.offA, stray.offB))} ` +
          `away from both. The boundary is out of order, or a wall between them is missing. ` +
          `List the walls in the order they are met going round the room.`
      )
    )
  }
  const crossing = selfCrossing(axisCorners)
  if (crossing) {
    const first = runs[(crossing[0] + 1) % count]![0]!.wall.id
    const second = runs[(crossing[1] + 1) % count]![0]!.wall.id
    return done(
      new RoomOutlineError(
        'room/out-of-order',
        `In room ${room.id}, the outline crosses itself: the side along wall ${first} cuts ` +
          `through the side along wall ${second}. The boundary is out of order. List the walls ` +
          `in the order they are met going round the room.`
      )
    )
  }

  // 6 · Faces that cross.
  //
  // Moving every wall in by half its thickness can turn a side round: the
  // corners at its two ends swap places and the side runs backwards. Between
  // two outward corners that means the faces of its neighbours met before they
  // reached it. Either the side is simply hidden (a short splay behind two
  // thick walls), and the neighbours then meet each other; or the neighbours
  // never meet on the room's side at all, because they are thicker than the gap
  // between them, and there is no floor.
  //
  // The sign of the area alone does not tell these apart. A room narrower than
  // its walls in one direction flips; one narrower in both flips twice and
  // looks sound again.
  const insideOut = (a: Wall, b: Wall): RoomOutline =>
    done(
      new RoomOutlineError(
        'room/inside-out',
        `Room ${room.id} has no floor: walls ${a.id} and ${b.id} are thicker than the gap ` +
          `between them, so their inner faces cross. Move the walls apart or make them thinner.`
      )
    )
  let live = edges
  let squeezed: [Wall, Wall] | null = null
  for (;;) {
    const n = live.length
    let hidden = -1
    for (let i = 0; i < n && hidden < 0; i++) {
      const edge = live[i]!
      if (edge.fixed) continue
      if (dot(sub(vertices[i]!, vertices[(i + n - 1) % n]!), edge.dir) >= -tolerance('noLength')) continue
      const outwardBefore = cross(live[(i + n - 1) % n]!.dir, edge.dir) > 0 === counterClockwise
      const outwardAfter = cross(edge.dir, live[(i + 1) % n]!.dir) > 0 === counterClockwise
      if (outwardBefore && outwardAfter) hidden = i
    }
    if (hidden < 0) break
    const before = live[(hidden + n - 1) % n]!
    const after = live[(hidden + 1) % n]!
    squeezed ??= [before.wall, after.wall]
    live = live.filter((_, i) => i !== hidden)
    if (live.length < 3) return insideOut(...squeezed)
    const next: (Vec2 | null)[] = live.map((edge, i) =>
      intersectLines(edge.line, live[(i + 1) % live.length]!.line)
    )
    if (next.some((vertex) => vertex === null)) return insideOut(before.wall, after.wall)
    vertices = next as Vec2[]
  }
  const faceTurn = signedArea(vertices)
  if (Math.abs(faceTurn) >= tolerance('areaEqual')) {
    if (faceTurn > 0 !== counterClockwise) {
      const pair = squeezed ?? [runs[0]![0]!.wall, runs[Math.floor(count / 2)]![0]!.wall]
      return insideOut(pair[0], pair[1])
    }
    if (selfCrossing(vertices)) {
      return done(
        new RoomOutlineError(
          'room/inside-out',
          `Part of room ${room.id} has no floor: somewhere its walls are thicker than the gap ` +
            `between them, so their inner faces cross. Move the walls apart or make them thinner.`
        )
      )
    }
  }

  return done(null)
}

/**
 * The room polygon, along the inner faces of its walls.
 *
 * Vertices come out counter-clockwise. Throws when the boundary does not
 * describe a closable outline — use `tryRoomPolygon` when the plan may be
 * malformed, which during most of development is always.
 */
export function roomPolygon(room: Room, index: PlanIndex): Vec2[] {
  const outline = roomOutline(room, index)
  if (outline.fault) throw outline.fault
  return outline.polygon
}

/** Same as `roomPolygon`, but returns `null` instead of throwing. */
export function tryRoomPolygon(room: Room, index: PlanIndex): Vec2[] | null {
  try {
    return roomPolygon(room, index)
  } catch {
    return null
  }
}

/** Worked out once per index: which rooms sit inside which (`nesting.ts`). */
const nestings = new WeakMap<PlanIndex, RoomNesting>()

/**
 * Which rooms of the plan sit inside which, and what each host keeps (ARE-5). Only rooms marked
 * `inside` are looked for; a plan with none costs nothing. Worked out once per index.
 */
export function roomNesting(index: PlanIndex): RoomNesting {
  // Worked out under changed tolerances (`withTolerances`), the answer is not the stated one,
  // so it is neither kept nor taken from what was kept.
  const stated = tolerancesAsStated()
  let found = stated ? nestings.get(index) : undefined
  if (found === undefined) {
    const rooms = index.plan.rooms
    found = rooms.some((room) => room.inside === true)
      ? nestRooms(
          rooms.flatMap((room) => {
            const outline = tryRoomPolygon(room, index)
            return outline === null ? [] : [{ room, outline }]
          }),
          index.wallsById
        )
      : NO_NESTING
    if (stated) nestings.set(index, found)
  }
  return found
}

/**
 * `roomArea` for a room whose outline is already traced: the outline's area, less the floor
 * of the rooms that sit inside it, with their walls.
 */
export function roomFloorArea(room: Room, index: PlanIndex, outline: readonly Vec2[]): number {
  return roomNesting(index).hosts.get(room.id)?.area ?? area(outline)
}

/**
 * Room area in square meters: the area of its outline, less the floor of any room marked
 * `inside` that sits in it, with that room's walls (ARE-5), so that each square metre is counted
 * once. `area(roomPolygon(room, index))` is the outline's area alone.
 *
 * It is derived data and that is why it does not live in the plan file: it is
 * computed every time. Derived data that gets stored is data that drifts.
 */
export function roomArea(room: Room, index: PlanIndex): number {
  return roomFloorArea(room, index, roomPolygon(room, index))
}
