/**
 * Reads a plan file for a command, or refuses it with one line that says why.
 *
 * A plan is refused when it can't be read, isn't JSON, or isn't a Grid plan by the schema.
 * A plan that passes the schema but has parts that can't be drawn is not refused: those parts
 * are left out, as the app leaves them out, and `grid check` says which and why.
 */
import { readFileSync } from 'fs'
import { planFloors, validatePlan, type Issue } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { UsageError } from './options'

/** Why a plan was refused. The message is one line. */
export class PlanRefused extends Error {
  override readonly name = 'PlanRefused'
}

export interface LoadedPlan {
  readonly plan: FloorPlan
  readonly issues: readonly Issue[]
  /** Ids the views and exports leave out because they can't be drawn. */
  readonly broken: ReadonlySet<string>
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new PlanRefused(`There is no file ${file}.`)
    if (code === 'EISDIR') throw new PlanRefused(`${file} is a folder, not a plan file.`)
    if (code === 'EACCES' || code === 'EPERM') throw new PlanRefused(`${file} can't be read: permission denied.`)
    throw new PlanRefused(`${file} can't be read: ${oneLine((error as Error).message)}`)
  }
}

/** Where a schema problem is, as `walls[2].thickness`. */
function pathText(path: readonly (string | number)[]): string {
  return path.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${key}` : key), '')
}

export function loadPlan(file: string): LoadedPlan {
  const text = readText(file)
  let raw: unknown
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch (error) {
    throw new PlanRefused(`${file} is not JSON: ${oneLine((error as Error).message)}`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PlanRefused(`${file} is not a Grid plan: it must be a JSON object with walls, rooms and openings.`)
  }
  const parsed = FloorPlanSchema.safeParse(raw)
  if (!parsed.success) {
    const [first, ...rest] = parsed.error.issues
    const where = first && first.path.length > 0 ? `${pathText(first.path)}: ` : ''
    const more = rest.length > 0 ? ` (and ${rest.length} more problem${rest.length === 1 ? '' : 's'})` : ''
    throw new PlanRefused(`${file} is not a Grid plan: ${where}${oneLine(first?.message ?? 'invalid')}${more}`)
  }
  const plan = parsed.data
  const { issues, broken } = validatePlan(plan)
  return { plan, issues, broken }
}

/**
 * The floor a command was asked for, checked against the plan. Unlike the views, a command
 * never falls back to another floor: a floor that isn't there is refused.
 */
export function floorOption(plan: FloorPlan, floor: string | undefined): string | undefined {
  if (floor === undefined) return undefined
  const floors = planFloors(plan)
  if (floors.some((f) => f.id === floor)) return floor
  const known = floors.map((f) => f.id).join(', ')
  throw new UsageError(`--floor ${JSON.stringify(floor)} is not a floor of this plan. Its floors: ${known || 'none'}.`)
}
