/**
 * HND-12: a phone room scan, read. Apple's room model first: the JSON that a room captured on an
 * iPhone or iPad with a depth sensor is saved as.
 *
 * The shape, in Grid's own words. A capture is one object. It holds lists of surfaces: `walls`,
 * `doors`, `windows` and `openings` (a gap in a wall with no door), and in newer captures
 * `floors`; and `objects`, the boxes of things standing in the room (a bath, a bed). Every
 * surface and object has:
 *
 * - `identifier`: its own id, the same for as long as the capture keeps it;
 * - `dimensions`: three numbers in metres, its width, its height and its depth (0 for a surface);
 * - `transform`: sixteen numbers, a 4 by 4 matrix written column by column, which places it: the
 *   first column is the way its width runs, the second its up, the third its normal, and the
 *   fourth its middle, in the capture's own frame (y up, metres);
 * - `category`: what it is, written as a word or as an object with one key (`{"door": {}}`),
 *   whose value may hold more about it (whether a door is open);
 * - `confidence`: how sure the capture is of it, high, medium or low, written the same way;
 * - `parentIdentifier`: for a door, a window or an opening, the wall it is in;
 * - in newer captures, `story` (which storey, a whole number) and `polygonCorners`, the corners
 *   of the surface in its own frame, for a surface that is not a rectangle, such as a floor.
 *
 * Newer captures may also hold `sections`, the parts of the capture a room type was given to:
 * each a `label` (a bedroom, a kitchen, written as a category is), a `center` and a `story`.
 *
 * Pure: parsed JSON in, a reading or a refusal out. Nothing here reads a file. A refusal names
 * the part and the limit, never the text (MSG-9).
 */
import { limit } from '../geometry/tolerances'
import { BOUNDARY_MAX, PARTS_MAX, textProblem } from '../types/planText'

/** The lists of a capture Grid reads, in the order it reads them. */
export const SCAN_LISTS = ['walls', 'doors', 'windows', 'openings', 'floors', 'objects'] as const
export type ScanList = (typeof SCAN_LISTS)[number]

/** What the surfaces of each list are: a wall, a door, and so on. */
export const SCAN_LIST_KIND: Readonly<Record<ScanList, string>> = {
  walls: 'wall',
  doors: 'door',
  windows: 'window',
  openings: 'opening',
  floors: 'floor',
  objects: 'object',
}

/**
 * The kinds of object a capture names, as it writes them. Grid draws two of them as fixtures
 * (`SCAN_FIXTURES`); the others are kept in the scan's evidence and not drawn.
 */
export const SCAN_OBJECT_KINDS = [
  'storage',
  'refrigerator',
  'stove',
  'bed',
  'sink',
  'washerDryer',
  'toilet',
  'bathtub',
  'oven',
  'dishwasher',
  'table',
  'sofa',
  'chair',
  'fireplace',
  'television',
  'stairs',
] as const

/** The room types a capture gives its sections, as it writes them, with the words some versions use. */
export const SCAN_SECTION_LABELS = ['bedroom', 'bathroom', 'kitchen', 'livingRoom', 'living', 'diningRoom', 'dining', 'unidentified'] as const

export const SCAN_CONFIDENCES = ['high', 'medium', 'low'] as const

export type Point3 = readonly [number, number, number]

/** One surface or object of a capture, as read. */
export interface ScanSurface {
  readonly list: ScanList
  readonly id: string
  /** What the capture says it is: the list's own kind, or for an object one of `SCAN_OBJECT_KINDS`; null for a word Grid does not know. */
  readonly category: string | null
  readonly confidence: (typeof SCAN_CONFIDENCES)[number] | null
  readonly dimensions: Point3
  /** Sixteen numbers, column by column. */
  readonly transform: readonly number[]
  readonly parent: string | null
  readonly story: number | null
  readonly corners: readonly Point3[]
  /** For a door: whether the capture saw it open; null when it does not say. */
  readonly open: boolean | null
}

export interface ScanSection {
  /** One of `SCAN_SECTION_LABELS`, or null for a word Grid does not know. */
  readonly label: string | null
  readonly center: Point3
  readonly story: number | null
}

