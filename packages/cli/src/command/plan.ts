/**
 * Reads a plan file for a command, or refuses it with one line that says why.
 *
 * A plan is refused when it can't be read, isn't JSON, or isn't a Grid plan by the schema.
 * A plan that passes the schema but has parts that can't be drawn is not refused: those parts
 * are left out, as the app leaves them out, and `grid check` says which and why.
 */
import { planFloors, validatePlan, type Issue } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, type FloorPlan, type PlanSchemaIssue } from '@ongrid/floorplan/types/floorplan'
import type { Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { PLAN_FILE_MAX_BYTES, planTextProblem } from './planText'
import { UsageError } from './options'

/** Why a plan was refused. The message is one line. */
export class PlanRefused extends Error {
  override readonly name = 'PlanRefused'
}

export interface LoadedPlan {
  /** The real path of the plan file, inside the project. */
  readonly file: string
  readonly plan: FloorPlan
  readonly issues: readonly Issue[]
  /** Ids the views and exports leave out because they can't be drawn. */
  readonly broken: ReadonlySet<string>
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function readText(project: Project, file: string): { text: string; real: string } {
  try {
    return project.readText(file, PLAN_FILE_MAX_BYTES)
  } catch (error) {
    if (error instanceof TextNotDecoded) throw new PlanRefused(oneLine(error.message))
    // A path the project refuses is refused as it is: its message names the project folder.
    if (!(error as NodeJS.ErrnoException).code) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new PlanRefused(`There is no file ${file}.`)
    if (code === 'EISDIR') throw new PlanRefused(`${file} is a folder, not a plan file.`)
    if (code === 'EFBIG') throw new PlanRefused(`${file} is larger than ${PLAN_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a plan file.`)
    if (code === 'EACCES' || code === 'EPERM') throw new PlanRefused(`${file} can't be read: permission denied.`)
    throw new PlanRefused(`${file} can't be read: ${oneLine((error as Error).message)}`)
  }
}

/** Where a schema problem is, as `walls[2].thickness`. */
function pathText(path: readonly (string | number)[]): string {
  return path.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${key}` : key), '')
}

/**
 * Where the text stops being JSON, in Grid's words. The parser's own message quotes the text
 * around the spot, and the text may be anything: a stranger's sentence to the agent, or the
 * start of a file that was never a plan.
 */
function notJson(text: string, error: unknown): string {
  const message = (error as Error).message
  if (/unexpected end of json input/i.test(message)) return 'it ends before the JSON does'
  const at = /position (\d+)/.exec(message)
  if (!at) return 'it can\'t be read as JSON'
  const before = text.slice(0, Number(at[1])).split('\n')
  return `it stops being JSON at line ${before.length}, column ${before[before.length - 1]!.length + 1}`
}

/**
 * A schema problem in Grid's words: where it is and what the schema wants, never the value
 * found there, which is text from the plan. Paths are keys of the schema and positions.
 */
function schemaProblem(issue: PlanSchemaIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? `needs a ${issue.expected}` : `must be a ${issue.expected}, not a ${issue.received}`
    case 'invalid_enum_value':
      return `must be one of ${issue.options.map((option) => JSON.stringify(option)).join(', ')}`
    case 'invalid_literal':
      return `must be ${JSON.stringify(issue.expected)}`
    case 'too_small':
    case 'too_big':
    case 'invalid_string':
    case 'not_finite':
    case 'not_multiple_of':
      // Made from the schema's own limits: "Number must be greater than 0".
      return issue.message
    default:
      return `does not fit the plan's format (${issue.code})`
  }
}

/** Reads a plan file inside the project. Refused with `PlanRefused`, or `PathRefused` for the path. */
export function loadPlan(project: Project, file: string): LoadedPlan {
  const { text, real } = readText(project, file)
  let raw: unknown
  try {
    // The reader has dropped a byte-order mark already; a second one is not JSON.
    raw = JSON.parse(text)
  } catch (error) {
    throw new PlanRefused(`${file} is not JSON: ${notJson(text, error)}.`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PlanRefused(`${file} is not a Grid plan: it must be a JSON object with walls, rooms and openings.`)
  }
  // MSG-9: names and ids are limited and cleaned before the schema reads them.
  const textProblem = planTextProblem(raw as Record<string, unknown>)
  if (textProblem !== null) throw new PlanRefused(`${file} is not a Grid plan: ${textProblem}.`)
  const parsed = FloorPlanSchema.safeParse(raw)
  if (!parsed.success) {
    const [first, ...rest] = parsed.error.issues
    const where = first && first.path.length > 0 ? `${pathText(first.path)}: ` : ''
    const more = rest.length > 0 ? ` (and ${rest.length} more problem${rest.length === 1 ? '' : 's'})` : ''
    throw new PlanRefused(`${file} is not a Grid plan: ${where}${first ? oneLine(schemaProblem(first)) : 'invalid'}${more}`)
  }
  const plan = parsed.data
  const { issues, broken } = validatePlan(plan)
  return { file: real, plan, issues, broken }
}

/**
 * The floor a command was asked for, checked against the plan. Unlike the views, a command
 * never falls back to another floor: a floor that isn't there is refused.
 */
export function floorOption(plan: FloorPlan, floor: string | undefined): string | undefined {
  if (floor === undefined) return undefined
  const floors = planFloors(plan)
  if (floors.some((f) => f.id === floor)) return floor
  // Quoted: a floor id is text from the plan file, and may hold anything.
  const known = floors.map((f) => JSON.stringify(f.id)).join(', ')
  throw new UsageError(`--floor ${JSON.stringify(floor)} is not a floor of this plan. Its floors: ${known || 'none'}.`)
}
