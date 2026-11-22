/**
 * Which jamb a door hangs from and which face it opens to.
 *
 * The one place the 2D plan reads these from: the optional `hinge` and
 * `swing` on `OpeningSchema`. Absent means "not decided", so a door that
 * leaves either out draws as a plain gap and nothing guesses a swing.
 */

import type { DoorHinge, DoorSide } from '@ongrid/floorplan/geometry'
import type { Opening, OpeningKind, OpeningPart } from '@ongrid/floorplan/types/floorplan'

export interface DoorHanding {
  /** The end of the opening along the wall axis the leaf hangs from (C2). */
  readonly hinge?: DoorHinge
  /** The face the door opens toward: `left` is the face the wall normal points at. */
  readonly swing?: DoorSide
  /** CNT-14: its kind, as the plan states it. A door with none is one swinging leaf. */
  readonly kind?: OpeningKind
  /** CNT-14: the part of it that opens, as the plan states it. */
  readonly opens?: OpeningPart
}

export function doorHandingOf(opening: Opening): DoorHanding {
  return {
    hinge: opening.hinge,
    swing: opening.swing,
    ...(opening.kind !== undefined && { kind: opening.kind }),
    ...(opening.opens !== undefined && { opens: opening.opens })
  }
}
