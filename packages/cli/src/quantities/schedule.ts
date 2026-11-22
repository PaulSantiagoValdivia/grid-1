/**
 * One schedule of the doors, windows and doorless openings, grouped by type and size, each
 * listed once with the two rooms it joins. Sizes are the hole in the wall: the plan holds no
 * frame, leaf or clear width.
 */
import { compareIds, planForFloor, roomNumbers, tolerance } from '@ongrid/floorplan/geometry'
import type { OpeningFacts } from '../describe/facts'
import { AREA_RULES, planAreas } from './areas'
import { HEIGHT_RULE, roomHeight } from './measure'
import type { AreaState, NumberState } from './state'
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

export function planSchedule(
  survey: Survey,
  options: { floors?: readonly string[]; types?: readonly ('door' | 'window' | 'opening')[]; narrowerThan?: number } = {},
): Schedule {
  const groups = new Map<string, { type: ScheduleRow['type']; width: number; height: number; sill: number; items: ScheduleItem[] }>()
  for (const floor of survey.facts.floors) {
    if (options.floors !== undefined && !options.floors.includes(floor.id)) continue
    for (const opening of floor.openings) {
      if (options.types !== undefined && !options.types.includes(opening.type)) continue
      if (options.narrowerThan !== undefined && !(opening.width < options.narrowerThan - tolerance('noLength'))) continue
      const key = [opening.type, opening.width.toFixed(3), opening.height.toFixed(3), opening.sill.toFixed(3)].join('|')
      const group = groups.get(key) ?? { type: opening.type, width: opening.width, height: opening.height, sill: opening.sill, items: [] }
      group.items.push({ id: opening.id, floor: floor.id, between: sideNames(opening) })
      groups.set(key, group)
    }
  }
  const rows = [...groups.values()]
    .map((group) => ({ ...group, count: group.items.length }))
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.width - b.width || a.height - b.height || a.sill - b.sill)
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
// QAR-5). Room numbers count up in that order; the plan file holds none. The numbering is the
// library's (`roomNumbers`), so the IFC file gives every room the same number (HND-2).

/** A room as the room schedule lists it. */
export interface RoomScheduleRow {
  /** 1, 2, 3… across the floors, in the schedule's order. Grid's, not the plan's. */
  readonly number: number
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
  /** A room's name, or what lies there when no room does (`outside`, `nothing drawn`, `a room left out`). */
  readonly between: readonly [string, string]
}

export interface OpeningSchedule {
  readonly rows: readonly OpeningScheduleRow[]
  /** Each opening counted once. */
  readonly counts: Readonly<Record<'door' | 'window' | 'opening', number>>
  readonly rule: string
}

export const ROOM_SCHEDULE_RULE =
  'Rooms are numbered by Grid, floor by floor from the lowest, then by id; the plan holds no room numbers. Areas are net, as grid_areas measures them; heights are as grid_measure gives them.'

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
  const rows: RoomScheduleRow[] = []
  const floors: RoomScheduleTotal[] = []
  for (const floor of order) {
    const figures = areas.floors.find((f) => f.floor === floor.id)
    if (figures === undefined) continue
    const storey = planForFloor(survey.plan, floor.id)
    const byId = new Map(figures.rooms.map((room) => [room.id, room] as const))
    for (const { number, id } of numbered.filter((n) => n.floor === floor.id)) {
      const room = byId.get(id)
      if (room === undefined) continue
      rows.push({
        number,
        id: room.id,
        name: room.name,
        use: room.use,
        floor: floor.id,
        floorName: floor.name,
        area: room.net,
        state: room.state,
        height: roomHeight(storey, room.id).value,
      })
    }
    floors.push({ floor: floor.id, floorName: floor.name, rooms: figures.rooms.length, area: figures.net, state: figures.states.net })
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
    for (const opening of [...facts.openings].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || compareIds(a.id, b.id))) {
      counts[opening.type] += 1
      rows.push({
        number: rows.length + 1,
        id: opening.id,
        type: opening.type,
        floor: floor.id,
        floorName: floor.name,
        width: opening.width,
        height: opening.height,
        sill: opening.sill,
        between: [side(opening.sides[0]), side(opening.sides[1])],
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

/** The room schedule as CSV: one row per room, then each floor's total and the total of all floors. */
export function roomScheduleCsv(schedule: RoomSchedule): string {
  const name = 'room schedule'
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    const area = numberCell(name, n, 'area', r.area, r.state === 'not-looked-at')
    return [
      numberCell(name, n, 'number', r.number, false), textCell(name, n, 'room id', r.id), textCell(name, n, 'name', r.name), r.use,
      area, area === null ? null : sqFt(area), numberCell(name, n, 'height', r.height, true), textCell(name, n, 'floor', r.floorName), r.state,
    ]
  })
  const totals = [...schedule.floors, schedule.total].map((t): Cell[] => {
    const area = numberCell(name, rows.length + 1, 'total area', t.area, false)!
    return [null, '', t.floor === null ? 'Total, all floors' : `Total, ${t.floorName}`, null, area, sqFt(area), null, t.floorName ?? 'all', t.state.state]
  })
  return csv(['number', 'room id', 'name', 'use', 'area m2', 'area sq ft', 'height m', 'floor', 'state'], [...rows, ...totals])
}

/** The opening schedule as CSV: one row per opening, each listed once. */
export function openingScheduleCsv(schedule: OpeningSchedule): string {
  const name = 'opening schedule'
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    return [
      numberCell(name, n, 'number', r.number, false), textCell(name, n, 'id', r.id), textCell(name, n, 'type', r.type),
      numberCell(name, n, 'width', r.width, false), numberCell(name, n, 'height', r.height, false), numberCell(name, n, 'sill', r.sill, false),
      textCell(name, n, 'floor', r.floorName), textCell(name, n, 'room on one side', r.between[0]), textCell(name, n, 'room on the other side', r.between[1]), 1,
    ]
  })
  return csv(['number', 'id', 'type', 'width m', 'height m', 'sill m', 'floor', 'side 1', 'side 2', 'count'], rows)
}
