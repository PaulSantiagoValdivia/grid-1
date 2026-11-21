/**
 * Door-sweep warnings.
 *
 * Whether each door's swing is fully stated, and whether the floor its leaf
 * sweeps is free: no wall in the way, no other door swinging into the same
 * spot. Every finding is a warning. The door still draws, and nothing here
 * marks anything as broken.
 *
 * Like `doorSwing`, the values come from the caller. `OpeningSchema` carries
 * `hinge` and `swing`, so the call is
 * `validateDoorSweeps(plan, (opening) => opening)`, made beside
 * `validatePlan` and never from inside it: this builds each floor with
 * `buildFloorPlan`, which runs `validatePlan`.
 */

import type { FloorPlan, Opening, Wall } from './plan'
import type { Issue } from './validate'
import type { DoorHinge, DoorSide, DoorSwing } from './door'
import { doorSwing } from './door'
import { buildFloorPlan } from './floorplan'
import { planFloors, planForFloor } from './floors'
import type { Vec2 } from './vec2'
import { tolerance } from './tolerances'
import { add, cross, distance, dot, length, lerp, perp, scale, signedArea, sub, vec } from './vec2'
import { wallParts, wallSlicePolygon } from './wall'

/** One door's swing, as the caller knows it. Either half may be missing. */
export interface DoorSwingValues {
  readonly hinge?: DoorHinge | null
  readonly swing?: DoorSide | null
}

/** An `Issue`, plus what the sweep runs into, so a marker can point at it. */
export interface DoorSweepIssue extends Issue {
  /** The walls a blocked door hits, or the other door. Empty when a value is missing. */
  readonly hits: readonly string[]
}

const MESSAGES = {
  'opening/swing-without-hinge':
    "This door is missing which side it hangs on, so it's drawn without a swing.",
  'opening/hinge-without-swing':
    "This door is missing which way it opens, so it's drawn without a swing.",
  'opening/door-blocked': 'This door hits a wall when it opens.',
  'opening/doors-collide': 'These two doors hit each other when they open.'
} as const

type SweepCode = keyof typeof MESSAGES

/** Below `noArea` a polygon is a line or a point: shapes that only touch. */
const noArea = (polygon: readonly Vec2[]): boolean => Math.abs(signedArea(polygon)) < tolerance('noArea')

/**
 * A door's sweep in its own frame: `u` along the closed leaf, `v` along the
 * open one, both unit and perpendicular. A point `p` sits at
 * `((p − origin)·u, (p − origin)·v)`, and the sweep is
 * `x ≥ 0, y ≥ 0, x² + y² ≤ radius²` however the plan is turned.
 *
 * When the door opens clockwise the frame is a mirror image of the plan's.
 * That changes nothing here: a reflection keeps every distance.
 */
interface DoorFrame {
  readonly origin: Vec2
  readonly u: Vec2
  readonly v: Vec2
  readonly radius: number
}

function frameOf(swing: DoorSwing): DoorFrame {
  const { center, radius, from, to } = swing.arc
  return {
    origin: center,
    u: vec(Math.cos(from), Math.sin(from)),
    v: vec(Math.cos(to), Math.sin(to)),
    radius
  }
}

function inFrame(frame: DoorFrame, p: Vec2): Vec2 {
  const d = sub(p, frame.origin)
  return vec(dot(d, frame.u), dot(d, frame.v))
}

/** One Sutherland–Hodgman pass: the part of a convex polygon where `side(p) ≥ 0`. */
function clipBy(polygon: readonly Vec2[], side: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) out.push(lerp(a, b, sa / (sa - sb)))
  }
  return out
}

/** Distance from the origin to a polygon that does not contain it. */
function distanceFromOrigin(polygon: readonly Vec2[]): number {
  let nearest = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const ab = sub(b, a)
    const len2 = dot(ab, ab)
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -dot(a, ab) / len2))
    nearest = Math.min(nearest, Math.hypot(a.x + ab.x * t, a.y + ab.y * t))
  }
  return nearest
}

