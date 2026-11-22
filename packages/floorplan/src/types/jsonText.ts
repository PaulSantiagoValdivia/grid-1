/**
 * MSG-6: a plan file's text, read before the JSON reader sees it.
 *
 * Three things stop a plan at the JSON reader with nothing to go on (lab MS-6, U-10): git's
 * conflict markers left by an unfinished merge, `NaN` or `Infinity` where a number goes, and a
 * number written with a decimal comma (`"offset": 3,45`). The reader gives "Unexpected token"
 * and a character position, and no part of the plan is drawn.
 *
 * - An unfinished merge is named for what it is: where it is, how many conflicts it holds, and
 *   what each side adds or changes, by id. Grid cannot tell which side is meant, so the plan is
 *   not read.
 * - `NaN`, `Infinity` and a decimal comma inside an object are each read as a value that is not
 *   there, at its place in the plan, and marked, so the part-by-part reader (`readParts.ts`)
 *   names it for what it is and still reads the rest. A decimal comma inside a list is valid
 *   JSON (`[4,6]` is two numbers), so it is never read as one: the reader names a point with
 *   too many numbers instead.
 *
 * The markers are looked for in every file: a merge can leave text that is still JSON. The
 * other two are looked for only when the JSON reader refuses the text, so a sound file costs
 * one read. Pure: text in, plain data out. Text from the file is never repeated except a
 * branch's label or an id that keeps to the text rule (MSG-9), in quotes.
 */
import { textProblem } from './planText'

/** A place in the plan: keys and positions, as `["walls", 2, "thickness"]`. */
export type JsonPath = readonly (string | number)[]

/** A value the text holds that JSON does not, read as a value that is not there. */
export interface TextMark {
  readonly path: JsonPath
  /** `not-a-number`: `NaN`, `Infinity` or `-Infinity`. `decimal-comma`: `3,45` in an object. */
  readonly what: 'not-a-number' | 'decimal-comma'
  /** The value as the file writes it: `NaN`, `3,45`. Only these characters ever are. */
  readonly token: string
  /** Where it is, counted from 1. */
  readonly line: number
  readonly column: number
}

/** One side of an unfinished merge. */
export interface MergeSide {
  /** The branch or commit the markers name, when it keeps to the text rule; else null. */
  readonly label: string | null
  /** Ids of the parts only this side has. */
  readonly adds: readonly string[]
}

export interface UnfinishedMerge {
  readonly kind: 'unfinished-merge'
  /** The line of the first conflict marker, counted from 1. */
  readonly line: number
  /** How many conflicts the file holds. */
  readonly conflicts: number
  readonly ours: MergeSide
  readonly theirs: MergeSide
  /** Ids of the parts both sides have, written differently. */
  readonly changed: readonly string[]
}

export interface NotJson {
  readonly kind: 'not-json'
  /** Where the text stops being JSON, counted from 1; null when the reader did not say. */
  readonly line: number | null
  readonly column: number | null
  /** True when the text ends before the JSON does. */
  readonly ends: boolean
}

export type TextRead =
  | { readonly ok: true; readonly value: unknown; readonly marks: readonly TextMark[] }
  | { readonly ok: false; readonly fault: UnfinishedMerge | NotJson }

/** Reads a plan file's text: its JSON value and the marks, or why it cannot be read. */
export function readPlanText(text: string): TextRead {
  const merge = unfinishedMerge(text)
  if (merge !== null) return { ok: false, fault: merge }
  try {
    return { ok: true, value: JSON.parse(text), marks: [] }
  } catch (error) {
    const scanned = scan(text)
    if ('marks' in scanned && scanned.marks.length > 0) {
      try {
        return { ok: true, value: JSON.parse(scanned.text), marks: scanned.marks }
      } catch {
        // Something else is wrong too: say where the text stops being JSON.
      }
    }
    return { ok: false, fault: notJson(text, error, 'at' in scanned ? scanned.at : null) }
  }
}

// ---------------------------------------------------------------------------------------------
// Where a text stops being JSON

/** Line and column of a character offset, counted from 1. */
function lineAt(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split('\n')
  return { line: before.length, column: before[before.length - 1]!.length + 1 }
}

/** Where the text stops being JSON: the reader's own position, else where the scan stopped. */
function notJson(text: string, error: unknown, stopped: number | null): NotJson {
  const message = error instanceof Error ? error.message : String(error)
  if (/unexpected end of json input/i.test(message) || stopped === text.length) return { kind: 'not-json', line: null, column: null, ends: true }
  const at = /position (\d+)/.exec(message)
  const offset = at !== null ? Number(at[1]) : stopped
  if (offset === null) return { kind: 'not-json', line: null, column: null, ends: false }
  return { kind: 'not-json', ...lineAt(text, offset), ends: false }
}

