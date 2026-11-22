/**
 * MSG-4: what a plan file says that Grid does not read, found on the file as written, before
 * the schema throws it away.
 *
 * The schema drops a key it does not know and reads a room use it does not know as unstated,
 * on purpose: a plan with one odd word still opens. Until now nothing said so, so `thick` for
 * `thickness` left a wall at the default 0.2 m in silence, and `{}` gave nothing to look at
 * (lab MS-1, AU3-3). This lists each of them, with the nearest word Grid does know:
 *
 * - a field no part of the format has, on the plan, a wall, a room, an opening, a floor, a
 *   fixture or the trace image;
 * - a room use Grid does not know (a use is read whatever its capitals, so `Bedroom` is
 *   `bedroom` and is not listed);
 * - a plan with no walls, no rooms, no openings and no fixtures.
 *
 * The fields a part has are read from the schema itself, so a field added to the format is
 * known here the moment it is added. Pure: the file as parsed JSON in, plain data out. A field
 * name or a use is text from the file: one that breaks the text rule of MSG-9 is never repeated.
 */
import { z } from 'zod'
import { FloorPlanSchema, ROOM_USES, foldUseWord, readUse, withRunFromEnds, type RoomUse } from './floorplan'
import { textProblem } from './planText'
import { likelyMeant } from './nearest'

/** A part of the plan a note is about, by where it is in the file. */
export interface PartAt {
  /** The list it is in. */
  readonly list: 'walls' | 'rooms' | 'openings' | 'floors' | 'items' | 'stairs' | 'patterns'
  readonly index: number
}

export type ReadingNote =
  | {
      readonly kind: 'unknown-field'
      /** The field's name, or null when it breaks the text rule and is not repeated. */
      readonly field: string | null
      /** Where the field is, as `walls[2]` or `referenceImage`; `''` for the plan's top level. */
      readonly at: string
      /** The part it is on, when it is on one. */
      readonly part: PartAt | null
      /** The field Grid knows that was most likely meant, or null. */
      readonly nearest: string | null
      /** Whether the part already has the field most likely meant: then the word is a second copy. */
      readonly nearestWritten: boolean
      /** Every field that place has, in the format's order. */
      readonly known: readonly string[]
    }
  | {
      readonly kind: 'unknown-use'
      /** The use as written, or null when it is not text or breaks the text rule. */
      readonly use: string | null
      /** What it was when it is not text: `a number`, `a list`. */
      readonly notText: string | null
      readonly part: PartAt
      /** The use Grid knows that was most likely meant, or null. */
      readonly nearest: RoomUse | null
    }
  | { readonly kind: 'empty' }

// ---------------------------------------------------------------------------------------------
// Nearest word

/**
 * The word in `known` most likely meant by `word`, or null (`likelyMeant` in `nearest.ts`, the
 * one helper the drawing check and the tool server use too). A replaced letter is not a slip
 * here: `roofs` is not offered `rooms`.
 */
export function nearestWord<T extends string>(word: string, known: readonly T[]): T | null {
  return likelyMeant(word, known)
}

/**
 * Words agents write for a room use that mean one Grid knows (lab AU3-3), but that Grid does not
 * read as it (CNT-5): the words for the uses the figure checks look at, which a room takes only
 * by its author's own choice, and words that mean two things. Only a suggestion: a word that
 * plainly means a use is read as it (`USE_WORDS` in the schema), and never reaches this table.
 * A use with no match here and no near spelling is told to use "other".
 */
const USE_MEANS: Readonly<Record<string, RoomUse>> = {
  bed: 'bedroom',
  lounge: 'living',
  sitting: 'living',
  living: 'living',
  family: 'living',
  dining: 'dining',
  hall: 'corridor',
}

/** The use Grid knows that a use it does not know most likely meant, or null. */
export function nearestUse(use: string): RoomUse | null {
  const folded = foldUseWord(use)
  return (Object.hasOwn(USE_MEANS, folded) ? USE_MEANS[folded] : undefined) ?? nearestWord(use, ROOM_USES)
}

// ---------------------------------------------------------------------------------------------
// The fields the format has, read from the schema

