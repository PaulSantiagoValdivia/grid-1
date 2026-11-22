/**
 * HND-9: who sits where, kept apart from the plan.
 *
 * A plan travels: into every export (IFC, DXF, OBJ, GLB), into the sheet, to whoever is handed
 * the plan file. People's names must not travel with it. So they are kept in a file of their
 * own beside the plan, `<plan>.occupancy.json` (`plan.occupancy.json` beside `plan.json`),
 * which names rooms by their ids and never the other way round: the plan knows nothing of it,
 * and nothing that reads the plan for an export reads this file.
 *
 *   {
 *     "version": "1",
 *     "seats": [
 *       { "room": "bedroom", "occupants": ["A. Person"] },
 *       { "room": "office", "desk": "Desk 2", "occupants": ["B. Person"] }
 *     ]
 *   }
 *
 * A seat is linked to a room of the plan by its id, and may name a desk in that room. The plan
 * has no desks (CNT-11 decided fixtures now and furniture later), so a desk is a label of this
 * file's own, inside its room.
 *
 * The file is read the one way every file is (`fs/projectFiles.ts`), and its text is held to
 * the plan's rules (MSG-9): an id to an id's limit, a desk or a name to a name's. A refusal
 * names the place (`seats[2].occupants[0]`) and never the text, which is a person's name.
 */
import path from 'path'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { PathRefused, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { textProblem } from '../command/planText'

/** What the file name adds to the plan's name. */
export const OCCUPANCY_SUFFIX = '.occupancy.json'
/** The largest occupancy file Grid reads. A building's seats are far fewer. */
export const OCCUPANCY_FILE_MAX_BYTES = 8 * 1024 * 1024
export const SEATS_MAX = 50_000
export const OCCUPANTS_MAX = 100

/** Why an occupancy file was refused. The message is one line and never holds a name. */
export class OccupancyRefused extends Error {
  override readonly name = 'OccupancyRefused'
}

export interface Seat {
  /** The id of a room of the plan. */
  readonly room: string
  /** A desk in that room, by this file's own label. */
  readonly desk?: string
  readonly occupants: readonly string[]
}

export interface Occupancy {
  readonly version: '1'
  readonly seats: readonly Seat[]
}

/** The occupancy file of a plan file: beside it, its name without `.json` and `.occupancy.json` after. */
export function occupancyFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${OCCUPANCY_SUFFIX}`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const extra = Object.keys(value).find((key) => !keys.includes(key))
  // A key is the file's structure, not a person's name, but it may be anything: it is not quoted.
  if (extra !== undefined) throw new OccupancyRefused(`${where} holds a field Grid does not know: it may hold only ${keys.join(', ')}`)
}

function text(value: unknown, kind: 'id' | 'name', where: string): string {
  if (typeof value !== 'string') throw new OccupancyRefused(`${where} must be text`)
  if (value.trim() === '') throw new OccupancyRefused(`${where} is empty`)
  const problem = textProblem(value, kind)
  if (problem !== null) throw new OccupancyRefused(`${where} ${problem}`)
  return value
}

/** The file's contents, checked. Refused with the first place that is wrong. */
export function parseOccupancy(raw: unknown): Occupancy {
  if (!isObject(raw)) throw new OccupancyRefused('it must be a JSON object with version and seats')
  onlyKeys(raw, ['version', 'seats'], 'the file')
  if (raw['version'] !== '1') throw new OccupancyRefused('version must be "1"')
  const seats = raw['seats']
  if (!Array.isArray(seats)) throw new OccupancyRefused('seats must be a list')
  if (seats.length > SEATS_MAX) throw new OccupancyRefused(`seats holds ${seats.length.toLocaleString('en-US')} seats; it may hold at most ${SEATS_MAX.toLocaleString('en-US')}`)
  return {
    version: '1',
    seats: seats.map((seat: unknown, i): Seat => {
      const where = `seats[${i}]`
      if (!isObject(seat)) throw new OccupancyRefused(`${where} must be an object with room and occupants`)
      onlyKeys(seat, ['room', 'desk', 'occupants'], where)
      const room = text(seat['room'], 'id', `${where}.room`)
      const desk = seat['desk'] === undefined ? undefined : text(seat['desk'], 'name', `${where}.desk`)
      const occupants = seat['occupants']
      if (!Array.isArray(occupants)) throw new OccupancyRefused(`${where}.occupants must be a list of names`)
      if (occupants.length > OCCUPANTS_MAX) throw new OccupancyRefused(`${where}.occupants holds ${occupants.length} names; a seat may hold at most ${OCCUPANTS_MAX}`)
      const names = occupants.map((name: unknown, j) => text(name, 'name', `${where}.occupants[${j}]`))
      return desk === undefined ? { room, occupants: names } : { room, desk, occupants: names }
    }),
  }
}

function oneLine(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

/**
 * Reads the occupancy file beside `planFile`, inside the project. Null when there is none.
 * Refused with `OccupancyRefused`, or `PathRefused` for the path.
 */
export function readOccupancy(project: Project, planFile: string): { readonly file: string; readonly occupancy: Occupancy } | null {
  const file = occupancyFileOf(planFile)
  const shown = path.basename(file)
  let read: { text: string; real: string }
  try {
    read = project.readText(file, OCCUPANCY_FILE_MAX_BYTES)
  } catch (error) {
    if (error instanceof PathRefused) throw error
    if (error instanceof TextNotDecoded) throw new OccupancyRefused(`${shown}: ${oneLine(error.message)}`)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    if (code === 'EISDIR') throw new OccupancyRefused(`${shown} is a folder, not an occupancy file.`)
    if (code === 'EFBIG') throw new OccupancyRefused(`${shown} is larger than ${OCCUPANCY_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in an occupancy file.`)
    if (code === 'EACCES' || code === 'EPERM') throw new OccupancyRefused(`${shown} can't be read: permission denied.`)
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(read.text)
  } catch {
    // The parser's message quotes the text around the fault, and the text holds names.
    throw new OccupancyRefused(`${shown} is not JSON.`)
  }
  try {
    return { file: read.real, occupancy: parseOccupancy(raw) }
  } catch (error) {
    if (error instanceof OccupancyRefused) throw new OccupancyRefused(`${shown} is not an occupancy file: ${error.message}.`)
    throw error
  }
}

