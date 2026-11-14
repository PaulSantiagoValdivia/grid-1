/**
 * Which jamb a door hangs from and which face it opens to.
 *
 * The one place the 2D plan reads these from: the optional `hinge` and
 * `swing` on `OpeningSchema`. Absent means "not decided", so a door that
 * leaves either out draws as a plain gap and nothing guesses a swing.
 */

import type { DoorHinge, DoorSide } from '@ongrid/core/geometry'
import type { Opening } from '@ongrid/core/types/floorplan'

export interface DoorHanding {
  /** The end of the opening along the wall axis the leaf hangs from (C2). */
  readonly hinge?: DoorHinge
  /** The face the door opens toward: `left` is the face the wall normal points at. */
  readonly swing?: DoorSide
}

export function doorHandingOf(opening: Opening): DoorHanding {
  return { hinge: opening.hinge, swing: opening.swing }
}
