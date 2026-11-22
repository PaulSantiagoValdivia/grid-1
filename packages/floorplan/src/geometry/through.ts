/**
 * Walls through floors (LVL-5, C15, lab VE-9, WR-9).
 *
 * A wall may state `through`, the highest floor it rises through: it stands on its own floor and
 * on every floor above it up to that one, in the order of `level`. It is one wall, shared by those
 * floors, so one edit moves it on all of them, and a room on any of them may list it. Its `height`
 * is how high it stands above the `through` floor's level, as a wall of that floor would; below
 * that it runs up through every floor and slab between. Its openings state their sill and height
 * from the wall's own floor (C2) and may reach as high as the wall does.
 *
 * Each floor's slice (`planForFloor`) holds the part of such a wall that stands on that floor, from
 * the floor's level to the next floor's in the wall's span (the top floor's part to the wall's
 * top), with the part of each of its openings that lies there. So everything that reads one floor
 * reads it as a wall of that floor. What draws the building whole (the 3D view, the exports, a
 * section) asks `wholeWall` for the wall as one piece: on its own floor's slice the wall from its
 * foot to its top with its openings as stated, and nothing on the floors above, where it has been
 * drawn already.
 *
 * Where the floors stand comes from `floorElevations`, which stacks each such wall as a wall of
 * its top floor (`storeySlice`), so the storeys do not depend on the parts.
 *
 * Pure, and never throws on a plan the schema reads.
 */

import type { Floor, FloorPlan, Opening, Wall } from './plan'
import { floorOf, planFloors } from './floors'
import { floorElevations, type BuildingElevations } from './elevations'
import { tolerance } from './tolerances'
import { quoted } from '../types/planText'
import type { Issue } from './validate'

/** Whether any wall of the plan rises through floors: one that states `through` another floor. */
export function hasWallsThrough(plan: Pick<FloorPlan, 'walls'>): boolean {
  return plan.walls.some((wall) => wall.through !== undefined && wall.through !== floorOf(wall))
}

const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

/** Each plan's floors, read once: `planFloors` walks every wall and room. */
const floorLists = new WeakMap<FloorPlan, readonly Floor[]>()

function floorsOf(plan: FloorPlan): readonly Floor[] {
  let floors = floorLists.get(plan)
  if (floors === undefined) {
    floors = planFloors(plan)
    floorLists.set(plan, floors)
  }
  return floors
}

/** Why a wall's `through` reaches no floor above its own, or null when it does. */
export function throughProblem(plan: FloorPlan, wall: Wall): 'unknown' | 'not-above' | null {
  if (wall.through === undefined || wall.through === floorOf(wall)) return null
  const floors = floorsOf(plan)
  const base = floors.find((f) => f.id === floorOf(wall))
  const top = floors.find((f) => f.id === wall.through)
  if (top === undefined || base === undefined) return 'unknown'
  return levelOf(top) > levelOf(base) ? null : 'not-above'
}

/**
 * The floors a wall stands on: its own first, then each floor above it, by level, up to the floor
 * it rises `through`. A wall that rises through no floor, or names one that is not above its own,
 * stands on its own floor only (and `throughIssues` says so).
 */
export function wallFloorIds(plan: FloorPlan, wall: Wall): string[] {
  const own = floorOf(wall)
  if (wall.through === undefined || wall.through === own || throughProblem(plan, wall) !== null) return [own]
  const floors = floorsOf(plan)
  const low = levelOf(floors.find((f) => f.id === own)!)
  const high = levelOf(floors.find((f) => f.id === wall.through)!)
  const between = floors.filter((f) => f.id !== own && f.id !== wall.through && levelOf(f) > low && levelOf(f) < high)
  return [own, ...[...between].sort((a, b) => levelOf(a) - levelOf(b)).map((f) => f.id), wall.through]
}

/** Whether a wall stands on a floor: its own, or one it rises through. */
export function wallStandsOn(plan: FloorPlan, wall: Wall, floorId: string): boolean {
  if (wall.through === undefined) return floorOf(wall) === floorId
  return wallFloorIds(plan, wall).includes(floorId)
}

/** The floor a wall counts toward the height of: the one it rises through, else its own. */
export function storeyFloorOf(plan: FloorPlan, wall: Wall): string {
  const floors = wallFloorIds(plan, wall)
  return floors[floors.length - 1]!
}

/** Each plan's storeys, worked out once for its slices. */
const levelCache = new WeakMap<FloorPlan, BuildingElevations>()