/** A capture as Grid read it. */
export interface RoomScan {
  readonly format: 'apple-room-model'
  /** The capture's own id, when it states one. */
  readonly id: string | null
  /** The capture's own version number, when it states one. */
  readonly version: number | null
  readonly surfaces: readonly ScanSurface[]
  readonly sections: readonly ScanSection[]
}

/** Why a scan was not read. The message names the part and the limit, never the scan's text. */
export class ScanRefused extends Error {
  override readonly name = 'ScanRefused'
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function refuse(message: string): never {
  throw new ScanRefused('scan/not-read', `The scan was not read: ${message}.`)
}

function count(n: number): string {
  return n.toLocaleString('en-US')
}

/** A finite number no larger than Grid takes (`largest`). */
function number(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) refuse(`${at} is not a number`)
  if (Math.abs(value) > limit('largest')) refuse(`${at} is larger than ${count(limit('largest'))}, the largest number Grid takes`)
  return value
}

function point3(value: unknown, at: string): Point3 {
  if (!Array.isArray(value) || value.length !== 3) refuse(`${at} is not three numbers`)
  return [number(value[0], `${at}[0]`), number(value[1], `${at}[1]`), number(value[2], `${at}[2]`)]
}

/** Sixteen numbers column by column, or four columns of four. */
function matrix(value: unknown, at: string): number[] {
  if (!Array.isArray(value)) refuse(`${at} is not a 4 by 4 matrix`)
  const flat = value.length === 4 && value.every((column) => Array.isArray(column) && column.length === 4) ? (value as unknown[][]).flat() : value
  if (flat.length !== 16) refuse(`${at} is not a 4 by 4 matrix: it needs sixteen numbers, column by column, or four columns of four`)
  return flat.map((v, i) => number(v, `${at}[${i}]`))
}

function idOf(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.length === 0) refuse(`${at} is not an id`)
  const problem = textProblem(value, 'id')
  if (problem !== null) refuse(`${at} ${problem}`)
  return value
}

/** A word written as a word, or as an object with one key; its value, when an object, is returned too. */
function word(value: unknown, at: string): { word: string; more: Record<string, unknown> } {
  if (typeof value === 'string') {
    const problem = textProblem(value, 'id')
    if (problem !== null) refuse(`${at} ${problem}`)
    return { word: value, more: {} }
  }
  if (isObject(value)) {
    const keys = Object.keys(value)
    if (keys.length !== 1) refuse(`${at} is not one word: written as an object, it has one key`)
    const key = keys[0]!
    const problem = textProblem(key, 'id')
    if (problem !== null) refuse(`${at} ${problem}`)
    const inner = value[key]
    return { word: key, more: isObject(inner) ? inner : {} }
  }
  refuse(`${at} is not a word`)
}

function story(value: unknown, at: string): number | null {
  if (value === undefined || value === null) return null
  const n = number(value, at)
  if (!Number.isInteger(n)) refuse(`${at} is not a whole number`)
  return n
}

