/**
 * MSG-10: a note the person has looked at, set aside as seen.
 *
 * A mark is kept in a file of its own beside the plan, `<plan>.seen.json` (`plan.seen.json`
 * beside `plan.json`), read and written only through `fs/projectFiles.ts`. The plan knows
 * nothing of it, and no export, sheet or drawing reads it: who marked a note is a name the
 * person typed, and it stays out of every file that travels with the plan.
 *
 *   {
 *     "version": "1",
 *     "marks": [
 *       {
 *         "code": "room/too-small",
 *         "thing": { "kind": "room", "id": "bed2" },
 *         "also": [],
 *         "parts": [{ "kind": "room", "id": "bed2", "hash": "…" }, { "kind": "wall", "id": "w3", "hash": "…" }],
 *         "reason": "A box room, kept small on purpose",
 *         "by": "A. Person",
 *         "at": "2026-11-22T10:00:00.000Z"
 *       }
 *     ]
 *   }
 *
 * A mark is keyed to the note (its code, its thing and the other parts it names) and to the
 * content of the parts it is about: the thing and the `also` ids, a room with the walls of its
 * outline, an opening with its wall, a floor with everything on it, and the plan as a whole
 * for a note about the plan that names no part. Each part's content is a hash of its canonical
 * JSON. When any of them changes, or the set of parts does, the mark no longer holds and the
 * note comes back as new, saying which part changed. A mark is never taken as the note being
 * dealt with: a seen note is always listed, under Seen.
 *
 * Reading a check never writes: a mark whose parts changed stays in the file, and holds no
 * more. Marking the same note again replaces it; unmarking takes it out.
 *
 * MSG-5: a line for several rooms (`each`) is one note: its thing is the first room and `also`
 * names the others, so its parts are every room with its outline walls, and a change to any of
 * them brings the line back. A mark made on one of those rooms' notes before they were one line,
 * or on the line when it named other rooms, finds the line but never holds (`earlierNote`).
 */
