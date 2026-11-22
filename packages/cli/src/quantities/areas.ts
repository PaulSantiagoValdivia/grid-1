/**
 * Floor areas with the rule each one follows, said in the answer (ARE-9), and the state of each
 * (MSG-2).
 *
 * The figures are the library's (`planAreaFigures`): net, gross internal and gross external,
 * per floor and per use, each described in Grid's own words (`MEASURES`). This file adds what
 * the measuring tools show beside them: each room's inside size, the floor its fixtures leave
 * free (CNT-12), circulation (rooms whose `use` is corridor or stair) as a share of the gross
 * internal area, and the state of every figure (`state.ts`).
 *
 * Rooms the caller names as outside (a balcony, a terrace) are listed apart and are not in the
 * net or the gross internal area. Rooms Grid could not draw are listed with no area, named, and
 * are in no figure.
 */
import { MEASURES, type GrossMeasure, type MeasureRule, type ReaderMeasure, type RoomLeftOut } from '@ongrid/floorplan/geometry'
import { planAreaFigures } from '@ongrid/floorplan/geometry/areas'
import type { Survey } from './survey'
import { FIXTURE_RULES, planFixtures } from './fixtures'
import { joinStates, lessRooms, NOT_LOOKED_AT, roomDoubts, roomState, sumState, type AreaState, type NumberState } from './state'

/** What each measure measures, in one sentence each. */
export const AREA_RULES = {
  net: MEASURES.net.measures,
  grossInternal: MEASURES.grossInternal.measures,
  grossExternal: MEASURES.grossExternal.measures,
  circulation: 'Circulation is the rooms whose use is corridor or stair, as a share of the gross internal area.',
} as const

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
  /** CNT-12, only on a room with fixtures: the floor they stand on, and the net area less it. */
  readonly fixtures?: number
  readonly free?: number
}

