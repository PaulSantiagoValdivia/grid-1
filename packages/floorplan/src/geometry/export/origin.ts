/**
 * Where an export writes the plan from (HND-2, HND-11; lab MS-12, CP2-1).
 *
 * A plan drawn at survey or map coordinates holds numbers in the millions of metres. DXF, IFC and
 * OBJ write numbers as text and keep them exactly, but a 3D file's points are 32-bit numbers,
 * which hold about seven digits: 4,580,000 m is held to half a metre. And BIM tools want an
 * element's own coordinates small. So an export writes the geometry near zero and keeps where
 * zero went as an offset: the IFC in its site's and building's placements, the GLB in the
 * translation of the node that holds the model.
 *
 * A plan that reaches no further than `farFromOrigin` from (0, 0) is written as it is. One that
 * reaches further is written from the site's origin when the plan states one (HND-11): the point
 * near the building it gave for this. With none, it is moved by whole steps of `farFromOrigin`,
 * to bring the middle of its walls within half a step of zero (HND-2). Either way every element
 * keeps its place in the world. A plan holding a coordinate past `largest`, which validation
 * refuses, is written as it is, so the move cannot bring a refused part back.
 */
import type { FloorPlan } from '../plan'
import { limit } from '../tolerances'

export type Pair2 = readonly [number, number]

/** The plan moved by `-at`, and `at`: where its zero went. */
export interface NearOrigin<P> {
  readonly plan: P
  readonly at: Pair2
}

// A plan read without the schema may hold anything: only pairs of finite numbers count, and
// anything else is left as it is, for the floors' validation to leave out.
const pair = (value: unknown): Pair2 | null =>
  Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
    ? [value[0] as number, value[1] as number]
    : null

const pairs = (values: readonly unknown[]): Pair2[] =>
  values.flatMap((value) => {
    const p = pair(value)
    return p === null ? [] : [p]
  })

/**
 * Where the plan's zero goes in an export: (0, 0) for a plan near it, else the site's origin, else
 * the middle of its walls in whole steps of `farFromOrigin`.
 */
export function exportOrigin(plan: Pick<FloorPlan, 'walls' | 'items' | 'stairs' | 'site'>): Pair2 {
  const wallPoints = pairs(plan.walls.flatMap((wall) => [wall.start, wall.end]))
  const others = pairs([
    ...(plan.items ?? []).map((item) => item.at),
    ...(plan.stairs ?? []).flatMap((stair) => (Array.isArray(stair.run) ? stair.run : []))
  ])
  if ([...wallPoints, ...others].some(([x, y]) => Math.hypot(x, y) > limit('largest'))) return [0, 0]
  if (!wallPoints.some(([x, y]) => Math.hypot(x, y) > limit('farFromOrigin'))) return [0, 0]
  const stated = pair(plan.site?.origin)
  if (stated !== null && Math.hypot(stated[0], stated[1]) <= limit('largest')) return stated
  const step = limit('farFromOrigin')
  const middle = (axis: 0 | 1): number => {
    const values = wallPoints.map((p) => p[axis])
    return Math.round((Math.min(...values) + Math.max(...values)) / 2 / step) * step
  }
  return [middle(0), middle(1)]
}

/**
 * The plan as an export writes it, near zero, and where its zero went (`exportOrigin`). The
 * walls, the fixtures and the stairs are moved; `site.origin` is not, so it stays the plan's own
 * point. Everything else is a size, or is placed by a wall.
 */
export function nearOrigin<P extends Pick<FloorPlan, 'walls' | 'items' | 'stairs' | 'site'>>(plan: P): NearOrigin<P> {
  const at = exportOrigin(plan)
  if (at[0] === 0 && at[1] === 0) return { plan, at: [0, 0] }
  function move<T>(value: T): T {
    const p = pair(value)
    return p === null ? value : ([p[0] - at[0], p[1] - at[1]] as T)
  }
  return {
    plan: {
      ...plan,
      walls: plan.walls.map((wall) => ({ ...wall, start: move(wall.start), end: move(wall.end) })),
      ...(plan.items === undefined ? {} : { items: plan.items.map((item) => ({ ...item, at: move(item.at) })) }),
      ...(plan.stairs === undefined
        ? {}
        : { stairs: plan.stairs.map((stair) => (Array.isArray(stair.run) ? { ...stair, run: stair.run.map(move) } : stair)) })
    },
    at
  }
}