import { createHash } from 'crypto'
import path from 'path'
import { floorOf, type FloorPlan } from '@ongrid/floorplan/geometry'
import { readPlanText } from '@ongrid/floorplan/types/jsonText'
import type { ResultLine, Thing, ThingKind } from '@ongrid/rules'
import { PathRefused, quoted, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { textProblem } from '../command/planText'

/** What the file name adds to the plan's name. */
export const SEEN_SUFFIX = '.seen.json'
/** The largest marks file Grid reads. */
export const SEEN_FILE_MAX_BYTES = 8 * 1024 * 1024
export const MARKS_MAX = 50_000
/** The longest reason a mark may give: one line. */
export const REASON_MAX = 200
/** The longest name a mark may give for who marked it: a name's limit in a plan (MSG-9). */
export const BY_MAX = 120

/** Why a marks file or a mark was refused. One line, and it never repeats a reason or a name. */
export class SeenRefused extends Error {
  override readonly name = 'SeenRefused'
}

/** A part a note is about, with a hash of its content when it was marked. */
export interface MarkedPart {
  readonly kind: ThingKind | 'unknown'
  readonly id: string
  readonly hash: string
}

export interface SeenMark {
  readonly code: string
  readonly thing: Thing
  readonly also: readonly string[]
  readonly parts: readonly MarkedPart[]
  readonly reason: string
  /** Who marked it: the name or role the person gave, never one Grid works out. */
  readonly by: string
  /** When, as an ISO date and time. */
  readonly at: string
}

export interface SeenFile {
  readonly version: '1'
  readonly marks: readonly SeenMark[]
}

/**
 * How a note stands: `new` (no mark), `seen` (a mark that still holds), or `back` (a mark
 * whose parts changed since, so the note is new again; `changed` names them).
 */
export type SeenState =
  | { readonly state: 'new' }
  | { readonly state: 'seen'; readonly mark: SeenMark }
  | { readonly state: 'back'; readonly mark: SeenMark; readonly changed: readonly MarkedPart[] }

/** The marks file of a plan file: beside it, its name without `.json` and `.seen.json` after. */
export function seenFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${SEEN_SUFFIX}`)
}

// ---------------------------------------------------------------------------------------------
// The parts a note is about, and their content

/** JSON with every object's keys in order, so the same content always gives the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function hashOf(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex').slice(0, 16)
}

type Lists = Readonly<Record<'wall' | 'room' | 'opening' | 'item' | 'stair' | 'floor', readonly { readonly id: string }[]>>

function listsOf(plan: FloorPlan): Lists {
  return { wall: plan.walls, room: plan.rooms, opening: plan.openings, item: plan.items ?? [], stair: plan.stairs ?? [], floor: plan.floors ?? [] }
}

/** Everything on one floor, and its entry in `floors`: a note about a floor is about all of it. */
function floorContent(plan: FloorPlan, floor: string): unknown {
  const walls = plan.walls.filter((w) => floorOf(w) === floor)
  const wallIds = new Set(walls.map((w) => w.id))
  return {
    floor: (plan.floors ?? []).filter((f) => f.id === floor),
    walls,
    rooms: plan.rooms.filter((r) => floorOf(r) === floor),
    openings: plan.openings.filter((o) => wallIds.has(o.wall)),
    items: (plan.items ?? []).filter((i) => floorOf(i) === floor),
    stairs: (plan.stairs ?? []).filter((s) => s.from === floor || s.to === floor),
    annotations: (plan.annotations ?? []).filter((a) => floorOf(a) === floor),
    sketch: (plan.sketch ?? []).filter((s) => floorOf(s) === floor),
  }
}

/**
 * What a mark is made from: the plan as Grid reads it, and the file's own text when there is one.
 * The text matters for a note about what Grid does not read or reads otherwise (`plan/unknown-field`,
 * `plan/unknown-use`, MSG-6's `plan/value-left-out`, `plan/part-left-out`, `plan/read-as-meant`):
 * the plan as read leaves those values out or reads them as meant, so each part's hash holds its
 * entry in the file too, as written, and a change to an unknown field's value brings the note back.
 */
export interface SeenSource {
  readonly plan: FloorPlan
  readonly text?: string
}

/** The lists of the file where each kind of part is written. */
const FILE_LISTS: Readonly<Record<Exclude<MarkedPart['kind'], 'plan'>, readonly string[]>> = {
  wall: ['walls'],
  room: ['rooms'],
  opening: ['openings'],
  item: ['items'],
  stair: ['stairs'],
  floor: ['floors'],
  unknown: ['walls', 'rooms', 'openings', 'items', 'stairs', 'floors', 'annotations', 'sketch'],
}

/** The file as written, as JSON: null when there is no text or it can't be read as JSON. */
function fileOf(source: SeenSource): Record<string, unknown> | null {
  if (source.text === undefined) return null
  const read = readPlanText(source.text)
  return read.ok && typeof read.value === 'object' && read.value !== null && !Array.isArray(read.value) ? (read.value as Record<string, unknown>) : null
}

/** Every entry of the file with this id, in the lists where a part of this kind is written. */
function fileEntries(file: Record<string, unknown>, kind: Exclude<MarkedPart['kind'], 'plan'>, id: string): unknown[] {
  return FILE_LISTS[kind].flatMap((list) => {
    const entries = file[list]
    return Array.isArray(entries) ? entries.filter((entry) => typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>)['id'] === id) : []
  })
}

/** The parts of the plan each with an id, as a note's `also` may name them: the kind each is. */
const ALSO_ORDER = ['wall', 'room', 'opening', 'item', 'stair', 'floor'] as const

/**
 * The parts a line is about, each with the hash of its content now: its thing, the ids it
 * names (`also`), a room's outline walls and an opening's wall. In the order the line names
 * them, each once.
 */
export function partsOf(source: SeenSource, line: Pick<ResultLine, 'thing' | 'also'>): MarkedPart[] {
  const { plan } = source
  const file = fileOf(source)
  const lists = listsOf(plan)
  const parts: MarkedPart[] = []
  const taken = new Set<string>()
  const add = (kind: MarkedPart['kind'], id: string, content: unknown): void => {
    const key = `${kind}\u0000${id}`
    if (taken.has(key)) return
    taken.add(key)
    // The part as read, and as written in the file: the whole file for the plan.
    const written = file === null ? null : kind === 'plan' ? file : fileEntries(file, kind, id)
    parts.push({ kind, id, hash: hashOf({ read: content ?? null, written }) })
  }
  const addPart = (kind: Exclude<ThingKind, 'plan'>, id: string): void => {
    if (kind === 'floor') {
      add('floor', id, floorContent(plan, id))
      return
    }
    const part = lists[kind].find((p) => p.id === id)
    add(kind, id, part)
    // A room is its outline too, and an opening the wall it is in.
    if (kind === 'room' && part !== undefined) for (const wall of (part as FloorPlan['rooms'][number]).boundary) addPart('wall', wall)
    if (kind === 'opening' && part !== undefined) addPart('wall', (part as FloorPlan['openings'][number]).wall)
  }
  if (line.thing.kind === 'plan') {
    // A note about the plan that names no part is about the whole plan.
    if (line.also.length === 0) add('plan', '', plan)
  } else addPart(line.thing.kind, line.thing.id)
  for (const id of line.also) {
    const kind = ALSO_ORDER.find((k) => (k === 'floor' ? lists.floor.some((p) => p.id === id) || plan.walls.some((w) => floorOf(w) === id) : lists[k].some((p) => p.id === id)))
    if (kind === undefined) {
      // A sketch item or a note on the drawing, or a part the plan no longer has.
      const other = [...(plan.annotations ?? []), ...(plan.sketch ?? [])].find((p) => p.id === id)
      add('unknown', id, other)
    } else addPart(kind, id)
  }
  return parts
}

/** The same note: its code, its thing and the parts it names. */
export function sameNote(mark: Pick<SeenMark, 'code' | 'thing' | 'also'>, line: Pick<ResultLine, 'code' | 'thing' | 'also'>): boolean {
  if (mark.code !== line.code || mark.thing.kind !== line.thing.kind || mark.thing.id !== line.thing.id) return false
  const a = [...mark.also].sort()
  const b = [...line.also].sort()
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * MSG-5: a mark made on a note that one line now gives for several rooms (`each`), or on that
 * line when it named other rooms: the same code, and one of the line's rooms is the mark's thing
 * or among the parts it names. Such a mark never holds as seen, since the rooms differ; the line
 * is new again, saying which parts changed. Marking or unmarking the line replaces it.
 */
export function earlierNote(mark: Pick<SeenMark, 'code' | 'thing' | 'also'>, line: Pick<ResultLine, 'code' | 'each'>): boolean {
  if (line.each === undefined || mark.code !== line.code) return false
  return line.each.some((part) => part.kind === mark.thing.kind && (part.id === mark.thing.id || mark.also.includes(part.id)))
}

/** How each line stands against the marks, in the order of the lines. */
export function seenStates(source: SeenSource, lines: readonly ResultLine[], marks: readonly SeenMark[]): SeenState[] {
  return lines.map((line): SeenState => {
    const exact = marks.find((m) => sameNote(m, line))
    const mark = exact ?? marks.find((m) => earlierNote(m, line))
    if (mark === undefined) return { state: 'new' }
    const now = partsOf(source, line)
    const key = (p: MarkedPart): string => `${p.kind}\u0000${p.id}`
    const before = new Map(mark.parts.map((p) => [key(p), p.hash] as const))
    // A part whose content changed, one the note now names, and one it no longer does.
    const changed = [
      ...now.filter((p) => before.get(key(p)) !== p.hash),
      ...mark.parts.filter((p) => !now.some((n) => key(n) === key(p))),
    ]
    if (exact === undefined) return { state: 'back', mark, changed: changed.length > 0 ? changed : now.slice(0, 1) }
    return changed.length === 0 ? { state: 'seen', mark } : { state: 'back', mark, changed }
  })
}

/** A part as a line names it: `room "bed2"`, `the plan`. */
export function partText(part: Pick<MarkedPart, 'kind' | 'id'>): string {
  if (part.kind === 'plan') return 'the plan'
  return `${part.kind === 'unknown' ? 'part' : part.kind} ${quoted(part.id)}`
}

// ---------------------------------------------------------------------------------------------
// The file

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new SeenRefused(`${where} holds a field Grid does not know: it may hold only ${keys.join(', ')}`)
}

function text(value: unknown, where: string, max: number, kind: 'name' | 'id' = 'name'): string {
  if (typeof value !== 'string') throw new SeenRefused(`${where} must be text`)
  const problem = reasonProblem(value, max, kind)
  if (problem !== null) throw new SeenRefused(`${where} ${problem}`)
  return value
}

/**
 * Why a reason or a name can't be kept, or null: empty, more than one line, a control or
 * direction character (MSG-9's rule for every text Grid keeps), or longer than `max`. Never
 * the text itself.
 */
export function reasonProblem(value: string, max: number, kind: 'name' | 'id' = 'name'): string | null {
  if (value.trim() === '') return 'is empty'
  const problem = textProblem(value, kind)
  // The plan's own length limit is a name's; a reason may be longer, and says its own.
  if (problem !== null && !problem.startsWith('is ')) return problem
  if (value.length > max) return `is ${value.length.toLocaleString('en-US')} characters long; it may have at most ${max}`
  return null
}

const THING_KINDS: readonly ThingKind[] = ['plan', 'floor', 'wall', 'room', 'opening', 'item', 'stair']
const PART_KINDS: readonly MarkedPart['kind'][] = [...THING_KINDS, 'unknown']

/** The file's contents, checked. Refused with the first place that is wrong. */
export function parseSeen(raw: unknown): SeenFile {
  if (!isObject(raw)) throw new SeenRefused('it must be a JSON object with version and marks')
  onlyKeys(raw, ['version', 'marks'], 'the file')
  if (raw['version'] !== '1') throw new SeenRefused('version must be "1"')
  const marks = raw['marks']
  if (!Array.isArray(marks)) throw new SeenRefused('marks must be a list')
  if (marks.length > MARKS_MAX) throw new SeenRefused(`marks holds ${marks.length.toLocaleString('en-US')} marks; it may hold at most ${MARKS_MAX.toLocaleString('en-US')}`)
  return {
    version: '1',
    marks: marks.map((mark: unknown, i): SeenMark => {
      const where = `marks[${i}]`
      if (!isObject(mark)) throw new SeenRefused(`${where} must be an object`)
      onlyKeys(mark, ['code', 'thing', 'also', 'parts', 'reason', 'by', 'at'], where)
      const code = text(mark['code'], `${where}.code`, 64, 'id')
      const thing = mark['thing']
      if (!isObject(thing) || !THING_KINDS.includes(thing['kind'] as ThingKind) || typeof thing['id'] !== 'string') throw new SeenRefused(`${where}.thing must be an object with a kind and an id`)
      const also = mark['also']
      if (!Array.isArray(also) || also.some((id) => typeof id !== 'string')) throw new SeenRefused(`${where}.also must be a list of ids`)
      const parts = mark['parts']
      if (!Array.isArray(parts)) throw new SeenRefused(`${where}.parts must be a list`)
      const read = parts.map((part: unknown, j): MarkedPart => {
        if (!isObject(part) || !PART_KINDS.includes(part['kind'] as MarkedPart['kind']) || typeof part['id'] !== 'string' || typeof part['hash'] !== 'string') {
          throw new SeenRefused(`${where}.parts[${j}] must be an object with a kind, an id and a hash`)
        }
        return { kind: part['kind'] as MarkedPart['kind'], id: part['id'], hash: part['hash'] }
      })
      const at = mark['at']
      if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) throw new SeenRefused(`${where}.at must be a date and time`)
      return {
        code,
        thing: { kind: thing['kind'] as ThingKind, id: thing['id'] },
        also: also as string[],
        parts: read,
        reason: text(mark['reason'], `${where}.reason`, REASON_MAX),
        by: text(mark['by'], `${where}.by`, BY_MAX),
        at,
      }
    }),
  }
}

function oneLine(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

/** The marks file as read: its path in the project, its marks, and why it could not be read. */
export interface SeenRead {
  /** The marks file, relative to the project folder. */
  readonly file: string
  readonly marks: readonly SeenMark[]
  /** Why the file could not be read, when it is there and wrong: then no note counts as seen. */
  readonly problem: string | null
}

/**
 * Reads the marks file beside `planFile`, inside the project. No file is no marks. A file that
 * can't be read gives no marks and says why, so a check never fails on it. A path the project
 * refuses throws `PathRefused`.
 */
export function readSeen(project: Project, planFile: string): SeenRead {
  const file = seenFileOf(planFile)
  const shown = path.basename(file)
  // A path the project refuses is refused here, before anything is read.
  const relative = project.relative(project.resolve(file))
  let read: { text: string; real: string }
  try {
    read = project.readText(file, SEEN_FILE_MAX_BYTES)
  } catch (error) {
    if (error instanceof PathRefused) throw error
    if (error instanceof TextNotDecoded) return { file: relative, marks: [], problem: `${shown}: ${oneLine(error.message)}` }
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { file: relative, marks: [], problem: null }
    if (code === 'EISDIR') return { file: relative, marks: [], problem: `${shown} is a folder, not a marks file` }
    if (code === 'EFBIG') return { file: relative, marks: [], problem: `${shown} is larger than ${SEEN_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a marks file` }
    if (code === 'EACCES' || code === 'EPERM') return { file: relative, marks: [], problem: `${shown} can't be read: permission denied` }
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(read.text)
  } catch {
    // The parser's message quotes the text around the fault, and the text holds reasons and names.
    return { file: relative, marks: [], problem: `${shown} is not JSON` }
  }
  try {
    return { file: relative, marks: parseSeen(raw).marks, problem: null }
  } catch (error) {
    if (error instanceof SeenRefused) return { file: relative, marks: [], problem: `${shown} is not a marks file: ${error.message}` }
    throw error
  }
}

