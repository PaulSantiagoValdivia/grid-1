/**
 * MSG-6: a plan read part by part. A fault stays where it is.
 *
 * `parseFloorPlan` is all or nothing: one negative offset, one number written as text or one
 * `null` refuses the whole plan with a position such as `openings.3.offset` (lab MS-6). This
 * reader checks each wall, room, opening, floor and fixture with the schema's own rules, keeps
 * what is sound, and says what it did with the rest, part by part:
 *
 * - **read as meant**: a number written as text (`"2.5"`, `"0.9 m"`), `"true"` for true, a word
 *   that differs from one the format knows only in its capitals or spaces (`"Exterior"`,
 *   `"Door"`), and a number where an id goes. The value is read and the line says so.
 * - **value left out**: a value the format cannot read in a field that may be left out. The
 *   field's default is used, or the field is read as not stated, and the line says which. A
 *   size stated where the field has a default is not: the default would change what is drawn,
 *   so the part is left out (`STATED_SIZES`).
 * - **part left out**: a value the part cannot do without (a wall's start, an opening's type)
 *   that cannot be read. The part is set aside; the rest of the plan is read and checked
 *   without it, and every view, measure and export leaves it out.
 *
 * Then the ids. Ids are unique across the whole plan (the owner's decision of 20 November
 * 2026). Of two parts of different kinds with one id, only the clash is set aside: the wall is
 * kept, because rooms and openings name walls, and the other part is left out, so the rooms on
 * that wall are still measured (lab MS-9). This is the reader's to do, because `validatePlan`
 * marks what it skips in one set of ids, where a room named after a wall takes the wall with it.
 * Two walls with one id are left as they are for `validatePlan`, which skips both
 * (`plan/duplicate-id`): a room that names that id could mean either; so are a blank id and two
 * ids that differ only in capitals or spaces (`plan/blank-id`, `plan/similar-id`).
 *
 * What is left at the plan's top level (a version Grid does not read, a list that is not a
 * list) still refuses the plan, with the schema's own problems. Pure: the file as JSON in,
 * plain data out. Text from the file is repeated only in quotes and only when it keeps to the
 * text rule (MSG-9).
 */
import { z } from 'zod'
import {
  FloorPlanSchema,
  FloorSchema,
  ItemSchema,
  OpeningSchema,
  RoomSchema,
  WallSchema,
  type FloorPlan,
  type PlanSchemaIssue
} from './floorplan'
import type { JsonPath, TextMark } from './jsonText'
import { quoted, textProblem } from './planText'
import { FILE_UNITS, planInMetres } from './units'

export type PartList = 'walls' | 'rooms' | 'openings' | 'floors' | 'items'

/** The part a fault is about: where it is in the file, and its id when it can be read. */
export interface PartRef {
  readonly list: PartList
  /** Its position in the file's list, from 0. */
  readonly index: number
  /** Its id, when it is text that keeps to the text rule; else null. */
  readonly id: string | null
}

interface ValueFault {
  /** The part it is in; null for the plan's own fields (`units`, `referenceImage`). */
  readonly part: PartRef | null
  /** Where the value is, from the top of the file. */
  readonly path: JsonPath
  /** What is there, in words: `-0.3`, `null`, `missing`, `NaN, which JSON does not hold as a number`. */
  readonly found: string
  /** What the format takes there, in words: `a number of at least 0`. */
  readonly wants: string
}

export type ReadFault =
  | (ValueFault & { readonly kind: 'read-as-meant'; /** The value read, in words. */ readonly read: string })
  | (ValueFault & {
      readonly kind: 'value-left-out'
      /** The default used, in words; null when the field is read as not stated. */
      readonly used: string | null
    })
  | (ValueFault & { readonly kind: 'part-left-out'; readonly part: PartRef })
  /** A part with the id of a part of another kind, or of the same kind but not two walls. It is left out; `kept` is read. */
  | { readonly kind: 'id-clash'; readonly part: PartRef & { readonly id: string }; readonly kept: PartRef & { readonly id: string } }

