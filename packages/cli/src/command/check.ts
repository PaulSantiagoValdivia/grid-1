/**
 * `grid check <plan>`: the result record of `@ongrid/rules` (`inspectPlan`, MSG-1): the drawing's
 * problems, the door sweeps, the findings and what was not checked, in one list with one count,
 * as text for a person or as JSON for a program.
 *
 * Every report starts with the label "General guidance, not your local rules". No line says a
 * plan complies, passes or is approved: no findings only means these checks found nothing.
 */
import { floorOf, type FloorPlan, type Issue } from '@ongrid/floorplan/geometry'
import { checkLocalRules, GENERAL_GUIDANCE_LABEL, inspectPlan, type GridResult, type LineKind, type ResultLine, type RulesReport } from '@ongrid/rules'
import { floorOption } from './plan'
import type { LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

export const CHECK_OPTIONS: OptionSpecs = {
  '--floor': { takesValue: true, help: 'Only show what was found on this floor (a floor id from the plan).' },
  '--country': {
    takesValue: true,
    help: 'Where the plan will be built, as a two-letter code such as US or ES.',
  },
  '--json': { takesValue: false, help: 'Print the report as JSON.' },
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
}

const COUNTRY = /^[A-Za-z]{2}$/

/** What no findings means, said wherever a check reports none. */
export const NOTHING_FOUND = 'That only means these checks found nothing, not that the plan meets any rule.'

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
  const result = inspectPlan(plan, options)
  const whole: CheckResult = { label: GENERAL_GUIDANCE_LABEL, issues: loaded.issues, report: full, result, numbers: result.lines.map((_, index) => index + 1) }
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
  }
  const result = resultOnFloor(whole.result, floor)
  const numbers = result.lines.map((line) => whole.numbers[whole.result.lines.indexOf(line)] ?? 0)
  return { label: GENERAL_GUIDANCE_LABEL, floor, issues: floorIssues(loaded, floor), report, result, numbers }
}

/** The record's lines on one floor, and those about the whole plan, counted again. */
export function resultOnFloor(result: GridResult, floor: string): GridResult {
  const lines = result.lines.filter((line) => line.floor === null || line.floor === floor)
  const counts = Object.fromEntries(Object.keys(result.counts).map((kind) => [kind, lines.filter((l) => l.kind === kind).length])) as Record<LineKind, number>
  return { ...result, lines, count: lines.length, counts }
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

/** The report as plain text. It always starts with the label. */
export function checkText(result: CheckResult, floorCount: number): string {
  const { report } = result
  const lines: string[] = [result.label]
  if (report.lookupNotice) lines.push(report.lookupNotice)
  if (result.floor !== undefined) lines.push(`Floor ${result.floor} only.`)

  lines.push(...section('Checks run', report.rules.map((rule) => `${rule.title} (${rule.source.label})`)))

  // One list, one count (MSG-1): the drawing's problems, the door sweeps, the findings and what
  // was not checked, each with its code, what was found and needed, and the fix.
  const record = result.result
  if (record.count === 0) {
    lines.push('', `To look at: nothing. ${NOTHING_FOUND}`)
  } else {
    lines.push('', `To look at (${record.count}): ${countsText(record)}.`)
    // Numbered by place in the whole plan's record: `grid draw` marks each with its number (MSG-8).
    record.lines.forEach((line, index) => {
      const where = floorCount > 1 && line.floor !== null && line.thing.kind !== 'floor' ? ` on ${JSON.stringify(line.floor)}` : ''
      lines.push(
        `  ${result.numbers[index]}. ${KIND_WORDS[line.kind]}, ${thingText(line)}${where}: ${line.message}. [${line.code}]`,
        `      found: ${line.found}`,
        `      needed: ${line.needed}`,
        `      fix: ${line.fix}`,
      )
    })
    if (record.counts.finding === 0) lines.push('', `No findings. ${NOTHING_FOUND}`)
  }

  if (report.figures.length > 0) {
    lines.push(...section('Figures used', report.figures.map((figure) => {
      const value = `${figure.key} ${figure.value} ${figure.unit}`
      if (figure.origin === 'lookup') return `${value}, looked up, status ${figure.status}${figure.source ? `, ${figure.source.url}` : ''}`
      const cited = figure.citations.map((c) => `${c.document} ${c.edition} ${c.clause}`).join('; ')
      return `${value}, ${figure.jurisdiction}, ${cited}, read ${figure.readOn}, status ${figure.status}`
    })))
  }

  lines.push(...section('What these checks never look at', report.limits))
  return `${lines.join('\n')}\n`
}

export function checkJson(result: CheckResult): string {
  return `${JSON.stringify(result, null, 2)}\n`
}
