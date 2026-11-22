/**
 * How the floors of a plan are joined (LVL-3, lab VE-1, AU3-1).
 *
 * Two things join floors:
 *
 * - A stair the plan states (`stairs`, laid out by `planStairs`): it joins the room it leaves
 *   from to the room it arrives in.
 * - Rooms used as a stair, or as a lift, on neighbouring floors that lie one over the other: the
 *   stair or the shaft drawn as a room on each floor, as agents already draw them. They are one
 *   stair (one shaft) when they share more than `stairRoomOverlap` of the smaller room. The lab
 *   ran this on its 74 plans of two floors or more: 117 of the 120 pairs of neighbouring floors
 *   with a stair room on both share half or more, and the 3 that do not are its planted faults.
 *
 * Neighbouring floors are neighbouring levels in the order of `level`; floors at one level are
 * set against those of the level next to it, all of them. Where both of two neighbouring levels
 * hold a stair room (or a lift) and none of them lies over one on the other, they are out of line,
 * and that is said: a stair room with none on the next floor is a loft ladder, a roof hatch or a
 * stair the plan has not drawn yet, and says nothing.
 *
 * Pure, and never throws: a pair of rooms the polygon library cannot compare is not joined.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair } from 'polygon-clipping'
import type { FloorPlan } from './plan'
import { indexPlan } from './plan'
import { floorOf, planFloors, planForFloor } from './floors'
import type { Vec2 } from './vec2'
import { area } from './vec2'
import { tryRoomPolygon } from './room'
import { multiArea } from './polygons'
import { TOLERANCES, tolerance } from './tolerances'
import type { BrokenOnFloor, StairLayout } from './stairs'
import { planStairs } from './stairs'
import { brokenOnFloor } from './validate'

/** What joins two floors: a stair the plan states, rooms used as a stair, or a lift shaft. */
export type JoinKind = 'stair' | 'stair-room' | 'lift'

export interface FloorJoin {
  readonly kind: JoinKind
  /** The stair's id for a stated stair; for rooms, the lower room's id and the upper's, joined by "|". */
  readonly via: string
  /** The room at each end, and its floor: the lower floor's first. */
  readonly lower: { readonly floor: string; readonly room: string }
  readonly upper: { readonly floor: string; readonly room: string }
}

/** Rooms used as a stair (or a lift) on two neighbouring levels, none over one on the other. */
export interface OutOfLine {
  readonly kind: 'stair' | 'lift'
  /** Every such room on the lower level and on the upper, by floor then id. */
  readonly lower: readonly { readonly floor: string; readonly room: string }[]
  readonly upper: readonly { readonly floor: string; readonly room: string }[]
  /** The most any of them shares with one on the other level, as a share of the smaller, 0 to 1. */
  readonly share: number
}

/**
 * LVL-5 (lab WR-9, D-7, H-5): a room used as a stair (or a lift) that lies over one on the floor
 * below, enough to join it, but moved from it: both of its sides across one way stand past the
 * other's on the same side, by more than `stackShift`. `by` is how far, east (+x) and north (+y),
 * the nearer of the two sides each way; `upperBox` and `lowerBox` are the two rooms' boxes on the
 * plan. A lift shaft is the same shaft on every floor, so for one `sides` also names each of its
 * sides that stands more than `stackShift` off the one below's, east or north positive, when it is
 * not moved as a whole (h06b: one wall of the shaft moved 0.6 m on one floor). A room marked
 * `overhang: "meant"` is not said to be shifted.
 */
export interface Shifted {
  readonly kind: 'stair' | 'lift'
  readonly lower: { readonly floor: string; readonly room: string }
  readonly upper: { readonly floor: string; readonly room: string }
  readonly by: Vec2
  readonly sides: readonly { readonly side: 'north' | 'east' | 'south' | 'west'; readonly by: number }[]
  readonly upperBox: { readonly min: Vec2; readonly max: Vec2 }
  readonly lowerBox: { readonly min: Vec2; readonly max: Vec2 }
}

/** The box round an outline. */
function boxOf(outline: readonly Vec2[]): { min: Vec2; max: Vec2 } {
  const xs = outline.map((p) => p.x)
  const ys = outline.map((p) => p.y)
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } }
}

