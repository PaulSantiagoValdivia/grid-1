/**
 * Reads a plan file for a command, or refuses it with one line that says why.
 *
 * A plan is refused when it can't be read, isn't JSON, holds an unfinished git merge, or isn't
 * a Grid plan at its top level. A part with a value Grid cannot read is not (MSG-6): the plan is
 * read part by part, that part is left out or its value read as meant, and the rest is drawn
 * and checked. A plan that passes the schema but has parts that can't be drawn is not refused
 * either: those parts are left out, as the app leaves them out, and `grid check` says which and
 * why. A command that writes the plan back reads it whole (`{ whole: true }`), so nothing the
 * reader left out is lost.
 */
import { planInMetres } from '@ongrid/floorplan/types/units'
import { planFloors, validatePlan, type Issue } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, quoted, type FloorPlan, type PlanSchemaIssue } from '@ongrid/floorplan/types/floorplan'
import { readPlanText, type UnfinishedMerge } from '@ongrid/floorplan/types/jsonText'
import { readPlanParts, type ReadFault } from '@ongrid/floorplan/types/readParts'
import { PathRefused, type Project } from '../fs/projectFiles'
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
  /** What the reader did with each part or value it could not read as written (MSG-6). */
  readonly faults?: readonly ReadFault[]
  /**
   * The file's text, which `grid check` reads again for the record, so the record names what
   * the reader did (MSG-6). Absent for a plan made in memory.
   */
  readonly text?: string
}

export interface LoadOptions {
  /**
   * Refuse a plan with any part or value the reader could not read as written, as before MSG-6.
   * For a command that writes the plan back: reading it part by part would drop what it left out.
   */
  readonly whole?: boolean
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

/** An unfinished merge in one line: where, and what each side adds or changes, by id. */
function mergeText(merge: UnfinishedMerge): string {
  const side = (label: string | null, other: string): string => (label === null ? other : quoted(label))
  const ids = (list: readonly string[]): string => (list.length > 6 ? `${list.slice(0, 6).map(quoted).join(', ')} and ${list.length - 6} more` : list.map(quoted).join(', '))
  const ours = side(merge.ours.label, 'one side')
  const theirs = side(merge.theirs.label, 'the other')
  const said = [
    merge.ours.adds.length > 0 ? `${ours} adds ${ids(merge.ours.adds)}` : null,
    merge.theirs.adds.length > 0 ? `${theirs} adds ${ids(merge.theirs.adds)}` : null,
    merge.changed.length > 0 ? `both change ${ids(merge.changed)}` : null,
  ].filter((part) => part !== null)
  const conflicts = merge.conflicts === 1 ? 'a conflict' : `${merge.conflicts} conflicts`
  return `${conflicts} between ${ours} and ${theirs}, the first at line ${merge.line}${said.length > 0 ? `: ${said.join('; ')}` : ''}. Finish the merge and take out git's markers`
}

/** A reading fault in one line, for a command that refuses it. */
function faultText(fault: ReadFault): string {
  if (fault.kind === 'id-clash') return `${fault.part.list}[${fault.part.index}].id is the id of ${fault.kept.list}[${fault.kept.index}] too`
  return `${pathText(fault.path)} is ${fault.found}, and the format takes ${fault.wants}`
}

/**
 * CMD-15 (T-5): the trace image a plan names is a path written by whoever wrote the plan, and
 * the plan may come from a stranger. It must lead to a file inside the project folder, by the
 * same resolver as every other path: no web address, no network or device path, no `..` or
 * absolute path out of the folder, no symbolic link out of it. Relative to the project folder,
 * as the schema says, for the command and the tool server alike. The picture need not exist.
 */
function traceImageCheck(project: Project, file: string, plan: FloorPlan): void {
  const image = plan.referenceImage
  if (image === undefined) return
  try {
    project.resolve(image.path, 'project')
  } catch (error) {
    if (!(error instanceof PathRefused)) throw error
    throw new PlanRefused(`${file} can't be used: its trace image, referenceImage.path, is refused. ${error.message} `
      + 'Take referenceImage out of the plan, or name a picture inside the project folder.')
  }
}

/** Reads a plan file inside the project. Refused with `PlanRefused`, or `PathRefused` for the path. */
export function loadPlan(project: Project, file: string, options: LoadOptions = {}): LoadedPlan {
  const { text, real } = readText(project, file)
  return loadPlanText(project, file, text, real, options)
}

/**
 * Reads a plan from its text, as `loadPlan` reads a file's: an earlier version of `file` kept in
 * a start marker or in git (WRT-8). `real` is the path it is named by in what is said of it.
 */
export function loadPlanText(project: Project, file: string, text: string, real: string, options: LoadOptions = {}): LoadedPlan {
  // MSG-6: the text first, for a merge left unfinished, NaN and a decimal comma.
  const read = readPlanText(text)
  if (!read.ok && read.fault.kind === 'unfinished-merge') {
    throw new PlanRefused(`${file} holds an unfinished git merge: ${mergeText(read.fault)}.`)
  }
  if (!read.ok) {
    let error: unknown = null
    try {
      // The reader has dropped a byte-order mark already; a second one is not JSON.
      JSON.parse(text)
    } catch (thrown) {
      error = thrown
    }
    throw new PlanRefused(`${file} is not JSON: ${notJson(text, error)}.`)
  }
  const raw = read.value
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PlanRefused(`${file} is not a Grid plan: it must be a JSON object with walls, rooms and openings.`)
  }
  // MSG-9: names and ids are limited and cleaned before the schema reads them.
  const textProblem = planTextProblem(raw as Record<string, unknown>)
  if (textProblem !== null) throw new PlanRefused(`${file} is not a Grid plan: ${textProblem}.`)
  const parts = readPlanParts(raw, read.marks)
  const strict = (): void => {
    // The schema's own words, as before MSG-6.
    const parsed = FloorPlanSchema.safeParse(planInMetres(raw).raw)
    if (parsed.success) return
    const [first, ...rest] = parsed.error.issues
    const where = first && first.path.length > 0 ? `${pathText(first.path)}: ` : ''
    const more = rest.length > 0 ? ` (and ${rest.length} more problem${rest.length === 1 ? '' : 's'})` : ''
    throw new PlanRefused(`${file} is not a Grid plan: ${where}${first ? oneLine(schemaProblem(first)) : 'invalid'}${more}`)
  }
  if (parts.plan === null) {
    strict()
    throw new PlanRefused(`${file} is not a Grid plan.`)
  }
  // WRT-7: lengths stated in another unit are read in it, and the change is written in metres.
  const faults = parts.faults.filter((f) => !(f.kind === 'read-as-meant' && f.path.length === 1 && f.path[0] === 'units' && planInMetres(raw).from !== null))
  if (options.whole === true && faults.length > 0) {
    // A value the text could not hold is named for what it is; the rest in the schema's words.
    if (read.marks.length === 0) strict()
    const [first, ...rest] = faults
    const more = rest.length > 0 ? ` (and ${rest.length} more)` : ''
    throw new PlanRefused(`${file} has a part Grid would leave out or read otherwise: ${faultText(first!)}${more}. grid check names each; correct them first.`)
  }
  const plan = parts.plan
  traceImageCheck(project, file, plan)
  const { issues, broken } = validatePlan(plan, undefined, { leftOutWalls: parts.leftOutWalls })
  return { file: real, plan, issues, broken, faults: parts.faults, text }
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
