/**
 * `grid check <plan>`: the result record of `@ongrid/rules` (`inspectPlan`, MSG-1): the drawing's
 * problems, the door sweeps, the findings and what was not checked, in one list with one count,
 * as text for a person or as JSON for a program.
 *
 * Every report starts with the label "General guidance, not your local rules". No line says a
 * plan complies, passes or is approved: no findings only means these checks found nothing.
 */
import { floorOf, type FloorPlan, type Issue } from '@ongrid/floorplan/geometry'
import {
  buildingKindsText,
  checkLocalRules,
  coverageOnFloor,
  figureUsedText,
  GENERAL_GUIDANCE_LABEL,
  inspectPlan,
  roomsLookedAt,
  type AppliedFigure,
  type CheckCoverage,
  type GridResult,
  type LineKind,
  type ResultLine,
  type RulesReport,
} from '@ongrid/rules'
import { floorOption } from './plan'
import type { LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'
import type { Project } from '../fs/projectFiles'
import { markDay, markSeen, partText, seenStates, unmarkSeen, type SeenMark, type SeenRead, type SeenState } from '../seen/marks'

export const CHECK_OPTIONS: OptionSpecs = {
  '--floor': { takesValue: true, help: 'Only show what was found on this floor (a floor id from the plan).' },
  '--country': {
    takesValue: true,
    help: 'Where the plan will be built, as a two-letter code such as US or ES.',
  },
  '--json': { takesValue: false, help: 'Print the report as JSON.' },
  // MSG-10: the report is short by default; this gives every section.
  '--full': { takesValue: false, help: 'Print the whole report: the checks run, every figure, what each check looked at part by part, and what these checks never look at.' },
  // MSG-10: a note set aside as seen, with the person's reason and name, in the marks file beside the plan.
  '--seen': { takesValue: true, help: 'Mark the note of this number as seen, with --reason and --by. It stays listed, under Seen, and is new again when one of its parts changes.' },
  '--unseen': { takesValue: true, help: 'Take the seen mark off the note of this number.' },
  '--reason': { takesValue: true, help: 'With --seen: why the note is set aside, in one line.' },
  '--by': { takesValue: true, help: 'With --seen: who marks it, as the name or role you give. It is kept only in the marks file beside the plan.' },
  ...PROJECT_OPTION,
}

export interface CheckRequest {
  readonly floor?: string
  readonly country?: string
  readonly json: boolean
}

export interface CheckResult {
  readonly label: typeof GENERAL_GUIDANCE_LABEL
  /** Only when the check was asked about one floor. */
  readonly floor?: string
  /** Problems with the drawing itself: what can't be drawn, and what is worth a look. */
  readonly issues: readonly Issue[]
  readonly report: RulesReport
  /** Everything above, and the door sweeps, as one list with one count (MSG-1). On one floor, its lines and the plan's. */
  readonly result: GridResult
  /**
   * Each of `result.lines`' number: its place from 1 in the whole plan's record, so a line keeps
   * its number on one floor, and a drawing marks it with the same one (MSG-8).
   */
  readonly numbers: readonly number[]
  /**
   * MSG-2 (lab W-8): how many of the rooms at least one check looked at, and those none did,
   * printed beside the count of lines. On one floor, that floor's rooms.
   */
  readonly rooms: ReturnType<typeof roomsLookedAt>
  /**
   * MSG-10: how each of `result.lines` stands against the seen marks beside the plan, when they
   * were read. Absent for a check that read no marks file.
   */
  readonly seen?: CheckSeen
}

/** MSG-10: the seen marks as a check read them. */
export interface CheckSeen {
  /** The marks file, relative to the project folder. */
  readonly file: string
  /** Why the marks file could not be read: then every note is new. */
  readonly problem: string | null
  /** Each of `result.lines`' state, in their order. */
  readonly states: readonly SeenState[]
}

/** MSG-10: the check with how each of its lines stands against the marks read beside the plan. */
export function withSeen(result: CheckResult, loaded: Pick<LoadedPlan, 'plan' | 'text'>, read: SeenRead): CheckResult {
  return { ...result, seen: { file: read.file, problem: read.problem, states: seenStates(loaded, result.result.lines, read.marks) } }
}

/** MSG-10: how many of the check's lines are seen, with a mark that still holds. */
export function seenCount(result: CheckResult): number {
  return (result.seen?.states ?? []).filter((s) => s.state === 'seen').length
}

/** "by "A. Person" on 2026-11-22: "Kept small on purpose"": the person's words, quoted. */
export function seenByText(mark: SeenMark): string {
  return `by ${JSON.stringify(mark.by)} on ${markDay(mark)}: ${JSON.stringify(mark.reason)}`
}

/** A note whose parts changed since it was marked: new again, and why. */
export function seenBeforeText(state: Extract<SeenState, { state: 'back' }>): string {
  const changed = state.changed.slice(0, 4).map(partText).join(', ')
  const more = state.changed.length > 4 ? ` and ${state.changed.length - 4} more` : ''
  return `seen before, ${seenByText(state.mark)}; but ${changed}${more} changed since, so it is new again`
}

/** MSG-10: what a request to mark a note asks: its number in the whole plan's report, and what to do. */
export type MarkAsk =
  | { readonly mark: 'seen'; readonly number: number; readonly reason: string; readonly by: string; readonly at?: string }
  | { readonly mark: 'unseen'; readonly number: number }

/** MSG-10: what marking did, in one line for the report, and as data. */
export interface MarkDone {
  readonly text: string
  readonly number: number
  readonly code: string
  readonly file: string
  /** The mark written, or the one taken off; null when there was none to take off. */
  readonly mark: SeenMark | null
  readonly unmarked: boolean
}

/**
 * The line of a number in the whole plan's report, or why there is none. `whole` is the check of
 * the whole plan, so a number means what `grid check` and `grid_check` print beside it.
 */
export function lineOfNumber(whole: CheckResult, number: number, argument: string): ResultLine {
  const count = whole.result.count
  if (count === 0) throw new UsageError(`${argument}: the report has no notes to mark.`)
  const line = Number.isInteger(number) ? whole.result.lines[number - 1] : undefined
  if (line === undefined) throw new UsageError(`${argument} takes the number of a note in the report, from 1 to ${count}.`)
  return line
}

/** MSG-10: marks a note of the whole plan's report as seen, or takes its mark off, in the marks file beside the plan. */
export function markNote(project: Project, planFile: string, loaded: LoadedPlan, whole: CheckResult, ask: MarkAsk, argument: string): MarkDone {
  const line = lineOfNumber(whole, ask.number, argument)
  const note = `${KIND_WORDS[line.kind]}, ${thingText(line)}: ${line.message}. [${line.code}]`
  if (ask.mark === 'unseen') {
    const { file, removed } = unmarkSeen(project, planFile, line)
    const text = removed === null ? `Note ${ask.number} had no seen mark, so nothing was changed: ${note}` : `Took the seen mark off note ${ask.number}, in ${file}; it is listed as new: ${note}`
    return { text, number: ask.number, code: line.code, file, mark: removed, unmarked: removed !== null }
  }
  const { file, mark } = markSeen(project, planFile, loaded, line, { reason: ask.reason, by: ask.by, ...(ask.at ? { at: ask.at } : {}) })
  const parts = mark.parts.slice(0, 4).map(partText).join(', ')
  const more = mark.parts.length > 4 ? ` or ${mark.parts.length - 4} more` : ''
  const when = mark.parts.length === 1 ? parts : `one of ${parts}${more}`
  const text = `Marked note ${ask.number} as seen, ${seenByText(mark)}, in ${file}: ${note} It stays listed, under Seen, and is new again when ${when} changes.`
  return { text, number: ask.number, code: line.code, file, mark, unmarked: false }
}

/** What the Seen part says of itself: never that a note is dealt with. */
export const SEEN_HEADING_NOTE = 'each stays listed here, and is new again when one of its parts changes'

const COUNTRY = /^[A-Za-z]{2}$/

/** What no findings means, said wherever a check reports none. */
export const NOTHING_FOUND = 'That only means these checks found nothing, not that the plan meets any rule.'
/** MSG-3: what a report says when no check looked at anything. */
export const NOTHING_CHECKED = 'Nothing was checked for this plan: no check found a floor, room or door to look at.'

/** MSG-3: a check that looked at nothing, said as such. */
export function nothingCheckedText(title: string, looksAt: CheckCoverage['looksAt']): string {
  return `Nothing was checked for "${title}": it looked at no ${PARTS[looksAt][1]}`
}

/** The floor each wall, room and opening is on. */
function floorsById(plan: FloorPlan): Map<string, string> {
  const floors = new Map<string, string>()
  for (const wall of plan.walls) floors.set(wall.id, floorOf(wall))
  for (const room of plan.rooms) floors.set(room.id, floorOf(room))
  for (const opening of plan.openings) {
    const wall = plan.walls.find((w) => w.id === opening.wall)
    if (wall) floors.set(opening.id, floorOf(wall))
  }
  // Set last: an item's own id never takes another part's floor (`item/duplicate-id` says so).
  for (const item of plan.items ?? []) if (!floors.has(item.id)) floors.set(item.id, floorOf(item))
  return floors
}

export function checkPlan(loaded: LoadedPlan, request: Omit<CheckRequest, 'json'>): CheckResult {
  const { plan } = loaded
  const country = request.country
  if (country !== undefined && !COUNTRY.test(country)) {
    throw new UsageError(`--country takes a two-letter country code, such as US or ES: got ${JSON.stringify(country)}.`)
  }
  const floor = floorOption(plan, request.floor)
  const options = country === undefined ? {} : { country: country.toUpperCase() }
  const full = checkLocalRules(plan, options)
  // The file's text (MSG-6), so the record names what the reader did and the words the schema
  // drops (MSG-4).
  const result = inspectPlan(loaded.text ?? plan, options)
  const whole: CheckResult = { label: GENERAL_GUIDANCE_LABEL, issues: loaded.issues, report: full, result, rooms: roomsLookedAt(plan, result.coverage), numbers: result.lines.map((_, index) => index + 1) }
  return floor === undefined ? whole : checkOnFloor(loaded, whole, floor)
}

/** What a check of the whole plan found on one floor, without running the rules again. */
export function checkOnFloor(loaded: LoadedPlan, whole: CheckResult, floor: string): CheckResult {
  const full = whole.report
  const report: RulesReport = {
    ...full,
    findings: full.findings.filter((finding) => finding.floor === floor),
    // A notice about the whole plan has no floor, and holds for every floor.
    notChecked: full.notChecked.filter((notice) => notice.floor === floor || notice.floor === ''),
    coverage: coverageOnFloor(full.coverage, floor),
  }
  const result = resultOnFloor(whole.result, floor)
  const numbers = result.lines.map((line) => whole.numbers[whole.result.lines.indexOf(line)] ?? 0)
  return { label: GENERAL_GUIDANCE_LABEL, floor, issues: floorIssues(loaded, floor), report, result, rooms: roomsLookedAt(loaded.plan, result.coverage, floor), numbers }
}

/** The record's lines on one floor, and those about the whole plan, counted again. */
export function resultOnFloor(result: GridResult, floor: string): GridResult {
  const lines = result.lines.filter((line) => line.floor === null || line.floor === floor)
  const counts = Object.fromEntries(Object.keys(result.counts).map((kind) => [kind, lines.filter((l) => l.kind === kind).length])) as Record<LineKind, number>
  return { ...result, lines, count: lines.length, counts, coverage: coverageOnFloor(result.coverage, floor) }
}

/** What each kind of line is called in a list. */
export const KIND_WORDS: Record<LineKind, string> = {
  refused: 'refused',
  'left-out': 'left out',
  'worth-a-look': 'worth a look',
  finding: 'finding',
  'not-checked': 'not checked',
}

/** How many lines of each kind, as "2 worth a look, 1 finding". */
export function countsText(result: GridResult): string {
  return (Object.keys(KIND_WORDS) as LineKind[])
    .filter((kind) => result.counts[kind] > 0)
    .map((kind) => `${result.counts[kind]} ${KIND_WORDS[kind]}${kind === 'finding' && result.counts[kind] !== 1 ? 's' : ''}`)
    .join(', ')
}

/** The thing a line is about, as `opening "d1"` or `the plan`. */
export function thingText(line: ResultLine): string {
  return line.thing.kind === 'plan' ? 'the plan' : `${line.thing.kind} ${JSON.stringify(line.thing.id)}`
}

/** The drawing's problems on one floor. A problem with the plan itself holds for every floor. */
export function floorIssues(loaded: LoadedPlan, floor: string): readonly Issue[] {
  const on = floorsById(loaded.plan)
  // A `floor` issue (enclosed floor no room claims) has the floor itself as its id.
  return loaded.issues.filter((issue) =>
    issue.entity === 'plan' || (issue.entity === 'floor' ? issue.id === floor : (on.get(issue.id) ?? floor) === floor))
}

function section(title: string, lines: readonly string[]): string[] {
  return ['', `${title} (${lines.length}):`, ...lines.map((line) => `  - ${line}`)]
}

export interface TextOptions {
  /** MSG-10: every section: the checks run, every figure, the long coverage and the limits. */
  readonly full?: boolean
}

/** One line of the list, with what was found and needed and the fix. */
function lineText(result: CheckResult, index: number, floorCount: number, details: boolean): string[] {
  const line = result.result.lines[index]!
  const where = floorCount > 1 && line.floor !== null && line.thing.kind !== 'floor' ? ` on ${JSON.stringify(line.floor)}` : ''
  const head = `  ${result.numbers[index]}. ${KIND_WORDS[line.kind]}, ${thingText(line)}${where}: ${line.message}. [${line.code}]`
  return details ? [head, `      found: ${line.found}`, `      needed: ${line.needed}`, `      fix: ${line.fix}`] : [head]
}

/** MSG-10: the figures the lines used, once each, as the figure used here with its basis and status. */
export function figuresOfLines(lines: readonly ResultLine[]): AppliedFigure[] {
  const figures: AppliedFigure[] = []
  const taken = new Set<string>()
  for (const figure of lines.flatMap((line) => line.figures ?? [])) {
    const key = JSON.stringify(figure)
    if (taken.has(key)) continue
    taken.add(key)
    figures.push(figure)
  }
  return figures
}

/** MSG-10: where the rest of a short report is: what `--full` (the command) or `full=true` (the tool) adds. */
export function restText(report: RulesReport, option = '--full'): string {
  return `${option} lists the checks, the figures, the parts looked at and what is never looked at (${report.limits.length}).`
}

/** MSG-10: how many checks ran, and where they are listed; MSG-3's words when none did. */
export function checksRunText(report: RulesReport): string {
  return `${report.rules.length === 0 ? `Checks run: none. ${NOTHING_CHECKED}` : `Checks run: ${report.rules.length}.`} ${restText(report)}`
}

/**
 * The report as plain text. It always starts with the label.
 *
 * MSG-10: short by default, and about this plan: the lines, the figures they used, what each
 * check looked at in counts, and where the rest is. `full` gives every section, as before. A
 * seen line is listed under Seen, never left out; a line seen before whose parts changed is
 * listed with the others, and says so.
 */
export function checkText(result: CheckResult, floorCount: number, options: TextOptions = {}): string {
  const full = options.full === true
  const { report } = result
  const lines: string[] = [result.label]
  if (report.lookupNotice) lines.push(report.lookupNotice)
  if (result.floor !== undefined) lines.push(`Floor ${result.floor} only.`)

  if (full) {
    // MSG-3: an empty list is said in words, never left as a heading over nothing.
    if (report.rules.length === 0) lines.push('', `Checks run: none. ${NOTHING_CHECKED}`)
    else lines.push(...section('Checks run', report.rules.map((rule) => `${rule.title} (${rule.source.label})`)))
  }
  if (result.seen?.problem) lines.push('', `The seen marks were not read: ${result.seen.problem}. Every note is listed as new.`)

  // One list, one count (MSG-1): the drawing's problems, the door sweeps, the findings and what
  // was not checked, each with its code, what was found and needed, and the fix.
  const record = result.result
  const states = result.seen?.states ?? []
  const seen = seenCount(result)
  if (record.count === 0) {
    lines.push('', `To look at: nothing. ${NOTHING_FOUND}`)
  } else {
    lines.push('', `To look at (${record.count}): ${countsText(record)}${seen > 0 ? `; ${seen} of them seen, listed under Seen` : ''}.`)
    // Numbered by place in the whole plan's record: `grid draw` marks each with its number (MSG-8).
    record.lines.forEach((_, index) => {
      const state = states[index]
      if (state?.state === 'seen') return
      lines.push(...lineText(result, index, floorCount, true))
      if (state?.state === 'back') lines.push(`      ${seenBeforeText(state)}.`)
    })
    if (record.counts.finding === 0) lines.push('', `No findings. ${NOTHING_FOUND}`)
    if (seen > 0) {
      lines.push('', `Seen (${seen}): ${SEEN_HEADING_NOTE}.`)
      record.lines.forEach((_, index) => {
        const state = states[index]
        if (state?.state !== 'seen') return
        lines.push(...lineText(result, index, floorCount, full), `      seen ${seenByText(state.mark)}`)
      })
    }
  }

  if (full) {
    lines.push(...coverageText(result))
    // MSG-3: each as the figure used here, with its basis and its status.
    if (report.figures.length > 0) lines.push(...section('Figures used', report.figures.map(figureUsedText)))
    lines.push(...section('What these checks never look at', report.limits))
  } else {
    // MSG-10: only the figures a line used, each still with its document, edition, clause and status.
    const used = figuresOfLines(record.lines)
    if (used.length > 0) lines.push(...section('Figures these notes used', used.map(figureUsedText)))
    lines.push(...coverageSummary(result))
    lines.push('', checksRunText(report))
  }
  return `${lines.join('\n')}\n`
}

const PARTS: Record<CheckCoverage['looksAt'], [string, string]> = {
  floor: ['floor', 'floors'],
  room: ['room', 'rooms'],
  door: ['door or opening', 'doors and openings'],
}

/** "3 rooms", "1 floor". */
export function partsText(count: number, looksAt: CheckCoverage['looksAt']): string {
  return `${count} ${PARTS[looksAt][count === 1 ? 0 : 1]}`
}

/** At most `most` ids in quotes, then how many more. */
function idsText(ids: readonly string[], most = 8): string {
  const shown = ids.slice(0, most).map((id) => JSON.stringify(id)).join(', ')
  return ids.length > most ? `${shown} and ${ids.length - most} more` : shown
}

/**
 * What each check looked at (MSG-2, lab CH-1, CH-4): its count beside the count of lines, then each
 * check with the parts it looked at and the parts it skipped, with the reason and a count. An
 * empty list of lines is read with it: it only says what these parts gave.
 */
/** COD-2: a line held to a figure check, whose `needed` names the kind of building it was read for. */
export function usedFigures(line: ResultLine): boolean {
  return (line.figures?.length ?? 0) > 0 || line.code === 'room/no-escape-opening'
}

/**
 * COD-2: for a check that applied figures, the kind of building they were read for, after its
 * count of findings, so a pass with none still says it: "; its figures were read for homes (…)".
 */
export function readForText(check: Pick<CheckCoverage, 'readFor'>): string {
  return check.readFor === undefined || check.readFor.length === 0 ? '' : `; its figures were read for ${buildingKindsText(check.readFor)}`
}

export function coverageText(result: CheckResult): string[] {
  const coverage = result.result.coverage
  if (coverage.length === 0) return []
  const summary = roomsSummary(result)
  const several = new Set(coverage.flatMap((check) => [...check.lookedAt, ...check.skipped].map((group) => group.floor))).size > 1
  const lines = ['', `Looked at by at least one check: ${summary}.`, `What each check looked at (${coverage.length}):`]
  for (const check of coverage) {
    if (check.lookedAtCount === 0) lines.push(`  - ${nothingCheckedText(check.title, check.looksAt)}${readForText(check)}.`)
    else lines.push(`  - ${check.title}: looked at ${partsText(check.lookedAtCount, check.looksAt)}; ${check.findings} finding${check.findings === 1 ? '' : 's'}${readForText(check)}.`)
    if (check.lookedAtCount > 0 && check.lookedAtCount <= 8) lines.push(`      looked at: ${idsText(check.lookedAt.flatMap((group) => group.ids))}`)
    for (const skip of check.skipped) {
      const where = several && skip.floor !== '' ? ` on ${JSON.stringify(skip.floor)}` : ''
      lines.push(`      not looked at, ${partsText(skip.ids.length, check.looksAt)}${where}: ${skip.why}: ${idsText(skip.ids)}`)
    }
  }
  return lines
}

/**
 * MSG-10: what each check looked at, in counts: the rooms looked at by at least one check (and
 * those none did), then each check's count, the parts it could not look at with the reason,
 * its findings when it gave any, and the kind of building its figures were read for (COD-2).
 * A part a check is not about (`use_not_covered`) is no gap and is left to the full report.
 */
export function coverageSummary(result: CheckResult): string[] {
  const coverage = result.result.coverage
  if (coverage.length === 0) return []
  // COD-2: the kind of building, once when every check that used figures read them for the same.
  const withFigures = coverage.filter((check) => check.lookedAtCount > 0 && (check.readFor?.length ?? 0) > 0)
  const kinds = [...new Set(withFigures.map((check) => buildingKindsText(check.readFor!)))]
  const once = kinds.length === 1
  const lines = ['', `Looked at by at least one check: ${roomsSummary(result)}.`, `What each check looked at (${coverage.length}):`]
  for (const check of coverage) {
    const gaps = check.skipped.filter((skip) => skip.reason !== 'use_not_covered')
    const gap = gaps.length === 0 ? '' : `; not looked at ${gaps.reduce((n, skip) => n + skip.ids.length, 0)}: ${[...new Set(gaps.map((skip) => skip.why))].join('; ')}`
    const findings = check.findings === 0 ? '' : `; ${check.findings} finding${check.findings === 1 ? '' : 's'}`
    lines.push(check.lookedAtCount === 0
      ? `  - ${nothingCheckedText(check.title, check.looksAt)}${gap}.`
      : `  - ${check.title}: ${partsText(check.lookedAtCount, check.looksAt)}${gap}${findings}${once ? '' : readForText(check)}.`)
  }
  if (once) {
    const who = withFigures.length === 1 ? 'The check that uses figures' : withFigures.length === 2 ? 'Both checks that use figures' : `The ${withFigures.length} checks that use figures`
    lines.push(`${who} read them for ${kinds[0]}.`)
  }
  return lines
}

/** "6 of 6 rooms", with the rooms no check looked at. */
function roomsSummary(result: CheckResult): string {
  const { rooms } = result
  return rooms.rooms === 0
    ? 'no rooms: there are none to look at'
    : `${rooms.lookedAt} of ${partsText(rooms.rooms, 'room')}${rooms.byNone.length > 0 ? `; looked at by none: ${idsText(rooms.byNone.map((r) => r.id))}` : ''}`
}

/**
 * The whole check as JSON; with `marked`, what `--seen` or `--unseen` did (MSG-10). `seen` is
 * there once the plan has marks, or a marks file that can't be read: a plan no one has marked
 * gives the same JSON as before.
 */
export function checkJson(result: CheckResult, marked?: MarkDone): string {
  const { seen, ...rest } = result
  const marks = seen !== undefined && (seen.problem !== null || seen.states.some((s) => s.state !== 'new') || marked !== undefined)
  const whole = { ...rest, ...(marks ? { seen } : {}), ...(marked === undefined ? {} : { marked }) }
  return `${JSON.stringify(whole, null, 2)}\n`
}