/**
 * How far one box is moved from another, one way: both its sides past the other's on the same side,
 * by the nearer of the two; 0 when one side is not, or either is no more than `stackShift` past.
 */
function movedBy(low0: number, low1: number, up0: number, up1: number): number {
  const a = up0 - low0
  const b = up1 - low1
  const least = tolerance('stackShift')
  if (a > least && b > least) return Math.min(a, b)
  if (a < -least && b < -least) return Math.max(a, b)
  return 0
}

/**
 * How far the upper outline is moved from the lower, east and north, and, when `everySide` and it
 * is not moved as a whole, each side that stands off the lower's; null when neither.
 */
export function shiftOf(lower: readonly Vec2[], upper: readonly Vec2[], everySide = false): Pick<Shifted, 'by' | 'sides' | 'lowerBox' | 'upperBox'> | null {
  const lowerBox = boxOf(lower)
  const upperBox = boxOf(upper)
  const by = {
    x: movedBy(lowerBox.min.x, lowerBox.max.x, upperBox.min.x, upperBox.max.x),
    y: movedBy(lowerBox.min.y, lowerBox.max.y, upperBox.min.y, upperBox.max.y)
  }
  const least = tolerance('stackShift')
  const sides: Shifted['sides'][number][] = []
  if (everySide && by.x === 0 && by.y === 0) {
    const off = [
      { side: 'north' as const, by: upperBox.max.y - lowerBox.max.y },
      { side: 'east' as const, by: upperBox.max.x - lowerBox.max.x },
      { side: 'south' as const, by: upperBox.min.y - lowerBox.min.y },
      { side: 'west' as const, by: upperBox.min.x - lowerBox.min.x }
    ]
    for (const side of off) if (Math.abs(side.by) > least) sides.push(side)
  }
  return by.x === 0 && by.y === 0 && sides.length === 0 ? null : { by, sides, lowerBox, upperBox }
}

export interface FloorJoins {
  readonly joins: readonly FloorJoin[]
  readonly outOfLine: readonly OutOfLine[]
  /** LVL-5: stair rooms and lift shafts that join the one below but are moved from it. */
  readonly shifted: readonly Shifted[]
  /** The stairs the plan states, laid out. */
  readonly stairs: readonly StairLayout[]
}

/** Room outlines by floor, then by room id: only rooms that can be drawn. */
export type OutlinesByFloor = ReadonlyMap<string, ReadonlyMap<string, readonly Vec2[]>>

const GRIDS = TOLERANCES.overlapGrids.values

