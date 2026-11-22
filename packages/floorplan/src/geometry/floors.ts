/**
 * Floors (storeys) — C5.
 *
 * A plan is a stack of floors sharing one origin and one coordinate system.
 * Walls and rooms name their floor; openings inherit their wall's. There is no
 * z here: slicing a plan to one floor is how the views show a storey, and each
 * one still rises from z = 0 (C4).
 *
 * Slicing rather than passing a floor id into every builder is deliberate: it
 * means no loop can forget to filter, so cross-floor bleed is impossible by
 * construction rather than by discipline.
 */
import { DEFAULT_FLOOR_ID, type BuildingType, type Floor } from '../types/floorplan'
import type { FloorPlan } from './plan'

/** The floor every entity belongs to until it says otherwise. */
export const DEFAULT_FLOOR: Floor = { id: DEFAULT_FLOOR_ID, name: 'Ground floor', level: 0 }

/** The floor an entity belongs to. Unstated means the ground floor (C5). */
export function floorOf(entity: { readonly floor?: string }): string {
  return entity.floor ?? DEFAULT_FLOOR_ID
}

/**
 * Every floor the plan actually has.
 *
 * The registry names and orders them; entities make them reachable. Both
 * sources are needed: registry alone would let one forgotten entry hide real
 * geometry with no way to reach it, and derivation alone has no names, no
 * stable order, and cannot express a storey the user asked for but has not
 * filled yet.
 *
 * Registry entries come first, ordered by `level` (stable within a tie).
 * Floors only an entity names are appended in first-appearance order — there is
 * no level to sort them by, and appending keeps them visible rather than
 * guessing where they belong.
 */
export function planFloors(plan: FloorPlan): Floor[] {
  const registry: Floor[] = []
  const seen = new Set<string>()

  for (const floor of plan.floors ?? []) {
    if (seen.has(floor.id)) continue // first entry wins; the duplicate is reported by validation
    seen.add(floor.id)
    registry.push(floor)
  }

  // Stable: Array.prototype.sort is stable, so equal levels keep registry order.
  registry.sort((a, b) => a.level - b.level)

  const derived: Floor[] = []
  for (const entity of [...plan.walls, ...plan.rooms]) {
    const id = floorOf(entity)
    if (seen.has(id)) continue
    seen.add(id)
    // No registry entry, so no name of its own. The id is the best label there is.
    derived.push(id === DEFAULT_FLOOR_ID ? DEFAULT_FLOOR : { id, name: id, level: 0 })
  }

  const all = [...registry, ...derived]
  return all.length > 0 ? all : [DEFAULT_FLOOR]
}

/**
 * CNT-5: what kind of building a floor is: its own `building`, else the plan's, else undefined
 * (the plan does not say). The first floor entry with the id wins, as in `planFloors`.
 */
export function floorBuilding(plan: Pick<FloorPlan, 'building' | 'floors'>, floorId: string): BuildingType | undefined {
  return (plan.floors ?? []).find((floor) => floor.id === floorId)?.building ?? plan.building
}

/** CNT-5: whether a floor's kind of building is its own, not the plan's. */
export function floorStatesBuilding(plan: Pick<FloorPlan, 'floors'>, floorId: string): boolean {
  return (plan.floors ?? []).find((floor) => floor.id === floorId)?.building !== undefined
}

/**
 * A floor id the plan really has: `requested` when present, otherwise the
 * lowest floor.
 *
 * Resolving on every read instead of syncing state means a stale id — a floor
 * the assistant deleted, or one left over from another project — is harmless
 * and needs no effect to clean up.
 */
export function resolveFloor(plan: FloorPlan, requested?: string | null): string {
  const floors = planFloors(plan)
  if (requested && floors.some((floor) => floor.id === requested)) return requested
  return floors[0]?.id ?? DEFAULT_FLOOR_ID
}

/**
 * The floor the views open on when none is picked: the ground floor, that is
 * the first floor at level 0, else the lowest floor above ground, else the
 * lowest. A basement opens first only in a plan that is all basement.
 *
 * `resolveFloor` keeps falling back to the lowest floor: the export reads it.
 */
export function defaultFloor(plan: FloorPlan): string {
  const floors = planFloors(plan)
  const ground = floors.find((floor) => floor.level === 0)
  if (ground) return ground.id

  const above = floors.filter((floor) => floor.level > 0)
  const candidates = above.length > 0 ? above : floors
  let lowest = candidates[0]
  for (const floor of candidates) if (lowest && floor.level < lowest.level) lowest = floor
  return lowest?.id ?? DEFAULT_FLOOR_ID
}

/**
 * The floor the views show: `requested` when the plan has it, otherwise
 * `defaultFloor`. Resolved on every read, like `resolveFloor`, so a stale id
 * needs no cleanup.
 */
export function viewFloor(plan: FloorPlan, requested?: string | null): string {
  if (requested && planFloors(plan).some((floor) => floor.id === requested)) return requested
  return defaultFloor(plan)
}

/** Wall ids that name more than one wall, so they resolve to no single storey. */
function collidingWallIds(plan: FloorPlan): ReadonlySet<string> {
  const seen = new Set<string>()
  const collided = new Set<string>()
  for (const wall of plan.walls) {
    if (seen.has(wall.id)) collided.add(wall.id)
    else seen.add(wall.id)
  }
  return collided
}

/**
 * The plan restricted to one floor.
 *
 * Walls, rooms and items by their own floor, openings by their wall's — so an opening
 * whose wall is elsewhere is dropped rather than left orphaned. `version`,
 * `units`, the registry and the reference image carry over untouched.
 *
 * Exact id match: resolve the id with `resolveFloor` first.
 *
 * One exception to the slices partitioning the plan: an opening on a wall id
 * that names walls on several storeys is dropped from every slice.
 * Matching by id alone would otherwise draw the same door on each of those
 * floors, which is worse than drawing it nowhere — and `validatePlan` reports
 * the collision as `plan/duplicate-id` so it is not silent.
 */
export function planForFloor(plan: FloorPlan, floorId: string): FloorPlan {
  const walls = plan.walls.filter((wall) => floorOf(wall) === floorId)
  const wallIds = new Set(walls.map((wall) => wall.id))
  const collided = collidingWallIds(plan)

  const slice: FloorPlan = {
    ...plan,
    walls,
    rooms: plan.rooms.filter((room) => floorOf(room) === floorId),
    openings: plan.openings.filter(
      (opening) => wallIds.has(opening.wall) && !collided.has(opening.wall)
    ),
    // CNT-12: an item by its own floor. A plan with no items keeps no key.
    ...(plan.items !== undefined && { items: plan.items.filter((item) => floorOf(item) === floorId) })
  }
  slices.add(slice)
  return slice
}

/** Every plan `planForFloor` returned, held weakly: nothing about the slice itself changes. */
const slices = new WeakSet<FloorPlan>()

/**
 * Whether `plan` is one floor's slice (`planForFloor`). A slice keeps the whole floor list but
 * only one floor's parts, so a check that sets floors against each other (LVL-1: an empty top
 * floor) would read the others as empty. Such checks run on the whole plan only.
 */
export function isFloorSlice(plan: FloorPlan): boolean {
  return slices.has(plan)
}

/** Whether the floor has anything to draw. Cheaper than slicing. */
export function floorHasGeometry(plan: FloorPlan, floorId: string): boolean {
  return (
    plan.walls.some((wall) => floorOf(wall) === floorId) ||
    plan.rooms.some((room) => floorOf(room) === floorId)
  )
}
