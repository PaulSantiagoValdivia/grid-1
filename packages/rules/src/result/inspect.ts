/**
 * The front door (MSG-1): one call that reads a plan, runs every check and returns one record,
 * and never throws.
 *
 * It gathers what used to come back in separate lists: the reading's refusals, the drawing's
 * problems (`validatePlan`), the door sweeps (`validateDoorSweeps`), and the full check's
 * findings and notices (`checkLocalRules`). Each becomes a line of the one list, worded by its
 * code (`catalogue.ts`). A check that fails inside Grid becomes a line too, and the others
 * still run.
 *
 * Pure: a plan in, plain data out. No AI, no file, no network.
 */

import {
  assumedValues,
  floorOf,
  itemName,
  itemNoun,
  marksWithNoPart,
  mergeBase,
  phaseCounts,
  planFacing,
  planHasPhases,
  planInState,
  planFloors,
  checkDoorSweeps,
  siteThingsText,
  tapedFiguresText,
  tapedLengths,
  tapedMissingText,
  tapedWhatText,
  tapedWithinText,
  validatePlan,
  withPatterns,
  LIMITS as PLAN_LIMITS,
  GENERAL_GUIDANCE_LABEL,
  type FloorPlan,
  type Issue,
  type TapedRow
} from '@ongrid/floorplan/geometry'
import { DEFAULT_FLOOR_ID, FloorPlanSchema, ROOM_USES, quoted, textProblem } from '@ongrid/floorplan/types/floorplan'
import { readPlanText, type TextMark, type TextRead } from '@ongrid/floorplan/types/jsonText'
import { countryInText } from '@ongrid/floorplan/types/places'
import { readPlanParts, type LeftOutPart, type PartRef, type ReadFault } from '@ongrid/floorplan/types/readParts'
import { readingNotes, type ReadingNote } from '@ongrid/floorplan/types/reading'
import { FIGURE_LIMITS } from '../checks/catalogue'
import { checkLocalRules, type CheckOptions } from '../checks/check'
import type { FindingCode, NotChecked, RuleFinding, RulesReport } from '../checks/types'
import { CODES, isLineCode, type CodeEntry, type Subject } from './catalogue'
import { FIRM_MEASURES, firmShort, firmUsed, type FirmInput } from './firm'
import { LINE_KINDS, RESULT_VERSION, type Cause, type GridResult, type HeldNote, type LineKind, type ResultLine, type Thing, type ThingKind } from './types'

type ZodIssue = NonNullable<ReturnType<typeof FloorPlanSchema.safeParse>['error']>['issues'][number]

const NOUN: Record<ThingKind, string> = { plan: 'The plan', floor: 'Floor', wall: 'Wall', room: 'Room', opening: 'Opening', item: 'Item', stair: 'Stair', pattern: 'Opening pattern' }
const OPENING_NOUN = { door: 'Door', window: 'Window', opening: 'Opening' } as const
/** An id from a file the format refused, when it is one Grid would read: else it is not repeated. */
const safeId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && textProblem(value, 'id') === null ? value : null

const FINDING_CODES: Record<FindingCode, string> = {
  no_exit: 'floor/no-exit',
  room_without_door: 'room/no-door',
  no_route_to_exit: 'room/no-route-out',
  door_to_undrawn_space: 'opening/to-undrawn-space',
  door_to_outside_above_ground: 'opening/door-out-above-ground',
  opening_below_ground: 'opening/below-ground',
  opening_too_small_to_pass: 'opening/too-small-to-pass',
  room_too_small: 'room/too-small',
  no_escape_opening: 'room/no-escape-opening',
  escape_window_too_small: 'room/escape-window-too-small',
  escape_window_too_high: 'room/escape-window-too-high',
  stair_out_of_line: 'room/stair-out-of-line',
  lift_out_of_line: 'room/lift-out-of-line',
  setback_short: 'plan/setback-short',
  over_boundary: 'plan/over-boundary'
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function errorText(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error))
}

/** One line from its code and what the code is told. */
function line(code: string, kind: LineKind, thing: Thing, floor: string | null, subject: Subject, extra: Partial<Pick<ResultLine, 'figures' | 'fixes' | 'each' | 'held' | 'firm'>> = {}): ResultLine {
  // A code missing from the catalogue still gives a line: the check's own words, and a test fails.
  const entry: CodeEntry | null = isLineCode(code) ? CODES[code] : null
  const found = entry?.found ? entry.found(subject) : subject.said
  return {
    code,
    kind,
    thing,
    floor,
    also: subject.also,
    message: entry ? entry.says(subject) : subject.said,
    found,
    needed: entry ? entry.needed(subject) : '',
    fix: entry ? entry.fix(subject) : '',
    ...extra
  }
}

const blank = (label: string): Subject => ({ label, name: '', floorName: '', said: '', also: [], names: [], floors: 0, country: '' })

// ---------------------------------------------------------------------------------------------
// Reading

