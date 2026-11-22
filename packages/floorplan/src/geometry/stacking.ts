/**
 * Floors that line up (LVL-5, lab WR-9, E-9): each floor's outline set against the floor below it.
 *
 * Floors are drawn one over the other, each with its own walls (C5), so widening one leaves the
 * other where it was, with nothing said (E-9: the ground floor 0.30 m wider than the floor above,
 * seen only in a 3D picture). Here each floor's outline, as its walls draw it (`floorSpaces`), is set
 * against the outline of the floors one level below: where it reaches past them it overhangs, and
 * where they reach past it it sits back. A stretch no more than `stackShift` across lines up, as
 * the faces of walls of different thickness on one axis do. Only floors with a room on them are
 * compared: a parapet or a lone wall is no floor plate. Either way it is a warning, as an
 * overhang or a set-back is often meant: a floor that states `overhang: "meant"` is not asked about.
 *
 * Pure, and never throws: a pair of floors the polygon library cannot cut is not compared.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import type { Floor, FloorPlan } from './plan'
import type { FloorSpaces } from './spaces'
import type { Issue } from './validate'
import { floorOf, planFloors } from './floors'
import { multiArea } from './polygons'
import { TOLERANCES, tolerance } from './tolerances'
import { metresText } from './rounding'
import { quoted } from '../types/planText'

const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

/**
 * Points on the finest grid the overlap cuts use: an outline's corners made good leave notches a
 * nanometre deep, which would join a strip past the floor below to slivers along its sides.
 */
const GRID = TOLERANCES.overlapGrids.values[TOLERANCES.overlapGrids.values.length - 1]!
const snap = (v: number): number => Math.round(v / GRID) * GRID
const closed = (ring: readonly { x: number; y: number }[]): Pair[] => [...ring.map((p): Pair => [snap(p.x), snap(p.y)]), [snap(ring[0]!.x), snap(ring[0]!.y)]]
const asMulti = (outline: FloorSpaces['outline']): MultiPolygon => outline.filter((piece) => piece.length > 0 && piece[0]!.length >= 3).map((piece): Polygon => piece.map(closed))

/** A stretch of one outline past another: its box on the plan, how far across it is, and the side. */
interface Stretch {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  /** Across the stretch, the narrower side of its box: how far it reaches past. */
  readonly depth: number
  readonly side: 'north' | 'east' | 'south' | 'west'
  readonly area: number
}

/** The pieces of `a` outside `b`, each at least `stackShift` across, largest first. */
function past(a: MultiPolygon, b: MultiPolygon, middle: { x: number; y: number }): Stretch[] | null {
  let pieces: MultiPolygon
  try {
    pieces = polygonClipping.difference(a, b)
  } catch {
    return null
  }
  const least = tolerance('stackShift')
  const found: Stretch[] = []
  for (const piece of pieces) {
    const ring = piece[0] ?? []
    if (ring.length < 4) continue
    const xs = ring.map((p) => p[0])
    const ys = ring.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const depth = Math.min(x1 - x0, y1 - y0)
    if (!(depth > least)) continue
    const dx = (x0 + x1) / 2 - middle.x
    const dy = (y0 + y1) / 2 - middle.y
    // The side of the floor below it lies on: the way its middle is from the middle of that floor,
    // read across the stretch's own long side when it is a strip.
    const strip = x1 - x0 < y1 - y0 ? 'ew' : 'ns'
    const side = strip === 'ew' ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'north' : 'south'
    found.push({ x0, y0, x1, y1, depth, side, area: multiArea([piece]) })
  }
  return found.sort((p, q) => q.area - p.area)
}

const at = (x: number, y: number): string => `(${metresText(x)}, ${metresText(y)})`
const m = (value: number): string => `${metresText(value)} m`

/** The most stretches one line names; the rest are counted. */
const NAMED = 3

/**
 * One warning for each floor whose outline does not lie over the floors one level below it
 * (`floor/out-of-line`), unless it states `overhang: "meant"`. Floors that cannot be worked out
 * (`spaces` leaves them out) are not compared.
 */
export function stackingIssues(plan: FloorPlan, spaces: readonly FloorSpaces[]): Issue[] {
  const floors = planFloors(plan)
  if (floors.length < 2) return []
  // A floor with no room on it (a parapet, a lone balustrade, a floor not drawn yet) is no floor
  // plate to line up: it is not compared, nor compared against.
  const withRooms = new Set(plan.rooms.map(floorOf))
  const outlines = new Map(spaces.filter((s) => withRooms.has(s.floor)).map((s) => [s.floor, s.outline] as const))
  const levels = [...new Set(floors.map(levelOf))].sort((a, b) => a - b)
  const issues: Issue[] = []
  for (let i = 0; i + 1 < levels.length; i++) {
    const below = floors.filter((f) => levelOf(f) === levels[i])
    const lower = below.flatMap((f) => asMulti(outlines.get(f.id) ?? []))
    if (lower.length === 0) continue
    let lowerUnion: MultiPolygon
    try {
      lowerUnion = lower.length === 1 ? lower : polygonClipping.union(lower[0]!, ...lower.slice(1))
    } catch {
      continue
    }
    const xs = lowerUnion.flatMap((piece) => piece[0]!.map((p) => p[0]))
    const ys = lowerUnion.flatMap((piece) => piece[0]!.map((p) => p[1]))
    const middle = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    for (const floor of floors.filter((f) => levelOf(f) === levels[i + 1])) {
      if (floor.overhang === 'meant') continue
      const upper = asMulti(outlines.get(floor.id) ?? [])
      if (upper.length === 0) continue
      const over = past(upper, lowerUnion, middle)
      const back = past(lowerUnion, upper, middle)
      if (over === null || back === null || (over.length === 0 && back.length === 0)) continue
      const said = (list: readonly Stretch[], verb: string): string => {
        const named = list.slice(0, NAMED).map((s) => `${m(s.depth)} on the ${s.side}, from ${at(s.x0, s.y0)} to ${at(s.x1, s.y1)}`)
        const more = list.length > NAMED ? `, and in ${list.length - NAMED} more ${list.length - NAMED === 1 ? 'place' : 'places'}` : ''
        return `${verb} ${named.join('; ')}${more}`
      }
      const parts = [
        over.length > 0 ? said(over, 'it reaches past it by') : null,
        back.length > 0 ? said(back, 'it sits back from it by') : null
      ].filter((p): p is string => p !== null)
      const lowerNames = below.map((f) => quoted(f.name || f.id))
      issues.push({
        entity: 'floor',
        id: floor.id,
        code: 'floor/out-of-line',
        severity: 'warning',
        message:
          `Floor ${quoted(floor.name || floor.id)} does not line up with ${lowerNames.join(' and ')} below it: ${parts.join('; and ')}. ` +
          'If that is meant, mark the floor with overhang "meant"; if not, move its outside walls over the floor below, or make a wall that both floors share rise through them (through).'
      })
    }
  }
  return issues
}
