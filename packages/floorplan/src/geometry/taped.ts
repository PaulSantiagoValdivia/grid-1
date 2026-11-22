/**
 * HND-11 (C11, lab WR-14): the lengths taped on site against the same lengths drawn.
 *
 * A plan keeps what was taped in `taped`: a room's side along one of its walls, or the distance
 * between two of the room's corners, each corner named by the two walls that meet there. Both
 * are measured on the room's outline as the drawing has it, along the inside faces of its walls
 * (C3), the same outline its area is measured on: a side is every edge of the outline that lies
 * on that wall's face, end to end; a corner is the outline's corner where the two walls' faces
 * meet.
 *
 * A taped length agrees when the drawing is within its own `tolerance`, or `tapedAgree`. Nothing
 * is drawn or placed from a taped length: it is a check, and every run says each one.
 *
 * Pure: a plan in, plain data out.
 */
import { DEFAULT_FLOOR_ID, type Taped } from '../types/floorplan'
import { indexPlan, type FloorPlan, type PlanIndex, type Wall } from './plan'
import { roomOutline, type RoomOutline } from './room'
import { fixedText } from './rounding'
import { tolerance } from './tolerances'
import { wallFaces } from './wall'
import { cross, distance, intersectLines, sub, type Line, type Vec2 } from './vec2'

/** What a taped length is of. */
export type TapedWhat = 'side' | 'corners'

/**
 * Why a taped length could not be set against the drawing: the room or a wall is not in the
 * plan, the wall is not one of the room's, two walls make no corner of the room, or the room's
 * outline cannot be drawn.
 */
export type TapedMissing = 'no-room' | 'no-wall' | 'not-the-rooms' | 'no-corner' | 'not-drawn'

export interface TapedRow {
  /** Its place in the plan's `taped` list, from 0. */
  readonly index: number
  /** The id the plan gives it, or null. */
  readonly id: string | null
  readonly room: string
  /** The room's name, or its id when the plan has no such room. */
  readonly roomName: string
  /** The room's floor; the ground floor when the plan has no such room. */
  readonly floor: string
  readonly what: TapedWhat
  /** For a side, its wall; for corners, the two walls of `from`, then the two of `to`. */
  readonly walls: readonly string[]
  readonly taped: number
  /** The same length on the drawing, or null when it cannot be measured. */
  readonly drawn: number | null
  /** Drawn less taped: positive when the drawing is longer. Null with no drawn length. */
  readonly off: number | null
  /** How far apart the two may be and agree. */
  readonly within: number
  readonly state: 'agrees' | 'differs' | 'not-measured'
  /** Only when not measured: why. */
  readonly missing?: TapedMissing
  /** Only when not measured for a wall or a corner: the walls it is about. */
  readonly missingWalls?: readonly string[]
}

/** The face of a wall that looks into the room, as a line. */
function roomFace(wall: Wall, outline: RoomOutline): Line | null {
  const side = outline.sides.find((s) => s.wallId === wall.id)
  if (side === undefined) return null
  return wallFaces(wall)[side.face]
}

const offLine = (p: Vec2, line: Line): number => Math.abs(cross(line.dir, sub(p, line.point)))

/** The outline's length along a face: every edge whose two ends lie on it. */
function sideAlong(polygon: readonly Vec2[], face: Line): number | null {
  const near = tolerance('chainPoint')
  let total = 0
  let any = false
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    if (offLine(a, face) <= near && offLine(b, face) <= near) {
      total += distance(a, b)
      any = true
    }
  }
  return any ? total : null
}

/** The outline's corner where two faces meet, or null when they make none. */
function cornerOf(polygon: readonly Vec2[], a: Line, b: Line): Vec2 | null {
  const at = intersectLines(a, b)
  if (at === null) return null
  let best: Vec2 | null = null
  let gap = Infinity
  for (const p of polygon) {
    const d = distance(p, at)
    if (d < gap) [best, gap] = [p, d]
  }
  return best !== null && gap <= tolerance('chainPoint') ? best : null
}

interface Measured {
  readonly drawn: number | null
  readonly missing?: TapedMissing
  readonly missingWalls?: readonly string[]
}

