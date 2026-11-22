/**
 * Door-sweep warnings.
 *
 * Whether each door's swing is fully stated, and whether the floor its leaf
 * sweeps is free: no wall in the way, no fixture standing in it (CNT-13), no
 * other door swinging into the same spot. Every finding is a warning. The door still draws, and nothing here
 * marks anything as broken.
 *
 * CNT-14: each door by its kind (`doorSweeps`). One leaf, a pair and a folding door sweep the
 * floor; a sliding, pocket, roller or garage door sweeps nothing and needs no swing. A door that
 * states nothing of its swing is not checked, and `checkDoorSweeps` lists it, floor by floor; a
 * wide door that states no kind is asked about (`opening/wide-single-leaf`).
 *
 * Like `doorSwing`, the values come from the caller. `OpeningSchema` carries
 * `hinge` and `swing`, so the call is
 * `validateDoorSweeps(plan, (opening) => opening)`, made beside
 * `validatePlan` and never from inside it: this builds each floor with
 * `buildFloorPlan`, which runs `validatePlan`. A view that has built the floor
 * it shows calls `validateFloorDoorSweeps` with that drawing instead (QAR-7).
 */

import { planInState } from './phases'
import type { FloorPlan, Opening, Wall } from './plan'
import type { Issue } from './validate'
import type { DoorSweep, DoorSwing, DoorValues } from './door'
import { doorSweeps } from './door'
import { doorKindOf, statedKind, sweepsFloor, swingNeeds } from './openingKinds'
import type { PlanDrawing } from './floorplan'
import { buildFloorPlan } from './floorplan'
import { boxIndex, boxOfPoints, widenBox } from './boxIndex'
import { planFloors, planForFloor } from './floors'
import type { Vec2 } from './vec2'
import { limit, tolerance } from './tolerances'
import { add, cross, distance, dot, length, lerp, perp, scale, signedArea, sub, vec } from './vec2'
import type { WallEnds } from './wall'
import { wallParts, wallSlicePolygon } from './wall'
import { wallJoints } from './joints'
import { itemName } from './items'

/**
 * One door's swing, as the caller knows it: the end it hangs from, the face it opens to, and
 * (CNT-14) its kind and the part of it that opens. Any may be missing; a door with no kind is one
 * swinging leaf.
 */
export type DoorSwingValues = DoorValues

/** An `Issue`, plus what the sweep runs into, so a marker can point at it. */
export interface DoorSweepIssue extends Issue {
  /** The walls a blocked door hits, the fixtures, or the other door. Empty when a value is missing. */
  readonly hits: readonly string[]
}