export type PlanRead =
  | {
      readonly plan: FloorPlan
      /** What the reader did with each part or value it could not read as written, in file order. */
      readonly faults: readonly ReadFault[]
      /** The ids of the walls left out, for `validatePlan` to name them on the rooms and openings that rest on them. */
      readonly leftOutWalls: ReadonlySet<string>
    }
  | {
      readonly plan: null
      /** `not-an-object`, or what the schema refuses at the plan's top level. */
      readonly refusal: { readonly kind: 'not-an-object' } | { readonly kind: 'schema'; readonly issues: readonly PlanSchemaIssue[] }
    }

const LISTS: readonly PartList[] = ['walls', 'rooms', 'openings', 'floors', 'items']
const SCHEMAS: Record<PartList, z.ZodTypeAny> = {
  walls: WallSchema,
  rooms: RoomSchema,
  openings: OpeningSchema,
  floors: FloorSchema,
  items: ItemSchema
}
/**
 * The sizes with a default. A size stated there that cannot be read (out of range, NaN, a
 * decimal comma, a word) is a statement, not a gap: the default would change what is drawn and
 * measured (a wall stated -0.3 thick drawn 0.2 thick), so the part is left out instead. Only
 * `null`, which states nothing, takes the default. A floor's `level` is not one of them: it only
 * orders the floors, and leaving a floor out would leave out everything on it.
 */
const STATED_SIZES: Partial<Record<PartList, readonly string[]>> = { walls: ['thickness', 'height'], openings: ['sill'] }

/** The order ids are kept in: walls first, because rooms and openings name them. */
const ID_ORDER: readonly PartList[] = ['walls', 'rooms', 'openings', 'items']

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const sameKeys = (a: JsonPath, b: JsonPath): boolean => a.length === b.length && a.every((key, i) => key === b[i])

/** An id as a line may repeat it: text that keeps to the text rule. */
export function readableId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && textProblem(value, 'id') === null ? value : null
}

// ---------------------------------------------------------------------------------------------
// Words for what is found and what is wanted

const TYPE_WORDS: Record<string, string> = {
  number: 'a number',
  string: 'a text',
  boolean: 'true or false',
  array: 'a list',
  object: 'an object',
  null: 'null',
  nan: 'NaN'
}

/** What a value is, in words, never repeating text that breaks the text rule. */
function valueText(value: unknown, mark: TextMark | undefined): string {
  if (mark?.what === 'not-a-number') return `${mark.token}, which JSON does not hold as a number`
  if (mark?.what === 'decimal-comma') return `${mark.token}, written with a decimal comma`
  if (value === undefined) return 'missing'
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') {
    if (value === '') return 'an empty text'
    return textProblem(value, 'id') === null ? `the text ${quoted(value)}` : 'a text'
  }
  if (Array.isArray(value)) return `a list of ${value.length}`
  return 'an object'
}

/** What the format takes where a number is too small or too large, or a list too short or long. */
function rangeText(issue: PlanSchemaIssue & { code: 'too_small' | 'too_big' }): string {
  const small = issue.code === 'too_small'
  const bound = small ? issue.minimum : issue.maximum
  const value = typeof bound === 'bigint' ? bound.toString() : String(bound)
  if (issue.type === 'number') return `a number ${small ? (issue.inclusive ? 'of at least' : 'more than') : issue.inclusive ? 'of at most' : 'less than'} ${value}`
  if (issue.type === 'array' && issue.exact) return `a list of ${value}`
  const unit = issue.type === 'string' ? 'characters' : 'items'
  return `${small ? 'at least' : 'at most'} ${value} ${unit}`
}

/** What the format takes at the place of a schema problem, in words. */
export function wantedText(issue: PlanSchemaIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return TYPE_WORDS[issue.expected] ?? `a ${issue.expected}`
    case 'invalid_enum_value':
      return `one of ${issue.options.map((o) => JSON.stringify(o)).join(', ')}`
    case 'invalid_literal':
      return JSON.stringify(issue.expected)
    case 'too_small':
    case 'too_big':
      return rangeText(issue)
    case 'not_finite':
      return 'a finite number'
    default:
      return 'what the plan format sets out'
  }
}