/**
 * Whether a wall rectangle reaches more than `swingContact` into the sweep. Exact: the
 * arc is never flattened.
 *
 * "More than `swingContact` (c) in" is the sweep shrunk by c (the points at least
 * that far inside it), which in the door's frame is
 * `x > c, y > c, x² + y² < (radius − c)²`: touching the jamb, resting
 * against the open leaf or brushing the arc does not count.
 *
 * The two straight sides are half-planes, so the rectangle is clipped to them
 * exactly. What is left meets the shrunk disc when its nearest point to the
 * hinge is closer than the shrunk radius. That is the same answer as testing
 * the rectangle's edges against the arc and both sides, its corners inside the
 * sweep and the sweep inside it, with no special case where they meet.
 */
function reachesInto(frame: DoorFrame, rectangle: readonly Vec2[]): boolean {
  const contact = tolerance('swingContact')
  const reach = frame.radius - contact
  // The shrunk sweep's corner is (c, c): past that, nothing is left.
  if (reach <= contact * Math.SQRT2) return false

  let part = rectangle.map((p) => inFrame(frame, p))
  part = clipBy(part, (p) => p.x - contact)
  part = clipBy(part, (p) => p.y - contact)
  if (part.length < 3 || noArea(part)) return false

  // Both sides keep x and y above c, so the hinge is never inside `part`.
  return distanceFromOrigin(part) < reach
}

/**
 * The rectangles of a wall a door leaf can hit: the runs that stand on the
 * floor. Solid runs and the sill under a window count; a lintel is above the
 * leaf, and another wall's doorway is a gap the leaf swings into. Each one is
 * the axis ± thickness/2 (C1).
 */
function standingParts(wall: Wall, openings: readonly Opening[]): Vec2[][] {
  return wallParts(wall, openings)
    .filter((part) => part.zFrom <= tolerance('noLength'))
    .map((part) => wallSlicePolygon(wall, part.from, part.to))
}

/** How finely a sweep's arc is flattened for the door-against-door test. */
const FLATTEN_STEP = (2 * Math.PI) / 180

/**
 * The sweep as a convex polygon: the hinge, then the arc from the closed leaf
 * to the open one in 2° steps. The chords lie inside the arc, by 0.14 mm at
 * most for a 90 cm door, far under the tolerance.
 */
function sweepPolygon(swing: DoorSwing): Vec2[] {
  const { center, radius, from, to } = swing.arc
  // The quarter turn, signed the way the door goes (`counterClockwise`).
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  const steps = Math.max(1, Math.ceil(Math.abs(turn) / FLATTEN_STEP - tolerance('relativeNoise')))
  const points: Vec2[] = [center]
  for (let i = 0; i <= steps; i++) {
    const angle = from + (turn * i) / steps
    points.push(add(center, scale(vec(Math.cos(angle), Math.sin(angle)), radius)))
  }
  return points
}

/** Where two convex polygons overlap (Sutherland–Hodgman), or `[]`. */
function overlapOf(a: readonly Vec2[], b: readonly Vec2[]): Vec2[] {
  const inward = Math.sign(signedArea(b))
  let out = [...a]
  for (let i = 0; i < b.length && out.length > 0; i++) {
    const p = b[i]!
    const edge = sub(b[(i + 1) % b.length]!, p)
    if (dot(edge, edge) === 0) continue
    out = clipBy(out, (x) => inward * cross(edge, sub(x, p)))
  }
  return out
}

/**
 * How wide a convex polygon is across its narrowest direction, which is
 * always square to one of its edges. Wider than this in every direction, so
 * both directions included, and the same however the plan is turned — a
 * bounding box would call a thin diagonal sliver wide.
 */