/** What a mark is given: the note's line, and the person's reason and name. */
export interface MarkRequest {
  readonly reason: string
  readonly by: string
  /** When; now when left out. */
  readonly at?: string
}

/**
 * Marks a line as seen, replacing a mark of the same note, and writes the marks file. A file
 * that is there and can't be read is refused, not replaced: it may hold marks.
 */
export function markSeen(project: Project, planFile: string, source: SeenSource, line: ResultLine, request: MarkRequest): { readonly file: string; readonly mark: SeenMark } {
  const reason = reasonProblem(request.reason, REASON_MAX)
  if (reason !== null) throw new SeenRefused(`The reason ${reason}.`)
  const by = reasonProblem(request.by, BY_MAX)
  if (by !== null) throw new SeenRefused(`Who marked it ${by}.`)
  const read = readSeen(project, planFile)
  if (read.problem !== null) throw new SeenRefused(`Nothing was marked: ${read.problem}. Correct the file, or take it out to start again.`)
  const mark: SeenMark = {
    code: line.code,
    thing: { kind: line.thing.kind, id: line.thing.id },
    also: [...line.also],
    parts: partsOf(source, line),
    reason: request.reason,
    by: request.by,
    at: request.at ?? new Date().toISOString(),
  }
  const marks = [...read.marks.filter((m) => !sameNote(m, line) && !earlierNote(m, line)), mark]
  writeSeen(project, planFile, marks)
  return { file: read.file, mark }
}

