/**
 * Floor areas with the rule each one is measured by, said in the answer.
 *
 * - Net: each room between its wall faces, as Grid measures it everywhere (`roomArea`).
 * - Gross internal: the floor inside the inner face of the walls marked `exterior`, inner
 *   walls and partitions included, worked out by `floorSpaces` from those walls alone.
 * - Gross external: the floor inside the outer face of the walls marked `exterior`.
 * - Circulation: rooms whose `use` is corridor or stair, as a share of the gross internal area.
 *
 * Rooms the caller names as outside (a balcony, a terrace) are listed apart and are not in
 * the net or the gross internal area.
 */
import { planForFloor, type FloorPlan } from '@ongrid/floorplan/geometry'
import { floorSpaces, spacesKnown } from '@ongrid/floorplan/geometry/spaces'
import type { Survey } from './survey'
import { FIXTURE_RULES, planFixtures } from './fixtures'

export const AREA_RULES = {
  net: 'Net area is each room measured between the faces of its walls, as Grid measures it everywhere.',
  grossInternal: 'Gross internal area is the floor inside the inner face of the walls marked exterior, inner walls and partitions included.',
  grossExternal: 'Gross external area is the floor inside the outer face of the walls marked exterior.',
  circulation: 'Circulation is the rooms whose use is corridor or stair, as a share of the gross internal area.',
} as const

/** Why a plan has no gross areas, said wherever the figures would be. */
export const GROSS_NOT_KNOWN = 'No gross areas: on some floor the walls marked exterior do not close a floor.'

export interface RoomArea {
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly floor: string
  readonly net: number
  /** Inside sizes across and up the drawing, when the room is a rectangle square to it. */
  readonly size: readonly [number, number] | null
  readonly outside: boolean
  /** CNT-12, only on a room with fixtures: the floor they stand on, and the net area less it. */
  readonly fixtures?: number
  readonly free?: number
}

export interface FloorAreas {
  readonly floor: string
  readonly rooms: readonly RoomArea[]
  readonly net: number
  readonly byUse: Readonly<Record<string, number>>
  readonly circulation: number
  /** Null when the walls marked exterior close no floor. */
  readonly grossInternal: number | null
  readonly grossExternal: number | null
  readonly outsideRooms: number
  /** Enclosed floor that no room covers, on the whole floor. */
  readonly unclaimed: number
}

export interface PlanAreas {
  readonly floors: readonly FloorAreas[]
  readonly net: number
  readonly grossInternal: number | null
  readonly grossExternal: number | null
  readonly circulation: number
  /** Circulation over gross internal, 0 to 1; null without a gross internal area. */
  readonly circulationShare: number | null
  /** Net over gross internal, 0 to 1; null without a gross internal area. */
  readonly netToGross: number | null
  readonly rules: readonly string[]
  readonly notes: readonly string[]
}

const CIRCULATION = new Set(['corridor', 'stair'])

function gross(plan: FloorPlan, floor: string): { internal: number; external: number } | null {
  const storey = planForFloor(plan, floor)
  const outer = { ...storey, rooms: [], openings: [], walls: storey.walls.filter((w) => w.kind === 'exterior' && w.virtual !== true) }
  if (outer.walls.length === 0) return null
  const spaces = floorSpaces(outer, floor)
  if (!spacesKnown(spaces) || spaces.floorArea < 0.01) return null
  return { internal: spaces.floorArea, external: spaces.outlineArea }
}

function unclaimedOn(plan: FloorPlan, floor: string): number {
  const spaces = floorSpaces(planForFloor(plan, floor), floor)
  return spacesKnown(spaces) ? spaces.unclaimedArea : 0
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

export function planAreas(survey: Survey, outside: ReadonlySet<string> = new Set(), floors?: readonly string[]): PlanAreas {
  const result: FloorAreas[] = []
  const notes: string[] = []
  const { taken } = planFixtures(survey.plan, floors)
  for (const floor of survey.facts.floors) {
    if (floors !== undefined && !floors.includes(floor.id)) continue
    const rooms: RoomArea[] = floor.rooms.map((room) => {
      const net = room.shape?.area ?? 0
      const fixtures = taken.get(room.id)
      return {
        id: room.id,
        name: room.name,
        use: room.use ?? null,
        floor: floor.id,
        net,
        size: room.shape?.rectangle ? [room.shape.across, room.shape.up] : null,
        outside: outside.has(room.id),
        // Fixtures add no area and take none from the totals: only the room's free floor (CNT-12).
        ...(fixtures === undefined ? {} : { fixtures, free: Math.max(0, net - fixtures) }),
      }
    })
    const inside = rooms.filter((room) => !room.outside)
    const byUse: Record<string, number> = {}
    for (const room of inside) byUse[room.use ?? 'not said'] = (byUse[room.use ?? 'not said'] ?? 0) + room.net
    const outsideRooms = sum(rooms.filter((room) => room.outside).map((room) => room.net))
    const g = gross(survey.plan, floor.id)
    result.push({
      floor: floor.id,
      rooms,
      net: sum(inside.map((room) => room.net)),
      byUse,
      circulation: sum(inside.filter((room) => CIRCULATION.has(room.use ?? '')).map((room) => room.net)),
      grossInternal: g === null ? null : Math.max(0, g.internal - outsideRooms),
      grossExternal: g === null ? null : g.external,
      outsideRooms,
      unclaimed: unclaimedOn(survey.plan, floor.id),
    })
    if (floor.leftOut.length > 0) notes.push(`Floor ${JSON.stringify(floor.id)}: ${floor.leftOut.length} part(s) can't be measured and are left out; grid_check says why.`)
  }
  const net = sum(result.map((f) => f.net))
  const known = result.every((f) => f.grossInternal !== null)
  const grossInternal = known ? sum(result.map((f) => f.grossInternal!)) : null
  const grossExternal = known ? sum(result.map((f) => f.grossExternal!)) : null
  const circulation = sum(result.map((f) => f.circulation))
  if (!known) notes.push(GROSS_NOT_KNOWN)
  const unclaimed = sum(result.map((f) => f.unclaimed))
  if (unclaimed >= 0.01) notes.push(`${unclaimed.toFixed(2)} m² of floor inside the walls belongs to no room; it is in the gross figures only.`)
  if (result.some((f) => f.outsideRooms > 0)) notes.push('Rooms named as outside are listed apart: they are in no net or gross internal figure.')
  return {
    floors: result,
    net,
    grossInternal,
    grossExternal,
    circulation,
    circulationShare: grossInternal ? circulation / grossInternal : null,
    netToGross: grossInternal ? net / grossInternal : null,
    rules: taken.size === 0 ? Object.values(AREA_RULES) : [...Object.values(AREA_RULES), FIXTURE_RULES.free],
    notes,
  }
}
