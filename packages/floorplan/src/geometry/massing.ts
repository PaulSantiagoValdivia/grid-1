/**
 * BRF-4 (C16, lab FD-1): a floor's stated outline, and the building as massing.
 *
 * A floor may state its `outline`, its outside face, before any wall is drawn. It is the one
 * shape the floor's slab covers, its roof is cut from and its gross external area is measured
 * to: `spaces.ts` and `outline.ts` join it with what the walls enclose, so a floor with walls and
 * no outline reads exactly as before, and a floor with an outline and no walls is massing.
 *
 * The storeys are counted here from the floors that hold something, an outline or walls that
 * close one, by level: floors at one level are one storey, and the floors below the ground floor
 * (`footprintFloors`, BRF-3) are counted apart.
 *
 * Pure: a plan in, plain data out. Never throws on a plan the schema reads.
 */
import type { Pair, Polygon } from 'polygon-clipping'
import type { FloorPlan } from './plan'
import { floorOf, planFloors } from './floors'
import { boundaryEdgeCount } from '../types/floorplan'
import { signedArea } from './vec2'
import { polygonArea } from './polygons'

/**
 * The outline `floor` states, as one counter-clockwise ring closed on its first point, or null
 * when the floor states none (or one with a number that is not finite).
 */
export function statedOutline(plan: Pick<FloorPlan, 'floors'>, floor: string): Polygon | null {
  const points = plan.floors?.find((f) => f.id === floor)?.outline
  if (points === undefined || !points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return null
  const open = boundaryEdgeCount(points) === points.length ? points : points.slice(0, -1)
  if (open.length < 3) return null
  const ring: Pair[] = open.map(([x, y]): Pair => [x, y])
  if (signedArea(ring.map(([x, y]) => ({ x, y }))) < 0) ring.reverse()
  return [[...ring, ring[0]!]]
}

/** The area inside a floor's stated outline, m²; null when it states none. */
export function statedOutlineArea(plan: Pick<FloorPlan, 'floors'>, floor: string): number | null {
  const outline = statedOutline(plan, floor)
  return outline === null ? null : polygonArea(outline)
}

/** Whether a floor is massing: it states an outline, and no wall stands on it. */
export function isMassing(plan: FloorPlan, floor: string): boolean {
  return statedOutline(plan, floor) !== null && !plan.walls.some((wall) => floorOf(wall) === floor)
}

/** The plan's floors that state an outline, by id, in plan order. */
export function outlinedFloors(plan: FloorPlan): string[] {
  return planFloors(plan)
    .filter((floor) => statedOutline(plan, floor.id) !== null)
    .map((floor) => floor.id)
}