function measure(entry: Taped, index: PlanIndex, outlines: Map<string, RoomOutline | null>): Measured {
  const room = index.plan.rooms.find((r) => r.id === entry.room)
  if (room === undefined) return { drawn: null, missing: 'no-room' }
  const walls = entry.wall !== undefined ? [entry.wall] : [...(entry.from ?? []), ...(entry.to ?? [])]
  const unknown = walls.filter((id) => !index.wallsById.has(id))
  if (unknown.length > 0) return { drawn: null, missing: 'no-wall', missingWalls: unknown }
  if (!outlines.has(room.id)) {
    let outline: RoomOutline | null = null
    try {
      const traced = roomOutline(room, index)
      outline = traced.fault === null ? traced : null
    } catch {
      outline = null
    }
    outlines.set(room.id, outline)
  }
  const outline = outlines.get(room.id) ?? null
  if (outline === null) return { drawn: null, missing: 'not-drawn' }
  const faces = new Map<string, Line>()
  const notTheRooms: string[] = []
  for (const id of new Set(walls)) {
    const face = roomFace(index.wallsById.get(id)!, outline)
    if (face === null) notTheRooms.push(id)
    else faces.set(id, face)
  }
  if (notTheRooms.length > 0) return { drawn: null, missing: 'not-the-rooms', missingWalls: notTheRooms }
  if (entry.wall !== undefined) {
    const drawn = sideAlong(outline.polygon, faces.get(entry.wall)!)
    return drawn === null ? { drawn: null, missing: 'not-drawn' } : { drawn }
  }
  const corner = (pair: readonly [string, string]): Vec2 | null => cornerOf(outline.polygon, faces.get(pair[0])!, faces.get(pair[1])!)
  const from = corner(entry.from!)
  const to = corner(entry.to!)
  if (from === null || to === null) return { drawn: null, missing: 'no-corner', missingWalls: [...(from === null ? entry.from! : []), ...(to === null ? entry.to! : [])] }
  return { drawn: distance(from, to) }
}

/**
 * Every length the plan keeps as taped, in its order, set against the drawing. Empty for a plan
 * with none.
 */
export function tapedLengths(plan: FloorPlan, given?: PlanIndex): TapedRow[] {
  const list = plan.taped ?? []
  if (list.length === 0) return []
  const index = given ?? indexPlan(plan)
  const outlines = new Map<string, RoomOutline | null>()
  return list.map((entry, at) => {
    const room = plan.rooms.find((r) => r.id === entry.room)
    const measured = measure(entry, index, outlines)
    const within = entry.tolerance ?? tolerance('tapedAgree')
    const off = measured.drawn === null ? null : measured.drawn - entry.length
    const state = off === null ? 'not-measured' : Math.abs(off) <= within + tolerance('lengthEqual') ? 'agrees' : 'differs'
    return {
      index: at,
      id: entry.id ?? null,
      room: entry.room,
      roomName: room?.name ?? entry.room,
      floor: room?.floor ?? DEFAULT_FLOOR_ID,
      what: entry.wall !== undefined ? 'side' : 'corners',
      walls: entry.wall !== undefined ? [entry.wall] : [...(entry.from ?? []), ...(entry.to ?? [])],
      taped: entry.length,
      drawn: measured.drawn,
      off,
      within,
      state,
      ...(measured.missing === undefined ? {} : { missing: measured.missing }),
      ...(measured.missingWalls === undefined ? {} : { missingWalls: measured.missingWalls })
    }
  })
}

// ---------------------------------------------------------------------------------------------
// In words: one wording, for the record's lines, `grid check` and every change's answer.

const q = (id: string): string => JSON.stringify(id)
const m = (value: number): string => `${fixedText(value, 3)} m`

/** What was taped: `the side along wall "ext-s"`, `corner "ext-s"/"ext-w" to corner "row"/"bed-hall"`. */
export function tapedWhatText(row: Pick<TapedRow, 'what' | 'walls'>): string {
  if (row.what === 'side') return `the side along wall ${q(row.walls[0] ?? '')}`
  const [a = '', b = '', c = '', d = ''] = row.walls
  return `corner ${q(a)}/${q(b)} to corner ${q(c)}/${q(d)}`
}

/** The two figures: `3.552 m drawn against 3.470 m taped, 0.082 m longer`; the taped one alone when nothing is drawn. */
export function tapedFiguresText(row: Pick<TapedRow, 'taped' | 'drawn' | 'off'>): string {
  if (row.drawn === null || row.off === null) return m(row.taped)
  const off = Math.abs(row.off) < tolerance('lengthEqual') ? 'the same' : `${m(Math.abs(row.off))} ${row.off > 0 ? 'longer' : 'shorter'}`
  return `${m(row.drawn)} drawn against ${m(row.taped)} taped, ${off}`
}

/** How close they may be: `0.010 m`. */
export const tapedWithinText = (row: Pick<TapedRow, 'within'>): string => m(row.within)

/** Why a taped length is not measured, in words, or null when it is. */
export function tapedMissingText(row: Pick<TapedRow, 'missing' | 'missingWalls' | 'room'>): string | null {
  const walls = (row.missingWalls ?? []).map(q)
  const list = walls.length <= 1 ? walls.join('') : `${walls.slice(0, -1).join(', ')} and ${walls.at(-1)}`
  switch (row.missing) {
    case undefined:
      return null
    case 'no-room':
      return `the plan has no room ${q(row.room)}`
    case 'no-wall':
      return `the plan has no wall ${list}`
    case 'not-the-rooms':
      return `wall${walls.length === 1 ? '' : 's'} ${list} ${walls.length === 1 ? 'is' : 'are'} not one of the room's`
    case 'no-corner':
      return `walls ${list} make no corner of the room`
    case 'not-drawn':
      return 'the room\'s outline cannot be drawn'
  }
}
