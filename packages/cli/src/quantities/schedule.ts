/**
 * One schedule of the doors, windows and doorless openings, grouped by type and size, each
 * listed once with the two rooms it joins. Sizes are the hole in the wall: the plan holds no
 * frame, leaf or clear width.
 */
import { compareIds, partHeight, partWidth, planForFloor, roomNumbers, sideSeenFrom, statedKind, tolerance } from '@ongrid/floorplan/geometry'
import { factText, type Facts, type Opening, type OpeningKind } from '@ongrid/floorplan/types/floorplan'
import type { OpeningFacts } from '../describe/facts'
import { AREA_RULES, FLAT_RULE, planAreas } from './areas'
import { flatOfRoom, planFlatTypes, planFlats } from '@ongrid/floorplan/geometry'
import { HEIGHT_RULE, roomHeight } from './measure'
import { joinStates, type AreaState, type NumberState } from './state'
import { sideNames, type Survey } from './survey'
import { csv, sqFt } from './units'

export const SCHEDULE_RULE =
  'Sizes are the opening in the wall, width by height, in metres, with the sill above the floor. The plan holds no frames or leaves, so a clear width is not known.'

export interface ScheduleItem {
  readonly id: string
  readonly floor: string
  readonly between: readonly [string, string]
}

export interface ScheduleRow {
  readonly type: 'door' | 'window' | 'opening'
  /** CNT-14: the kind the plan states (`sliding`, `fixed`), or null; one type of each kind and size. */
  readonly kind: OpeningKind | null
  readonly width: number
  readonly height: number
  readonly sill: number
  readonly count: number
  readonly items: readonly ScheduleItem[]
}

export interface Schedule {
  readonly rows: readonly ScheduleRow[]
  readonly counts: Readonly<Record<'door' | 'window' | 'opening', number>>
  readonly rule: string
}

const ORDER = { door: 0, window: 1, opening: 2 } as const

/** CNT-14: openings that state no kind first, then by kind's word. */
const kindOrder = (a: OpeningKind | null, b: OpeningKind | null): number => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1)

export function planSchedule(
  survey: Survey,
  options: { floors?: readonly string[]; types?: readonly ('door' | 'window' | 'opening')[]; narrowerThan?: number } = {},
): Schedule {
  const groups = new Map<string, { type: ScheduleRow['type']; kind: OpeningKind | null; width: number; height: number; sill: number; items: ScheduleItem[] }>()
  const stated = new Map(survey.plan.openings.map((o) => [o.id, o] as const))
  for (const floor of survey.facts.floors) {
    if (options.floors !== undefined && !options.floors.includes(floor.id)) continue
    for (const opening of floor.openings) {
      if (options.types !== undefined && !options.types.includes(opening.type)) continue
      if (options.narrowerThan !== undefined && !(opening.width < options.narrowerThan - tolerance('noLength'))) continue
      const kind = statedKind(opening.type, stated.get(opening.id)?.kind)
      const key = [opening.type, kind ?? '', opening.width.toFixed(3), opening.height.toFixed(3), opening.sill.toFixed(3)].join('|')
      const group = groups.get(key) ?? { type: opening.type, kind, width: opening.width, height: opening.height, sill: opening.sill, items: [] }
      group.items.push({ id: opening.id, floor: floor.id, between: sideNames(opening) })
      groups.set(key, group)
    }
  }
  const rows = [...groups.values()]
    .map((group) => ({ ...group, count: group.items.length }))
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || kindOrder(a.kind, b.kind) || a.width - b.width || a.height - b.height || a.sill - b.sill)
  const counts = { door: 0, window: 0, opening: 0 }
  for (const row of rows) counts[row.type] += row.count
  return { rows, counts, rule: SCHEDULE_RULE }
}