const MESSAGES = {
  'opening/swing-without-hinge':
    "This door is missing which side it hangs on, so it's drawn without a swing.",
  'opening/hinge-without-swing':
    "This door is missing which way it opens, so it's drawn without a swing.",
  'opening/door-blocked': 'This door hits a wall when it opens.',
  'opening/door-hits-item': 'This door hits a fixture when it opens.',
  'opening/doors-collide': 'These two doors hit each other when they open.',
  'opening/wide-single-leaf': 'This door states no kind, so it is drawn and checked as one swinging leaf; a leaf this wide is rare.'
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
 * the axis ± thickness/2 (C1), with its corners joined as the drawing joins
 * them (SHT-2).
 */
function standingParts(wall: Wall, openings: readonly Opening[], ends: WallEnds | undefined): Vec2[][] {
  return wallParts(wall, openings)
    .filter((part) => part.zFrom <= tolerance('noLength'))
    .map((part) => wallSlicePolygon(wall, part.from, part.to, ends))
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

function warning(code: SweepCode, id: string, hits: readonly string[] = [], message: string = MESSAGES[code]): DoorSweepIssue {
  return { code, entity: 'opening', id, message, severity: 'warning', hits }
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
  return checkDoorSweeps(plan, swingOf).issues
}

/** CNT-14: the doors on one floor whose sweep was not checked because the plan states no swing for them. */
export interface DoorsNotChecked {
  readonly floor: string
  /** In plan order. */
  readonly doors: readonly string[]
}

/**
 * The door-swing check on every floor, with the doors it could not check (CNT-14): those whose
 * kind swings or folds and that state neither the end they hang from nor the face they open to.
 * A door that states one of the two has its own warning instead; a sliding, pocket, roller or
 * garage door sweeps nothing and needs neither. Each floor is built once.
 */
export function checkDoorSweeps(
  plan: FloorPlan,
  swingOf: (opening: Opening) => DoorSwingValues | null | undefined
): { readonly issues: readonly DoorSweepIssue[]; readonly notChecked: readonly DoorsNotChecked[] } {
  const issues: DoorSweepIssue[] = []
  const notChecked: DoorsNotChecked[] = []
  // Each door is asked about once.
  const asked = new Map<Opening, DoorSwingValues | null | undefined>()
  const once = (opening: Opening): DoorSwingValues | null | undefined => {
    if (!asked.has(opening)) asked.set(opening, swingOf(opening))
    return asked.get(opening)
  }
  for (const floor of planFloors(plan)) {
    const slice = planForFloor(plan, floor.id)
    const drawing = buildFloorPlan(slice)
    issues.push(...validateFloorDoorSweeps(slice, drawing, once))
    const doors = floorDoorsNotChecked(slice, drawing, once)
    if (doors.length > 0) notChecked.push({ floor: floor.id, doors })
  }
  return { issues, notChecked }
}

/** Whether a door's sweep cannot be checked because the plan states nothing of its swing (CNT-14). */
export function swingNotStated(values: DoorSwingValues | null | undefined): boolean {
  const kind = doorKindOf(values?.kind)
  return sweepsFloor(kind) && !values?.hinge && !values?.swing
}

/** The doors one floor draws whose sweep is not checked because the plan states nothing of their swing (CNT-14). */
export function floorDoorsNotChecked(
  slice: FloorPlan,
  drawing: PlanDrawing,
  swingOf: (opening: Opening) => DoorSwingValues | null | undefined
): string[] {
  const drawn = new Set(drawing.openings.map((o) => o.id))
  return slice.openings.filter((o) => o.type === 'door' && drawn.has(o.id) && swingNotStated(swingOf(o))).map((o) => o.id)
}

/**
 * The same check for one floor (QAR-7): `slice` is that floor's `planForFloor`, and `drawing`
 * is `buildFloorPlan(slice)`, which a view has already built to draw it. A view calls this for
 * the floor it shows, and never builds the other floors to check them.
 *
 * Each door is tried only against the walls and doors near it (`boxIndex`), then exactly as
 * before, so the findings and their order are what trying every pair gives.
 */
export function validateFloorDoorSweeps(
  given: FloorPlan,
  whole: PlanDrawing,
  swingOf: (opening: Opening) => DoorSwingValues | null | undefined
): readonly DoorSweepIssue[] {
  // CNT-10: doors swing in the building as it will be after the work; what is to be demolished
  // is in no door's way.
  const slice = planInState(given, 'after')
  const standing = (part: { readonly phase?: string }): boolean => part.phase !== 'demolished'
  const drawing = slice === given ? whole : { ...whole, walls: whole.walls.filter(standing), openings: whole.openings.filter(standing) }
  const issues: DoorSweepIssue[] = []
  // What the view draws for this storey: broken walls and openings are
  // already out, and validation has said why.
  const drawnById = new Map(drawing.openings.map((drawn) => [drawn.id, drawn]))

  // Every real wall this storey draws, as the rectangles a leaf can hit.
  const blockers: { readonly id: string; readonly parts: readonly Vec2[][] }[] = []
  const drawnWalls = new Set(drawing.walls.map((w) => w.id))
  const joints = wallJoints(slice.walls.filter((w) => drawnWalls.has(w.id)))
  const openingsByWall = new Map<string, Opening[]>()
  for (const o of slice.openings) {
    if (!drawnById.has(o.id)) continue
    const list = openingsByWall.get(o.wall)
    if (list) list.push(o)
    else openingsByWall.set(o.wall, [o])
  }
  for (const w of slice.walls) {
    if (w.virtual || !drawnWalls.has(w.id)) continue
    blockers.push({ id: w.id, parts: standingParts(w, openingsByWall.get(w.id) ?? [], joints.get(w.id)) })
  }
  const nearBlockers = boxIndex(blockers.map((b) => boxOfPoints(b.parts.flat())))

  // CNT-13: the fixtures this storey draws stand on the floor, so a leaf hits them as it hits a
  // wall. Each is named by its kind and id, and its label when the plan states one.
  const stated = new Map((slice.items ?? []).map((item) => [item.id, item] as const))
  const fixtures = drawing.items.map((item) => ({ id: item.id, outline: item.outline, name: itemName(stated.get(item.id) ?? { id: item.id, kind: item.kind }) }))
  const nearFixtures = boxIndex(fixtures.map((f) => boxOfPoints(f.outline)))

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
    const kind = doorKindOf(values?.kind)

    // CNT-14 (lab EL-5): a wide door that states no kind is drawn as one leaf; ask.
    if (statedKind('door', values?.kind) === null && drawn.width >= limit('wideSingleLeaf')) {
      issues.push(warning('opening/wide-single-leaf', drawn.id))
    }

    // A door that slides, rolls or lifts sweeps nothing, and needs no swing.
    if (!sweepsFloor(kind)) continue
    const needs = swingNeeds(kind)
    // Nothing stated: listed as not checked (`checkDoorSweeps`), never guessed.
    if (!hinge && !swing) continue
    if (needs.hinge && !hinge) {
      issues.push(warning('opening/swing-without-hinge', drawn.id))
      continue
    }
    if (needs.swing && !swing) {
      issues.push(warning('opening/hinge-without-swing', drawn.id))
      continue
    }

    const shapes = doorSweeps(drawn, values ?? {})
    if (shapes === null || shapes.length === 0) continue
    const reached = (shape: DoorSweep, rectangle: readonly Vec2[]): boolean =>
      shape.shape === 'arc' ? reachesInto(frameOf(shape.swing), rectangle) : narrowestWidth(overlapOf(shape.polygon, rectangle)) > tolerance('swingContact')
    const reach = (shape: DoorSweep) =>
      shape.shape === 'arc' ? widenBox(boxOfPoints([shape.swing.arc.center]), shape.swing.arc.radius) : boxOfPoints(shape.polygon)

    // Each sweep lies within its box: a wall whose box is further off cannot reach into it.
    const hits = [...new Set(shapes.flatMap((shape) => nearBlockers.near(reach(shape))))]
      .sort((a, b) => a - b)
      .map((i) => blockers[i]!)
      .filter((b) => b.id !== drawn.wallId)
      .filter((b) => b.parts.some((rectangle) => shapes.some((shape) => reached(shape, rectangle))))
      .map((b) => b.id)
    if (hits.length > 0) issues.push(warning('opening/door-blocked', drawn.id, hits))

    const struck = [...new Set(shapes.flatMap((shape) => nearFixtures.near(reach(shape))))]
      .sort((a, b) => a - b)
      .map((i) => fixtures[i]!)
      .filter((f) => shapes.some((shape) => reached(shape, f.outline)))
    if (struck.length > 0) {
      const message = `This door hits ${struck.map((f) => f.name).join(', ')} when it opens.`
      issues.push(warning('opening/door-hits-item', drawn.id, struck.map((f) => f.id), message))
    }

    for (const shape of shapes) {
      if (shape.shape === 'arc') {
        sweeps.push({ id: drawn.id, hinge: shape.swing.hinge, radius: shape.swing.arc.radius, polygon: sweepPolygon(shape.swing) })
      } else {
        const middle = scale(shape.polygon.reduce((sum, p) => add(sum, p), vec(0, 0)), 1 / shape.polygon.length)
        sweeps.push({ id: drawn.id, hinge: middle, radius: Math.max(...shape.polygon.map((p) => distance(p, middle))), polygon: shape.polygon })
      }
    }
  }

  // Two discs whose boxes do not meet are further apart than their radii: the test below would
  // skip them too.
  const nearSweeps = boxIndex(sweeps.map((s) => widenBox(boxOfPoints([s.hinge]), s.radius)))
  // CNT-14: a pair's two leaves are one door, and two doors are named once however many of their leaves meet.
  const named = new Set<string>()
  for (let i = 0; i < sweeps.length; i++) {
    const first = sweeps[i]!
    for (const j of nearSweeps.near(widenBox(boxOfPoints([first.hinge]), first.radius))) {
      if (j <= i) continue
      const second = sweeps[j]!
      if (second.id === first.id || named.has(`${first.id}\u0000${second.id}`)) continue
      // Two discs this far apart cannot overlap: skip the clip.
      if (distance(first.hinge, second.hinge) >= first.radius + second.radius) continue
      if (narrowestWidth(overlapOf(first.polygon, second.polygon)) > tolerance('swingContact')) {
        named.add(`${first.id}\u0000${second.id}`)
        issues.push(warning('opening/doors-collide', first.id, [second.id]))
      }
    }
  }

  return issues
}
