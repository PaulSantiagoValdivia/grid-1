/**
 * The build schedule: how a plan change is drawn, one part at a time.
 *
 * When the assistant saves a new plan during a live run, the preview does not
 * swap the old plan for the new one in a single frame. It draws the difference
 * in the order a house is built: what goes away first, then the outer walls,
 * the inner walls, the doors and windows, the rooms and finally the
 * dimensions. Both views play the same schedule, so 2D and 3D cannot disagree
 * about what has been built.
 *
 * Every step leaves a valid plan behind (`planAfter`): a wall exists before
 * the openings cut into it, walls and openings before the rooms they close,
 * and rooms go before the walls they rest on. Validation and graceful
 * degradation therefore work on every in-between plan unchanged.
 */

import type { FloorPlan, Opening, Room, Wall } from './plan'
import { indexPlan, roomWallIds } from './plan'
import type { PlanWall } from './floorplan'
import type { Vec2 } from './vec2'
import { TOLERANCES } from './tolerances'
import { centroid, dot, fromTuple, signedArea, sub } from './vec2'
import { pointAlong, wallAxis } from './wall'
import { tryRoomPolygon } from './room'
import { wallExposure } from './exposure'

export type StepKind = 'remove' | 'wall' | 'move' | 'raise' | 'opening' | 'room' | 'dimensions'

export interface BuildStep {
  /**
   * - `remove`: the part fades out; drawn from the previous plan.
   * - `wall`: a new wall, or one whose length, direction or thickness changed.
   * - `move`: a wall that only slid, same length and direction.
   * - `raise`: a wall whose only change is its height (3D only).
   */
  readonly kind: StepKind
  /** The wall, opening or room id. `dimensions` for the dimensions step. */
  readonly id: string
  /** 0 remove · 1 outer walls · 2 other walls · 3 openings · 4 rooms · 5 dimensions. */
  readonly group: number
  /**
   * Where the part ends, in plan meters: a wall's end, an opening's centre, a
   * room's label point. The preview shows its "still working" pulse there.
   * Absent for removals and dimensions, which draw nothing new.
   */
  readonly at?: Vec2
}

const DIMENSIONS_ID = 'dimensions'

/** Two heights or lengths closer than `joint` are one (a fixed entry of the tolerance table). */
const EPS = TOLERANCES.joint.value

const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS

type WallChange = 'none' | 'move' | 'raise' | 'retrace'

function wallChange(prev: Wall, next: Wall): WallChange {
  const same = (a: readonly number[], b: readonly number[]) => near(a[0], b[0]) && near(a[1], b[1])
  const sameShape =
    near(prev.thickness, next.thickness) && (prev.virtual === true) === (next.virtual === true)
  const prevDelta = [prev.end[0] - prev.start[0], prev.end[1] - prev.start[1]]
  const nextDelta = [next.end[0] - next.start[0], next.end[1] - next.start[1]]

  if (!sameShape || !same(prevDelta, nextDelta)) return 'retrace'
  if (!same(prev.start, next.start)) return 'move'
  if (!near(prev.height, next.height)) return 'raise'
  return 'none'
}

function sameOpening(a: Opening, b: Opening): boolean {
  return (
    a.wall === b.wall &&
    a.type === b.type &&
    near(a.offset, b.offset) &&
    near(a.width, b.width) &&
    near(a.height, b.height) &&
    near(a.sill, b.sill)
  )
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i])

function sameRoom(a: Room, b: Room): boolean {
  const [holesA, holesB] = [a.holes ?? [], b.holes ?? []]
  return (
    a.name === b.name &&
    a.floor === b.floor &&
    sameList(a.boundary, b.boundary) &&
    // ARE-6: the walls round each hole.
    holesA.length === holesB.length &&
    holesA.every((hole, i) => sameList(hole, holesB[i]!))
  )
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) if (!map.has(item.id)) map.set(item.id, item)
  return map
}

function wallEnd(wall: Wall): Vec2 {
  return fromTuple(wall.end)
}

function openingCentre(opening: Opening, wall: Wall | undefined): Vec2 | undefined {
  if (!wall) return undefined
  try {
    return pointAlong(wallAxis(wall), opening.offset + opening.width / 2)
  } catch {
    return undefined
  }
}