/** The schema under the wrappers that do not change which fields a value has. */
function bare(schema: z.ZodTypeAny): z.ZodTypeAny {
  for (;;) {
    if (schema instanceof z.ZodEffects) schema = schema.innerType()
    else if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) schema = schema.unwrap()
    else if (schema instanceof z.ZodDefault) schema = schema.removeDefault()
    else if (schema instanceof z.ZodCatch) schema = schema.removeCatch()
    else if (schema instanceof z.ZodPipeline) schema = schema._def.in
    else return schema
  }
}

/**
 * The value as the schema reads it where the schema reads a field in another form: a straight
 * stair's `start` and `end` (LVL-3) are its walking line `run`, so they are known. Only that one
 * reading: the others fill in defaults, which would hide a misspelt field's meaning.
 */
function preprocessed(schema: z.ZodTypeAny, value: unknown): unknown {
  for (;;) {
    if (schema instanceof z.ZodEffects) {
      const effect = schema._def.effect
      if (effect.type === 'preprocess' && effect.transform === withRunFromEnds) return withRunFromEnds(value)
      schema = schema.innerType()
    } else if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) schema = schema.unwrap()
    else if (schema instanceof z.ZodDefault) schema = schema.removeDefault()
    else return value
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const LISTS = new Set(['walls', 'rooms', 'openings', 'floors', 'items', 'stairs', 'patterns'])

function where(path: readonly (string | number)[]): string {
  return path.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${key}` : key), '')
}

function partOf(path: readonly (string | number)[]): PartAt | null {
  const [list, index] = path
  return typeof list === 'string' && LISTS.has(list) && typeof index === 'number' ? { list: list as PartAt['list'], index } : null
}

/** WRT-6, HND-11: fields the reading adds, which no file states: a file that writes one is told it is not read. */
const READING_ONLY = new Set(['unstated', 'placedBy'])

/** Walks the file and its schema side by side, noting each key the schema does not have. */
function walk(schema: z.ZodTypeAny, given: unknown, path: (string | number)[], notes: ReadingNote[]): void {
  const shape = bare(schema)
  const value = preprocessed(schema, given)
  if (shape instanceof z.ZodArray) {
    if (!Array.isArray(value)) return
    value.forEach((item, i) => walk(shape.element as z.ZodTypeAny, item, [...path, i], notes))
    return
  }
  if (!(shape instanceof z.ZodObject) || !isObject(value)) return
  const fields = shape.shape as Record<string, z.ZodTypeAny>
  const known = Object.keys(fields).filter((key) => !READING_ONLY.has(key))
  for (const key of Object.keys(value)) {
    if (Object.hasOwn(fields, key) && !READING_ONLY.has(key)) {
      walk(fields[key]!, value[key], [...path, key], notes)
      continue
    }
    const nearest = nearestWord(key, known)
    notes.push({
      kind: 'unknown-field',
      field: textProblem(key, 'id') === null ? key : null,
      at: where(path),
      part: partOf(path),
      nearest,
      nearestWritten: nearest !== null && Object.hasOwn(value, nearest),
      known,
    })
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'a list'
  if (typeof value === 'object') return 'an object'
  return typeof value === 'boolean' ? 'true or false' : `a ${typeof value}`
}

/**
 * What the file says that Grid does not read, in the order the file gives it: each unknown
 * field, each room use Grid does not know, and an empty plan. Empty for anything that is not a
 * JSON object: that is refused, and the refusal says so.
 */
export function readingNotes(raw: unknown): ReadingNote[] {
  if (!isObject(raw)) return []
  const notes: ReadingNote[] = []
  walk(FloorPlanSchema, raw, [], notes)
  const rooms = raw['rooms']
  if (Array.isArray(rooms)) {
    rooms.forEach((room: unknown, index) => {
      // No use, or null, is a use not stated: that is the format's, and the checks say so.
      if (!isObject(room) || room['use'] === undefined || room['use'] === null) return
      const use = readUse(room['use'])
      if (typeof use === 'string' && (ROOM_USES as readonly string[]).includes(use)) return
      const text = typeof use === 'string' && textProblem(use, 'name') === null ? use : null
      notes.push({
        kind: 'unknown-use',
        use: text,
        notText: typeof use === 'string' ? null : typeName(use),
        part: { list: 'rooms', index },
        nearest: text === null ? null : nearestUse(text),
      })
    })
  }
  const none = (key: string): boolean => !Array.isArray(raw[key]) || (raw[key] as unknown[]).length === 0
  if (none('walls') && none('rooms') && none('openings') && none('items')) notes.push({ kind: 'empty' })
  return notes
}
