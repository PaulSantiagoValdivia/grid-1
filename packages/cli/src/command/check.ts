/**
 * `grid check <plan>`: the full check of `@ongrid/rules`, with the drawing's own problems,
 * as text for a person or as JSON for a program.
 *
 * Every report starts with the label "General guidance, not your local rules". No line says a
 * plan complies, passes or is approved: no findings only means these checks found nothing.
 */
import { floorOf, type FloorPlan, type Issue } from '@ongrid/floorplan/geometry'
import { checkLocalRules, GENERAL_GUIDANCE_LABEL, type RulesReport } from '@ongrid/rules'
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
  return floors
}

export function checkPlan(loaded: LoadedPlan, request: Omit<CheckRequest, 'json'>): CheckResult {
  const { plan } = loaded
  const country = request.country
  if (country !== undefined && !COUNTRY.test(country)) {
    throw new UsageError(`--country takes a two-letter country code, such as US or ES: got ${JSON.stringify(country)}.`)
  }
  const floor = floorOption(plan, request.floor)
  const full = checkLocalRules(plan, country === undefined ? {} : { country: country.toUpperCase() })
  const whole: CheckResult = { label: GENERAL_GUIDANCE_LABEL, issues: loaded.issues, report: full }
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
  return { label: GENERAL_GUIDANCE_LABEL, floor, issues: floorIssues(loaded, floor), report }
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
  const onFloor = (floor: string): string => (floorCount > 1 && floor ? `${floor}: ` : '')
  const lines: string[] = [result.label]
  if (report.lookupNotice) lines.push(report.lookupNotice)
  if (result.floor !== undefined) lines.push(`Floor ${result.floor} only.`)

  lines.push(...section('Checks run', report.rules.map((rule) => `${rule.title} (${rule.source.label})`)))

  if (report.findings.length === 0) {
    lines.push('', `Findings: none. ${NOTHING_FOUND}`)
  } else {
    lines.push(...section('Findings', report.findings.map((finding) => `${onFloor(finding.floor)}${finding.message}`)))
  }

  if (report.notChecked.length > 0) {
    lines.push(...section('Not checked', report.notChecked.map((notice) => `${onFloor(notice.floor)}${notice.message}`)))
  }

  if (result.issues.length > 0) {
    lines.push(...section(
      'Problems in the drawing',
      result.issues.map((issue) => `${issue.severity === 'error' ? 'left out' : 'worth a look'}, ${issue.entity} ${JSON.stringify(issue.id)}: ${issue.message}`),
    ))
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
