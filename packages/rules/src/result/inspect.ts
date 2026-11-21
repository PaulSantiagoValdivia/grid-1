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
  floorOf,
  planFloors,
  validateDoorSweeps,
  validatePlan,
  LIMITS as PLAN_LIMITS,
  GENERAL_GUIDANCE_LABEL,
  type FloorPlan,
  type Issue
} from '@ongrid/floorplan/geometry'
import { DEFAULT_FLOOR_ID, FloorPlanSchema, quoted, textProblem } from '@ongrid/floorplan/types/floorplan'
import { FIGURE_LIMITS } from '../checks/catalogue'
import { checkLocalRules, type CheckOptions } from '../checks/check'
import type { FindingCode, NotChecked, RuleFinding, RulesReport } from '../checks/types'
import { CODES, isLineCode, type Subject } from './catalogue'
import { LINE_KINDS, RESULT_VERSION, type GridResult, type LineKind, type ResultLine, type Thing, type ThingKind } from './types'

type ZodIssue = NonNullable<ReturnType<typeof FloorPlanSchema.safeParse>['error']>['issues'][number]

const NOUN: Record<ThingKind, string> = { plan: 'The plan', floor: 'Floor', wall: 'Wall', room: 'Room', opening: 'Opening' }
const OPENING_NOUN = { door: 'Door', window: 'Window', opening: 'Opening' } as const
/** An id from a file the format refused, when it is one Grid would read: else it is not repeated. */
const safeId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && textProblem(value, 'id') === null ? value : null

const FINDING_CODES: Record<FindingCode, string> = {
  no_exit: 'floor/no-exit',
  room_without_door: 'room/no-door',
  no_route_to_exit: 'room/no-route-out',
  door_to_undrawn_space: 'opening/to-undrawn-space',
  room_too_small: 'room/too-small',
  no_escape_opening: 'room/no-escape-opening',
  escape_window_too_small: 'room/escape-window-too-small',
  escape_window_too_high: 'room/escape-window-too-high'
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function errorText(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error))
}

/** One line from its code and what the code is told. */
function line(code: string, kind: LineKind, thing: Thing, floor: string | null, subject: Subject, extra: Partial<Pick<ResultLine, 'figures'>> = {}): ResultLine {
  // A code missing from the catalogue still gives a line: the check's own words, and a test fails.
  const entry = isLineCode(code) ? CODES[code] : null
  const found = entry && 'found' in entry && entry.found ? entry.found(subject) : subject.said
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
  const kinds: Record<string, ThingKind> = { walls: 'wall', rooms: 'room', openings: 'opening', floors: 'floor' }
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

type Read = { plan: FloorPlan; lines: [] } | { plan: null; lines: ResultLine[] }

function readPlan(raw: unknown): Read {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { plan: null, lines: [line('plan/not-json', 'refused', { kind: 'plan', id: '' }, null, { ...blank(NOUN.plan), said: "text that can't be read as JSON" })] }
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { plan: null, lines: [line('plan/not-an-object', 'refused', { kind: 'plan', id: '' }, null, blank(NOUN.plan))] }
  }
  const parsed = FloorPlanSchema.safeParse(value)
  if (parsed.success) return { plan: parsed.data, lines: [] }
  return { plan: null, lines: refusalLines(value as Record<string, unknown>, parsed.error.issues) }
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
      }
    }
  }
}

/** The thing a drawing problem is about: a floor's two plan-wide codes are about the floor. */
function issueThing(issue: Issue): { thing: Thing; also: string[] } {
  if (issue.code === 'plan/similar-floor-id' || issue.code === 'plan/duplicate-floor') return { thing: { kind: 'floor', id: issue.id }, also: [] }
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
    floors: names.floors
  }
  return line(issue.code, issue.severity === 'error' ? 'left-out' : 'worth-a-look', thing, at.floor, subject)
}

function findingLine(finding: RuleFinding, names: Names, wayOutNotDrawn: ReadonlySet<string>): ResultLine {
  let code = FINDING_CODES[finding.code]
  if (finding.code === 'no_route_to_exit' && wayOutNotDrawn.has(finding.floor)) code = 'room/no-route-to-door-out'
  const thing: Thing =
    finding.code === 'no_exit'
      ? { kind: 'floor', id: finding.floor }
      : finding.code === 'door_to_undrawn_space' && finding.openings[0] !== undefined
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
    figures: report?.figures ?? [],
    limits: report?.limits ?? [...PLAN_LIMITS, ...FIGURE_LIMITS]
  }
}

/** Every line about a plan that was read. */
function inspectRead(plan: FloorPlan, options: CheckOptions): GridResult {
  const lines: ResultLine[] = []
  const names = namesOf(plan)
  const stage = (name: string, body: () => void): void => {
    try {
      body()
    } catch (error) {
      lines.push(checkFailed(name, error))
    }
  }
  stage('drawing check', () => {
    lines.push(...validatePlan(plan).issues.map((issue) => issueLine(issue, names)))
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
  return record(lines, true, report)
}

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
    return inspectRead(read.plan, options)
  } catch (error) {
    return record([checkFailed('reading', error)], false, null)
  }
}
