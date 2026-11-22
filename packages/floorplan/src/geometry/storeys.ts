/**
 * BRF-4 (C16, lab FD-1): how many storeys the building has, and how high it stands over the
 * ground, from the floors that hold something: an outline they state (massing) or walls that
 * close one. Both are read before any wall exists.
 *
 * - A storey is a level (`Floor.level`, C5) with at least one such floor on it: two flats side
 *   by side on one level are one storey. The storeys at or above the ground floor are counted
 *   apart from those below it, as BRF-3's footprint takes them (`footprintFloors`).
 * - The height is from the ground (`site.ground`, else the ground floor's floor level) to the
 *   top of the highest roof: a floor's level, its clear height and the roof slab over it, or the
 *   ridge its sloped roof states, and the parapet it states. A roof stated by its pitch alone is
 *   taken at the floor's clear height, the tallest of its walls as the roof cuts them.
 *
 * Pure: a plan in, plain data out. Never throws on a plan the schema reads.
 */
import { floorElevations, SLAB_THICKNESS } from './elevations'
import { planFloors } from './floors'
import { groundLevel } from './ground'
import { outlineKnown, slabOutline } from './outline'
import type { FloorPlan } from './plan'
import { indexPlan } from './plan'
import { footprintFloors } from './site'
import { validatePlan } from './validate'

/** One storey: a level with floors that hold something. */
export interface Storey {
  readonly level: number
  /** Its floors, by id, in plan order. */
  readonly floors: readonly string[]
  /** Under the ground floor: a basement. */
  readonly below: boolean
}

export interface PlanStoreys {
  /** Storeys at or above the ground floor. */
  readonly above: number
  /** Storeys under it. */
  readonly below: number
  readonly storeys: readonly Storey[]
  /** Floors that hold nothing yet, no outline and no walls that close one: in no storey. */
  readonly empty: readonly string[]
  /** Floors whose outline could not be worked out, with why: in no storey. */
  readonly unknown: readonly { readonly floor: string; readonly reason: string }[]
}

export interface BuildingHeight {
  /** From the ground to the top of the highest roof, m. */
  readonly height: number
  /** The floor whose roof is highest. */
  readonly floor: string
  /** The ground's level, from the ground floor's floor level: stated, or 0. */
  readonly ground: number
  readonly groundStated: boolean
}

export interface StoreyOptions {
  readonly broken?: ReadonlySet<string>
}

/** The storeys of the building: the levels whose floors hold something. */
export function planStoreys(plan: FloorPlan, options: StoreyOptions = {}): PlanStoreys {
  const broken = options.broken ?? validatePlan(plan, indexPlan(plan), { spaces: false }).broken
  const upper = new Set(footprintFloors(plan))
  const byLevel = new Map<number, { floors: string[]; below: boolean }>()
  const empty: string[] = []
  const unknown: { floor: string; reason: string }[] = []
  for (const floor of planFloors(plan)) {
    const outline = slabOutline(plan, floor.id, broken)
    if (!outlineKnown(outline)) {
      unknown.push({ floor: floor.id, reason: outline.reason })
      continue
    }
    if (outline.pieces.length === 0) {
      empty.push(floor.id)
      continue
    }
    const level = Number.isFinite(floor.level) ? floor.level : 0
    const storey = byLevel.get(level) ?? { floors: [], below: !upper.has(floor.id) }
    storey.floors.push(floor.id)
    byLevel.set(level, storey)
  }
  const storeys = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, s]): Storey => ({ level, floors: s.floors, below: s.below }))
  return { above: storeys.filter((s) => !s.below).length, below: storeys.filter((s) => s.below).length, storeys, empty, unknown }
}

/**
 * How high the building stands over the ground: to the top of the highest roof of a floor at or
 * above the ground floor that holds something. Null when no such floor holds anything.
 */
export function buildingHeight(plan: FloorPlan, storeys: PlanStoreys = planStoreys(plan)): BuildingHeight | null {
  const elevations = floorElevations(plan)
  const ground = groundLevel(plan, elevations)
  const floors = new Map(planFloors(plan).map((floor) => [floor.id, floor] as const))
  let best: { top: number; floor: string } | null = null
  for (const storey of storeys.storeys) {
    if (storey.below) continue
    for (const id of storey.floors) {
      const at = elevations.floors.get(id)
      const floor = floors.get(id)
      if (at === undefined || floor === undefined) continue
      const ridge = floor.roof !== undefined && floor.roof.shape !== 'flat' && floor.roof.ridge !== undefined ? floor.roof.ridge : null
      const top = at.floorLevel + Math.max(at.clearHeight, ridge ?? 0) + SLAB_THICKNESS + (floor.parapet ?? 0)
      if (best === null || top > best.top) best = { top, floor: id }
    }
  }
  if (best === null) return null
  return { height: best.top - ground.level, floor: best.floor, ground: ground.level, groundStated: ground.stated }
}
