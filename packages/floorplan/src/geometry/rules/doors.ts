/**
 * Doors that join other rooms after an edit (MSG-14, lab WR-3).
 *
 * Which rooms a door joins is read from where it stands, as the route check reads it
 * (`openingSides`): never from the wall it names or the rooms that list that wall. So a wall
 * moved 1 m that leaves the living-room door opening from the hall into the kitchen is caught,
 * though the door, its wall and every wall list are as they were. A door is followed from one
 * version to the next by its id.
 */

import type { FloorPlan, Opening } from '../plan'
import { indexPlan } from '../plan'
import { floorOf, planFloors, planForFloor } from '../floors'
import { drawable } from './check'
import { openingSides, outsideTest, roomOutlines } from './graph'
import { quoted } from '../../types/planText'

/** What lies on one side of a door: a room by id, the outside, or floor nobody drew. */
export type DoorFace = { readonly room: string } | { readonly outside: true } | { readonly undrawn: true }

export interface DoorRoomsChange {
  readonly opening: string
  readonly floor: string
  /** The two sides before and after, in a stable order: rooms by id, then the outside, then floor not drawn. */
  readonly before: readonly [DoorFace, DoorFace]
  readonly after: readonly [DoorFace, DoorFace]
  /** `"door-living" joined "hall" and "living"; it now joins "hall" and "kitchen"` */
  readonly message: string
}

const sideName = (side: DoorFace): string =>
  'room' in side ? quoted(side.room) : 'outside' in side ? 'the outside' : 'a space that is not drawn'

const sideKey = (side: DoorFace): string => ('room' in side ? `0${side.room}` : 'outside' in side ? '1' : '2')

/** What each door and doorless opening of the plan joins, by id. Windows join nothing. */
function doorSides(plan: FloorPlan): Map<string, { floor: string; sides: [DoorFace, DoorFace] }> {
  const found = new Map<string, { floor: string; sides: [DoorFace, DoorFace] }>()
  for (const floor of planFloors(plan)) {
    const { storey, leftOut } = drawable(planForFloor(plan, floor.id))
    const index = indexPlan(storey)
    const outlines = roomOutlines(storey, index, leftOut.rooms)
    const outside = outsideTest(storey, index)
    for (const opening of storey.openings) {
      if (opening.type === 'window') continue
      const wall = index.wallsById.get(opening.wall)
      if (wall === undefined) continue
      const along = opening.offset + opening.width / 2
      const [left, right] = openingSides(opening, index, outlines)
      // With a room on neither side, a wall's stated kind cannot say which side is the outside.
      const asStated = left !== null || right !== null
      const side = (room: string | null, face: 'left' | 'right'): DoorFace =>
        room !== null ? { room } : outside(wall, along, face, asStated) ? { outside: true } : { undrawn: true }
      const sides = [side(left, 'left'), side(right, 'right')].sort((a, b) => (sideKey(a) < sideKey(b) ? -1 : sideKey(a) > sideKey(b) ? 1 : 0))
      found.set(opening.id, { floor: floorOf(wall), sides: sides as [DoorFace, DoorFace] })
    }
  }
  return found
}

const joins = (sides: readonly [DoorFace, DoorFace]): string => `${sideName(sides[0])} and ${sideName(sides[1])}`

/**
 * The doors and doorless openings in both versions of a plan that join other rooms in the later
 * one, in the order of the later plan. A door added, removed, turned into a window, or on a wall
 * that cannot be drawn in either version is not compared.
 */
export function doorsThatChangedRooms(earlier: FloorPlan, later: FloorPlan): DoorRoomsChange[] {
  const before = doorSides(earlier)
  const after = doorSides(later)
  const changes: DoorRoomsChange[] = []
  const seen = new Set<string>()
  for (const opening of later.openings as Opening[]) {
    if (seen.has(opening.id)) continue
    seen.add(opening.id)
    const was = before.get(opening.id)
    const is = after.get(opening.id)
    if (was === undefined || is === undefined) continue
    if (was.sides.map(sideKey).join('|') === is.sides.map(sideKey).join('|')) continue
    changes.push({
      opening: opening.id,
      floor: is.floor,
      before: was.sides,
      after: is.sides,
      message: `${quoted(opening.id)} joined ${joins(was.sides)}; it now joins ${joins(is.sides)}`
    })
  }
  return changes
}