function surface(raw: unknown, list: ScanList, at: string): ScanSurface {
  if (!isObject(raw)) refuse(`${at} is not an object`)
  const id = idOf(raw['identifier'], `${at}.identifier`)
  const kind = SCAN_LIST_KIND[list]
  let category: string | null = kind
  let open: boolean | null = null
  if (raw['category'] !== undefined) {
    const read = word(raw['category'], `${at}.category`)
    if (list === 'objects') category = (SCAN_OBJECT_KINDS as readonly string[]).includes(read.word) ? read.word : null
    if (list === 'doors' && typeof read.more['isOpen'] === 'boolean') open = read.more['isOpen']
  } else if (list === 'objects') category = null
  let confidence: ScanSurface['confidence'] = null
  if (raw['confidence'] !== undefined && raw['confidence'] !== null) {
    const read = word(raw['confidence'], `${at}.confidence`).word
    confidence = (SCAN_CONFIDENCES as readonly string[]).includes(read) ? (read as ScanSurface['confidence']) : null
  }
  const dimensions = point3(raw['dimensions'], `${at}.dimensions`)
  if (dimensions.some((d) => d < 0)) refuse(`${at}.dimensions holds a size below 0`)
  const transform = matrix(raw['transform'], `${at}.transform`)
  const parentRaw = raw['parentIdentifier']
  const parent = parentRaw === undefined || parentRaw === null ? null : idOf(parentRaw, `${at}.parentIdentifier`)
  const cornersRaw = raw['polygonCorners']
  let corners: Point3[] = []
  if (cornersRaw !== undefined && cornersRaw !== null) {
    if (!Array.isArray(cornersRaw)) refuse(`${at}.polygonCorners is not a list`)
    if (cornersRaw.length > BOUNDARY_MAX) refuse(`${at}.polygonCorners has ${count(cornersRaw.length)} corners; a surface may have at most ${count(BOUNDARY_MAX)}`)
    corners = cornersRaw.map((c, i) => point3(c, `${at}.polygonCorners[${i}]`))
  }
  return { list, id, category, confidence, dimensions, transform, parent, story: story(raw['story'], `${at}.story`), corners, open }
}

function section(raw: unknown, at: string): ScanSection {
  if (!isObject(raw)) refuse(`${at} is not an object`)
  const read = raw['label'] === undefined || raw['label'] === null ? null : word(raw['label'], `${at}.label`).word
  const label = read !== null && (SCAN_SECTION_LABELS as readonly string[]).includes(read) ? read : null
  return { label, center: point3(raw['center'], `${at}.center`), story: story(raw['story'], `${at}.story`) }
}

/**
 * Reads a capture shaped like Apple's room model. Throws `ScanRefused`, naming the part and the
 * limit, for anything that is not one: not an object, a list that is not a list or holds more
 * than `PARTS_MAX`, a surface without an id or with a number that is not one, two surfaces with
 * one id, or no wall at all. Fields Grid does not read are passed over.
 */
export function readRoomScan(raw: unknown): RoomScan {
  if (!isObject(raw)) refuse('it is not a JSON object, the shape a room capture is saved in')
  const surfaces: ScanSurface[] = []
  const places: string[] = []
  for (const list of SCAN_LISTS) {
    const items = raw[list]
    if (items === undefined || items === null) continue
    if (!Array.isArray(items)) refuse(`${list} is not a list`)
    if (items.length > PARTS_MAX) refuse(`${list} has ${count(items.length)} entries; a scan may have at most ${count(PARTS_MAX)} in each list`)
    items.forEach((item, i) => {
      surfaces.push(surface(item, list, `${list}[${i}]`))
      places.push(`${list}[${i}]`)
    })
  }
  const sectionsRaw = raw['sections']
  let sections: ScanSection[] = []
  if (sectionsRaw !== undefined && sectionsRaw !== null) {
    if (!Array.isArray(sectionsRaw)) refuse('sections is not a list')
    if (sectionsRaw.length > PARTS_MAX) refuse(`sections has ${count(sectionsRaw.length)} entries; a scan may have at most ${count(PARTS_MAX)}`)
    sections = sectionsRaw.map((s, i) => section(s, `sections[${i}]`))
  }
  const seen = new Map<string, string>()
  for (const [i, s] of surfaces.entries()) {
    const where = places[i]!
    const first = seen.get(s.id)
    if (first !== undefined) throw new ScanRefused('scan/same-id', `The scan was not read: ${first} and ${where} have the same identifier, and Grid keeps the scan by its ids.`)
    seen.set(s.id, where)
  }
  if (!surfaces.some((s) => s.list === 'walls')) throw new ScanRefused('scan/no-walls', 'The scan was not read: it holds no walls, and Grid draws a scan from its walls.')
  const id = raw['identifier'] === undefined || raw['identifier'] === null ? null : idOf(raw['identifier'], 'identifier')
  const version = typeof raw['version'] === 'number' && Number.isFinite(raw['version']) ? raw['version'] : null
  return { format: 'apple-room-model', id, version, surfaces, sections }
}