// ---------------------------------------------------------------------------------------------
// ARE-12: the room schedule and the opening schedule, as tables.
//
// Both are data first. The tool's text, its CSV and the sheet's tables are written from the same
// rows, so no part reads another's printed text (lab AB-4, AU7-1). Rows are in one order whatever
// the order of the file: floors by level, then by id, rooms and openings by id (`compareIds`,
// QAR-5). Room numbers count up in that order; a room that states its own number (CNT-9) comes
// first on its floor, by that number, and is given it; every row carries its part's facts. The
// numbering is the library's (`roomNumbers`), so the IFC file gives every room the same number
// (HND-2).

/** A room as the room schedule lists it. */
export interface RoomScheduleRow {
  /** 1, 2, 3… across the floors, in the schedule's order. Grid's, not the plan's. */
  readonly number: number
  /** CNT-9: the number the plan states for the room, which the schedule gives in place of Grid's; null when it states none. */
  readonly roomNumber: string | null
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly floor: string
  readonly floorName: string
  /** Net, in m²; null when Grid could not draw the room, and the totals say so. */
  readonly area: number | null
  readonly state: NumberState
  /** In metres, by ARE-10's rule; null when the plan gives none. */
  readonly height: number | null
  /** CNT-9: the room's facts of the person's own, by name, as the plan gives them. */
  readonly properties: Facts
  /** CNT-4, only on a plan that lists flats: the id of the flat the room is in, or null. */
  readonly flat?: string | null
  /**
   * CNT-8, only on a room with zones: each zone, measured, by id. A zone is no row of
   * its own: its floor is in its room's area, so a column of areas adds up to the total.
   */
  readonly zones?: readonly RoomScheduleZone[]
}

/** A zone of a room in the room schedule (CNT-8). */
export interface RoomScheduleZone {
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly area: number | null
  /** CNT-9: the zone's own facts, as the plan gives them. It has no number: its room has. */
  readonly properties: Facts
}

/** A total of the room schedule: one floor's, or all floors'. */
export interface RoomScheduleTotal {
  /** Null for the total of all floors. */
  readonly floor: string | null
  readonly floorName: string | null
  readonly rooms: number
  readonly area: number
  readonly state: AreaState
}

export interface RoomSchedule {
  readonly rows: readonly RoomScheduleRow[]
  /** One per floor, in the schedule's order; each names its floor. */
  readonly floors: readonly RoomScheduleTotal[]
  /** Every floor given. */
  readonly total: RoomScheduleTotal
  readonly rules: readonly string[]
}

/** One opening, listed once, with the rooms on its two sides. */
export interface OpeningScheduleRow {
  readonly number: number
  readonly id: string
  readonly type: 'door' | 'window' | 'opening'
  readonly floor: string
  readonly floorName: string
  readonly width: number
  readonly height: number
  readonly sill: number
  /** CNT-14: its kind as the plan states it, or null (a door with none is one swinging leaf). */
  readonly kind: OpeningKind | null
  /** CNT-14: the part of it that opens, when the plan states one: width, and height (the opening's when unstated). */
  readonly opens: { readonly width: number; readonly height: number } | null
  /** CNT-14: a door's handing in rooms, `opens into "Hall", hinged on the left`, when the plan states it. */
  readonly handing: string | null
  /** A room's name, or what lies there when no room does (`outside`, `nothing drawn`, `a room left out`). */
  readonly between: readonly [string, string]
  /** CNT-9: the opening's facts of the person's own, by name, as the plan gives them. */
  readonly properties: Facts
}

export interface OpeningSchedule {
  readonly rows: readonly OpeningScheduleRow[]
  /** Each opening counted once. */
  readonly counts: Readonly<Record<'door' | 'window' | 'opening', number>>
  readonly rule: string
}

export const ROOM_SCHEDULE_RULE =
  'Rooms are listed floor by floor from the lowest: on each floor, the rooms that state a number in the plan first, by that number and given it, then the others by id, numbered by Grid. Areas are net, as grid_areas measures them; heights are as grid_measure gives them.'