/**
 * The steps that turn `prev` into `next`, in build order.
 *
 * Entities are matched by id. Within a group, parts keep the order of the file.
 * Unchanged parts get no step, and neither does a change that alters no shape
 * (a wall's `kind`, the order things are listed in): those simply show.
 */
export function buildSteps(prev: FloorPlan, next: FloorPlan): BuildStep[] {
  const prevWalls = byId(prev.walls)
  const prevOpenings = byId(prev.openings)
  const prevRooms = byId(prev.rooms)
  const nextWalls = byId(next.walls)
  const nextOpenings = byId(next.openings)
  const nextRooms = byId(next.rooms)

  // Walls: what each one does, and which ones have to go first.
  const change = new Map<string, WallChange | 'new'>()
  for (const wall of nextWalls.values()) {
    const before = prevWalls.get(wall.id)
    change.set(wall.id, before ? wallChange(before, wall) : 'new')
  }
  const goneWalls = new Set(
    [...prevWalls.keys()].filter((id) => !nextWalls.has(id) || change.get(id) === 'retrace')
  )

  // Openings ride on their wall: one on a wall that goes, or that changed
  // itself, is cut again after the walls are drawn.
  const redrawOpening = (opening: Opening): boolean => {
    const before = prevOpenings.get(opening.id)
    if (!before || !sameOpening(before, opening)) return true
    const wall = change.get(opening.wall)
    return wall === 'retrace' || wall === 'new'
  }
  const goneOpenings = new Set(
    [...prevOpenings.values()]
      .filter((o) => {
        const after = nextOpenings.get(o.id)
        return !after || redrawOpening(after) || goneWalls.has(o.wall)
      })
      .map((o) => o.id)
  )

  // Rooms close on their walls: one whose walls moved or were redrawn would
  // not close halfway through, so it goes first and fills again at the end.
  // A height change never moves an outline.
  const wallMoves = (id: string): boolean => {
    const c = change.get(id)
    return c === 'new' || c === 'retrace' || c === 'move' || (c === undefined && prevWalls.has(id))
  }
  const redrawRoom = (room: Room): boolean => {
    const before = prevRooms.get(room.id)
    if (!before || !sameRoom(before, room)) return true
    return roomWallIds(room).some(wallMoves)
  }
  const goneRooms = new Set(
    [...prevRooms.values()]
      .filter((r) => {
        const after = nextRooms.get(r.id)
        return !after || redrawRoom(after)
      })
      .map((r) => r.id)
  )

  const steps: BuildStep[] = []

  // Group 0: rooms, then openings, then walls, in the old file's order.
  for (const room of prevRooms.values()) {
    if (goneRooms.has(room.id)) steps.push({ kind: 'remove', id: room.id, group: 0 })
  }
  for (const opening of prevOpenings.values()) {
    if (goneOpenings.has(opening.id)) steps.push({ kind: 'remove', id: opening.id, group: 0 })
  }
  for (const wall of prevWalls.values()) {
    if (goneWalls.has(wall.id)) steps.push({ kind: 'remove', id: wall.id, group: 0 })
  }

  // Groups 1 and 2: outer walls (as the drawing shows them, `wallExposure`), then everything else.
  const nextIndex = indexPlan(next)
  const wallStep = (wall: Wall): BuildStep | null => {
    const c = change.get(wall.id)
    const group = wallExposure(nextIndex, wall.id) === 'exterior' && wall.virtual !== true ? 1 : 2
    const at = wallEnd(wall)
    if (c === 'new' || c === 'retrace') return { kind: 'wall', id: wall.id, group, at }
    if (c === 'move') return { kind: 'move', id: wall.id, group, at }
    if (c === 'raise') return { kind: 'raise', id: wall.id, group, at }
    return null
  }
  for (const group of [1, 2]) {
    for (const wall of nextWalls.values()) {
      const step = wallStep(wall)
      if (step && step.group === group) steps.push(step)
    }
  }

  // Group 3: openings.
  for (const opening of nextOpenings.values()) {
    if (redrawOpening(opening)) {
      const at = openingCentre(opening, nextWalls.get(opening.wall))
      steps.push({ kind: 'opening', id: opening.id, group: 3, ...(at ? { at } : {}) })
    }
  }

  // Group 4: rooms.
  const index = indexPlan(next)
  for (const room of nextRooms.values()) {
    if (redrawRoom(room)) {
      const polygon = tryRoomPolygon(room, index)
      const at = polygon ? centroid(polygon) : undefined
      steps.push({ kind: 'room', id: room.id, group: 4, ...(at ? { at } : {}) })
    }
  }

  // Group 5: dimensions, once, when anything drawn in plan changed. A height
  // change alone moves no dimension.
  if (steps.some((step) => step.kind !== 'raise')) {
    steps.push({ kind: 'dimensions', id: DIMENSIONS_ID, group: 5 })
  }

  return steps
}

