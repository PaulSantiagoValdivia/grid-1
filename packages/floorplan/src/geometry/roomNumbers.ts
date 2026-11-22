/**
 * Room numbers (ARE-12, CNT-9): Grid's count, and the number a room states. A room's count is
 * worked out every time, in one order whatever the order of the file: floors by level, then by
 * id, and on each floor the rooms that state a number (`Room.number`, CNT-9) first, by that
 * number, then the others by id (`compareIds`, QAR-5), counted 1, 2, 3… across the floors. A
 * room is shown by the number it states, else by Grid's count (`shownRoomNumber`). The room
 * schedule (`grid_schedule`) and the IFC file (HND-2) both read them here, so they give the same
 * numbers. A zone of a room (CNT-8) has no number, counted or stated: it is no row of the
 * schedule and no space of the IFC, so a room with zones numbers the rooms as the room without.
 * A number a zone states stays in the plan, unread, and is its again if it stops being a zone.
 *
 * Pure: a plan in, numbers out.
 */

import { planInState } from './phases'
import { indexPlan, type FloorPlan } from './plan'
import { floorOf, planFloors, planForFloor } from './floors'
import { compareIds } from './order'
import { roomZones } from './zones'

export interface RoomNumber {
  /** 1, 2, 3… across the floors given. Grid's count. */
  readonly number: number
  /** CNT-9: the number the plan states for the room; null when it states none. */
  readonly stated: string | null
  readonly floor: string
  readonly id: string
}

/** CNT-9: the number a room is shown by: the one it states, else Grid's count. */
export function shownRoomNumber(n: Pick<RoomNumber, 'number' | 'stated'>): string {
  return n.stated ?? String(n.number)
}

/**
 * Every room of the plan with its number, in numbering order. A room id used twice on one floor
 * (a fault validation reports) gets one number, and the first of them states it. With `floors`,
 * only those floors are numbered, from 1.
 */
export function roomNumbers(stated: FloorPlan, floors?: readonly string[]): RoomNumber[] {
  // CNT-10: the rooms after the work are counted; a room to be demolished has no number.
  const plan = planInState(stated, 'after')
  const order = planFloors(plan)
    .filter((floor) => floors === undefined || floors.includes(floor.id))
    .sort((a, b) => a.level - b.level || compareIds(a.id, b.id))
  const out: RoomNumber[] = []
  for (const floor of order) {
    // Zones are worked out on the floor's own plan, as the areas and the IFC find them.
    const zoneOf = plan.rooms.some((room) => room.partOf !== undefined) ? roomZones(indexPlan(planForFloor(plan, floor.id))).zoneOf : null
    const stated = new Map<string, string | null>()
    for (const room of plan.rooms) {
      if (floorOf(room) !== floor.id || stated.has(room.id) || zoneOf?.has(room.id) === true) continue
      stated.set(room.id, room.number ?? null)
    }
    const ids = [...stated.keys()].sort((a, b) => {
      const [x, y] = [stated.get(a) ?? null, stated.get(b) ?? null]
      if (x !== null && y !== null) return compareIds(x, y) || compareIds(a, b)
      if (x !== null || y !== null) return x !== null ? -1 : 1
      return compareIds(a, b)
    })
    for (const id of ids) out.push({ number: out.length + 1, stated: stated.get(id) ?? null, floor: floor.id, id })
  }
  return out
}
