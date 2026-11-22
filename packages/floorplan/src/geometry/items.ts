/**
 * Fixtures on the plan (CNT-12, C6): where each stands, what it covers, how it is drawn and what
 * is worth a look about it.
 *
 * CNT-11 decided the shape of a placed item and that this version holds fixed fixtures only: a
 * toilet, a basin, a shower, a bath and a kitchen run. A fixture is never a wall and never a
 * room. It adds no floor area and closes no outline; the room it stands in is found from the
 * outlines, never named, and it takes from that room only the floor it stands on (`free floor`).
 *
 * Every size is the author's. A symbol is drawn inside the footprint the plan states, in
 * proportions of it, so whatever the size the drawing is to scale. The proportions are Grid's own
 * way of drawing and say nothing about how big a fixture should be.
 *
 * Pure: a plan in, shapes and issues out.
 */

import { ITEM_KINDS, type Item, type ItemKind } from '../types/floorplan'
import { quoted } from '../types/planText'
import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { openingsOf } from './plan'
import { floorOf, planFloors } from './floors'
import type { Vec2 } from './vec2'
import { area } from './vec2'
import { tryRoomShape, type RoomShape } from './room'
import { pointInPolygon } from './innerPoint'
import { intersectionArea, union } from './polygons'
import { tolerance } from './tolerances'
import { wallPlanSlices } from './wall'
import { nearestFloorId } from './levels'
import { metresText } from './rounding'
import type { Issue } from './validate'

export { ITEM_KINDS, type Item, type ItemKind } from '../types/floorplan'

/** What a person calls each kind, in a sentence. */
export const ITEM_KIND_WORDS: Readonly<Record<ItemKind, string>> = {
  toilet: 'toilet',
  basin: 'basin',
  shower: 'shower',
  bath: 'bath',
  'kitchen-run': 'kitchen run'
}

export function isItemKind(kind: string): kind is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(kind)
}