/** CNT-9: the number a room schedule row is shown by: the plan's own, else Grid's. */
export function shownNumber(row: Pick<RoomScheduleRow, 'number' | 'roomNumber'>): string {
  return row.roomNumber ?? String(row.number)
}

/** CNT-9: a row's facts in words, `fire rating "EI 30", head count 12`; empty when it carries none. */
export function factsText(properties: Facts): string {
  return Object.entries(properties).map(([name, value]) => `${JSON.stringify(name)} ${typeof value === 'string' ? JSON.stringify(value) : factText(value)}`).join(', ')
}

/** A row the schedule cannot write: it is named, never left out in silence. */
export class ScheduleRowError extends Error {
  constructor(schedule: string, row: number, what: string) {
    super(`The ${schedule} cannot be written: row ${row} ${what}.`)
    this.name = 'ScheduleRowError'
  }
}

/** Floors by level, then by id: the file's order decides nothing. */
function floorOrder(survey: Survey, floors: readonly string[] | undefined): { id: string; name: string }[] {
  return survey.facts.floors
    .filter((floor) => floors === undefined || floors.includes(floor.id))
    .slice()
    .sort((a, b) => a.level - b.level || compareIds(a.id, b.id))
    .map((floor) => ({ id: floor.id, name: floor.name ?? floor.id }))
}

export function roomSchedule(survey: Survey, options: { floors?: readonly string[] } = {}): RoomSchedule {
  const order = floorOrder(survey, options.floors)
  const areas = planAreas(survey, { floors: order.map((f) => f.id) })
  const numbered = roomNumbers(survey.plan, order.map((f) => f.id))
  // CNT-4: on a plan that lists flats, each row says which flat its room is in.
  const listsFlats = (survey.plan.flats ?? []).length > 0
  const flatOf = flatOfRoom(planFlats(survey.plan))
  const rows: RoomScheduleRow[] = []
  const floors: RoomScheduleTotal[] = []
  for (const floor of order) {
    const figures = areas.floors.find((f) => f.floor === floor.id)
    if (figures === undefined) continue
    const storey = planForFloor(survey.plan, floor.id)
    const places = figures.rooms.filter((room) => room.zoneOf === undefined)
    const byId = new Map(places.map((room) => [room.id, room] as const))
    const own = new Map(storey.rooms.map((r) => [r.id, r] as const))
    // HND-2: the library's numbers, which number no zone (CNT-8), so the IFC gives the same.
    for (const { number, stated, id } of numbered.filter((n) => n.floor === floor.id)) {
      const room = byId.get(id)
      if (room === undefined) continue
      const zones = figures.rooms
        .filter((zone) => zone.zoneOf === room.id)
        .sort((a, z) => compareIds(a.id, z.id))
        .map((zone) => ({ id: zone.id, name: zone.name, use: zone.use, area: zone.net, properties: own.get(zone.id)?.properties ?? {} }))
      rows.push({
        number,
        roomNumber: stated,
        id: room.id,
        name: room.name,
        use: room.use,
        floor: floor.id,
        floorName: floor.name,
        area: room.net,
        state: room.state,
        height: roomHeight(storey, room.id).value,
        properties: own.get(id)?.properties ?? {},
        ...(listsFlats ? { flat: flatOf.get(room.id) ?? null } : {}),
        ...(zones.length === 0 ? {} : { zones }),
      })
    }
    floors.push({ floor: floor.id, floorName: floor.name, rooms: places.length, area: figures.net, state: figures.states.net })
  }
  return {
    rows,
    floors,
    total: { floor: null, floorName: null, rooms: rows.length, area: areas.net, state: areas.states.net },
    rules: [ROOM_SCHEDULE_RULE, AREA_RULES.net, HEIGHT_RULE],
  }
}

const TYPE_ORDER = { door: 0, opening: 1, window: 2 } as const