/** Where a schema problem is, as `walls[2].thickness`. Paths are keys of the schema and positions. */
function placeText(path: readonly (string | number)[]): string {
  return path.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${key}` : String(key)), '') || 'the plan'
}

/** The part of the file a schema problem is in, when it can be told from what was read. */
function partAt(raw: Record<string, unknown>, path: readonly (string | number)[]): { thing: Thing; floor: string | null; label: string } {
  const whole = { thing: { kind: 'plan' as const, id: '' }, floor: null, label: NOUN.plan }
  const [list, at] = path
  const kinds: Record<string, ThingKind> = { walls: 'wall', rooms: 'room', openings: 'opening', floors: 'floor', items: 'item', stairs: 'stair', patterns: 'pattern' }
  if (typeof list !== 'string' || typeof at !== 'number' || !Object.hasOwn(kinds, list)) return whole
  const items = raw[list]
  const item = Array.isArray(items) ? (items[at] as unknown) : undefined
  if (typeof item !== 'object' || item === null) return whole
  const fields = item as Record<string, unknown>
  const id = safeId(fields['id'])
  if (id === null) return whole
  const kind = kinds[list]!
  let floor: string | null
  if (kind === 'floor') floor = id
  else if (kind === 'opening' || kind === 'pattern') {
    const walls = Array.isArray(raw['walls']) ? (raw['walls'] as unknown[]) : []
    const wall = walls.find((w) => typeof w === 'object' && w !== null && (w as Record<string, unknown>)['id'] === fields['wall'])
    floor = wall === undefined ? null : safeId((wall as Record<string, unknown>)['floor']) ?? DEFAULT_FLOOR_ID
  } else floor = safeId(fields['floor']) ?? DEFAULT_FLOOR_ID
  return { thing: { kind, id }, floor, label: `${NOUN[kind]} ${quoted(id)}` }
}

/** What the format wants where a number is too small or too large. */
function rangeText(issue: ZodIssue & { code: 'too_small' | 'too_big' }): string {
  const small = issue.code === 'too_small'
  const bound = small ? issue.minimum : issue.maximum
  const value = typeof bound === 'bigint' ? bound.toString() : String(bound)
  if (issue.type === 'number') return `a number ${small ? (issue.inclusive ? 'of at least' : 'more than') : issue.inclusive ? 'of at most' : 'less than'} ${value}`
  const unit = issue.type === 'string' ? 'characters' : 'items'
  return `${small ? 'at least' : 'at most'} ${value} ${unit}`
}

function refusalLines(raw: Record<string, unknown>, issues: readonly ZodIssue[]): ResultLine[] {
  return issues.map((issue) => {
    const place = placeText(issue.path)
    const part = partAt(raw, issue.path)
    const subject = (said: string, wants: string): Subject => ({ ...blank(part.label), said, place, wants })
    switch (issue.code) {
      case 'invalid_type':
        return issue.received === 'undefined'
          ? line('plan/missing-field', 'refused', part.thing, part.floor, subject('', `a ${issue.expected}`))
          : line('plan/wrong-type', 'refused', part.thing, part.floor, subject(`a ${issue.received} at ${place}`, `a ${issue.expected}`))
      case 'invalid_enum_value':
        return line('plan/unknown-word', 'refused', part.thing, part.floor, subject('', `one of ${issue.options.map((o) => JSON.stringify(o)).join(', ')}`))
      case 'invalid_literal':
        return line('plan/unknown-word', 'refused', part.thing, part.floor, subject('', JSON.stringify(issue.expected)))
      case 'too_small':
      case 'too_big':
        return line('plan/out-of-range', 'refused', part.thing, part.floor, subject('', rangeText(issue)))
      default:
        // Made from the schema's own rules, Grid's text checks among them: never the text found.
        return line('plan/not-in-format', 'refused', part.thing, part.floor, subject(oneLine(issue.message), 'what the plan format sets out'))
    }
  })
}

/** What each place may hold, for a field Grid does not know there. */
const FIELDS_OF: Record<string, string> = {
  walls: 'a wall',
  rooms: 'a room',
  openings: 'an opening',
  floors: 'a floor',
  items: 'a fixture',
  patterns: 'an opening pattern',
  '': 'the plan',
  referenceImage: 'the trace image',
  written: 'the record of how the plan was written'
}

/**
 * The words Grid does not read (MSG-4), one line each, about the part they are on: a field Grid
 * does not know, a room use it does not know, and an empty plan. They are worth a look: the
 * plan is read without them, and that may be what explains the other lines.
 */
function readingLines(raw: Record<string, unknown>, notes: readonly ReadingNote[], names: Names): ResultLine[] {
  return notes.map((note) => {
    if (note.kind === 'empty') return line('plan/empty', 'worth-a-look', { kind: 'plan', id: '' }, null, blank(NOUN.plan))
    // The part by where it is in the file; named as every other line names it.
    const at = note.part === null ? null : partAt(raw, [note.part.list, note.part.index])
    const part = at === null || at.thing.kind === 'plan' ? null : { thing: at.thing, ...names.thingOf(at.thing.kind, at.thing.id) }
    const thing = part?.thing ?? { kind: 'plan' as const, id: '' }
    const subject = { ...blank(part?.label ?? NOUN.plan), name: part?.name ?? '', nearest: note.nearest }
    if (note.kind === 'unknown-field') {
      const word = note.field === null ? 'with a name Grid does not repeat' : quoted(note.field)
      const what = FIELDS_OF[note.part?.list ?? note.at] ?? quoted(note.at)
      return line('plan/unknown-field', 'worth-a-look', thing, part?.floor ?? null, {
        ...subject,
        word,
        nearestWritten: note.nearestWritten,
        known: `the fields of ${what}: ${note.known.join(', ')}`,
        place: note.at || 'the top of the plan'
      })
    }
    const word = note.use !== null ? quoted(note.use) : note.notText !== null ? `that is ${note.notText}` : 'that Grid does not repeat'
    return line('plan/unknown-use', 'worth-a-look', thing, part?.floor ?? null, {
      ...subject,
      word,
      known: `the uses Grid knows: ${ROOM_USES.join(', ')}`,
      place: `${note.part.list}[${note.part.index}].use`
    })
  })
}


/** A part a reading fault is about, as a line names it: `Door "d1"`, or `The wall at walls[3]` when its id cannot be read. */
function faultPart(raw: Record<string, unknown>, ref: PartRef): { thing: Thing; floor: string | null; label: string; place: string } {
  const place = `${ref.list}[${ref.index}]`
  const kind = PART_KINDS[ref.list]
  const items = raw[ref.list]
  const fields = Array.isArray(items) && typeof items[ref.index] === 'object' && items[ref.index] !== null ? (items[ref.index] as Record<string, unknown>) : {}
  const type = fields['type']
  const noun = kind === 'opening' && (type === 'door' || type === 'window' || type === 'opening') ? OPENING_NOUN[type] : NOUN[kind]
  let floor: string | null
  if (kind === 'floor') floor = ref.id
  else if (kind === 'opening' || kind === 'pattern') {
    const walls = Array.isArray(raw['walls']) ? (raw['walls'] as unknown[]) : []
    const wall = walls.find((w) => typeof w === 'object' && w !== null && (w as Record<string, unknown>)['id'] === fields['wall'])
    floor = wall === undefined ? null : safeId((wall as Record<string, unknown>)['floor']) ?? DEFAULT_FLOOR_ID
  } else floor = safeId(fields['floor']) ?? DEFAULT_FLOOR_ID
  // A part whose id cannot be read is named by its place, and the line is about the plan.
  if (ref.id === null) return { thing: { kind: 'plan', id: '' }, floor: null, label: `The ${noun.toLowerCase()} at ${place}`, place }
  return { thing: { kind, id: ref.id }, floor, label: `${noun} ${quoted(ref.id)}`, place }
}

const PART_KINDS: Record<PartRef['list'], ThingKind> = { walls: 'wall', rooms: 'room', openings: 'opening', floors: 'floor', items: 'item', patterns: 'pattern' }

/** An id no part of the file has: `kitchen-2`. */
function freeId(raw: Record<string, unknown>, id: string): string {
  const taken = new Set<string>()
  for (const list of Object.keys(PART_KINDS)) {
    const items = raw[list]
    if (!Array.isArray(items)) continue
    for (const item of items) if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>)['id'] === 'string') taken.add((item as Record<string, unknown>)['id'] as string)
  }
  const base = id.trim().replace(/\s+/g, '-') || 'part'
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return quoted(`${base}-${n}`)
}

/**
 * What the reader did with each part or value it could not read as written (MSG-6), one line
 * each: a part left out (or one whose id another part keeps) is `left-out`, a value left out or
 * read as meant is `worth-a-look`.
 */
function faultLines(raw: Record<string, unknown>, faults: readonly ReadFault[]): ResultLine[] {
  return faults.map((fault) => {
    if (fault.kind === 'id-clash') {
      const at = faultPart(raw, fault.part)
      const kept = faultPart(raw, fault.kept)
      const subject: Subject = { ...blank(at.label), place: `${at.place}.id`, rename: freeId(raw, fault.part.id), kept: `${kept.label} (${kept.place})`, also: [fault.kept.id] }
      return line('plan/id-clash', 'left-out', at.thing, at.floor, subject)
    }
    const at = fault.part === null ? { thing: { kind: 'plan' as const, id: '' }, floor: null, label: NOUN.plan } : faultPart(raw, fault.part)
    const subject: Subject = { ...blank(at.label), said: fault.found, place: placeText(fault.path), wants: fault.wants }
    if (fault.kind === 'read-as-meant') return line('plan/read-as-meant', 'worth-a-look', at.thing, at.floor, { ...subject, read: fault.read })
    if (fault.kind === 'value-left-out') {
      const made = line('plan/value-left-out', 'worth-a-look', at.thing, at.floor, { ...subject, used: fault.used })
      if (fault.part === null && fault.path.length === 1 && fault.path[0] === 'units') UNITS_READ.add(made)
      return made
    }
    return line('plan/part-left-out', 'left-out', at.thing, at.floor, subject)
  })
}

/** A file that cannot be read as JSON, in the words of what it is (MSG-6). */
function textFaultLine(fault: Extract<TextRead, { ok: false }>['fault']): ResultLine {
  const plan = { kind: 'plan' as const, id: '' }
  if (fault.kind === 'not-json') {
    const where = fault.ends ? 'text that ends before the JSON does' : fault.line === null ? "text that can't be read as JSON" : `text that stops being JSON at line ${fault.line}, column ${fault.column}`
    return line('plan/not-json', 'refused', plan, null, { ...blank(NOUN.plan), said: where })
  }
  const side = (s: { label: string | null }, other: string): string => (s.label === null ? other : quoted(s.label))
  const ours = side(fault.ours, 'the first side')
  const theirs = side(fault.theirs, 'the second side')
  const list = (ids: readonly string[]): string => (ids.length > 6 ? `${ids.slice(0, 6).map(quoted).join(', ')} and ${ids.length - 6} more` : ids.map(quoted).join(', '))
  const parts = [
    fault.ours.adds.length > 0 ? `${ours} adds ${list(fault.ours.adds)}` : null,
    fault.theirs.adds.length > 0 ? `${theirs} adds ${list(fault.theirs.adds)}` : null,
    fault.changed.length > 0 ? `both sides change ${list(fault.changed)}` : null
  ].filter((part): part is string => part !== null)
  const sides = parts.join('; ')
  const conflicts = fault.conflicts === 1 ? 'one conflict' : `${fault.conflicts} conflicts`
  return line('plan/unfinished-merge', 'refused', plan, null, {
    ...blank(NOUN.plan),
    said: `${conflicts} between ${ours} and ${theirs}, the first at line ${fault.line}${sides ? `: ${sides}` : ''}`,
    sides
  })
}

type Read =
  | { plan: FloorPlan; raw: Record<string, unknown>; lines: ResultLine[]; leftOutWalls: ReadonlySet<string>; leftOut: readonly LeftOutPart[] }
  | { plan: null; lines: ResultLine[] }

function readPlan(raw: unknown): Read {
  let value = raw
  let marks: readonly TextMark[] = []
  if (typeof raw === 'string') {
    // MSG-6: the text is read before the JSON reader, for a merge left unfinished, NaN and a decimal comma.
    const text = readPlanText(raw)
    if (!text.ok) return { plan: null, lines: [textFaultLine(text.fault)] }
    value = text.value
    marks = text.marks
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { plan: null, lines: [line('plan/not-an-object', 'refused', { kind: 'plan', id: '' }, null, blank(NOUN.plan))] }
  }
  // MSG-6: part by part, so a fault stays where it is and the rest is still checked.
  const read = readPlanParts(value, marks)
  if (read.plan === null) {
    if (read.refusal.kind === 'not-an-object') return { plan: null, lines: [line('plan/not-an-object', 'refused', { kind: 'plan', id: '' }, null, blank(NOUN.plan))] }
    return { plan: null, lines: refusalLines(value as Record<string, unknown>, read.refusal.issues) }
  }
  return {
    plan: read.plan,
    raw: value as Record<string, unknown>,
    lines: faultLines(value as Record<string, unknown>, read.faults),
    leftOutWalls: read.leftOutWalls,
    leftOut: read.leftOut
  }
}

// ---------------------------------------------------------------------------------------------
// A plan that was read

interface Names {
  readonly floors: number
  floorName(id: string): string
  roomName(id: string): string
  thingOf(kind: ThingKind, id: string): { label: string; name: string; floor: string | null }
  /** CNT-13: a fixture inside a sentence, `kitchen run "k1"` (`itemName`). */
  itemName(id: string): string
}

function namesOf(plan: FloorPlan, stated: FloorPlan = plan): Names {
  const floors = planFloors(plan)
  const floorNames = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const rooms = new Map<string, FloorPlan['rooms'][number]>()
  for (const room of plan.rooms) if (!rooms.has(room.id)) rooms.set(room.id, room)
  const walls = new Map<string, FloorPlan['walls'][number]>()
  for (const wall of plan.walls) if (!walls.has(wall.id)) walls.set(wall.id, wall)
  const openings = new Map<string, FloorPlan['openings'][number]>()
  for (const opening of plan.openings) if (!openings.has(opening.id)) openings.set(opening.id, opening)
  const stairs = new Map<string, NonNullable<FloorPlan['stairs']>[number]>()
  for (const stair of plan.stairs ?? []) if (!stairs.has(stair.id)) stairs.set(stair.id, stair)
  const items = new Map<string, NonNullable<FloorPlan['items']>[number]>()
  for (const item of plan.items ?? []) if (!items.has(item.id)) items.set(item.id, item)
  // LVL-8: a pattern is on its wall's floor.
  const patterns = new Map<string, NonNullable<FloorPlan['patterns']>[number]>()
  for (const pattern of stated.patterns ?? []) if (!patterns.has(pattern.id)) patterns.set(pattern.id, pattern)
  const floorName = (id: string): string => floorNames.get(id) ?? id
  const roomName = (id: string): string => rooms.get(id)?.name || id
  return {
    floors: floors.length,
    floorName,
    roomName,
    itemName: (id) => {
      const item = items.get(id)
      return item ? itemName(item) : `item ${quoted(id)}`
    },
    thingOf(kind, id) {
      switch (kind) {
        case 'plan':
          return { label: NOUN.plan, name: '', floor: null }
        case 'floor':
          return { label: `${NOUN.floor} ${quoted(floorName(id))}`, name: floorName(id), floor: id }
        case 'stair': {
          // LVL-3: a stair is on the floor its walking line starts from.
          const stair = stairs.get(id)
          return { label: `${NOUN.stair} ${quoted(stair?.name ?? id)}`, name: stair?.name ?? id, floor: stair ? stair.from : null }
        }
        case 'room': {
          const room = rooms.get(id)
          return { label: `${NOUN.room} ${quoted(roomName(id))}`, name: roomName(id), floor: room ? floorOf(room) : null }
        }
        case 'wall': {
          const wall = walls.get(id)
          return { label: `${NOUN.wall} ${quoted(id)}`, name: id, floor: wall ? floorOf(wall) : null }
        }
        case 'opening': {
          const opening = openings.get(id)
          const wall = opening ? walls.get(opening.wall) : undefined
          return {
            label: `${opening ? OPENING_NOUN[opening.type] : NOUN.opening} ${quoted(id)}`,
            name: id,
            floor: wall ? floorOf(wall) : null
          }
        }
        case 'pattern': {
          const wall = walls.get(patterns.get(id)?.wall ?? '')
          return { label: `${NOUN.pattern} ${quoted(id)}`, name: id, floor: wall ? floorOf(wall) : null }
        }
        case 'item': {
          // A fixture by its kind: `Toilet "wc1"` (CNT-12). One of a kind Grid does not hold is an `Item`.
          const item = items.get(id)
          return { label: item ? itemNoun(item) : `${NOUN.item} ${quoted(id)}`, name: id, floor: item ? floorOf(item) : null }
        }
      }
    }
  }
}

/** The thing a drawing problem is about: the plan-wide codes that name a floor are about the floor. */
function issueThing(issue: Issue): { thing: Thing; also: string[] } {
  if (issue.code === 'plan/similar-floor-id' || issue.code === 'plan/duplicate-floor' || issue.code === 'plan/same-level') return { thing: { kind: 'floor', id: issue.id }, also: [] }
  if (issue.entity === 'plan') return { thing: { kind: 'plan', id: '' }, also: issue.id === 'plan' ? [] : [issue.id] }
  return { thing: { kind: issue.entity, id: issue.id }, also: [] }
}

/**
 * MSG-5: the id of the part each drawing line follows from, as `validatePlan` gives it (`plan`
 * for the plan as a whole), until the record finds the line about that part.
 */
const CAUSE_IDS = new WeakMap<ResultLine, string>()
/** MSG-5: a line's cause where the record finds it itself, not the drawing check. */
const CAUSE_LINES = new WeakMap<ResultLine, ResultLine>()
/** MSG-5: the reader's line for a plan's stated unit, which it reads as metres. */
const UNITS_READ = new WeakSet<ResultLine>()
/** MSG-5: what is measured against a size, and so follows from a plan that may not be in metres. */
const SIZED = new Set(['plan/far-from-origin', 'wall/size-question', 'opening/size-question', 'room/size-question', 'floor/size-question', 'room/too-small', 'room/escape-window-too-small', 'room/escape-window-too-high', 'opening/wide-single-leaf'])

function issueLine(issue: Issue & { readonly hits?: readonly string[] }, names: Names): ResultLine {
  const { thing, also } = issueThing(issue)
  const at = names.thingOf(thing.kind, thing.id)
  const label = issue.code === 'plan/duplicate-id' ? quoted(issue.id) : at.label
  const subject: Subject = {
    ...blank(label),
    name: at.name,
    floorName: at.floor === null ? '' : names.floorName(at.floor),
    said: oneLine(issue.message),
    also: [...also, ...(issue.hits ?? [])],
    floors: names.floors,
    ...(issue.code === 'opening/door-hits-item' ? { items: (issue.hits ?? []).map(names.itemName) } : {}),
    ...(issue.fixes ? { fixes: issue.fixes } : {})
  }
  const made = line(issue.code, issue.severity === 'error' ? 'left-out' : 'worth-a-look', thing, at.floor, subject, issue.fixes ? { fixes: issue.fixes } : {})
  if (issue.causedBy !== undefined) CAUSE_IDS.set(made, issue.causedBy)
  return made
}

/** A finding's code and the thing its line is about. */
function findingThing(finding: RuleFinding, wayOutNotDrawn: ReadonlySet<string>): { code: string; thing: Thing } {
  let code = FINDING_CODES[finding.code]
  if (finding.code === 'no_route_to_exit' && wayOutNotDrawn.has(finding.floor)) code = 'room/no-route-to-door-out'
  const thing: Thing =
    finding.code === 'no_exit'
      ? { kind: 'floor', id: finding.floor }
      : finding.code === 'setback_short' || finding.code === 'over_boundary'
      ? { kind: 'plan', id: '' }
      : (finding.code === 'door_to_undrawn_space' ||
          finding.code === 'door_to_outside_above_ground' ||
          finding.code === 'opening_below_ground' ||
          finding.code === 'opening_too_small_to_pass') &&
        finding.openings[0] !== undefined
      ? { kind: 'opening', id: finding.openings[0] }
      : { kind: 'room', id: finding.rooms[0] ?? '' }
  return { code, thing }
}

function findingSubject(finding: RuleFinding, names: Names, thing: Thing): Subject {
  const room = finding.rooms[0]
  return {
    ...blank(names.thingOf(thing.kind, thing.id).label),
    name: room === undefined ? names.floorName(finding.floor) : names.roomName(room),
    floorName: names.floorName(finding.floor),
    also: [...finding.rooms, ...finding.openings].filter((id) => id !== thing.id),
    names: finding.rooms.map(names.roomName),
    floors: names.floors,
    finding,
    said: finding.message
  }
}

function findingLine(finding: RuleFinding, names: Names, wayOutNotDrawn: ReadonlySet<string>): ResultLine {
  const { code, thing } = findingThing(finding, wayOutNotDrawn)
  return line(code, 'finding', thing, finding.floor, findingSubject(finding, names, thing), finding.figures ? { figures: finding.figures } : {})
}

/** MSG-5 (lab MS-14): the findings whose notes may stand as one line for several rooms. */
const GROUPED = new Set([
  'room/no-door',
  'room/no-route-out',
  'room/no-route-to-door-out',
  'opening/to-undrawn-space',
  'opening/door-out-above-ground',
  'opening/too-small-to-pass',
  'room/too-small',
  'room/no-escape-opening',
  'room/escape-window-too-small',
  'room/escape-window-too-high'
])

/**
 * MSG-5 (lab MS-14): identical notes as one line. Findings of one code on one floor that say the
 * same in every word but the room's name (what was found, what is needed, the fix and the
 * figures) become one line that lists the rooms, in the order the check gave them; `each` and
 * `also` keep every id. Twelve hotel rooms with the same window are one line, not twelve.
 */
function groupedFindings(findings: readonly RuleFinding[], names: Names, wayOutNotDrawn: ReadonlySet<string>): ResultLine[] {
  const made = findings.map((finding) => ({ finding, line: findingLine(finding, names, wayOutNotDrawn) }))
  const groups = new Map<string, typeof made>()
  const order: (typeof made)[] = []
  for (const one of made) {
    const { line: l } = one
    if (!GROUPED.has(l.code) || l.fixes !== undefined) {
      order.push([one])
      continue
    }
    const key = JSON.stringify([l.code, l.floor, l.found, l.needed, l.fix, l.figures ?? null])
    const group = groups.get(key)
    if (group === undefined) {
      const fresh = [one]
      groups.set(key, fresh)
      order.push(fresh)
    } else group.push(one)
  }
  return order.map((group) => {
    if (group.length === 1) return group[0]!.line
    const first = group[0]!
    const { code, thing } = findingThing(first.finding, wayOutNotDrawn)
    const each = group.map((one) => one.line.thing)
    const also = [...new Set(group.flatMap((one) => [one.line.thing.id, ...one.line.also]))].filter((id) => id !== thing.id)
    const subject: Subject = { ...findingSubject(first.finding, names, thing), also, group: group.map((one) => findingSubject(one.finding, names, one.line.thing).name) }
    return line(code, 'finding', thing, first.finding.floor, subject, { ...(first.line.figures ? { figures: first.line.figures } : {}), each })
  })
}

function noticeCode(notice: NotChecked): string {
  switch (notice.reason) {
    case 'no_stairs':
      return 'floor/not-checked-no-stairs'
    case 'way_out_not_drawn':
      return 'floor/not-checked-way-out-not-drawn'
    case 'cannot_be_drawn':
      return notice.rooms.length > 0 ? 'floor/not-checked-rooms-not-drawn' : 'floor/not-checked-doors-not-drawn'
    case 'no_use':
      return 'floor/not-checked-no-use'
    case 'no_figures_for_place':
      return notice.ruleId === 'habitable-room-area' ? 'plan/not-checked-sizes-for-place' : 'plan/not-checked-escapes-for-place'
    case 'above_escape_storeys':
      return 'floor/not-checked-above-escape-storeys'
    case 'no_rooms':
      return 'plan/not-checked-no-rooms'
    case 'boundary_not_measured':
      return 'plan/not-checked-boundary'
    case 'not_for_building': {
      const what = notice.ruleId === 'habitable-room-area' ? 'sizes' : 'escapes'
      return notice.floor === '' ? `plan/not-checked-${what}-for-building` : `floor/not-checked-${what}-for-building`
    }
  }
}

/** MSG-5: what a held note was about, in words, as a "could not be drawn" line's `found` says it. */
const HELD_WORDS: Record<string, (names: string, many: boolean) => string> = {
  'floor/no-exit': (n) => `whether ${n} has a door to the outside`,
  'room/no-door': (n, many) => `whether ${n} ${many ? 'have' : 'has'} a door`,
  'room/no-route-out': (n, many) => `whether ${n} ${many ? 'have' : 'has'} a route out`,
  'room/no-route-to-door-out': (n, many) => `whether ${n} ${many ? 'have' : 'has'} a route out`,
  'opening/to-undrawn-space': (n, many) => `where ${many ? 'doors' : 'a door'} from ${n} ${many ? 'lead' : 'leads'}`,
  'room/no-escape-opening': (n, many) => `whether ${n} ${many ? 'have' : 'has'} a window or door to escape through`,
  'room/escape-window-too-small': (n, many) => `whether ${many ? 'the windows' : 'the window'} of ${n} can be escaped through`,
  'room/escape-window-too-high': (n, many) => `whether ${many ? 'the windows' : 'the window'} of ${n} can be escaped through`
}

/** The notes a "could not be drawn" notice holds back, as data and in words. */
function heldNotes(notice: NotChecked, names: Names, wayOutNotDrawn: ReadonlySet<string>): { held: HeldNote[]; said: string } {
  const held = (notice.held ?? []).map(({ finding, waitsFor }): HeldNote => {
    const { code, thing } = findingThing(finding, wayOutNotDrawn)
    const also = [...finding.rooms, ...finding.openings].filter((id) => id !== thing.id)
    return { code, thing, floor: finding.floor, also, waitsFor: [...waitsFor] }
  })
  // One phrase per code, its rooms (or floors) by name, in the order held.
  const byCode = new Map<string, string[]>()
  for (const [i, note] of held.entries()) {
    const finding = notice.held![i]!.finding
    const name = note.code === 'floor/no-exit' ? names.floorName(finding.floor) : names.roomName(finding.rooms[0] ?? note.thing.id)
    byCode.set(note.code, [...(byCode.get(note.code) ?? []), name])
  }
  const said = [...byCode]
    .map(([code, list]) => {
      const named = [...new Set(list)].map(quoted).join(', ')
      return HELD_WORDS[code]?.(named, list.length > 1) ?? `the notes on ${named}`
    })
    .join('; ')
  return { held, said }
}

function noticeLine(notice: NotChecked, names: Names, country: string, wayOutNotDrawn: ReadonlySet<string> = new Set()): ResultLine {
  const thing: Thing = notice.floor === '' ? { kind: 'plan', id: '' } : { kind: 'floor', id: notice.floor }
  const { held, said: heldSaid } = heldNotes(notice, names, wayOutNotDrawn)
  const subject: Subject = {
    ...blank(names.thingOf(thing.kind, thing.id).label),
    name: notice.floor === '' ? '' : names.floorName(notice.floor),
    floorName: notice.floor === '' ? '' : names.floorName(notice.floor),
    also: [...notice.rooms, ...notice.openings],
    names: notice.rooms.map(names.roomName),
    floors: names.floors,
    country,
    notice,
    said: notice.message,
    heldSaid
  }
  return line(noticeCode(notice), 'not-checked', thing, notice.floor === '' ? null : notice.floor, subject, held.length > 0 ? { held } : {})
}

function checkFailed(stage: string, error: unknown): ResultLine {
  return line('plan/check-failed', 'not-checked', { kind: 'plan', id: '' }, null, {
    ...blank(NOUN.plan),
    said: `the ${stage} stopped: ${errorText(error)}`
  })
}

/**
 * MSG-5 (lab W-7): each line that follows from another, filed under it. A drawing line names the
 * part it follows from by id (`validatePlan`'s `causedBy`); its cause is the first line about that
 * part, a part left out before one worth a look: the reader's line for a part it left out, the
 * drawing's for one it cannot draw, `plan/duplicate-id` for an id two walls share, the plan's own
 * line for `plan`. A line whose cause has no line of its own stays a problem of its own.
 */
function filed(lines: readonly ResultLine[]): ResultLine[] {
  const order = new Map(LINE_KINDS.map((kind, i) => [kind, i] as const))
  // Stable: lines of one kind keep the order their check gave them.
  const sorted = [...lines].sort((a, b) => order.get(a.kind)! - order.get(b.kind)!)
  const about = new Map<string, ResultLine>()
  for (const l of sorted) {
    if (l.kind !== 'left-out' && l.kind !== 'worth-a-look' && l.kind !== 'refused') continue
    const key = l.thing.kind === 'plan' ? (l.code === 'plan/duplicate-id' ? l.also[0] ?? null : 'plan') : l.thing.kind === 'floor' ? null : l.thing.id
    if (key !== null && !about.has(key)) about.set(key, l)
  }
  const causeOf = new Map<ResultLine, ResultLine>()
  for (const l of sorted) {
    const id = CAUSE_IDS.get(l)
    const cause = CAUSE_LINES.get(l) ?? (id === undefined ? undefined : about.get(id))
    if (cause !== undefined && cause !== l) causeOf.set(l, cause)
  }
  const under = new Map<ResultLine, ResultLine[]>()
  for (const l of sorted) {
    const cause = causeOf.get(l)
    if (cause !== undefined) under.set(cause, [...(under.get(cause) ?? []), l])
  }
  const out: ResultLine[] = []
  const placed = new Set<ResultLine>()
  const place = (l: ResultLine, cause: ResultLine | null): void => {
    if (placed.has(l)) return
    placed.add(l)
    out.push(cause === null ? l : { ...l, causedBy: causeId(cause) })
    for (const next of under.get(l) ?? []) place(next, l)
  }
  for (const l of sorted) if (!causeOf.has(l)) place(l, null)
  // A ring of causes has no first line: its lines stand as problems of their own.
  for (const l of sorted) place(l, null)
  return out
}

/** A line as a cause names it: its code, and the id of the part it is about. */
function causeId(l: ResultLine): Cause {
  return { code: l.code, id: l.thing.kind === 'plan' && l.code === 'plan/duplicate-id' ? l.also[0] ?? '' : l.thing.id }
}

function record(lines: readonly ResultLine[], read: boolean, report: RulesReport | null, taped: readonly TapedRow[] | null = null, firm: FirmInput | null = null): GridResult {
  const sorted = filed(lines)
  const counts = Object.fromEntries(LINE_KINDS.map((kind) => [kind, sorted.filter((l) => l.kind === kind).length])) as Record<LineKind, number>
  return {
    resultVersion: RESULT_VERSION,
    label: GENERAL_GUIDANCE_LABEL,
    read,
    count: sorted.length,
    counts,
    problems: problemsIn(sorted),
    lines: sorted,
    basis: report?.basis ?? 'general-baseline',
    ...(report?.lookupNotice ? { lookupNotice: report.lookupNotice } : {}),
    checks: report?.rules ?? [],
    coverage: report?.coverage ?? [],
    figures: report?.figures ?? [],
    limits: report?.limits ?? [...PLAN_LIMITS, ...FIGURE_LIMITS],
    place: report?.place ?? null,
    ...(report?.withoutPlace ? { withoutPlace: report.withoutPlace } : {}),
    ...(taped === null ? {} : { taped }),
    ...(firm === null ? {} : { firm: firmUsed(firm) })
  }
}

/** MSG-5: the lines that follow from no other and are not `not-checked`: the problems to act on. */
export function problemsIn(lines: readonly ResultLine[]): number {
  return lines.filter((l) => l.causedBy === undefined && l.kind !== 'not-checked').length
}

/**
 * COD-8: the firm's own standards as lines: each part measured short of the firm's figure is a
 * finding with its `firm/` code, after the code figures' findings, and a file that could not be
 * read is one `firm/not-read` line. The firm's figures are not tied to a place, so they are set
 * against the plan whatever place it states, or none.
 */
function firmLines(firm: FirmInput, names: Names): ResultLine[] {
  if (firm.problem !== null) {
    return [line('firm/not-read', 'not-checked', { kind: 'plan', id: '' }, null, { ...blank(quoted(firm.file)), said: firm.problem, floors: names.floors, firm: { value: 0, name: null, file: firm.file, measured: null, said: '' } })]
  }
  const out: ResultLine[] = []
  for (const measured of firm.measured) {
    const standard = firm.standards[measured.standard]
    if (standard === undefined || !firmShort(measured, standard)) continue
    const at = names.thingOf(measured.thing.kind, measured.thing.id)
    const unit = FIRM_MEASURES[standard.measure].unit
    out.push(
      line(FIRM_MEASURES[standard.measure].code, 'finding', measured.thing, measured.floor ?? at.floor, {
        ...blank(at.label),
        name: at.name,
        floorName: at.floor === null ? '' : names.floorName(at.floor),
        also: [...measured.also],
        floors: names.floors,
        firm: { value: standard.value, name: standard.name, file: firm.file, measured: measured.measured, said: measured.said }
      }, { firm: { standard: measured.standard, measure: standard.measure, value: standard.value, unit, name: standard.name, file: firm.file } })
    )
  }
  return out
}

/** COD-8: the front door's options: the full check's, and the firm's own standards beside the plan, measured. */
export interface InspectOptions extends CheckOptions {
  readonly firm?: FirmInput
}

/** Every line about a plan that was read. */
function inspectRead(read: Extract<Read, { plan: FloorPlan }>, inspectOptions: InspectOptions): GridResult {
  const { firm, ...options } = inspectOptions
  // LVL-8: the checks read the plain openings a pattern expands into, so a window placed by a
  // pattern counts for escape like one placed by hand. The drawing check reads the plan as stated,
  // and says first what kept any pattern's openings from being placed (`validatePlan`).
  // CNT-10: a fit-out is read with its base's walls and openings, as existing. The drawing check
  // reads both states of a plan with phases; every other check, the building after the work.
  const stated = options.base === undefined ? read.plan : mergeBase(read.plan, withPatterns(options.base)).plan
  const whole = withPatterns(stated)
  const plan = planInState(whole, 'after')
  const lines: ResultLine[] = [...read.lines]
  const names = namesOf(whole, stated)
  const stage = (name: string, body: () => void): void => {
    try {
      body()
    } catch (error) {
      lines.push(checkFailed(name, error))
    }
  }
  // What the file says that Grid does not read leads the lines of its kind: it may explain them.
  stage('reading', () => {
    lines.push(...readingLines(read.raw, readingNotes(read.raw), names))
  })
  stage('drawing check', () => {
    lines.push(...validatePlan(stated, undefined, { leftOutWalls: read.leftOutWalls, leftOutParts: read.leftOut }).issues.map((issue) => issueLine(issue, names)))
  })
  // CNT-10: which state the checks read, and what the plan's work holds.
  stage('phases', () => {
    if (!planHasPhases(whole)) return
    const counts = phaseCounts(whole)
    const parts = (n: { walls: number; openings: number; rooms: number }): number => n.walls + n.openings + n.rooms
    const said = [
      `${parts(counts.existing)} existing`,
      `${parts(counts.demolished)} to be demolished`,
      `${parts(counts.new)} new`,
    ].join(', ')
    lines.push(line('plan/read-after-work', 'not-checked', { kind: 'plan', id: '' }, null, { ...blank('The plan'), floors: names.floors, said: `${said} walls, openings and rooms${whole.base === undefined ? '' : `, fitted out in ${quoted(whole.base)}`}` }))
  })
  stage('door check', () => {
    const seen = new Set<string>()
    const checked = checkDoorSweeps(plan, (opening) => opening)
    for (const issue of checked.issues) {
      const key = `${issue.code}|${issue.id}|${issue.hits.join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(issueLine(issue, names))
    }
    // CNT-14: the doors whose swing the plan does not state, floor by floor, as not checked.
    for (const { floor, doors } of checked.notChecked) {
      lines.push(
        line('floor/not-checked-door-swings', 'not-checked', { kind: 'floor', id: floor }, floor, {
          ...blank(names.thingOf('floor', floor).label),
          name: names.floorName(floor),
          floorName: names.floorName(floor),
          also: doors,
          floors: names.floors
        })
      )
    }
  })
  let report: RulesReport | null = null
  stage('plan checks', () => {
    // MSG-5: with what the reader left out, so a note that rests on it is held back.
    report = checkLocalRules(plan, { ...options, leftOut: read.leftOut })
    const wayOutNotDrawn = new Set(report.notChecked.filter((n) => n.reason === 'way_out_not_drawn').map((n) => n.floor))
    // COD-3: the place by Grid's name for it, never the text it was given.
    const country = report.place === null ? '' : countryInText(report.place.country)
    lines.push(...groupedFindings(report.findings, names, wayOutNotDrawn))
    lines.push(...report.notChecked.map((notice) => noticeLine(notice, names, country, wayOutNotDrawn)))
  })
  // COD-8: the firm's own standards, after the code figures' findings, apart from them.
  if (firm !== undefined) {
    stage('firm standards', () => {
      lines.push(...firmLines(firm, names))
    })
  }
  // SHT-7: what is written on the drawing. The sketch is drawn and never measured or checked,
  // and the record says so, floor by floor. A note in a room the plan lacks is not drawn.
  stage('writing', () => {
    const byFloor = new Map<string, NonNullable<FloorPlan['sketch']>>()
    for (const item of plan.sketch ?? []) byFloor.set(floorOf(item), [...(byFloor.get(floorOf(item)) ?? []), item])
    for (const [floor, items] of byFloor) {
      const label = names.thingOf('floor', floor).label
      const categories = [...new Set(items.map((item) => item.category))]
      lines.push(
        line('floor/sketch-drawn-only', 'not-checked', { kind: 'floor', id: floor }, floor, {
          ...blank(label),
          name: names.floorName(floor),
          floorName: names.floorName(floor),
          said: `${items.length} sketch item${items.length === 1 ? '' : 's'}`,
          also: items.map((item) => item.id),
          names: categories,
          floors: names.floors
        })
      )
    }
    const rooms = new Set(whole.rooms.map((room) => room.id))
    for (const note of plan.annotations ?? []) {
      if (note.room === undefined || rooms.has(note.room)) continue
      lines.push(line('plan/note-no-place', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(quoted(note.id)), also: [note.id, note.room], floors: names.floors, said: `room ${note.room}` }))
    }
  })
  // BRF-3: the site's things are drawn only, and the record says so once.
  stage('site', () => {
    const things = plan.site?.things ?? []
    if (things.length === 0) return
    lines.push(
      line('plan/site-things-drawn-only', 'not-checked', { kind: 'plan', id: '' }, null, {
        ...blank(NOUN.plan),
        said: siteThingsText(things),
        also: things.map((thing) => thing.id),
        floors: names.floors
      })
    )
  })
  // CNT-3: a front that names no outside part, and a plan whose y runs down the page.
  stage('orientation', () => {
    if (plan.yAxis === 'down') lines.push(line('plan/y-down', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank('The plan'), floors: names.floors }))
    const front = plan.front === undefined ? null : planFacing(plan).front
    if (front === null || !('missing' in front)) return
    const label = `${front.part === 'wall' ? 'wall' : 'opening'} ${quoted(front.id)}`
    const said = front.missing === 'no-such-part' ? 'the plan does not have' : front.part === 'wall' ? 'does not face outside' : 'is not in a wall that faces outside'
    lines.push(line('plan/front-not-said', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(label), also: [front.id], floors: names.floors, said }))
  })
  // WRT-6 (lab WR-15): what the plan marks assumed, for the person to confirm, and a mark that
  // names a part the plan no longer has.
  stage('marks', () => {
    for (const mark of marksWithNoPart(whole)) {
      const label = `${NOUN[mark.part]} ${quoted(mark.id)}`
      lines.push(line('plan/mark-no-part', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(label), also: [mark.id], floors: names.floors, ...(mark.value ? { word: VALUE_WORDS[mark.value] ?? mark.value } : {}) }))
    }
    for (const value of assumedValues(whole)) {
      const at = names.thingOf(value.part, value.id)
      lines.push(
        line('plan/value-assumed', 'to-confirm', { kind: value.part, id: value.id }, at.floor, {
          ...blank(at.label),
          name: at.name,
          floorName: at.floor === null ? '' : names.floorName(at.floor),
          floors: names.floors,
          said: value.tolerance === null ? '' : `give or take ${value.tolerance} m`,
          ...(value.value ? { word: VALUE_WORDS[value.value] ?? value.value } : {})
        })
      )
    }
  })
  // HND-11 (lab WR-14): each length taped on site against the drawing. One that differs, or that
  // cannot be measured, is a line; the whole table rides on the record.
  let taped: readonly TapedRow[] | null = null
  stage('taped', () => {
    if ((plan.taped ?? []).length === 0) return
    taped = tapedLengths(plan)
    for (const row of taped) {
      if (row.state === 'agrees') continue
      const room = names.thingOf('room', row.room)
      const said = { what: tapedWhatText(row), figures: tapedFiguresText(row), within: tapedWithinText(row) }
      const also = [...new Set([row.room, ...row.walls])]
      if (row.state === 'differs') {
        lines.push(line('room/taped-differs', 'worth-a-look', { kind: 'room', id: row.room }, room.floor, { ...blank(room.label), name: room.name, floorName: room.floor === null ? '' : names.floorName(room.floor), also: row.walls, floors: names.floors, taped: said }))
      } else {
        const label = row.missing === 'no-room' ? `room ${quoted(row.room)}` : room.label
        lines.push(line('plan/taped-not-measured', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(label), also, floors: names.floors, said: tapedMissingText(row) ?? '', taped: said }))
      }
    }
  })
  // CNT-17 (lab EL-15): what the plan marks as needing to be accessible is measured by
  // grid_measure what=access, never checked here: no figure for it has been confirmed.
  stage('accessible', () => {
    const rooms = plan.accessible?.rooms ?? []
    const routes = plan.accessible?.routes ?? []
    if (rooms.length === 0 && routes.length === 0) return
    const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`
    const said = [rooms.length > 0 ? count(rooms.length, 'room') : null, routes.length > 0 ? count(routes.length, 'route') : null].filter((x) => x !== null).join(' and ')
    const marked = [...new Set([...rooms, ...routes.flatMap((r) => [r.to, ...(r.from === undefined ? [] : [r.from])])])]
    lines.push(line('plan/not-checked-access', 'not-checked', { kind: 'plan', id: '' }, null, { ...blank('The plan'), also: marked, floors: names.floors, said }))
  })
  // MSG-5: a plan that may not be in metres (`plan/units-question`): what is measured against a
  // size follows from it, and it follows from the unit the plan states, which is read as metres.
  const units = lines.find((l) => l.code === 'plan/units-question')
  if (units !== undefined) {
    const stated = lines.find((l) => UNITS_READ.has(l))
    if (stated !== undefined) CAUSE_LINES.set(units, stated)
    for (const l of lines) if (SIZED.has(l.code)) CAUSE_LINES.set(l, units)
  }
  return record(lines, true, report, taped, firm ?? null)
}

/** WRT-6: a marked value as a line names it. */
const VALUE_WORDS: Readonly<Record<string, string>> = { floorOffset: 'floor offset', at: 'place', start: 'start', end: 'end', turn: 'turn' }

/**
 * Reads a plan and runs every check on it. Never throws.
 *
 * `raw` is the plan as parsed JSON, or its text. A plan the format refuses gives a record with
 * `read: false` whose lines say where and why; nothing else is checked then.
 */
export function inspectPlan(raw: unknown, options: InspectOptions = {}): GridResult {
  try {
    const read = readPlan(raw)
    if (read.plan === null) return record(read.lines, false, null)
    return inspectRead(read, options)
  } catch (error) {
    return record([checkFailed('reading', error)], false, null)
  }
}
