/**
 * Room numbers (ARE-12, CNT-9): Grid's count, and the number a room states. A room's count is
 * worked out every time, in one order whatever the order of the file: floors by level, then by
 * id, and on each floor the rooms that state a number (`Room.number`, CNT-9) first, by that
 * number, then the others by id (`compareIds`, QAR-5), counted 1, 2, 3… across the floors. A
 * room is shown by the number it states, else by Grid's count (`shownRoomNumber`). The room
 * schedule (`grid_schedule`) and the IFC file (HND-2) both read them here, so they give the same
 * numbers.
 *
 * Pure: a plan in, numbers out.
 */

import type { FloorPlan } from './plan'
import { floorOf, planFloors } from './floors'
import { compareIds } from './order'

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
export function roomNumbers(plan: FloorPlan, floors?: readonly string[]): RoomNumber[] {
  const order = planFloors(plan)
    .filter((floor) => floors === undefined || floors.includes(floor.id))
    .sort((a, b) => a.level - b.level || compareIds(a.id, b.id))
  const out: RoomNumber[] = []
  for (const floor of order) {
    const stated = new Map<string, string | null>()
    for (const room of plan.rooms) {
      if (floorOf(room) !== floor.id || stated.has(room.id)) continue
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
