/**
 * Outdoor space, roofed or open (CNT-7, C26, lab EL-8, EL-18, R-8).
 *
 * A room that states `outdoor` is a garden, a courtyard, a terrace, a balcony, a light well, a
 * porch, a carport or another outdoor space. It is drawn and measured as a room, and to the
 * building it is the outside:
 *
 * - it is in no net, gross internal or gross external area (`areas.ts` lists it apart);
 * - it needs no door and no route of its own, and a route may pass through it (`rules/check.ts`);
 * - a wall between it and a room faces outside (`exposure.ts`);
 * - a wall that bounds outdoor space and no room is no part of the building (`outdoorOnlyWalls`):
 *   it adds no area and sets no storey height;
 * - on the lowest level it stands on the ground, with no slab, and only a roofed one has a roof
 *   (`envelope.ts`), in the IFC and the 3D files alike.
 *
 * Pure: a plan in, ids and booleans out. A plan with no outdoor space gets the same answers it
 * always got: every function here returns nothing for it.
 */

import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { indexPlan, roomWallIds } from './plan'
import { floorOf } from './floors'
import { tryRoomShape } from './room'
import { ROOFED_BY_KIND, type OutdoorKind } from '../types/floorplan'
import { wallFrameAt, wallLength } from './wall'
import type { Vec2 } from './vec2'
import { tolerance } from './tolerances'

/** The room's outdoor kind, or null for a room that is not outdoor space. `true` is `other`. */
export function outdoorKind(room: Pick<Room, 'outdoor'>): OutdoorKind | null {
  if (room.outdoor === undefined) return null
  return room.outdoor === true ? 'other' : room.outdoor
}

/** Whether the room is outdoor space (C26). */
export const isOutdoor = (room: Pick<Room, 'outdoor'>): boolean => room.outdoor !== undefined

/**
 * Whether a roof covers the outdoor space: as it states, else as its kind usually is (a porch and a
 * carport are roofed, every other kind open). Null for a room that is not outdoor space.
 */
export function outdoorRoofed(room: Pick<Room, 'outdoor' | 'roofed'>): boolean | null {
  const kind = outdoorKind(room)
  if (kind === null) return null
  return room.roofed ?? ROOFED_BY_KIND.has(kind)
}

/** Whether any room of the plan is outdoor space. */
export const planHasOutdoor = (plan: Pick<FloorPlan, 'rooms'>): boolean => plan.rooms.some(isOutdoor)

/** The ids of the plan's outdoor spaces. */
export const outdoorIds = (plan: Pick<FloorPlan, 'rooms'>): ReadonlySet<string> => new Set(plan.rooms.filter(isOutdoor).map((room) => room.id))

function inRing(p: Vec2, ring: readonly Vec2[]): boolean {
  let odd = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

/** Whether a point lies within `reach` of a ring's edges. */
function nearRing(p: Vec2, ring: readonly Vec2[], reach: number): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length2 = dx * dx + dy * dy
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2))
    if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= reach) return true
  }
  return false
}

const middleOf = (wall: Wall): Vec2 | null => {
  try {
    return wallFrameAt(wall, wallLength(wall) / 2).point
  } catch {
    return null
  }
}

const cache = new WeakMap<PlanIndex, ReadonlySet<string>>()

/**
 * The walls that bound outdoor space and no room: a fence, a parapet round a terrace, a balcony's
 * edge, the plot's edge drawn as a line, a porch's posts. A wall is one when no room that is not
 * outdoor lists it, and an outdoor space lists it or holds its middle. A wall no room lists that
 * stands in no outdoor space is the building's, as before. Empty for a plan with no outdoor space.
 */
export function outdoorOnlyWalls(index: PlanIndex): ReadonlySet<string> {
  const found = cache.get(index)
  if (found !== undefined) return found
  const out = new Set<string>()
  const plan = index.plan
  if (planHasOutdoor(plan)) {
    const indoorListed = new Set(plan.rooms.filter((room) => !isOutdoor(room)).flatMap((room) => roomWallIds(room)))
    const outdoorListed = new Set(plan.rooms.filter(isOutdoor).flatMap((room) => roomWallIds(room)))
    const shapes = plan.rooms.filter(isOutdoor).flatMap((room) => {
      const shape = tryRoomShape(room, index)
      return shape === null || shape.polygon.length < 3 ? [] : [{ floor: floorOf(room), shape }]
    })
    for (const wall of plan.walls) {
      if (indoorListed.has(wall.id)) continue
      if (outdoorListed.has(wall.id)) {
        out.add(wall.id)
        continue
      }
      const middle = middleOf(wall)
      if (middle === null) continue
      const floor = floorOf(wall)
      // A post on the outline's edge or at its corner stands in it too.
      const reach = (wall.virtual === true ? 0 : wall.thickness / 2) + tolerance('touch')
      const holds = (ring: readonly Vec2[]): boolean => inRing(middle, ring) || nearRing(middle, ring, reach)
      if (shapes.some(({ floor: f, shape }) => f === floor && holds(shape.polygon) && !shape.holes.some((hole) => inRing(middle, hole) && !nearRing(middle, hole, reach)))) out.add(wall.id)
    }
  }
  cache.set(index, out)
  return out
}

/**
 * The building alone, for what is measured to its walls (the gross areas, the storey heights and
 * the slabs and roofs): the plan less its walls that bound outdoor space and no room, the openings
 * in them, and the outdoor spaces that listed one. An outdoor space every wall of which is the
 * building's (a courtyard, a light well) stays: to the building it is the outside, and what
 * measures the building takes it off. The plan itself for a plan with no outdoor space.
 */
export function buildingPlan(plan: FloorPlan, index: PlanIndex = indexPlan(plan)): FloorPlan {
  if (!planHasOutdoor(plan)) return plan
  const gone = outdoorOnlyWalls(index)
  if (gone.size === 0) return plan
  return {
    ...plan,
    walls: plan.walls.filter((wall) => !gone.has(wall.id)),
    openings: plan.openings.filter((opening) => !gone.has(opening.wall)),
    rooms: plan.rooms.filter((room) => !isOutdoor(room) || !roomWallIds(room).some((id) => gone.has(id))),
  }
}