/**
 * The plan with the first `count` steps applied on top of `prev`.
 *
 * A step counts as applied from the moment it starts: a wall being traced is
 * in the plan, and the view draws only the traced part of it. A removed part
 * is already out, and the view fades it from `prev`.
 *
 * Parts without a step show as they are in `next`, so `planAfter(steps.length)`
 * is `next` itself, in its order.
 */
export function planAfter(
  prev: FloorPlan,
  next: FloorPlan,
  steps: readonly BuildStep[],
  count: number
): FloorPlan {
  const applied = steps.slice(0, Math.max(0, count))
  const removed = new Set(applied.filter((s) => s.kind === 'remove').map((s) => s.id))
  const drawn = new Set(
    applied.filter((s) => s.kind !== 'remove' && s.kind !== 'dimensions').map((s) => s.id)
  )
  const pending = new Set(
    steps.filter((s) => s.kind !== 'remove' && s.kind !== 'dimensions').map((s) => s.id)
  )
  const removing = new Set(steps.filter((s) => s.kind === 'remove').map((s) => s.id))

  function merge<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
    const prevById = byId(before)
    const nextIds = new Set(after.map((item) => item.id))
    const out: T[] = []

    for (const item of after) {
      if (!pending.has(item.id) || drawn.has(item.id)) {
        out.push(item)
        continue
      }
      // Not drawn yet: the old version stays until it is removed, if there
      // was one.
      const old = prevById.get(item.id)
      if (old && !(removing.has(item.id) && removed.has(item.id))) out.push(old)
    }

    // Parts that are gone from the new plan stay until their removal starts.
    for (const item of before) {
      if (!nextIds.has(item.id) && !removed.has(item.id)) out.push(item)
    }

    return out
  }

  return {
    ...next,
    walls: merge(prev.walls, next.walls),
    openings: merge(prev.openings, next.openings),
    rooms: merge(prev.rooms, next.rooms)
  }
}

/**
 * Clips a polygon to the half-plane where `dot(p - origin, axis) <= limit`.
 * One Sutherland–Hodgman pass; it keeps the polygon's winding.
 */
function clipBehind(polygon: readonly Vec2[], origin: Vec2, axis: Vec2, limit: number): Vec2[] {
  const out: Vec2[] = []
  const reach = (p: Vec2) => dot(sub(p, origin), axis) - limit

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const ra = reach(a)
    const rb = reach(b)
    if (ra <= 0) out.push(a)
    if ((ra < 0 && rb > 0) || (ra > 0 && rb < 0)) {
      const k = ra / (ra - rb)
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
    }
  }
  return out
}

/**
 * The part of a wall drawn so far, `t` from 0 (nothing) to 1 (all of it).
 *
 * The wall's slices are clipped where the axis has reached `start + t·(end -
 * start)`, so the wall grows from its start to its end and never the other
 * way. This is geometry, not drawing: the 2D view only paints what comes out.
 */
export function traceWall(wall: PlanWall, t: number): Vec2[][] {
  if (t >= 1) return wall.slices.map((slice) => [...slice])
  if (t <= 0 || wall.slices.length === 0) return []

  const [start, end] = wall.centerline
  const axis = sub(end, start)
  const limit = t * dot(axis, axis)

  const out: Vec2[][] = []
  for (const slice of wall.slices) {
    const clipped = clipBehind(slice, start, axis, limit)
    if (clipped.length >= 3 && Math.abs(signedArea(clipped)) > TOLERANCES.noArea.value) out.push(clipped)
  }
  return out
}
