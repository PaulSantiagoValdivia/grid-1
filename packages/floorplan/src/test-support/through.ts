/**
 * LVL-5 (lab VE-9, H-10): the lab's house with a stair window from 0.9 to 5.4 m (hx3), as the lab
 * wrote it and as LVL-5 lets it be written, for tests in every package.
 */
import { parseFloorPlan, type FloorPlan } from '../types/floorplan'
import { labPlan } from './lab'

/** The lab's hx3 as written: two floors stacked wall by wall, the tall stair window on the ground floor's north wall. */
export const stairWindowAsWritten = (): FloorPlan => labPlan('H/scenarios/hx3-window-through-two-storeys.json')

/**
 * The same house with its north wall written once, through both floors: the ground floor's `g-n`
 * rises through `first`, the first floor's own `f-n` is gone, the first floor's rooms list `g-n` in
 * its place, and the first floor's north window `f-w-n` is in `g-n`, its sill measured from the
 * ground floor's level (the first floor stands at 2.95 m). Nothing else changes.
 */
export function stairWindowThrough(): FloorPlan {
  const raw = JSON.parse(JSON.stringify(stairWindowAsWritten())) as FloorPlan
  return parseFloorPlan({
    ...raw,
    walls: raw.walls.filter((w) => w.id !== 'f-n').map((w) => (w.id === 'g-n' ? { ...w, through: 'first' } : w)),
    rooms: raw.rooms.map((r) => ({ ...r, boundary: r.boundary.map((id) => (id === 'f-n' ? 'g-n' : id)) })),
    openings: raw.openings.map((o) => (o.wall === 'f-n' ? { ...o, wall: 'g-n', sill: o.sill + 2.95 } : o))
  })
}

/** Across the north wall at the stair window (x 0.3 to 1.0), looking west. */
export const ACROSS_STAIR_WINDOW = { from: { x: 0.65, y: 4 }, to: { x: 0.65, y: 7 }, toward: 'left' } as const
