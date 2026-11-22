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
import { joinStates, lessRooms, NOT_LOOKED_AT, roomDoubts, roomState, sumState, type AreaState, type NumberState } from './state'

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
  /** Null when the room cannot be drawn, so has no area (MSG-2): it is named as left out of every total. */
  readonly net: number | null
  /** MSG-2: proven, not proven (the drawing questions its outline) or not looked at (not measured). */
  readonly state: NumberState
  /** The drawing problems that question its outline, by code. Empty when there are none. */
  readonly doubts: readonly string[]
  /** Inside sizes across and up the drawing, when the room is a rectangle square to it. */
  readonly size: readonly [number, number] | null
  readonly outside: boolean
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
  /** MSG-2: the state of each figure, and the rooms it left out or holds in doubt. */
  readonly states: {
    readonly net: AreaState
    readonly byUse: Readonly<Record<string, AreaState>>
    readonly circulation: AreaState
    readonly grossInternal: AreaState
    readonly grossExternal: AreaState
  }
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
  /** MSG-2: the state of each total, and the rooms it left out or holds in doubt. */
  readonly states: {
    readonly net: AreaState
    readonly circulation: AreaState
    readonly grossInternal: AreaState
    readonly grossExternal: AreaState
    readonly circulationShare: AreaState
    readonly netToGross: AreaState
  }
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
  const shown = survey.facts.floors.filter((floor) => floors === undefined || floors.includes(floor.id))
  const doubts = roomDoubts(survey.plan, shown.map((floor) => floor.id))
  for (const floor of shown) {
    const rooms: RoomArea[] = floor.rooms.map((room) => {
      const net = room.shape?.area ?? null
      const doubted = doubts.get(floor.id)?.get(room.id) ?? []
      return {
        id: room.id,
        name: room.name,
        use: room.use ?? null,
        floor: floor.id,
        net,
        state: roomState(net, doubted),
        doubts: doubted,
        size: room.shape?.rectangle ? [room.shape.across, room.shape.up] : null,
        outside: outside.has(room.id),
      }
    })
    const area = (list: readonly RoomArea[]): number => sum(list.map((room) => room.net ?? 0))
    const inside = rooms.filter((room) => !room.outside)
    const byUse: Record<string, number> = {}
    const byUseState: Record<string, AreaState> = {}
    for (const use of [...new Set(inside.map((room) => room.use ?? 'not said'))]) {
      const ofUse = inside.filter((room) => (room.use ?? 'not said') === use)
      byUse[use] = area(ofUse)
      byUseState[use] = sumState(ofUse)
    }
    const outsideList = rooms.filter((room) => room.outside)
    const outsideRooms = area(outsideList)
    const circulating = inside.filter((room) => CIRCULATION.has(room.use ?? ''))
    const g = gross(survey.plan, floor.id)
    // Gross areas come from the walls marked exterior; gross internal takes off the outside rooms.
    result.push({
      floor: floor.id,
      rooms,
      net: area(inside),
      byUse,
      circulation: area(circulating),
      grossInternal: g === null ? null : Math.max(0, g.internal - outsideRooms),
      grossExternal: g === null ? null : g.external,
      outsideRooms,
      unclaimed: unclaimedOn(survey.plan, floor.id),
      states: {
        net: sumState(inside),
        byUse: byUseState,
        circulation: sumState(circulating),
        grossInternal: g === null ? NOT_LOOKED_AT : lessRooms(outsideList),
        grossExternal: g === null ? NOT_LOOKED_AT : lessRooms([]),
      },
    })
    if (floor.leftOut.length > 0) notes.push(`Floor ${JSON.stringify(floor.id)}: ${floor.leftOut.length} part(s) can't be measured and are left out; grid_check says why.`)
  }
  const net = sum(result.map((f) => f.net))
  const known = result.every((f) => f.grossInternal !== null)
  const grossInternal = known ? sum(result.map((f) => f.grossInternal!)) : null
  const grossExternal = known ? sum(result.map((f) => f.grossExternal!)) : null
  const circulation = sum(result.map((f) => f.circulation))
  if (!known) notes.push(GROSS_NOT_KNOWN)
  const netState = joinStates(result.map((f) => f.states.net))
  // AC-9: a room that cannot be measured is named, so a total short by its area is read as such.
  if (netState.leftOut.length > 0) {
    const several = survey.facts.floors.length > 1
    const named = netState.leftOut.map((room) => `${JSON.stringify(room.name)}${several ? ` on ${JSON.stringify(room.floor)}` : ''}`).join(', ')
    notes.push(`Every total here leaves out ${netState.leftOut.length === 1 ? 'a room' : `${netState.leftOut.length} rooms`} that could not be measured, and is short by ${netState.leftOut.length === 1 ? 'its' : 'their'} area: ${named}.`)
  }
  const grossInternalState = known ? joinStates(result.map((f) => f.states.grossInternal)) : NOT_LOOKED_AT
  const grossExternalState = known ? joinStates(result.map((f) => f.states.grossExternal)) : NOT_LOOKED_AT
  const circulationState = joinStates(result.map((f) => f.states.circulation))
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
    rules: Object.values(AREA_RULES),
    notes,
    states: {
      net: netState,
      circulation: circulationState,
      grossInternal: grossInternalState,
      grossExternal: grossExternalState,
      circulationShare: grossInternal ? joinStates([circulationState, grossInternalState]) : NOT_LOOKED_AT,
      netToGross: grossInternal ? joinStates([netState, grossInternalState]) : NOT_LOOKED_AT,
    },
  }
}