/** Takes a line's mark out of the marks file. False when it had none, and nothing is written. */
export function unmarkSeen(project: Project, planFile: string, line: ResultLine): { readonly file: string; readonly removed: SeenMark | null } {
  const read = readSeen(project, planFile)
  if (read.problem !== null) throw new SeenRefused(`Nothing was changed: ${read.problem}. Correct the file, or take it out to start again.`)
  const removed = read.marks.find((m) => sameNote(m, line)) ?? read.marks.find((m) => earlierNote(m, line)) ?? null
  if (removed !== null) writeSeen(project, planFile, read.marks.filter((m) => !sameNote(m, line) && !earlierNote(m, line)))
  return { file: read.file, removed }
}

function writeSeen(project: Project, planFile: string, marks: readonly SeenMark[]): void {
  const file = seenFileOf(planFile)
  const body: SeenFile = { version: '1', marks }
  try {
    project.writeFile(file, `${JSON.stringify(body, null, 2)}\n`)
  } catch (error) {
    if (error instanceof PathRefused) throw error
    const code = (error as NodeJS.ErrnoException).code
    throw new SeenRefused(`Can't write ${path.basename(file)}${code === 'EACCES' || code === 'EPERM' ? ': permission denied' : code === 'EISDIR' ? ': it is a folder' : `: ${oneLine((error as Error).message)}`}.`)
  }
}

/** The day of a mark, as 2026-11-22. */
export function markDay(mark: Pick<SeenMark, 'at'>): string {
  return mark.at.slice(0, 10)
}