/** What was found at the place of a schema problem, in words. */
function foundText(issue: PlanSchemaIssue, value: unknown, mark: TextMark | undefined): string {
  if (mark !== undefined) return valueText(value, mark)
  // A text-rule problem says what is wrong with the text without repeating it (MSG-9).
  if (issue.code === 'custom') return `${typeof value === 'string' ? 'a text' : Array.isArray(value) ? 'a list' : 'a value'} that ${issue.message}`
  // `[4, 6, 3, 3]` where a point goes: most likely `4,6` and `3,3` with a decimal comma.
  if (issue.code === 'too_big' && issue.type === 'array' && Array.isArray(value) && value.length === 4 && value.every((v) => Number.isInteger(v))) {
    return `a list of 4 numbers, ${value.join(', ')}: a decimal comma splits each number of a point in two`
  }
  return valueText(value, undefined)
}

// ---------------------------------------------------------------------------------------------
// Read as meant

const NO = Symbol('no reading')
const NUMBER_TEXT = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(?:m)?\s*$/
const fold = (word: string): string => word.toLowerCase().replace(/[\s_-]+/g, '')

/** The value most likely meant, when it can be told for sure; else `NO`. */
function asMeant(value: unknown, issue: PlanSchemaIssue): unknown {
  if (issue.code === 'invalid_type') {
    if (issue.expected === 'number' && typeof value === 'string') {
      const found = NUMBER_TEXT.exec(value)
      return found === null ? NO : Number(found[1])
    }
    if (issue.expected === 'boolean' && typeof value === 'string') {
      const word = value.trim().toLowerCase()
      return word === 'true' ? true : word === 'false' ? false : NO
    }
    // An id or a name written as a whole number: 12 for "12".
    if (issue.expected === 'string' && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
    return NO
  }
  if (issue.code === 'invalid_enum_value' && typeof value === 'string' && value.trim() !== '') {
    const match = issue.options.filter((option) => typeof option === 'string' && fold(option) === fold(value))
    return match.length === 1 ? match[0] : NO
  }
  if (issue.code === 'invalid_literal' && typeof issue.expected === 'string') {
    if (typeof value === 'string' && value.trim() !== '' && fold(value) === fold(issue.expected)) return issue.expected
    if (typeof value === 'number' && String(value) === issue.expected) return issue.expected
  }
  return NO
}

/** A value read or used, in words. */
function readText(value: unknown): string {
  if (typeof value === 'string') return quoted(value)
  if (Array.isArray(value) || isObject(value)) return JSON.stringify(value)
  return String(value)
}

// ---------------------------------------------------------------------------------------------
// One part

function getAt(root: unknown, path: JsonPath): unknown {
  let here: unknown = root
  for (const key of path) {
    if (typeof here !== 'object' || here === null) return undefined
    here = (here as Record<string | number, unknown>)[key]
  }
  return here
}

/**
 * Sets a value inside a part, copying each list and object on the way, so the file as read is
 * never changed. Never a deep copy: a part may nest a list a hundred thousand deep (lab T-9).
 */
function setAt(root: Record<string, unknown>, path: JsonPath, value: unknown): void {
  let here: Record<string | number, unknown> = root
  for (const key of path.slice(0, -1)) {
    const child = here[key]
    const copy = (Array.isArray(child) ? [...child] : { ...(child as object) }) as Record<string | number, unknown>
    here[key] = copy
    here = copy
  }
  here[path[path.length - 1]!] = value
}

/**
 * One part, read as far as it can be: the part as it is kept (or null when it is left out), and
 * what was done to it. A value left out is told the default used once the part is read.
 */
function readPart(list: PartList, index: number, raw: unknown, marks: readonly TextMark[]): { part: Record<string, unknown> | null; faults: ReadFault[] } {
  const schema = SCHEMAS[list]
  const ref: PartRef = { list, index, id: isObject(raw) ? readableId(raw['id']) : null }
  if (!isObject(raw)) {
    return { part: null, faults: [{ kind: 'part-left-out', part: ref, path: [list, index], found: valueText(raw, undefined), wants: 'an object' }] }
  }
  const part: Record<string, unknown> = { ...raw }
  let faults: ReadFault[] = []
  // A value left out, in its place among the faults, until the default it leaves is known.
  const pending = new Map<ReadFault, string>()
  const tried = new Set<string>()
  // Each turn reads one value as meant or leaves one field out, so a part cannot take more
  // turns than it has values; the bound only stops a schema that never settles.
  for (let turn = 0; turn < 64; turn++) {
    const parsed = schema.safeParse(part)
    if (parsed.success) {
      const data = parsed.data as Record<string, unknown>
      const used = (field: string): string | null => (data[field] === undefined ? null : readText(data[field]))
      return { part, faults: faults.map((f) => (pending.has(f) ? { ...f, used: used(pending.get(f)!) } : f)) }
    }
    const issue = parsed.error.issues[0]! as PlanSchemaIssue
    const path: JsonPath = [list, index, ...issue.path]
    const mark = marks.find((m) => sameKeys(m.path, path))
    const value = getAt(part, issue.path)
    const said = { part: ref, path, found: foundText(issue, value, mark), wants: wantedText(issue) }
    const field = issue.path[0]
    const key = issue.path.join('.')
    if (mark === undefined && !tried.has(key)) {
      const meant = asMeant(value, issue)
      if (meant !== NO && issue.path.length > 0) {
        tried.add(key)
        setAt(part, issue.path, meant)
        faults.push({ kind: 'read-as-meant', ...said, read: readText(meant) })
        continue
      }
    }
    // A value read as meant that still does not fit is said once, as what is done with it.
    const others = faults.filter((f) => f.kind !== 'read-as-meant' || !sameKeys(f.path, path))
    // A field the part can do without: left out, and its default used. Never the id, and never a
    // number out of range where the field has a default.
    const stated = typeof field === 'string' && (STATED_SIZES[list] ?? []).includes(field) && (value !== null || mark !== undefined)
    if (typeof field === 'string' && field !== 'id' && !stated && Object.hasOwn(part, field)) {
      const without = { ...part }
      delete without[field]
      const again = schema.safeParse(without)
      if (again.success || !again.error.issues.some((i) => i.path[0] === field)) {
        delete part[field]
        const fault: ReadFault = { kind: 'value-left-out', ...said, used: null }
        faults = [...others, fault]
        pending.set(fault, field)
        continue
      }
    }
    return { part: null, faults: [{ kind: 'part-left-out', ...said }] }
  }
  return { part: null, faults: [{ kind: 'part-left-out', part: ref, path: [list, index], found: 'a part Grid could not read', wants: 'what the plan format sets out' }] }
}

// ---------------------------------------------------------------------------------------------
// The plan

/** Where each kept part was in the file, list by list. */
type Positions = Record<PartList, number[]>

/** The plan's own fields, once its parts are read: read as meant, left out, or refused. */
function readTop(work: Record<string, unknown>, faults: ReadFault[], marks: readonly TextMark[]): { plan: FloorPlan } | { issues: PlanSchemaIssue[] } {
  const tried = new Set<string>()
  for (let turn = 0; turn < 16; turn++) {
    const parsed = FloorPlanSchema.safeParse(work)
    if (parsed.success) return { plan: parsed.data }
    const issue = parsed.error.issues[0]! as PlanSchemaIssue
    const [field] = issue.path
    // A list that is not a list, too long a list, or a part the schema still refuses: the
    // parts were each read, so this is the plan's shape, and the plan is refused.
    if (typeof field !== 'string' || field === 'version' || LISTS.includes(field as PartList)) {
      if (field === 'version' && !tried.has('version')) {
        const meant = asMeant(work['version'], issue)
        if (meant !== NO) {
          tried.add('version')
          faults.push({ kind: 'read-as-meant', part: null, path: issue.path, found: foundText(issue, work['version'], undefined), wants: wantedText(issue), read: readText(meant) })
          work['version'] = meant
          continue
        }
      }
      return { issues: parsed.error.issues as PlanSchemaIssue[] }
    }
    const value = getAt(work, issue.path)
    const mark = marks.find((m) => sameKeys(m.path, issue.path))
    const said = { part: null, path: issue.path, found: foundText(issue, value, mark), wants: wantedText(issue) }
    if (mark === undefined && !tried.has(field)) {
      const meant = issue.path.length === 1 ? asMeant(value, issue) : NO
      if (meant !== NO) {
        tried.add(field)
        work[field] = meant
        faults.push({ kind: 'read-as-meant', ...said, read: readText(meant) })
        continue
      }
    }
    // COD-3: a place Grid does not know is left out alone; the rest of the site is kept.
    const site = work['site']
    if (field === 'site' && issue.path.length === 2 && issue.path[1] === 'country' && typeof site === 'object' && site !== null && !Array.isArray(site)) {
      const rest = { ...(site as Record<string, unknown>) }
      delete rest['country']
      work['site'] = rest
      faults.push({ kind: 'value-left-out', ...said, used: null })
      continue
    }
    // `units` keeps its default, metres; `projectId` and `referenceImage` are read as not stated.
    delete work[field]
    const used = FloorPlanSchema.safeParse(work)
    const data = used.success ? (used.data as Record<string, unknown>)[field] : undefined
    faults.push({ kind: 'value-left-out', ...said, used: data === undefined ? null : readText(data) })
  }
  return { issues: (FloorPlanSchema.safeParse(work).error?.issues ?? []) as PlanSchemaIssue[] }
}

/** One id on two parts, but not two walls: the first is kept, in the order walls, rooms, openings, items. */
function readClashes(plan: FloorPlan, positions: Positions, faults: ReadFault[]): FloorPlan {
  const out = { ...plan } as Record<string, unknown>
  const first = new Map<string, PartRef & { id: string }>()
  for (const list of ID_ORDER) {
    const parts = (plan[list as keyof FloorPlan] ?? undefined) as readonly { id: string }[] | undefined
    if (parts === undefined) continue
    const kept: { id: string }[] = []
    parts.forEach((part, at) => {
      const ref = { list, index: positions[list][at]!, id: part.id }
      const same = first.get(part.id)
      // Two walls with one id stay for `validatePlan`: a room naming it could mean either.
      if (same !== undefined && !(same.list === 'walls' && list === 'walls')) {
        faults.push({ kind: 'id-clash', part: ref, kept: same })
        return
      }
      if (same === undefined) first.set(part.id, ref)
      kept.push(part)
    })
    if (kept.length !== parts.length) out[list] = kept
  }
  return out as FloorPlan
}

/**
 * Reads a plan part by part. `raw` is the file as JSON; `marks` are the values its text held
 * that JSON does not (`readPlanText`), at their places. Never throws.
 */
export function readPlanParts(given: unknown, marks: readonly TextMark[] = []): PlanRead {
  if (!isObject(given)) return { plan: null, refusal: { kind: 'not-an-object' } }
  const faults: ReadFault[] = []
  // WRT-7: a file that states its lengths in another unit is read in that unit, and in metres from here on.
  const converted = planInMetres(given)
  const raw = converted.raw
  if (converted.from !== null) {
    faults.push({ kind: 'read-as-meant', part: null, path: ['units'], found: JSON.stringify(given['units']), wants: '"m": Grid stores metres', read: `"m", every length read in ${FILE_UNITS[converted.from]!.name} and converted to metres` })
  }
  const positions = Object.fromEntries(LISTS.map((list) => [list, [] as number[]])) as Positions
  const work: Record<string, unknown> = { ...raw }
  const whole = FloorPlanSchema.safeParse(raw)
  const bad = new Set(whole.success ? [] : whole.error.issues.filter((i) => typeof i.path[1] === 'number').map((i) => `${i.path[0]}|${i.path[1]}`))
  for (const list of LISTS) {
    const parts = raw[list]
    if (!Array.isArray(parts)) continue
    const kept: unknown[] = []
    parts.forEach((part, index) => {
      if (!bad.has(`${list}|${index}`)) {
        kept.push(part)
        positions[list].push(index)
        return
      }
      const read = readPart(list, index, part, marks)
      faults.push(...read.faults)
      if (read.part !== null) {
        kept.push(read.part)
        positions[list].push(index)
      }
    })
    work[list] = kept
  }
  const top = whole.success ? { plan: whole.data } : readTop(work, faults, marks)
  if (!('plan' in top)) return { plan: null, refusal: { kind: 'schema', issues: top.issues } }
  const plan = readClashes(top.plan, positions, faults)
  const leftOutWalls = new Set<string>()
  for (const fault of faults) {
    if (fault.part === null || fault.part.list !== 'walls' || fault.part.id === null) continue
    if (fault.kind === 'part-left-out' || fault.kind === 'id-clash') leftOutWalls.add(fault.part.id)
  }
  return { plan, faults, leftOutWalls }
}