/** The floor two outlines share, as a share of the smaller; null when they cannot be cut. */
function sharedShare(a: readonly Vec2[], b: readonly Vec2[]): number | null {
  const smaller = Math.min(area([...a]), area([...b]))
  if (!(smaller > tolerance('areaEqual'))) return null
  // Moved so the first outline's first corner sits at the origin: as exact far away as near.
  const dx = a[0]!.x
  const dy = a[0]!.y
  for (const grid of GRIDS) {
    const steps = grid === 0 ? 0 : Math.round(1 / grid)
    const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
    const ring = (outline: readonly Vec2[]): MultiPolygon => [[outline.map((p): Pair => [snap(p.x - dx), snap(p.y - dy)])]]
    try {
      return multiArea(polygonClipping.intersection(ring(a), ring(b))) / smaller
    } catch {
      // Tried again on a coarser grid.
    }
  }
  return null
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The outline of every room that can be drawn, floor by floor. */
export function roomOutlinesByFloor(plan: FloorPlan, broken: BrokenOnFloor = brokenOnFloor): Map<string, Map<string, Vec2[]>> {
  const found = new Map<string, Map<string, Vec2[]>>()
  for (const floor of planFloors(plan)) {
    const slice = planForFloor(plan, floor.id)
    const index = indexPlan(slice)
    const left = broken(slice)
    const rooms = new Map<string, Vec2[]>()
    for (const room of slice.rooms) {
      if (left.has(room.id)) continue
      const outline = tryRoomPolygon(room, index)
      if (outline !== null) rooms.set(room.id, outline)
    }
    found.set(floor.id, rooms)
  }
  return found
}

/**
 * Every join between the plan's floors, and every pair of levels whose stair rooms (or lifts) do
 * not line up. `outlines` are the rooms that count, floor by floor (`roomOutlinesByFloor`); a
 * caller that has them already passes them, so the outlines are traced once.
 */
export function floorJoins(plan: FloorPlan, outlines: OutlinesByFloor = roomOutlinesByFloor(plan), broken: BrokenOnFloor = brokenOnFloor): FloorJoins {
  const joins: FloorJoin[] = []
  const outOfLine: OutOfLine[] = []
  const shifted: Shifted[] = []

  // Stated stairs: the room each end stands in.
  const { stairs } = planStairs(plan, broken)
  for (const stair of stairs) {
    if (stair.lower.room === null || stair.upper.room === null) continue
    // Only rooms the way-out check knows: one left out of the outlines is no end.
    if (!outlines.get(stair.lower.floor)?.has(stair.lower.room) || !outlines.get(stair.upper.floor)?.has(stair.upper.room)) continue
    joins.push({
      kind: 'stair',
      via: stair.id,
      lower: { floor: stair.lower.floor, room: stair.lower.room },
      upper: { floor: stair.upper.floor, room: stair.upper.room }
    })
  }

  // Rooms used as a stair or a lift, level by level.
  const floors = planFloors(plan)
  const levels = [...new Set(floors.map((f) => (Number.isFinite(f.level) ? f.level : 0)))].sort((a, b) => a - b)
  // By floor and id: some plans repeat a room's id from floor to floor.
  const use = new Map(plan.rooms.map((room) => [`${floorOf(room)}|${room.id}`, room.use] as const))
  const meant = new Set(plan.rooms.filter((room) => room.overhang === 'meant').map((room) => `${floorOf(room)}|${room.id}`))
  const roomsOf = (level: number, kind: 'stair' | 'lift'): { floor: string; room: string; outline: readonly Vec2[] }[] =>
    floors
      .filter((f) => (Number.isFinite(f.level) ? f.level : 0) === level)
      .flatMap((f) =>
        [...(outlines.get(f.id) ?? new Map<string, readonly Vec2[]>())]
          .filter(([id]) => use.get(`${f.id}|${id}`) === kind)
          .map(([room, outline]) => ({ floor: f.id, room, outline }))
      )
      .sort((a, b) => byText(a.floor, b.floor) || byText(a.room, b.room))

  for (let i = 0; i + 1 < levels.length; i++) {
    for (const kind of ['stair', 'lift'] as const) {
      const below = roomsOf(levels[i]!, kind)
      const above = roomsOf(levels[i + 1]!, kind)
      if (below.length === 0 || above.length === 0) continue
      let best = 0
      // LVL-5: each upper room against the room below it shares most with, when they join.
      const most = new Map<(typeof above)[number], { room: (typeof below)[number]; share: number }>()
      for (const a of below) {
        for (const b of above) {
          const share = sharedShare(a.outline, b.outline)
          if (share === null) continue
          best = Math.max(best, share)
          if (share >= tolerance('stairRoomOverlap')) {
            joins.push({
              kind: kind === 'stair' ? 'stair-room' : 'lift',
              via: `${a.room}|${b.room}`,
              lower: { floor: a.floor, room: a.room },
              upper: { floor: b.floor, room: b.room }
            })
            if (share > (most.get(b)?.share ?? 0)) most.set(b, { room: a, share })
          }
        }
      }
      for (const [b, { room: a }] of most) {
        if (meant.has(`${b.floor}|${b.room}`)) continue
        const moved = shiftOf(a.outline, b.outline, kind === 'lift')
        if (moved === null) continue
        shifted.push({ kind, lower: { floor: a.floor, room: a.room }, upper: { floor: b.floor, room: b.room }, ...moved })
      }
      if (best < tolerance('stairRoomOverlap')) {
        const strip = ({ floor, room }: { floor: string; room: string }) => ({ floor, room })
        outOfLine.push({ kind, lower: below.map(strip), upper: above.map(strip), share: best })
      }
    }
  }

  return { joins, outOfLine, shifted, stairs }
}