// ---------------------------------------------------------------------------------------------
// An unfinished merge

const START = /^<{7}(?:[ \t]+(.*))?$/
const BASE = /^\|{7}(?:[ \t].*)?$/
const MIDDLE = /^={7}[ \t]*$/
const END = /^>{7}(?:[ \t]+(.*))?$/

const labelOf = (text: string | undefined): string | null => {
  const label = text?.trim() ?? ''
  return label.length > 0 && textProblem(label, 'name') === null ? label : null
}

/**
 * The conflicts git leaves in a file it could not merge, or null when there are none. Only a
 * whole conflict counts: a start, a middle and an end marker, in that order, each at the start
 * of its own line.
 */
function unfinishedMerge(text: string): UnfinishedMerge | null {
  // Cheap first: most plans hold no line that starts with seven of these.
  if (!/^(<{7}|>{7})/m.test(text)) return null
  const lines = text.split(/\r?\n/)
  const ours: string[] = []
  const theirs: string[] = []
  const oursOnly: string[] = []
  const theirsOnly: string[] = []
  let first = -1
  let conflicts = 0
  let labels: { ours: string | null; theirs: string | null } = { ours: null, theirs: null }
  let state: 'out' | 'ours' | 'base' | 'theirs' = 'out'
  let pending: { ours: string[]; theirs: string[]; start: number; label: string | null } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (state === 'out') {
      const start = START.exec(line)
      if (start !== null) {
        state = 'ours'
        pending = { ours: [], theirs: [], start: i, label: labelOf(start[1]) }
        continue
      }
      ours.push(line)
      theirs.push(line)
      continue
    }
    if (state === 'ours' && BASE.test(line)) {
      state = 'base'
      continue
    }
    if ((state === 'ours' || state === 'base') && MIDDLE.test(line)) {
      state = 'theirs'
      continue
    }
    const end = state === 'theirs' ? END.exec(line) : null
    if (end !== null && pending !== null) {
      if (first < 0) {
        first = pending.start
        labels = { ours: pending.label, theirs: labelOf(end[1]) }
      }
      conflicts++
      ours.push(...pending.ours)
      theirs.push(...pending.theirs)
      oursOnly.push(...pending.ours)
      theirsOnly.push(...pending.theirs)
      pending = null
      state = 'out'
      continue
    }
    if (state === 'ours') pending!.ours.push(line)
    else if (state === 'theirs') pending!.theirs.push(line)
  }
  if (conflicts === 0) return null
  const sides = partsOfSides(ours.join('\n'), theirs.join('\n')) ?? idsOfSides(oursOnly.join('\n'), theirsOnly.join('\n'))
  return {
    kind: 'unfinished-merge',
    line: first + 1,
    conflicts,
    ours: { label: labels.ours, adds: sides.ours },
    theirs: { label: labels.theirs, adds: sides.theirs },
    changed: sides.changed
  }
}

const LISTS = ['walls', 'rooms', 'openings', 'floors', 'items'] as const
const safeId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && textProblem(id, 'id') === null

/** Each side read as a whole plan, and its parts compared by id. Null when a side is not JSON. */
function partsOfSides(ours: string, theirs: string): { ours: string[]; theirs: string[]; changed: string[] } | null {
  const parts = (text: string): Map<string, string> | null => {
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      return null
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const found = new Map<string, string>()
    for (const list of LISTS) {
      const items = (value as Record<string, unknown>)[list]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const id = typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['id'] : undefined
        if (safeId(id) && !found.has(id)) found.set(id, JSON.stringify(item))
      }
    }
    return found
  }
  const a = parts(ours)
  const b = parts(theirs)
  if (a === null || b === null) return null
  return {
    ours: [...a.keys()].filter((id) => !b.has(id)),
    theirs: [...b.keys()].filter((id) => !a.has(id)),
    changed: [...a.keys()].filter((id) => b.has(id) && b.get(id) !== a.get(id))
  }
}

