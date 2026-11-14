/**
 * The door symbol, ready for SVG: the open leaf, its swing arc and the
 * two jambs.
 *
 * Where the leaf and the arc go comes from `doorSwing` in the geometry core;
 * this only writes its result the way the canvas draws, with the plan's Y
 * flipped. How thick each line is lives in the stylesheet.
 */

import type { PlanOpening, Vec2 } from '@ongrid/floorplan/geometry'
import { doorSwing } from '@ongrid/floorplan/geometry'
import type { DoorHanding } from './doorHanding'

type Line = readonly [Vec2, Vec2]

export interface DoorSymbol {
  /** The open leaf, from the hinge to its tip. SVG coordinates. */
  readonly leaf: Line
  /** The swing, from the leaf tip back to the other jamb, as a path. */
  readonly arc: string
  /** Across the wall at the opening's start and end. SVG coordinates. */
  readonly jambs: readonly [Line, Line]
}

const flip = (p: Vec2): Vec2 => ({ x: p.x, y: -p.y })
const n = (v: number): string => v.toFixed(4)

/**
 * The symbol for one door, or `null` when its hinge or swing isn't known:
 * then the door draws as a plain gap, and nothing guesses a swing. Windows and
 * doorless openings never get one.
 */
export function doorSymbolOf(opening: PlanOpening, handing: DoorHanding | undefined): DoorSymbol | null {
  if (opening.type !== 'door') return null
  const swing = doorSwing(opening, handing?.hinge, handing?.swing)
  if (!swing) return null

  const [hinge, tip] = swing.leaf
  const { center, radius, from } = swing.arc
  const far = { x: center.x + radius * Math.cos(from), y: center.y + radius * Math.sin(from) }

  // `counterClockwise` is the turn from the closed leaf to the open one, in
  // the plan. The arc is written the other way (tip to far jamb), and
  // flipping Y turns it round once more, so the two cancel: a plan turn
  // counter-clockwise is SVG's positive sweep here.
  const sweep = swing.arc.counterClockwise ? 1 : 0
  const a = flip(tip)
  const b = flip(far)
  const arc = `M${n(a.x)},${n(a.y)}A${n(radius)},${n(radius)} 0 0 ${sweep} ${n(b.x)},${n(b.y)}`

  const half = { x: (opening.normal.x * opening.thickness) / 2, y: (opening.normal.y * opening.thickness) / 2 }
  const jamb = (p: Vec2): Line => [
    flip({ x: p.x + half.x, y: p.y + half.y }),
    flip({ x: p.x - half.x, y: p.y - half.y })
  ]

  return { leaf: [flip(hinge), flip(tip)], arc, jambs: [jamb(opening.from), jamb(opening.to)] }
}
