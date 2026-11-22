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
  itemNoun,
  marksWithNoPart,
  planFloors,
  validateDoorSweeps,
  validatePlan,
  LIMITS as PLAN_LIMITS,
  GENERAL_GUIDANCE_LABEL,
  type FloorPlan,
  type Issue
} from '@ongrid/floorplan/geometry'
import { DEFAULT_FLOOR_ID, FloorPlanSchema, ROOM_USES, quoted, textProblem } from '@ongrid/floorplan/types/floorplan'
import { readPlanText, type TextMark, type TextRead } from '@ongrid/floorplan/types/jsonText'
import { readPlanParts, type PartRef, type ReadFault } from '@ongrid/floorplan/types/readParts'
import { readingNotes, type ReadingNote } from '@ongrid/floorplan/types/reading'
import { FIGURE_LIMITS } from '../checks/catalogue'
import { checkLocalRules, type CheckOptions } from '../checks/check'
import type { FindingCode, NotChecked, RuleFinding, RulesReport } from '../checks/types'
import { CODES, isLineCode, type CodeEntry, type Subject } from './catalogue'
import { LINE_KINDS, RESULT_VERSION, type GridResult, type LineKind, type ResultLine, type Thing, type ThingKind } from './types'

type ZodIssue = NonNullable<ReturnType<typeof FloorPlanSchema.safeParse>['error']>['issues'][number]

const NOUN: Record<ThingKind, string> = { plan: 'The plan', floor: 'Floor', wall: 'Wall', room: 'Room', opening: 'Opening', item: 'Item', stair: 'Stair' }
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
  opening_too_small_to_pass: 'opening/too-small-to-pass',
  room_too_small: 'room/too-small',
  no_escape_opening: 'room/no-escape-opening',
  escape_window_too_small: 'room/escape-window-too-small',
  escape_window_too_high: 'room/escape-window-too-high',
  stair_out_of_line: 'room/stair-out-of-line',
  lift_out_of_line: 'room/lift-out-of-line'
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function errorText(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error))
}

/** One line from its code and what the code is told. */
function line(code: string, kind: LineKind, thing: Thing, floor: string | null, subject: Subject, extra: Partial<Pick<ResultLine, 'figures' | 'fixes'>> = {}): ResultLine {
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
  const kinds: Record<string, ThingKind> = { walls: 'wall', rooms: 'room', openings: 'opening', floors: 'floor', items: 'item', stairs: 'stair' }
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
  else if (kind === 'opening') {
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
  else if (kind === 'opening') {
    const walls = Array.isArray(raw['walls']) ? (raw['walls'] as unknown[]) : []
    const wall = walls.find((w) => typeof w === 'object' && w !== null && (w as Record<string, unknown>)['id'] === fields['wall'])
    floor = wall === undefined ? null : safeId((wall as Record<string, unknown>)['floor']) ?? DEFAULT_FLOOR_ID
  } else floor = safeId(fields['floor']) ?? DEFAULT_FLOOR_ID
  // A part whose id cannot be read is named by its place, and the line is about the plan.
  if (ref.id === null) return { thing: { kind: 'plan', id: '' }, floor: null, label: `The ${noun.toLowerCase()} at ${place}`, place }
  return { thing: { kind, id: ref.id }, floor, label: `${noun} ${quoted(ref.id)}`, place }
}

const PART_KINDS: Record<PartRef['list'], ThingKind> = { walls: 'wall', rooms: 'room', openings: 'opening', floors: 'floor', items: 'item' }

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
    if (fault.kind === 'value-left-out') return line('plan/value-left-out', 'worth-a-look', at.thing, at.floor, { ...subject, used: fault.used })
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
  | { plan: FloorPlan; raw: Record<string, unknown>; lines: ResultLine[]; leftOutWalls: ReadonlySet<string> }
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
  return { plan: read.plan, raw: value as Record<string, unknown>, lines: faultLines(value as Record<string, unknown>, read.faults), leftOutWalls: read.leftOutWalls }
}

// ---------------------------------------------------------------------------------------------
// A plan that was read

interface Names {
  readonly floors: number
  floorName(id: string): string
  roomName(id: string): string
  thingOf(kind: ThingKind, id: string): { label: string; name: string; floor: string | null }
}

function namesOf(plan: FloorPlan): Names {
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
  const floorName = (id: string): string => floorNames.get(id) ?? id
  const roomName = (id: string): string => rooms.get(id)?.name || id
  return {
    floors: floors.length,
    floorName,
    roomName,
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
    ...(issue.fixes ? { fixes: issue.fixes } : {})
  }
  return line(issue.code, issue.severity === 'error' ? 'left-out' : 'worth-a-look', thing, at.floor, subject, issue.fixes ? { fixes: issue.fixes } : {})
}

function findingLine(finding: RuleFinding, names: Names, wayOutNotDrawn: ReadonlySet<string>): ResultLine {
  let code = FINDING_CODES[finding.code]
  if (finding.code === 'no_route_to_exit' && wayOutNotDrawn.has(finding.floor)) code = 'room/no-route-to-door-out'
  const thing: Thing =
    finding.code === 'no_exit'
      ? { kind: 'floor', id: finding.floor }
      : (finding.code === 'door_to_undrawn_space' ||
          finding.code === 'door_to_outside_above_ground' ||
          finding.code === 'opening_too_small_to_pass') &&
        finding.openings[0] !== undefined
      ? { kind: 'opening', id: finding.openings[0] }
      : { kind: 'room', id: finding.rooms[0] ?? '' }
  const room = finding.rooms[0]
  const subject: Subject = {
    ...blank(names.thingOf(thing.kind, thing.id).label),
    name: room === undefined ? names.floorName(finding.floor) : names.roomName(room),
    floorName: names.floorName(finding.floor),
    also: [...finding.rooms, ...finding.openings].filter((id) => id !== thing.id),
    names: finding.rooms.map(names.roomName),
    floors: names.floors,
    finding,
    said: finding.message
  }
  return line(code, 'finding', thing, finding.floor, subject, finding.figures ? { figures: finding.figures } : {})
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
  }
}

