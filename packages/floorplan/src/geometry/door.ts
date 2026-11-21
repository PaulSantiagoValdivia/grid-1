/**
 * Door swing geometry — C2.
 *
 * Where a door's leaf and its arc land, given which jamb it hangs from and
 * which face it opens to.
 *
 * `OpeningSchema` carries both values, as `hinge` and `swing`. Here they come
 * from the caller, and the contract this module fixes is the *meaning* of
 * them, which is the part the schema has to match.
 */

import type { PlanOpening } from './floorplan'
import type { Vec2 } from './vec2'
import { add, cross, distance, normalize, scale, sub } from './vec2'

/**
 * Which jamb the leaf hangs from, named by the ends of the opening along the
 * wall axis — `start` is the end nearer `wall.start`, which is the same datum
 * `offset` is measured from (C2).
 */
export type DoorHinge = 'start' | 'end'

/**
 * Which face the door opens toward.
 *
 * `left` is the face the wall normal points at, exactly as `wallFaces` in
 * `wall.ts` already uses the word. Giving these a second meaning here is how
 * the 2D plan and the 3D view end up disagreeing about which room a door opens
 * into.
 */
export type DoorSide = 'left' | 'right'

/** A circular arc, exactly. Canvas `arc()`, SVG `A` and DXF `ARC` all take this. */
export interface SwingArc {
  readonly center: Vec2
  readonly radius: number
  /** Radians, where the closed leaf lies. */
  readonly from: number
  /** Radians, where the open leaf lies. */
  readonly to: number
  readonly counterClockwise: boolean
}

export interface DoorSwing {
  /** The pivot: the jamb the leaf hangs from, on the face of the wall it opens towards. */
  readonly hinge: Vec2
  /** The leaf in its open position, from the hinge outward. */
  readonly leaf: readonly [Vec2, Vec2]
  /** The floor the leaf sweeps, from closed to open. */
  readonly arc: SwingArc
}

const angleOf = (v: Vec2): number => Math.atan2(v.y, v.x)

/**
 * The swing of one door, or `null` when there is nothing honest to draw.
 *
 * Returns `null` when either value is missing. That is the decision the issue
 * asks for, and it is deliberate: a default would draw a swing the architect
 * never specified, and a door shown opening into the wrong room is a worse
 * error in a construction drawing than no symbol at all. "Unknown" is a state
 * the drawing is allowed to show.
 *
 * Exact rather than tessellated: an arc flattened to a polyline cannot be
 * un-flattened, and DXF and SVG both want the real thing.
 */
export function doorSwing(
  opening: PlanOpening,
  hinge: DoorHinge | null | undefined,
  side: DoorSide | null | undefined
): DoorSwing | null {
  if (!hinge || !side) return null

  const width = distance(opening.from, opening.to)
  // A zero-width opening has no axis to hang anything from, and `normalize`
  // would hand back a direction that is not one.
  if (width <= 0) return null

  const open = side === 'left' ? opening.normal : scale(opening.normal, -1)
  // The leaf hangs from the face of the wall it opens towards, not from the wall's centre line
  // (SHT-2, lab DR-7): its reach is measured from there. A dividing line has no thickness, so a
  // door in one hangs on the line.
  const face = scale(open, opening.thickness / 2)
  const pivot = add(hinge === 'start' ? opening.from : opening.to, face)
  const farJamb = add(hinge === 'start' ? opening.to : opening.from, face)

  // Closed, the leaf lies across the opening on that face and reaches the other jamb.
  const closed = normalize(sub(farJamb, pivot))

  const tip = add(pivot, scale(open, width))

  return {
    hinge: pivot,
    leaf: [pivot, tip],
    arc: {
      center: pivot,
      radius: width,
      from: angleOf(closed),
      to: angleOf(open),
      // Which way round the quarter turn goes: the side the door opens to.
      counterClockwise: cross(closed, open) > 0
    }
  }
}
