/**
 * Storey elevations: where each floor stands, derived because the plan stores
 * none (C5: `level` orders floors, it is not an elevation). The 3D view and the
 * IFC export both stack storeys through this one rule, so a storey stands at the
 * same height in both.
 *
 * An explicit elevation or slab thickness in the schema stays the upgrade path:
 * it could override the derived values without changing this contract.
 */

import { DEFAULT_FLOOR, planFloors, planForFloor } from './floors'
import type { Floor, FloorPlan, Wall } from './plan'
import { indexPlan } from './plan'
import { validatePlan } from './validate'

/** What a storey with no drawn wall counts as: the plan's default wall height. */
export const DEFAULT_STOREY_HEIGHT = 2.7

/** Where one level stands. */
export interface StoreyLevel {
  /** The top of its floor slab, where its walls and rooms stand. */
  readonly floorLevel: number
  /** The height of its tallest drawn wall, or the default when it has none. */
  readonly clearHeight: number
}

/**
 * Stacks levels from the tallest drawn wall on each (0, negative or non-finite
 * when it has none), with `slab` metres of floor slab between storeys.
 *
 * The lowest level at or above 0 has its floor level at 0, with its slab below
 * it. Each higher level stands on its own slab, which lies on the walls of the
 * level below: floor level below, plus its clear height, plus `slab`. Levels
 * below 0 stack downward, each one's walls ending under the slab of the level
 * above it. Gaps in the numbering are ignored: levels are an order, not
 * positions. With `slab = 0` each storey stands directly on the walls below.
 */
export function stackLevels(
  tallestByLevel: ReadonlyMap<number, number>,
  slab: number
): Map<number, StoreyLevel> {
  const heightOf = (level: number): number => {
    const tallest = tallestByLevel.get(level) ?? 0
    return Number.isFinite(tallest) && tallest > 0 ? tallest : DEFAULT_STOREY_HEIGHT
  }

  const all = [...tallestByLevel.keys()]
  const above = all.filter((level) => level >= 0).sort((a, b) => a - b)
  const below = all.filter((level) => level < 0).sort((a, b) => b - a)

  const levels = new Map<number, StoreyLevel>()

  let floorLevel = 0
  for (const level of above) {
    const clearHeight = heightOf(level)
    levels.set(level, { floorLevel, clearHeight })
    floorLevel += clearHeight + slab
  }

  let base = 0
  for (const level of below) {
    const clearHeight = heightOf(level)
    base -= slab + clearHeight
    levels.set(level, { floorLevel: base, clearHeight })
  }

  return levels
}

/**
 * The thickness of every floor slab and of the roof. The plan has no field for
 * it yet; an optional one would override this without changing the rule.
 */
export const SLAB_THICKNESS = 0.25

const isFinitePoint = (p: readonly [number, number]): boolean =>
  Number.isFinite(p[0]) && Number.isFinite(p[1])

/** Every number a wall's shape depends on is a number. */
export const isFiniteWall = (wall: Wall): boolean =>
  isFinitePoint(wall.start) &&
  isFinitePoint(wall.end) &&
  Number.isFinite(wall.thickness) &&
  Number.isFinite(wall.height)

/**
 * Whether the views draw a wall, so it counts toward its storey's height: not
 * virtual, not reported `broken` by validation, and every number finite.
 * Validation judges shape, not whether a number is a number (a NaN passes every
 * comparison), so finiteness is checked here too.
 */
export function isDrawnWall(wall: Wall, broken: ReadonlySet<string>): boolean {
  return !wall.virtual && !broken.has(wall.id) && isFiniteWall(wall)
}

/** The whole building's storeys, as the 3D view and the IFC export stack them. */
export interface BuildingElevations {
  /** Every floor `planFloors` gives. Floors sharing a level share a value. */
  readonly floors: ReadonlyMap<string, StoreyLevel>
  /** The roof slab, lying on the top storey's walls. */
  readonly roof: { readonly bottom: number; readonly top: number }
}

/** The tallest wall a floor draws, or 0 when it draws none or cannot be analysed. */
function tallestDrawnWall(plan: FloorPlan, floor: Floor): number {
  try {
    const slice = planForFloor(plan, floor.id)
    const broken = new Set(validatePlan(slice, indexPlan(slice), { spaces: false }).broken)
    let tallest = 0
    for (const wall of slice.walls) {
      if (isDrawnWall(wall, broken) && wall.height > tallest) tallest = wall.height
    }
    return tallest
  } catch {
    return 0
  }
}

function floorsOf(plan: FloorPlan): Floor[] {
  try {
    return planFloors(plan)
  } catch {
    return [DEFAULT_FLOOR]
  }
}

/**
 * Each floor's level and clear height, plus the roof, with `SLAB_THICKNESS`
 * slabs. Total: whatever the plan contains, it never throws, and a floor that
 * cannot be analysed counts as one with no walls.
 */
export function floorElevations(plan: FloorPlan): BuildingElevations {
  const floors = floorsOf(plan)
  // The schema makes a level an integer; a file that bypassed it still stacks.
  const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

  const tallest = new Map<number, number>()
  for (const floor of floors) {
    const height = tallestDrawnWall(plan, floor)
    tallest.set(levelOf(floor), Math.max(tallest.get(levelOf(floor)) ?? 0, height))
  }

  const levels = stackLevels(tallest, SLAB_THICKNESS)
  const byFloor = new Map<string, StoreyLevel>()
  for (const floor of floors) byFloor.set(floor.id, levels.get(levelOf(floor))!)

  let top: StoreyLevel = { floorLevel: 0, clearHeight: DEFAULT_STOREY_HEIGHT }
  let topLevel = -Infinity
  for (const [level, storey] of levels) {
    if (level > topLevel) {
      topLevel = level
      top = storey
    }
  }
  const bottom = top.floorLevel + top.clearHeight

  return { floors: byFloor, roof: { bottom, top: bottom + SLAB_THICKNESS } }
}