function levelsOf(plan: FloorPlan): BuildingElevations {
  let levels = levelCache.get(plan)
  if (levels === undefined) {
    levels = floorElevations(plan)
    levelCache.set(plan, levels)
  }
  return levels
}

/** One floor's stretch of a wall through floors, in metres above the wall's own floor's level. */
interface Stretch {
  readonly floor: string
  readonly from: number
  readonly to: number
}

/**
 * How a wall through floors stands, floor by floor: each floor's stretch of it, from that floor's
 * level to the next one's in its span, the top floor's to the wall's top. `rise` is its whole
 * height above its own floor's level.
 */
export function wallStretches(plan: FloorPlan, wall: Wall): { readonly rise: number; readonly stretches: readonly Stretch[] } {
  const floors = wallFloorIds(plan, wall)
  if (floors.length === 1) return { rise: wall.height, stretches: [{ floor: floors[0]!, from: 0, to: wall.height }] }
  const levels = levelsOf(plan).floors
  const at = (id: string): number => levels.get(id)?.floorLevel ?? 0
  const foot = at(floors[0]!)
  const rise = at(floors[floors.length - 1]!) + wall.height - foot
  const stretches = floors.map((floor, i) => ({ floor, from: at(floor) - foot, to: i + 1 < floors.length ? at(floors[i + 1]!) - foot : rise }))
  return { rise, stretches }
}

/** How high a wall rises above its own floor's level: its height, or for one through floors its whole height. */
export function wallRise(plan: FloorPlan, wall: Wall): number {
  return wall.through === undefined ? wall.height : wallStretches(plan, wall).rise
}

/** What a part in a floor's slice is of a wall through floors. */
export interface SharedPart {
  /** The wall as the plan states it. */
  readonly whole: Wall
  /** The floor this part stands on. */
  readonly floor: string
  /** Whether it is the wall's own floor, where the wall is drawn whole. */
  readonly base: boolean
  /** Whether it is the floor the wall rises through, the top of it. */
  readonly top: boolean
  /** The wall's whole height above its own floor's level. */
  readonly rise: number
  /** The wall's openings as the plan states them, measured from its own floor. */
  readonly openings: readonly Opening[]
  /** Where this part ends, in metres above the wall's own floor's level. */
  readonly to: number
}

const wallParts = new WeakMap<Wall, SharedPart>()
const openingParts = new WeakMap<Opening, { readonly whole: Opening; readonly base: boolean }>()

/** The wall through floors a slice's wall is a part of, or null for a wall of one floor. */
export function sharedPart(wall: Wall): SharedPart | null {
  return wallParts.get(wall) ?? null
}

/**
 * Whether a slice's opening is the part, on a floor above its wall's own, of an opening in a wall
 * through floors: drawn there, never counted or exported there again.
 */
export function isCarriedOpening(opening: Opening): boolean {
  return openingParts.get(opening)?.base === false
}

/**
 * A slice's wall as what draws the building whole draws it (the 3D view, the exports, a section):
 * a wall of one floor as it is, with `openings`; a part of a wall through floors on the wall's own
 * floor as the whole wall, from its foot to its top, with its openings as stated; and a part on a
 * floor above as `null`, drawn already.
 */
export function wholeWall(wall: Wall, openings: readonly Opening[]): { readonly wall: Wall; readonly openings: readonly Opening[] } | null {
  const part = wallParts.get(wall)
  if (part === undefined) return { wall, openings }
  if (!part.base) return null
  const { through: _through, ...rest } = part.whole
  void _through
  const kept = new Set(openings.map((o) => openingParts.get(o)?.whole ?? o))
  // An opening with a part on this floor is the wall's when the slice kept it; one wholly above
  // this floor is checked on its own floor's slice, and is the wall's too.
  const here = (o: Opening): boolean => o.sill < part.to && o.sill + o.height > 0
  return { wall: { ...rest, height: part.rise }, openings: part.openings.filter((o) => kept.has(o) || !here(o)) }
}

/**
 * The walls standing on a floor, and their openings, as that floor's slice holds them: a wall of
 * that floor as it is, a wall through floors as its stretch on this floor with the part of each
 * opening that lies in it. In plan order.
 */