export interface LinkedSeat {
  readonly seat: number
  readonly room: string
  readonly roomName: string
  readonly desk?: string
  readonly occupants: readonly string[]
}

export interface SeatLinks {
  readonly linked: readonly LinkedSeat[]
  /** Seats whose room the plan does not have, by their place in the file. */
  readonly unlinked: ReadonlyArray<{ readonly seat: number; readonly room: string }>
}

/** Each seat with the plan's room it is linked to, and the seats that lead to no room. */
export function linkSeats(plan: FloorPlan, occupancy: Occupancy): SeatLinks {
  const rooms = new Map(plan.rooms.map((room) => [room.id, room]))
  const linked: LinkedSeat[] = []
  const unlinked: Array<{ seat: number; room: string }> = []
  occupancy.seats.forEach((seat, i) => {
    const room = rooms.get(seat.room)
    if (room === undefined) {
      unlinked.push({ seat: i, room: seat.room })
      return
    }
    const roomName = room.name || room.id
    linked.push(seat.desk === undefined
      ? { seat: i, room: room.id, roomName, occupants: seat.occupants }
      : { seat: i, room: room.id, roomName, desk: seat.desk, occupants: seat.occupants })
  })
  return { linked, unlinked }
}

/** What `grid occupancy` prints: who sits where, by room name, and the seats that lead nowhere. */
export function occupancyText(fileShown: string, links: SeatLinks): string {
  const lines = [`Who sits where, from ${fileShown}. It is kept apart from the plan, and no export or sheet carries it.`]
  if (links.linked.length === 0 && links.unlinked.length === 0) lines.push('It names no seats.')
  for (const seat of links.linked) {
    const place = seat.desk === undefined ? seat.roomName : `${seat.roomName}, ${seat.desk}`
    lines.push(`  ${place}: ${seat.occupants.length === 0 ? 'nobody' : seat.occupants.join(', ')}`)
  }
  for (const { seat, room } of links.unlinked) {
    lines.push(`seats[${seat}] names room ${JSON.stringify(room)}, which the plan does not have: link it to a room id the plan holds.`)
  }
  return `${lines.join('\n')}\n`
}