export function openingSchedule(survey: Survey, options: { floors?: readonly string[] } = {}): OpeningSchedule {
  const rows: OpeningScheduleRow[] = []
  const counts = { door: 0, window: 0, opening: 0 }
  for (const floor of floorOrder(survey, options.floors)) {
    const facts = survey.facts.floors.find((f) => f.id === floor.id)!
    const named = new Map(facts.rooms.map((room) => [room.id, room.name] as const))
    const side = (s: OpeningFacts['sides'][number]): string => (typeof s === 'object' ? named.get(s.room) ?? s.room : s)
    const stated = new Map(survey.plan.openings.map((o) => [o.id, o] as const))
    for (const opening of [...facts.openings].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || compareIds(a.id, b.id))) {
      counts[opening.type] += 1
      const own = stated.get(opening.id)
      rows.push({
        number: rows.length + 1,
        id: opening.id,
        type: opening.type,
        floor: floor.id,
        floorName: floor.name,
        width: opening.width,
        height: opening.height,
        sill: opening.sill,
        kind: statedKind(opening.type, own?.kind),
        opens: own?.opens === undefined || opening.type === 'opening' ? null : { width: partWidth(opening.width, own.opens), height: partHeight(opening.height, own.opens) },
        handing: own === undefined ? null : handingWords(own, opening.sides, side),
        between: [side(opening.sides[0]), side(opening.sides[1])],
        properties: stated.get(opening.id)?.properties ?? {},
      })
    }
  }
  return { rows, counts, rule: SCHEDULE_RULE }
}

type Cell = string | number | null

/** A number for a spreadsheet: finite, and never a negative zero (AU7-1). */
function numberCell(schedule: string, row: number, what: string, value: unknown, nullable: boolean): number | null {
  if (value === null && nullable) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ScheduleRowError(schedule, row, `has no number for its ${what}`)
  return value === 0 ? 0 : value
}

function textCell(schedule: string, row: number, what: string, value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new ScheduleRowError(schedule, row, `has no ${what}`)
  return value
}

/** CNT-9: every fact name the rows carry, in the order first met: one column each. */
function factColumns(rows: readonly { readonly properties: Facts }[]): string[] {
  const names = new Set<string>()
  for (const row of rows) for (const name of Object.keys(row.properties)) names.add(name)
  return [...names]
}

/** CNT-9: a row's facts under the fact columns; empty where it carries none. */
function factCells(properties: Facts, columns: readonly string[]): Cell[] {
  return columns.map((column) => {
    const value = properties[column]
    return value === undefined ? null : typeof value === 'number' ? value : factText(value)
  })
}

/** The room schedule as CSV: one row per room, then each floor's total and the total of all floors. */
export function roomScheduleCsv(schedule: RoomSchedule): string {
  const name = 'room schedule'
  const columns = factColumns(schedule.rows)
  // CNT-4: a flat column only on a plan that lists flats, so every other schedule is as it was.
  const flats = schedule.rows.some((r) => r.flat !== undefined)
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    const area = numberCell(name, n, 'area', r.area, r.state === 'not-looked-at')
    return [
      r.roomNumber ?? numberCell(name, n, 'number', r.number, false), textCell(name, n, 'room id', r.id), textCell(name, n, 'name', r.name), r.use,
      area, area === null ? null : sqFt(area), numberCell(name, n, 'height', r.height, true), textCell(name, n, 'floor', r.floorName), r.state,
      ...(flats ? [r.flat ?? null] : []),
      ...factCells(r.properties, columns),
    ]
  })
  const totals = [...schedule.floors, schedule.total].map((t): Cell[] => {
    const area = numberCell(name, rows.length + 1, 'total area', t.area, false)!
    return [null, '', t.floor === null ? 'Total, all floors' : `Total, ${t.floorName}`, null, area, sqFt(area), null, t.floorName ?? 'all', t.state.state, ...(flats ? [null] : []), ...columns.map(() => null)]
  })
  return csv(['number', 'room id', 'name', 'use', 'area m2', 'area sq ft', 'height m', 'floor', 'state', ...(flats ? ['flat'] : []), ...columns], [...rows, ...totals])
}