function narrowestWidth(polygon: readonly Vec2[]): number {
  if (polygon.length < 3 || noArea(polygon)) return 0
  let narrowest = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const edge = sub(polygon[(i + 1) % polygon.length]!, polygon[i]!)
    const len = length(edge)
    if (len < tolerance('noLength')) continue
    const across = scale(perp(edge), 1 / len)
    let lo = Infinity
    let hi = -Infinity
    for (const p of polygon) {
      const d = dot(p, across)
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    narrowest = Math.min(narrowest, hi - lo)
  }
  return narrowest === Infinity ? 0 : narrowest
}

function warning(code: SweepCode, id: string, hits: readonly string[] = []): DoorSweepIssue {
  return { code, entity: 'opening', id, message: MESSAGES[code], severity: 'warning', hits }
}

/**
 * Checks every drawable door of the plan, floor by floor. Never throws.
 *
 * `swingOf` is asked only about doors: windows and doorless openings have no
 * leaf, so whatever the caller holds for them is ignored.
 */
export function validateDoorSweeps(
  plan: FloorPlan,
  swingOf: (opening: Opening) => DoorSwingValues | null | undefined
): readonly DoorSweepIssue[] {
  const issues: DoorSweepIssue[] = []

  for (const floor of planFloors(plan)) {
    const slice = planForFloor(plan, floor.id)
    // What the view draws for this storey: broken walls and openings are
    // already out, and validation has said why.
    const drawing = buildFloorPlan(slice)
    const drawnById = new Map(drawing.openings.map((drawn) => [drawn.id, drawn]))

    // Every real wall this storey draws, as the rectangles a leaf can hit.
    const blockers: { readonly id: string; readonly parts: readonly Vec2[][] }[] = []
    const drawnWalls = new Set(drawing.walls.map((w) => w.id))
    for (const w of slice.walls) {
      if (w.virtual || !drawnWalls.has(w.id)) continue
      const openings = slice.openings.filter((o) => o.wall === w.id && drawnById.has(o.id))
      blockers.push({ id: w.id, parts: standingParts(w, openings) })
    }

    // Plan order, not the drawing's (by wall, then offset): "the first door"
    // of a pair is the one the file lists first.
    const sweeps: {
      readonly id: string
      readonly hinge: Vec2
      readonly radius: number
      readonly polygon: readonly Vec2[]
    }[] = []
    for (const opening of slice.openings) {
      if (opening.type !== 'door') continue
      const drawn = drawnById.get(opening.id)
      if (!drawn) continue

      const values = swingOf(opening)
      const hinge = values?.hinge ?? null
      const swing = values?.swing ?? null

      if (!hinge && !swing) continue
      if (!hinge) {
        issues.push(warning('opening/swing-without-hinge', drawn.id))
        continue
      }
      if (!swing) {
        issues.push(warning('opening/hinge-without-swing', drawn.id))
        continue
      }

      const sweep = doorSwing(drawn, hinge, swing)
      if (!sweep) continue
      const frame = frameOf(sweep)

      const hits = blockers
        .filter((b) => b.id !== drawn.wallId)
        .filter((b) => b.parts.some((rectangle) => reachesInto(frame, rectangle)))
        .map((b) => b.id)
      if (hits.length > 0) issues.push(warning('opening/door-blocked', drawn.id, hits))

      sweeps.push({
        id: drawn.id,
        hinge: sweep.hinge,
        radius: sweep.arc.radius,
        polygon: sweepPolygon(sweep)
      })
    }

    for (let i = 0; i < sweeps.length; i++) {
      for (let j = i + 1; j < sweeps.length; j++) {
        const first = sweeps[i]!
        const second = sweeps[j]!
        // Two discs this far apart cannot overlap: skip the clip.
        if (distance(first.hinge, second.hinge) >= first.radius + second.radius) continue
        if (narrowestWidth(overlapOf(first.polygon, second.polygon)) > tolerance('swingContact')) {
          issues.push(warning('opening/doors-collide', first.id, [second.id]))
        }
      }
    }
  }

  return issues
}