export interface FloorAreas {
  readonly floor: string
  readonly rooms: readonly RoomArea[]
  /** Rooms on this floor Grid could not draw: in no figure. */
  readonly leftOut: readonly RoomLeftOut[]
  readonly net: number
  readonly byUse: Readonly<Record<string, number>>
  readonly circulation: number
  /** Null when it cannot be worked out on this floor (`why`). */
  readonly grossInternal: number | null
  readonly grossExternal: number | null
  readonly outsideRooms: number
  /** Every solid wall; null with the gross figures. */
  readonly walls: number | null
  /** Enclosed floor that no room covers, on the whole floor. */
  readonly unclaimed: number
  readonly why: string | null
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
  readonly byUse: Readonly<Record<string, number>>
  readonly leftOut: readonly RoomLeftOut[]
  /** Which gross measure to give first, and why. */
  readonly reader: ReaderMeasure
  /** Why a gross figure is not known, in a sentence; null when both are. */
  readonly grossWhy: string | null
  /** The three measures, each with what it measures, does not take off and cannot say. */
  readonly measures: readonly MeasureRule[]
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

export interface AreasRequest {
  readonly outside?: ReadonlySet<string>
  readonly floors?: readonly string[]
  readonly country?: string
  readonly gross?: GrossMeasure | 'both'
}

const CIRCULATION = new Set(['corridor', 'stair'])

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

const NOT_SAID = 'not said'
const key = (floor: string, id: string): string => `${floor}\u0000${id}`

export function planAreas(survey: Survey, request: AreasRequest = {}): PlanAreas {
  const outside = request.outside ?? new Set<string>()
  const figures = planAreaFigures(survey.plan, {
    outside,
    ...(request.floors ? { floors: request.floors } : {}),
    ...(request.country ? { country: request.country } : {}),
    ...(request.gross ? { gross: request.gross } : {}),
  })
  const { taken } = planFixtures(survey.plan, request.floors)
  const doubts = roomDoubts(survey.plan, figures.floors.map((f) => f.floor))
  // Lab plans repeat room ids from floor to floor, so a room is found by its floor too.
  const shapes = new Map(survey.rooms.map((room) => [key(room.facts.floor, room.facts.id), room.facts.shape] as const))

  const floors: FloorAreas[] = figures.floors.map((f) => {
    const counted = new Map(f.rooms.map((room) => [room.id, room] as const))
    const unmeasured = new Map(f.leftOut.map((room) => [room.id, room] as const))
    // Every room on the floor, in plan order: one Grid could not draw is listed with no area.
    const ids = [...new Set(survey.plan.rooms.map((room) => room.id).filter((id) => counted.has(id) || unmeasured.has(id)))]
    const uses = new Map(survey.plan.rooms.filter((room) => counted.has(room.id) || unmeasured.has(room.id)).map((room) => [room.id, room.use ?? null] as const))
    const rooms: RoomArea[] = ids.map((id) => {
      const figure = counted.get(id)
      const net = figure?.area ?? null
      const doubted = doubts.get(f.floor)?.get(id) ?? []
      const shape = shapes.get(key(f.floor, id))
      const fixtures = taken.get(id)
      return {
        id,
        name: figure?.name ?? unmeasured.get(id)!.name,
        use: figure?.use ?? uses.get(id) ?? null,
        floor: f.floor,
        net,
        state: roomState(net, doubted),
        doubts: doubted,
        size: shape?.rectangle ? [shape.across, shape.up] : null,
        outside: outside.has(id),
        // Fixtures add no area and take none from the totals: only the room's free floor (CNT-12).
        // A room that could not be measured has no free floor either (MSG-2).
        ...(fixtures === undefined ? {} : { fixtures, ...(net === null ? {} : { free: Math.max(0, net - fixtures) }) }),
      }
    })
    const inside = rooms.filter((room) => !room.outside)
    const byUseState: Record<string, AreaState> = {}
    for (const use of [...new Set(inside.map((room) => room.use ?? NOT_SAID))]) byUseState[use] = sumState(inside.filter((room) => (room.use ?? NOT_SAID) === use))
    const circulating = inside.filter((room) => CIRCULATION.has(room.use ?? ''))
    return {
      floor: f.floor,
      rooms,
      leftOut: f.leftOut,
      net: f.net,
      byUse: f.byUse,
      circulation: sum(circulating.map((room) => room.net ?? 0)),
      grossInternal: f.grossInternal,
      grossExternal: f.grossExternal,
      outsideRooms: f.outsideRooms,
      walls: f.walls,
      unclaimed: f.unclaimed ?? 0,
      why: f.why,
      states: {
        net: sumState(inside),
        byUse: byUseState,
        circulation: sumState(circulating),
        // Gross areas come from the walls; gross internal takes off the outside rooms.
        grossInternal: f.grossInternal === null ? NOT_LOOKED_AT : lessRooms(rooms.filter((room) => room.outside)),
        grossExternal: f.grossExternal === null ? NOT_LOOKED_AT : lessRooms([]),
      },
    }
  })

  const grossInternal = figures.grossInternal.area
  const net = figures.net.area ?? 0
  const circulation = sum(floors.map((f) => f.circulation))
  const unknown = [figures.grossInternal, figures.grossExternal].filter((g) => g.area === null)
  const grossWhy = unknown.length === 0 ? null : `No ${unknown.map((g) => g.rule.name.toLowerCase()).join(' or ')}: ${unknown[0]!.why}`
  const netState = joinStates(floors.map((f) => f.states.net))
  const notes: string[] = grossWhy ? [grossWhy] : []
  // AC-9: a room that cannot be measured is named, so a total short by its area is read as such.
  if (netState.leftOut.length > 0) {
    const several = survey.facts.floors.length > 1
    const named = netState.leftOut.map((room) => `${JSON.stringify(room.name)}${several ? ` on ${JSON.stringify(room.floor)}` : ''}`).join(', ')
    notes.push(`Every total here leaves out ${netState.leftOut.length === 1 ? 'a room' : `${netState.leftOut.length} rooms`} that could not be measured, and is short by ${netState.leftOut.length === 1 ? 'its' : 'their'} area: ${named}.`)
  }
  // The library's own note on rooms left out says the same, so it is not said twice.
  notes.push(...figures.notes.filter((note) => !note.startsWith('Left out of every figure')))
  const grossInternalState = grossInternal === null ? NOT_LOOKED_AT : joinStates(floors.map((f) => f.states.grossInternal))
  const grossExternalState = figures.grossExternal.area === null ? NOT_LOOKED_AT : joinStates(floors.map((f) => f.states.grossExternal))
  const circulationState = joinStates(floors.map((f) => f.states.circulation))
  return {
    floors,
    net,
    grossInternal,
    grossExternal: figures.grossExternal.area,
    circulation,
    circulationShare: grossInternal ? circulation / grossInternal : null,
    netToGross: grossInternal ? net / grossInternal : null,
    byUse: figures.byUse,
    leftOut: figures.leftOut,
    reader: figures.reader,
    grossWhy,
    measures: [MEASURES.net, MEASURES.grossInternal, MEASURES.grossExternal],
    rules: taken.size === 0 ? Object.values(AREA_RULES) : [...Object.values(AREA_RULES), FIXTURE_RULES.free],
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