/** The opening schedule as CSV: one row per opening, each listed once. */
export function openingScheduleCsv(schedule: OpeningSchedule): string {
  const name = 'opening schedule'
  const columns = factColumns(schedule.rows)
  // CNT-14: the kind, the part that opens and the handing, each only when some opening states it,
  // so a schedule of a plan that states none is as before.
  const kinds = schedule.rows.some((r) => r.kind !== null)
  const parts = schedule.rows.some((r) => r.opens !== null)
  const handings = schedule.rows.some((r) => r.handing !== null)
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    return [
      numberCell(name, n, 'number', r.number, false), textCell(name, n, 'id', r.id), textCell(name, n, 'type', r.type),
      ...(kinds ? [r.kind] : []),
      numberCell(name, n, 'width', r.width, false), numberCell(name, n, 'height', r.height, false), numberCell(name, n, 'sill', r.sill, false),
      ...(parts ? [r.opens?.width ?? null, r.opens?.height ?? null] : []),
      ...(handings ? [r.handing] : []),
      textCell(name, n, 'floor', r.floorName), textCell(name, n, 'room on one side', r.between[0]), textCell(name, n, 'room on the other side', r.between[1]), 1,
      ...factCells(r.properties, columns),
    ]
  })
  return csv(
    ['number', 'id', 'type', ...(kinds ? ['kind'] : []), 'width m', 'height m', 'sill m', ...(parts ? ['opens width m', 'opens height m'] : []), ...(handings ? ['handing'] : []), 'floor', 'side 1', 'side 2', 'count', ...columns],
    rows,
  )
}

/**
 * CNT-14: a door's handing in rooms, as the plan states it: the room it opens into and the side it
 * is hinged on as seen from there (`sideSeenFrom`); null when it states no swing. `sides` are what
 * lies on the face the wall's normal points at, then the other.
 */
function handingWords(opening: Opening, sides: OpeningFacts['sides'], name: (side: OpeningFacts['sides'][number]) => string): string | null {
  if (opening.type !== 'door' || opening.swing === undefined) return null
  const into = opening.swing === 'left' ? sides[0] : sides[1]
  // A room by its name; past a face with no room, what lies there.
  const words = typeof into === 'object' ? `opens into ${name(into)}` : into === 'outside' ? 'opens outside' : `opens toward ${name(into)}`
  return opening.hinge === undefined ? words : `${words}, hinged on the ${sideSeenFrom(opening.swing, opening.hinge)}`
}

// ---------------------------------------------------------------------------------------------
// CNT-4: the flat schedule and the mix by type, from the plan's flats list (lab EL-1, AR-7).

/** A flat as the flat schedule lists it. */
export interface FlatScheduleRow {
  /** 1, 2, 3… in id order, whatever the order of the file. */
  readonly number: number
  readonly id: string
  readonly name: string
  /** The type it states, by id, and the type's name (its id when the plan does not state it); null with none. */
  readonly type: string | null
  readonly typeName: string | null
  readonly mirrored: boolean
  /** The floors its rooms are on, by name, in floor order: two or more for a duplex. */
  readonly floors: readonly string[]
  readonly rooms: number
  /** Its rooms used as a bedroom. */
  readonly bedrooms: number
  /** Net, in m², as grid_areas measures a flat. */
  readonly area: number
  readonly state: NumberState
}

/** One type in the mix: how many flats of it, how many mirrored, and their area. */
export interface FlatMixRow {
  /** Null for the flats that state no type. */
  readonly type: string | null
  readonly name: string
  readonly flats: number
  readonly mirrored: number
  /** The share of all flats, 0 to 1. */
  readonly share: number
  readonly area: number
  /** The area of one flat of the type, on average; null with none placed. */
  readonly each: number | null
}

export interface FlatSchedule {
  readonly rows: readonly FlatScheduleRow[]
  /** By type: the plan's flat types in their order, then any type it names but does not state, then the flats with none. */
  readonly mix: readonly FlatMixRow[]
  readonly total: { readonly flats: number; readonly area: number; readonly state: AreaState }
  /** The net area of the rooms in no flat: the common parts. */
  readonly notInFlats: number
  readonly rules: readonly string[]
}