/** The ids written on each side's lines, when a side is not JSON on its own. */
function idsOfSides(ours: string, theirs: string): { ours: string[]; theirs: string[]; changed: string[] } {
  const ids = (text: string): string[] => {
    const found: string[] = []
    for (const match of text.matchAll(/"id"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      let id: unknown
      try {
        id = JSON.parse(`"${match[1]}"`)
      } catch {
        continue
      }
      if (safeId(id) && !found.includes(id)) found.push(id)
    }
    return found
  }
  const a = ids(ours)
  const b = ids(theirs)
  return { ours: a.filter((id) => !b.includes(id)), theirs: b.filter((id) => !a.includes(id)), changed: a.filter((id) => b.includes(id)) }
}

// ---------------------------------------------------------------------------------------------
// NaN, Infinity and the decimal comma

interface Frame {
  readonly list: boolean
  key: string | number
  state: 'key-or-end' | 'key' | 'colon' | 'value' | 'value-or-end' | 'comma-or-end'
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const NOT_A_NUMBER = /(?:-?Infinity|NaN)/y
const COMMA_DIGITS = /,(\d+)(?=[ \t\r\n]*[,}])/y
const WORD = /true|false|null/y
const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y

function sticky(pattern: RegExp, text: string, at: number): string | null {
  pattern.lastIndex = at
  const found = pattern.exec(text)
  return found === null ? null : found[0]
}

/**
 * The text with each `NaN`, `Infinity` and decimal comma read as `null`, and where each was; or
 * the offset where the text stops being JSON in some other way (its length when it ends first).
 */
function scan(text: string): { text: string; marks: TextMark[] } | { at: number } {
  const marks: TextMark[] = []
  const pieces: string[] = []
  let copied = 0
  const stack: Frame[] = []
  let i = 0
  let lastNumber: { start: number; end: number } | null = null
  let done = false

  const path = (): JsonPath => stack.map((frame) => frame.key)
  const valueDone = (): void => {
    const top = stack[stack.length - 1]
    if (top === undefined) done = true
    else top.state = 'comma-or-end'
  }
  const replace = (start: number, end: number, what: TextMark['what']): void => {
    marks.push({ path: path(), what, token: text.slice(start, end), ...lineAt(text, start) })
    pieces.push(text.slice(copied, start), 'null')
    copied = end
  }

  while (i < text.length) {
    const c = text[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (done) return { at: i }
    const top = stack[stack.length - 1]
    const state = top?.state ?? 'value'
    if (state === 'value' || state === 'value-or-end') {
      if (state === 'value-or-end' && c === ']') {
        stack.pop()
        i++
        valueDone()
        continue
      }
      lastNumber = null
      if (c === '{') {
        stack.push({ list: false, key: '', state: 'key-or-end' })
        i++
        continue
      }
      if (c === '[') {
        stack.push({ list: true, key: 0, state: 'value-or-end' })
        i++
        continue
      }
      const string = c === '"' ? sticky(STRING, text, i) : null
      if (string !== null) {
        i += string.length
        valueDone()
        continue
      }
      const nan = sticky(NOT_A_NUMBER, text, i)
      if (nan !== null) {
        replace(i, i + nan.length, 'not-a-number')
        i += nan.length
        valueDone()
        continue
      }
      const number = sticky(NUMBER, text, i)
      if (number !== null) {
        lastNumber = { start: i, end: i + number.length }
        i += number.length
        valueDone()
        continue
      }
      const word = sticky(WORD, text, i)
      if (word !== null) {
        i += word.length
        valueDone()
        continue
      }
      return { at: i }
    }
    if (top === undefined) return { at: i }
    if (state === 'comma-or-end') {
      if (c === ',' && !top.list && lastNumber !== null && lastNumber.end === i) {
        const digits = sticky(COMMA_DIGITS, text, i)
        if (digits !== null && !/[.eE]/.test(text.slice(lastNumber.start, lastNumber.end))) {
          replace(lastNumber.start, i + digits.length, 'decimal-comma')
          i += digits.length
          lastNumber = null
          continue
        }
      }
      lastNumber = null
      if (c === ',') {
        if (top.list) {
          top.key = (top.key as number) + 1
          top.state = 'value'
        } else top.state = 'key'
        i++
        continue
      }
      if ((c === '}' && !top.list) || (c === ']' && top.list)) {
        stack.pop()
        i++
        valueDone()
        continue
      }
      return { at: i }
    }
    if (state === 'key-or-end' || state === 'key') {
      if (state === 'key-or-end' && c === '}') {
        stack.pop()
        i++
        valueDone()
        continue
      }
      const key = c === '"' ? sticky(STRING, text, i) : null
      if (key === null) return { at: i }
      top.key = JSON.parse(key) as string
      top.state = 'colon'
      i += key.length
      continue
    }
    // state === 'colon'
    if (c !== ':') return { at: i }
    top.state = 'value'
    i++
  }
  if (!done) return { at: text.length }
  pieces.push(text.slice(copied))
  return { text: pieces.join(''), marks }
}
