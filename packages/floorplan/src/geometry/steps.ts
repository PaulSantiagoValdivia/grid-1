/**
 * A step inside a floor (LVL-7, lab R-4 and S-17): a room whose floor stands above or below its
 * storey's, as a genkan, a sunken wet area or a stage.
 *
 * A room states it with `floorOffset`, in metres from its storey's floor level. A platform that
 * covers part of a room is a room marked `inside` (ARE-5), edged with dividing lines and with its
 * own offset: its floor is taken off the room around it and counted at its own level, so a stage
 * is floor and never a wall.
 *
 * Where two rooms at different levels meet, the plan shows the step: across each door or
 * doorless opening between them, and along a dividing line between them. Which room lies on
 * which side of a wall is read from the one answer every view uses (`planWallSides`). The steps
 * are what a step-free route check reads later; nothing here judges them.
 */

import type { FloorPlan, PlanIndex, Room } from './plan'
import { indexPlan, openingsOf } from './plan'
import { planWallSides } from './exposure'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { openingSpan, wallFrameAt, wallLength } from './wall'

/** How far a room's floor stands above its storey's, in metres: its stated offset, else 0. */
export function roomFloorOffset(room: Room): number {
  return room.floorOffset !== undefined && Number.isFinite(room.floorOffset) ? room.floorOffset : 0
}

/** One step between two rooms at different levels. */
export interface PlanStep {
  readonly wallId: string
  /** The door or doorless opening the step is in, or null along a dividing line. */
  readonly openingId: string | null
  /**
   * The step's edge: where the higher floor ends. In an opening it is the lower room's face of
   * the wall, since the lower room's floor ends at its inner face (C3) and the higher floor runs
   * through the gap. Along a dividing line it is the line.
   */
  readonly from: Vec2
  readonly to: Vec2
  readonly upper: string
  readonly lower: string
  /** How much higher the upper room's floor is, in metres. Always more than `sameFloorLevel`. */
  readonly rise: number
}

/**
 * Every step in the plan, wall by wall in the plan's order. A room in `broken` is left out, and
 * a wall in it, or a wall with no length, has no steps. Windows are no way through, so they get
 * none. Never throws.
 */
export function planSteps(
  plan: FloorPlan,
  index: PlanIndex = indexPlan(plan),
  broken: ReadonlySet<string> = new Set()
): PlanStep[] {
  // A plan whose rooms all stand on their storeys has no steps, and costs nothing here.
  if (!plan.rooms.some((room) => roomFloorOffset(room) !== 0)) return []
  const rooms = new Map(plan.rooms.filter((room) => !broken.has(room.id)).map((room) => [room.id, room] as const))
  const sides = planWallSides(index)
  const same = tolerance('sameFloorLevel')
  const steps: PlanStep[] = []

  for (const wall of plan.walls) {
    if (broken.has(wall.id)) continue
    const wallSide = sides.get(wall.id)
    if (wallSide === undefined) continue
    let total: number
    try {
      total = wallLength(wall)
    } catch {
      continue
    }
    const half = wall.virtual === true ? 0 : wall.thickness / 2
    const ways = wall.virtual === true
      ? [{ id: null, from: 0, to: total }]
      : openingsOf(index, wall.id)
          .filter((opening) => opening.type !== 'window' && !broken.has(opening.id))
          .map((opening) => ({ id: opening.id, ...openingSpan(opening) }))

    for (const stretch of wallSide.stretches) {
      const left = stretch.left.map((id) => rooms.get(id)).find((room) => room !== undefined)
      const right = stretch.right.map((id) => rooms.get(id)).find((room) => room !== undefined)
      if (left === undefined || right === undefined) continue
      const rise = roomFloorOffset(left) - roomFloorOffset(right)
      if (!(Math.abs(rise) > same)) continue
      // The edge lies on the lower room's face: the left face is the one the normal points at.
      const lowerOnLeft = rise < 0
      const shift = lowerOnLeft ? half : -half
      // On a curved wall the step is drawn as the chord between its ends, on the lower room's face.
      const at = (s: number): Vec2 => {
        const { point: p, normal } = wallFrameAt(wall, s)
        return { x: p.x + normal.x * shift, y: p.y + normal.y * shift }
      }
      for (const way of ways) {
        const from = Math.max(way.from, stretch.from)
        const to = Math.min(way.to, stretch.to)
        if (!(to - from > tolerance('noLength'))) continue
        steps.push({
          wallId: wall.id,
          openingId: way.id,
          from: at(from),
          to: at(to),
          upper: (lowerOnLeft ? right : left).id,
          lower: (lowerOnLeft ? left : right).id,
          rise: Math.abs(rise)
        })
      }
    }
  }
  return steps
}