export const FLAT_SCHEDULE_RULE =
  "Flats are the plan's own list of which rooms make each flat, never read from the rooms' names, numbered in id order. The mix counts the flats of each type the plan states, and the mirrored ones among them."

export function flatSchedule(survey: Survey, options: { floors?: readonly string[] } = {}): FlatSchedule {
  const order = floorOrder(survey, options.floors)
  const areas = planAreas(survey, { floors: order.map((f) => f.id) })
  const names = new Map(order.map((f) => [f.id, f.name] as const))
  const uses = new Map(survey.plan.rooms.map((room) => [room.id, room.use] as const))
  const rows: FlatScheduleRow[] = [...areas.flats]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((flat, i) => ({
      number: i + 1,
      id: flat.id,
      name: flat.name,
      type: flat.type,
      typeName: flat.type === null ? null : flat.typeName ?? flat.type,
      mirrored: flat.mirrored,
      floors: flat.floors.map((id) => names.get(id) ?? id),
      rooms: flat.rooms.length,
      bedrooms: flat.rooms.filter((id) => uses.get(id) === 'bedroom').length,
      area: flat.net,
      state: flat.state.state,
    }))
  const stated = planFlatTypes(survey.plan)
  const named = [...new Set(rows.map((row) => row.type).filter((type): type is string => type !== null && !stated.some((t) => t.id === type)))]
  const kinds: { type: string | null; name: string }[] = [
    ...stated.map((t) => ({ type: t.id, name: t.name })),
    ...named.map((type) => ({ type, name: type })),
    ...(rows.some((row) => row.type === null) ? [{ type: null, name: 'no type' }] : []),
  ]
  const mix = kinds.map(({ type, name }): FlatMixRow => {
    const of = rows.filter((row) => row.type === type)
    const area = of.reduce((sum, row) => sum + row.area, 0)
    return { type, name, flats: of.length, mirrored: of.filter((row) => row.mirrored).length, share: rows.length === 0 ? 0 : of.length / rows.length, area, each: of.length === 0 ? null : area / of.length }
  })
  const state = joinStates(areas.flats.map((flat) => flat.state))
  return {
    rows,
    mix,
    total: { flats: rows.length, area: rows.reduce((sum, row) => sum + row.area, 0), state },
    notInFlats: areas.notInFlats ?? areas.net,
    rules: [FLAT_SCHEDULE_RULE, FLAT_RULE],
  }
}

/** The flat schedule as CSV: one row per flat, the totals, then the mix, one row per type. */
export function flatScheduleCsv(schedule: FlatSchedule): string {
  const name = 'flat schedule'
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    return [
      'flat', numberCell(name, n, 'number', r.number, false), textCell(name, n, 'flat id', r.id), textCell(name, n, 'name', r.name), r.typeName,
      r.mirrored ? 'yes' : 'no', r.floors.join('; '), r.rooms, r.bedrooms, null, null, numberCell(name, n, 'area', r.area, false), sqFt(r.area), r.state,
    ]
  })
  rows.push(['total', null, '', 'All flats', null, null, null, null, null, schedule.total.flats, null, schedule.total.area, sqFt(schedule.total.area), schedule.total.state.state])
  rows.push(['total', null, '', 'In no flat', null, null, null, null, null, null, null, schedule.notInFlats, sqFt(schedule.notInFlats), null])
  for (const m of schedule.mix) rows.push(['mix', null, m.type ?? '', m.name, m.name, null, null, null, null, m.flats, m.mirrored, m.area, sqFt(m.area), null])
  return csv(['row', 'number', 'id', 'name', 'type', 'mirrored', 'floors', 'rooms', 'bedrooms', 'flats', 'mirrored flats', 'area m2', 'area sq ft', 'state'], rows)
}