export function throughFloorParts(plan: FloorPlan, floorId: string): { readonly walls: Wall[]; readonly openings: Opening[] } {
  const walls: Wall[] = []
  const shared = new Map<string, { readonly stretch: Stretch; readonly part: SharedPart }>()
  const sharedIds = new Set<string>()
  for (const wall of plan.walls) {
    if (wall.through === undefined || wall.through === floorOf(wall)) {
      if (floorOf(wall) === floorId) walls.push(wall)
      continue
    }
    const floors = wallFloorIds(plan, wall)
    if (floors.length === 1) {
      // A `through` that reaches no floor above: a wall of its own floor (`throughIssues`).
      if (floorOf(wall) === floorId) walls.push(stripped(wall, floorOf(wall)))
      continue
    }
    if (!floors.includes(floorId)) continue
    const { rise, stretches } = wallStretches(plan, wall)
    const stretch = stretches.find((s) => s.floor === floorId)!
    const height = stretch.to - stretch.from
    if (!(height > tolerance('noLength'))) continue
    const part: SharedPart = {
      whole: wall,
      floor: floorId,
      base: floorId === floors[0],
      top: floorId === floors[floors.length - 1],
      rise,
      openings: plan.openings.filter((o) => o.wall === wall.id),
      to: stretch.to
    }
    const copy: Wall = { ...stripped(wall, floorId), height }
    wallParts.set(copy, part)
    walls.push(copy)
    sharedIds.add(wall.id)
    shared.set(wall.id, { stretch, part })
  }

  const openings: Opening[] = []
  for (const opening of plan.openings) {
    const on = shared.get(opening.wall)
    if (on === undefined) {
      if (!sharedIds.has(opening.wall)) openings.push(opening)
      continue
    }
    const { stretch, part } = on
    const height = stretch.to - stretch.from
    const foot = opening.sill - stretch.from
    const head = opening.sill + opening.height - stretch.from
    const sill = Math.max(0, foot)
    const top = Math.min(head, height)
    // An opening that lies wholly on another floor's stretch has no part here.
    if (!(top - sill > tolerance('noLength')) && !(Number.isNaN(foot) || Number.isNaN(head))) continue
    const same = sill === opening.sill && top - sill === opening.height
    const piece: Opening = same ? opening : { ...opening, sill, height: top - sill }
    openingParts.set(piece, { whole: opening, base: part.base })
    openings.push(piece)
  }
  return { walls, openings }
}

/** A wall without `through`, on `floor`: the floor's own copy of it. */
function stripped(wall: Wall, floor: string): Wall {
  const { through: _through, ...rest } = wall
  void _through
  return floor === floorOf(wall) ? rest : { ...rest, floor }
}

/**
 * The walls a floor stacks on, as `floorElevations` reads them: each wall of one floor on it, and
 * each wall through floors on the floor it rises through, as a wall of that floor with its own
 * height and none of its openings. Nothing here needs the storeys, so the storeys can be worked
 * out from it.
 */
export function storeyWalls(plan: FloorPlan, floorId: string): Wall[] {
  const walls: Wall[] = []
  for (const wall of plan.walls) {
    if (wall.through === undefined || wall.through === floorOf(wall)) {
      if (floorOf(wall) === floorId) walls.push(wall)
      continue
    }
    if (storeyFloorOf(plan, wall) === floorId) walls.push(stripped(wall, floorId))
  }
  return walls
}

/**
 * LVL-5: a wall's `through` that names a floor the plan does not have, or one not above the
 * wall's own. The wall stands on its own floor only.
 */
export function throughIssues(plan: FloorPlan): Issue[] {
  const issues: Issue[] = []
  for (const wall of plan.walls) {
    const problem = throughProblem(plan, wall)
    if (problem === null) continue
    const own = floorOf(wall)
    const floors = floorsOf(plan)
    const above = floors.filter((f) => levelOf(f) > levelOf(floors.find((x) => x.id === own) ?? { id: own, name: own, level: 0 })).map((f) => quoted(f.id))
    const why =
      problem === 'unknown'
        ? `floor ${quoted(wall.through!)}, which the plan does not have`
        : `floor ${quoted(wall.through!)}, which is not above its own floor ${quoted(own)}`
    issues.push({
      entity: 'wall',
      id: wall.id,
      code: 'wall/through-floor',
      severity: 'warning',
      message:
        `Wall ${quoted(wall.id)} rises through ${why}, so it stands on its own floor only. ` +
        (above.length === 0 ? `No floor is above ${quoted(own)}.` : `The floors above it are ${above.join(', ')}.`)
    })
  }
  return issues
}