function noticeLine(notice: NotChecked, names: Names, country: string): ResultLine {
  const thing: Thing = notice.floor === '' ? { kind: 'plan', id: '' } : { kind: 'floor', id: notice.floor }
  const subject: Subject = {
    ...blank(names.thingOf(thing.kind, thing.id).label),
    name: notice.floor === '' ? '' : names.floorName(notice.floor),
    floorName: notice.floor === '' ? '' : names.floorName(notice.floor),
    also: [...notice.rooms, ...notice.openings],
    names: notice.rooms.map(names.roomName),
    floors: names.floors,
    country,
    notice,
    said: notice.message
  }
  return line(noticeCode(notice), 'not-checked', thing, notice.floor === '' ? null : notice.floor, subject)
}

function checkFailed(stage: string, error: unknown): ResultLine {
  return line('plan/check-failed', 'not-checked', { kind: 'plan', id: '' }, null, {
    ...blank(NOUN.plan),
    said: `the ${stage} stopped: ${errorText(error)}`
  })
}

function record(lines: readonly ResultLine[], read: boolean, report: RulesReport | null): GridResult {
  const order = new Map(LINE_KINDS.map((kind, i) => [kind, i] as const))
  // Stable: lines of one kind keep the order their check gave them.
  const sorted = [...lines].sort((a, b) => order.get(a.kind)! - order.get(b.kind)!)
  const counts = Object.fromEntries(LINE_KINDS.map((kind) => [kind, sorted.filter((l) => l.kind === kind).length])) as Record<LineKind, number>
  return {
    resultVersion: RESULT_VERSION,
    label: GENERAL_GUIDANCE_LABEL,
    read,
    count: sorted.length,
    counts,
    lines: sorted,
    basis: report?.basis ?? 'general-baseline',
    ...(report?.lookupNotice ? { lookupNotice: report.lookupNotice } : {}),
    checks: report?.rules ?? [],
    coverage: report?.coverage ?? [],
    figures: report?.figures ?? [],
    limits: report?.limits ?? [...PLAN_LIMITS, ...FIGURE_LIMITS]
  }
}

/** Every line about a plan that was read. */
function inspectRead(read: Extract<Read, { plan: FloorPlan }>, options: CheckOptions): GridResult {
  const { plan } = read
  const lines: ResultLine[] = [...read.lines]
  const names = namesOf(plan)
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
    lines.push(...validatePlan(plan, undefined, { leftOutWalls: read.leftOutWalls }).issues.map((issue) => issueLine(issue, names)))
  })
  stage('door check', () => {
    const seen = new Set<string>()
    for (const issue of validateDoorSweeps(plan, (opening) => opening)) {
      const key = `${issue.code}|${issue.id}|${issue.hits.join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(issueLine(issue, names))
    }
  })
  let report: RulesReport | null = null
  stage('plan checks', () => {
    report = checkLocalRules(plan, options)
    const wayOutNotDrawn = new Set(report.notChecked.filter((n) => n.reason === 'way_out_not_drawn').map((n) => n.floor))
    const country = (options.country ?? '').trim().toUpperCase()
    lines.push(...report.findings.map((finding) => findingLine(finding, names, wayOutNotDrawn)))
    lines.push(...report.notChecked.map((notice) => noticeLine(notice, names, country)))
  })
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
    const rooms = new Set(plan.rooms.map((room) => room.id))
    for (const note of plan.annotations ?? []) {
      if (note.room === undefined || rooms.has(note.room)) continue
      lines.push(line('plan/note-no-place', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(quoted(note.id)), also: [note.id, note.room], floors: names.floors, said: `room ${note.room}` }))
    }
  })
  // WRT-6 (lab WR-15): what the plan marks assumed, for the person to confirm, and a mark that
  // names a part the plan no longer has.
  stage('marks', () => {
    for (const mark of marksWithNoPart(plan)) {
      const label = `${NOUN[mark.part]} ${quoted(mark.id)}`
      lines.push(line('plan/mark-no-part', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(label), also: [mark.id], floors: names.floors, ...(mark.value ? { word: VALUE_WORDS[mark.value] ?? mark.value } : {}) }))
    }
    for (const value of assumedValues(plan)) {
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
  return record(lines, true, report)
}

/** WRT-6: a marked value as a line names it. */
const VALUE_WORDS: Readonly<Record<string, string>> = { floorOffset: 'floor offset', at: 'place', start: 'start', end: 'end', turn: 'turn' }

/**
 * Reads a plan and runs every check on it. Never throws.
 *
 * `raw` is the plan as parsed JSON, or its text. A plan the format refuses gives a record with
 * `read: false` whose lines say where and why; nothing else is checked then.
 */
export function inspectPlan(raw: unknown, options: CheckOptions = {}): GridResult {
  try {
    const read = readPlan(raw)
    if (read.plan === null) return record(read.lines, false, null)
    return inspectRead(read, options)
  } catch (error) {
    return record([checkFailed('reading', error)], false, null)
  }
}
