/**
 * Floor areas with the rule each one follows, said in the answer (ARE-9).
 *
 * The figures are the library's (`planAreaFigures`): net, gross internal and gross external,
 * per floor and per use, each described in Grid's own words (`MEASURES`). This file adds what
 * the measuring tools show beside them: each room's inside size, and circulation (rooms whose
 * `use` is corridor or stair) as a share of the gross internal area.
 *
 * Rooms the caller names as outside (a balcony, a terrace) are listed apart and are not in the
 * net or the gross internal area. Rooms Grid could not draw are named, and are in no figure.
 */
import { MEASURES, type GrossMeasure, type MeasureRule, type ReaderMeasure, type RoomLeftOut } from '@ongrid/floorplan/geometry'
import { planAreaFigures } from '@ongrid/floorplan/geometry/areas'
import type { Survey } from './survey'

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
  readonly net: number
  /** Inside sizes across and up the drawing, when the room is a rectangle square to it. */
  readonly size: readonly [number, number] | null
  readonly outside: boolean
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
}

export interface AreasRequest {
  readonly outside?: ReadonlySet<string>
  readonly floors?: readonly string[]
  readonly country?: string
  readonly gross?: GrossMeasure | 'both'
}

const CIRCULATION = new Set(['corridor', 'stair'])

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

export function planAreas(survey: Survey, request: AreasRequest = {}): PlanAreas {
  const figures = planAreaFigures(survey.plan, {
    ...(request.outside ? { outside: request.outside } : {}),
    ...(request.floors ? { floors: request.floors } : {}),
    ...(request.country ? { country: request.country } : {}),
    ...(request.gross ? { gross: request.gross } : {}),
  })
  // Lab plans repeat room ids from floor to floor, so a room is found by its floor too.
  const shapes = new Map(survey.rooms.map((room) => [`${room.facts.floor}\u0000${room.facts.id}`, room.facts.shape] as const))
  const floors: FloorAreas[] = figures.floors.map((f) => ({
    floor: f.floor,
    rooms: f.rooms.map((room) => {
      const shape = shapes.get(`${room.floor}\u0000${room.id}`)
      return {
        id: room.id,
        name: room.name,
        use: room.use,
        floor: room.floor,
        net: room.area,
        size: shape?.rectangle ? [shape.across, shape.up] : null,
        outside: room.outside,
      }
    }),
    leftOut: f.leftOut,
    net: f.net,
    byUse: f.byUse,
    circulation: sum(f.rooms.filter((room) => !room.outside && CIRCULATION.has(room.use ?? '')).map((room) => room.area)),
    grossInternal: f.grossInternal,
    grossExternal: f.grossExternal,
    outsideRooms: f.outsideRooms,
    walls: f.walls,
    unclaimed: f.unclaimed ?? 0,
    why: f.why,
  }))
  const grossInternal = figures.grossInternal.area
  const circulation = sum(floors.map((f) => f.circulation))
  const unknown = [figures.grossInternal, figures.grossExternal].filter((g) => g.area === null)
  const grossWhy = unknown.length === 0 ? null : `No ${unknown.map((g) => g.rule.name.toLowerCase()).join(' or ')}: ${unknown[0]!.why}`
  return {
    floors,
    net: figures.net.area ?? 0,
    grossInternal,
    grossExternal: figures.grossExternal.area,
    circulation,
    circulationShare: grossInternal ? circulation / grossInternal : null,
    netToGross: grossInternal ? (figures.net.area ?? 0) / grossInternal : null,
    byUse: figures.byUse,
    leftOut: figures.leftOut,
    reader: figures.reader,
    grossWhy,
    measures: [MEASURES.net, MEASURES.grossInternal, MEASURES.grossExternal],
    rules: Object.values(AREA_RULES),
    notes: [...(grossWhy ? [grossWhy] : []), ...figures.notes],
  }
}