/** An item's name in a line: its label when it has one, else its kind, then its id. */
export function itemNoun(item: Pick<Item, 'id' | 'kind' | 'label'>): string {
  const kind = isItemKind(item.kind) ? ITEM_KIND_WORDS[item.kind] : 'item'
  const word = `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
  return `${word} ${quoted(item.id)}`
}

const m = (value: number): string => `${metresText(value)} m`

// ── Where it stands ──────────────────────────────────────────────────────────────────────────

/** The item's own axes: `across` along its width, left to right seen from its front, `front` from its back to its front. */
interface Frame {
  readonly at: Vec2
  readonly across: Vec2
  readonly front: Vec2
  readonly width: number
  readonly depth: number
}

function frameOf(item: Item): Frame {
  const turn = ((item.turn ?? 0) * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  return {
    at: { x: item.at[0], y: item.at[1] },
    across: { x: cos, y: sin },
    front: { x: -sin, y: cos },
    width: item.size[0],
    depth: item.size[1]
  }
}

/** A point given in shares of the item: `u` from -0.5 (its left) to 0.5, `v` from -0.5 (its back) to 0.5 (its front). */
function point(f: Frame, u: number, v: number): Vec2 {
  const a = u * f.width
  const b = v * f.depth
  return { x: f.at.x + f.across.x * a + f.front.x * b, y: f.at.y + f.across.y * a + f.front.y * b }
}

/** The floor an item covers: its four corners, counter-clockwise, back left first. */
export function itemFootprint(item: Item): Vec2[] {
  const f = frameOf(item)
  return [point(f, -0.5, -0.5), point(f, 0.5, -0.5), point(f, 0.5, 0.5), point(f, -0.5, 0.5)]
}

/** The room an item stands in: the smallest room on its floor whose floor holds the item's middle, or null. */
export function itemRoom(item: Item, rooms: readonly { readonly room: Room; readonly shape: RoomShape }[]): Room | null {
  const at = { x: item.at[0], y: item.at[1] }
  const floor = floorOf(item)
  let best: { room: Room; area: number } | null = null
  for (const { room, shape } of rooms) {
    if (floorOf(room) !== floor) continue
    if (!pointInPolygon(at, shape.polygon, shape.holes)) continue
    const size = area(shape.polygon)
    if (best === null || size < best.area) best = { room, area: size }
  }
  return best?.room ?? null
}

/** Every room of the plan whose outline closes, with its shape. Broken rooms are left out. */
export function roomShapes(index: PlanIndex, broken: ReadonlySet<string> = new Set()): { room: Room; shape: RoomShape }[] {
  return index.plan.rooms.flatMap((room) => {
    if (broken.has(room.id)) return []
    const shape = tryRoomShape(room, index)
    return shape === null ? [] : [{ room, shape }]
  })
}

// ── How it is drawn ──────────────────────────────────────────────────────────────────────────

/** How a fixture is drawn: closed rings filled with the paper, in order, and open lines over them. */
export interface ItemSymbol {
  readonly rings: readonly (readonly Vec2[])[]
  readonly lines: readonly (readonly Vec2[])[]
}

/** Points round an ellipse, in shares of the item. */
function ellipse(f: Frame, u: number, v: number, ru: number, rv: number, steps = 24): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < steps; i++) {
    const t = (2 * Math.PI * i) / steps
    out.push(point(f, u + ru * Math.cos(t), v + rv * Math.sin(t)))
  }
  return out
}

/** A circle `r` metres across its radius, its middle in shares of the item. */
function circle(f: Frame, u: number, v: number, r: number, steps = 16): Vec2[] {
  return ellipse(f, u, v, r / f.width, r / f.depth, steps)
}

/** A box in shares of the item. */
function box(f: Frame, u0: number, v0: number, u1: number, v1: number): Vec2[] {
  return [point(f, u0, v0), point(f, u1, v0), point(f, u1, v1), point(f, u0, v1)]
}

/** A box with rounded corners of radius `r` metres, in shares of the item. */
function roundedBox(f: Frame, u0: number, v0: number, u1: number, v1: number, r: number, steps = 4): Vec2[] {
  const ru = r / f.width
  const rv = r / f.depth
  const corners: [number, number, number][] = [
    [u1 - ru, v0 + rv, -Math.PI / 2],
    [u1 - ru, v1 - rv, 0],
    [u0 + ru, v1 - rv, Math.PI / 2],
    [u0 + ru, v0 + rv, Math.PI]
  ]
  const out: Vec2[] = []
  for (const [cu, cv, from] of corners) {
    for (let i = 0; i <= steps; i++) {
      const t = from + (Math.PI / 2) * (i / steps)
      out.push(point(f, cu + ru * Math.cos(t), cv + rv * Math.sin(t)))
    }
  }
  return out
}

/**
 * The symbol of a fixture, drawn inside its footprint:
 *
 * - toilet: the cistern against its back and the pan, an oval, in front of it;
 * - basin: its outline with the bowl, an oval, and the tap at its back;
 * - shower: the tray with both diagonals, falling to the waste in its middle;
 * - bath: its outline with the tub inside, rounded, and the waste at its left end;
 * - kitchen run: the worktop's outline.
 */
export function itemSymbol(item: Item & { readonly kind: ItemKind }): ItemSymbol {
  const f = frameOf(item)
  const short = Math.min(f.width, f.depth)
  const outline = box(f, -0.5, -0.5, 0.5, 0.5)
  switch (item.kind) {
    case 'toilet':
      return { rings: [box(f, -0.5, -0.5, 0.5, -0.2), ellipse(f, 0, 0.12, 0.38, 0.38)], lines: [] }
    case 'basin':
      return { rings: [outline, ellipse(f, 0, 0.1, 0.38, 0.34), circle(f, 0, -0.36, short / 16)], lines: [] }
    case 'shower':
      return {
        rings: [outline, circle(f, 0, 0, short / 16)],
        lines: [
          [point(f, -0.5, -0.5), point(f, 0.5, 0.5)],
          [point(f, 0.5, -0.5), point(f, -0.5, 0.5)]
        ]
      }
    case 'bath': {
      const inset = short * 0.1
      const iu = 0.5 - inset / f.width
      const iv = 0.5 - inset / f.depth
      return {
        rings: [outline, roundedBox(f, -iu, -iv, iu, iv, short * 0.25), circle(f, -iu + (short * 0.15) / f.width, 0, short / 16)],
        lines: []
      }
    }
    case 'kitchen-run':
      return { rings: [outline], lines: [] }
  }
}

// ── The floor it takes ───────────────────────────────────────────────────────────────────────

/**
 * The floor the fixtures take in each room, by room id, in square metres: the footprints of the
 * fixtures that stand in it, joined (two that overlap take their shared floor once) and cut to
 * the room's floor, less its holes. A room with no fixture is not in the map.
 */
export function itemFloorTaken(items: readonly Item[], rooms: readonly { readonly room: Room; readonly shape: RoomShape }[]): Map<string, number> {
  const byRoom = new Map<string, Item[]>()
  for (const item of items) {
    const room = itemRoom(item, rooms)
    if (room === null) continue
    const list = byRoom.get(room.id)
    if (list) list.push(item)
    else byRoom.set(room.id, [item])
  }
  const taken = new Map<string, number>()
  for (const { room, shape } of rooms) {
    const list = byRoom.get(room.id)
    if (list === undefined || taken.has(room.id)) continue
    const ring = (points: readonly Vec2[]): [number, number][] => points.map((p) => [p.x, p.y])
    const floor = [ring(shape.polygon), ...shape.holes.map(ring)]
    try {
      const covered = union(list.map((item) => [ring(itemFootprint(item))]))
      taken.set(room.id, intersectionArea(floor, covered))
    } catch {
      // The library failed on this room: its fixtures' own areas, which cannot be less.
      taken.set(room.id, list.reduce((sum, item) => sum + item.size[0] * item.size[1], 0))
    }
  }
  return taken
}

// ── Running into a wall ──────────────────────────────────────────────────────────────────────

/**
 * How far two convex shapes reach into each other, in metres, or 0 when they do not overlap: the
 * least overlap along the edge normals of both (separating axes).
 */
export function convexPenetration(a: readonly Vec2[], b: readonly Vec2[]): number {
  let least = Infinity
  for (const shape of [a, b]) {
    for (let i = 0; i < shape.length; i++) {
      const p = shape[i]!
      const q = shape[(i + 1) % shape.length]!
      const ex = q.x - p.x
      const ey = q.y - p.y
      const len = Math.hypot(ex, ey)
      if (len === 0) continue
      const nx = -ey / len
      const ny = ex / len
      let a0 = Infinity
      let a1 = -Infinity
      for (const v of a) {
        const d = v.x * nx + v.y * ny
        if (d < a0) a0 = d
        if (d > a1) a1 = d
      }
      let b0 = Infinity
      let b1 = -Infinity
      for (const v of b) {
        const d = v.x * nx + v.y * ny
        if (d < b0) b0 = d
        if (d > b1) b1 = d
      }
      const overlap = Math.min(a1, b1) - Math.max(a0, b0)
      if (overlap <= 0) return 0
      if (overlap < least) least = overlap
    }
  }
  return least === Infinity ? 0 : least
}

interface Bounds {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

function boundsOf(points: readonly Vec2[]): Bounds {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

const meet = (a: Bounds, b: Bounds): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/** The solid walls a footprint reaches into past `itemIntoWall`, each with how far, deepest first. */
export function wallsRunInto(footprint: readonly Vec2[], walls: readonly { readonly wall: Wall; readonly slices: readonly (readonly Vec2[])[]; readonly box: Bounds }[]): { wall: string; depth: number }[] {
  const box = boundsOf(footprint)
  const found: { wall: string; depth: number }[] = []
  for (const { wall, slices, box: wallBox } of walls) {
    if (!meet(box, wallBox)) continue
    let depth = 0
    for (const slice of slices) depth = Math.max(depth, convexPenetration(footprint, slice))
    if (depth > tolerance('itemIntoWall')) found.push({ wall: wall.id, depth })
  }
  return found.sort((a, b) => b.depth - a.depth)
}

// ── What is worth a look ─────────────────────────────────────────────────────────────────────

const issue = (id: string, code: string, message: string, severity: Issue['severity']): Issue => ({ entity: 'item', id, code, message, severity })

const held = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= tolerance('largest')

/** The room's height, floor to ceiling: as it states, else its floor's, else its lowest solid wall's. Null when none is known. */
function roomHeightOf(room: Room | null, index: PlanIndex, floorHeight: number | undefined): number | null {
  if (room?.height !== undefined) return room.height
  if (floorHeight !== undefined) return floorHeight
  if (room === null) return null
  let lowest = Infinity
  for (const id of room.boundary) {
    const wall = index.wallsById.get(id)
    if (wall === undefined || wall.virtual === true || !(wall.height > 0)) continue
    if (wall.height < lowest) lowest = wall.height
  }
  return lowest === Infinity ? null : lowest
}

/**
 * The drawing's checks on the plan's fixtures. Errors (the item is left out of every view, measure
 * and export, and its id goes into `broken`): a number Grid does not accept, a kind this version
 * does not hold, an id another part has, a floor the plan does not have. Warnings: a fixture in
 * no room, one that runs into a wall, one taller than its room.
 */
export function itemIssues(plan: FloorPlan, index: PlanIndex, broken: Set<string>): Issue[] {
  const items = plan.items ?? []
  if (items.length === 0) return []
  const issues: Issue[] = []

  const otherIds = new Set<string>([...plan.walls.map((w) => w.id), ...plan.rooms.map((r) => r.id), ...plan.openings.map((o) => o.id)])
  const itemIds = new Map<string, number>()
  for (const item of items) itemIds.set(item.id, (itemIds.get(item.id) ?? 0) + 1)
  const floors = planFloors(plan)
  const floorIds = floors.map((f) => f.id)
  const floorHeights = new Map(floors.map((f) => [f.id, f.height] as const))
  const kinds = ITEM_KINDS.map((k) => quoted(k)).join(', ')

  const sound: Item[] = []
  for (const item of items) {
    const noun = itemNoun(item)
    const numbers = [item.at[0], item.at[1], item.size[0], item.size[1], item.height, item.turn ?? 0]
    if (!numbers.every(held)) {
      issues.push(issue(item.id, 'item/too-large', `${noun} has a number that is not finite or is past the ${m(tolerance('largest'))} Grid accepts. Give every size and place in metres.`, 'error'))
      broken.add(item.id)
      continue
    }
    if (!(item.size[0] > 0 && item.size[1] > 0 && item.height > 0)) {
      issues.push(issue(item.id, 'item/no-size', `${noun} has no size: its width, depth and height must each be above 0.`, 'error'))
      broken.add(item.id)
      continue
    }
    if (!isItemKind(item.kind)) {
      issues.push(
        issue(
          item.id,
          'item/unknown-kind',
          `Item ${quoted(item.id)} is a ${quoted(item.kind)}, a kind the plan does not hold yet. It holds fixed fixtures: ${kinds}. Loose furniture, points and seats come later; until then the item is left out, and nothing else of the plan changes.`,
          'error'
        )
      )
      broken.add(item.id)
      continue
    }
    if ((itemIds.get(item.id) ?? 0) > 1 || otherIds.has(item.id)) {
      issues.push(issue(item.id, 'item/duplicate-id', `${noun} has an id that names another part of the plan too. Give every item an id of its own.`, 'error'))
      broken.add(item.id)
      continue
    }
    const floor = floorOf(item)
    if (!floorIds.includes(floor)) {
      const nearest = nearestFloorId(floor, floorIds)
      issues.push(
        issue(
          item.id,
          'item/unknown-floor',
          `${noun} sits on floor ${quoted(floor)}, which the plan does not have` + (nearest === null ? '.' : `; the nearest it has is ${quoted(nearest)}.`),
          'error'
        )
      )
      broken.add(item.id)
      continue
    }
    sound.push(item)
  }
  if (sound.length === 0) return issues

  const rooms = roomShapes(index, broken)
  const wallsByFloor = new Map<string, { wall: Wall; slices: Vec2[][]; box: Bounds }[]>()
  for (const wall of plan.walls) {
    if (wall.virtual === true || broken.has(wall.id)) continue
    try {
      const slices = wallPlanSlices(wall, openingsOf(index, wall.id).filter((o) => !broken.has(o.id)))
      if (slices.length === 0) continue
      const list = wallsByFloor.get(floorOf(wall)) ?? []
      list.push({ wall, slices, box: boundsOf(slices.flat()) })
      wallsByFloor.set(floorOf(wall), list)
    } catch {
      // A wall that cannot be built is reported by its own checks.
    }
  }

  for (const item of sound) {
    const noun = itemNoun(item)
    const room = itemRoom(item, rooms)
    if (room === null && rooms.some(({ room: r }) => floorOf(r) === floorOf(item))) {
      issues.push(issue(item.id, 'item/outside-rooms', `${noun} stands in no room: its middle, at (${metresText(item.at[0])}, ${metresText(item.at[1])}), is outside every room on its floor.`, 'warning'))
    }
    const into = wallsRunInto(itemFootprint(item), wallsByFloor.get(floorOf(item)) ?? [])
    if (into.length > 0) {
      const named = into.slice(0, 3).map((w) => `${quoted(w.wall)} by ${m(w.depth)}`).join(', ')
      issues.push(issue(item.id, 'item/into-wall', `${noun} runs into ${into.length === 1 ? 'wall' : 'walls'} ${named}${into.length > 3 ? ` and ${into.length - 3} more` : ''}. Move it clear of the wall's face, or make it smaller.`, 'warning'))
    }
    const height = roomHeightOf(room, index, floorHeights.get(floorOf(item)))
    if (height !== null && item.height > height + tolerance('itemAboveRoom')) {
      const where = room === null ? `its floor, ${quoted(floorOf(item))}` : `room ${quoted(room.name || room.id)}`
      issues.push(issue(item.id, 'item/too-tall', `${noun} is ${m(item.height)} high, ${m(item.height - height)} higher than ${where}, which is ${m(height)} high.`, 'warning'))
    }
  }
  return issues
}
