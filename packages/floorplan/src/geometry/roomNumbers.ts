/**
 * Room numbers (ARE-12): Grid's, not the plan's. The plan format holds none, so a room's number
 * is worked out every time, in one order whatever the order of the file: floors by level, then by
 * id, and on each floor the rooms by id (`compareIds`, QAR-5), numbered 1, 2, 3… across the
 * floors. The room schedule (`grid_schedule`) and the IFC file (HND-2) both read them here, so
 * they give the same numbers. A zone of a room (CNT-8) has no number: it is no row of the
 * schedule and no space of the IFC, so a room with zones numbers the rooms as the room without.
 *
 * Pure: a plan in, numbers out.
 */

import { indexPlan, type FloorPlan } from './plan'
import { floorOf, planFloors, planForFloor } from './floors'
import { compareIds } from './order'
import { roomZones } from './zones'

export interface RoomNumber {
  /** 1, 2, 3… across the floors given. */
  readonly number: number
  readonly floor: string
  readonly id: string
}

/**
 * Every room of the plan with its number, in numbering order. A room id used twice on one floor
 * (a fault validation reports) gets one number. With `floors`, only those floors are numbered,
 * from 1.
 */
export function roomNumbers(plan: FloorPlan, floors?: readonly string[]): RoomNumber[] {
  const order = planFloors(plan)
    .filter((floor) => floors === undefined || floors.includes(floor.id))
    .sort((a, b) => a.level - b.level || compareIds(a.id, b.id))
  const out: RoomNumber[] = []
  for (const floor of order) {
    // Zones are worked out on the floor's own plan, as the areas and the IFC find them.
    const zoneOf = plan.rooms.some((room) => room.partOf !== undefined) ? roomZones(indexPlan(planForFloor(plan, floor.id))).zoneOf : null
    const ids = [...new Set(plan.rooms.filter((room) => floorOf(room) === floor.id && zoneOf?.has(room.id) !== true).map((room) => room.id))].sort(compareIds)
    for (const id of ids) out.push({ number: out.length + 1, floor: floor.id, id })
  }
  return out
}
