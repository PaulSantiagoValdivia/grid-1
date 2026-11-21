/**
 * What every tool of `grid serve` shares: how a tool is written down, how its arguments are
 * read, and how it finds the plan, the floor and the room it was asked about.
 *
 * One description of each argument gives both the input schema `tools/list` shows and the
 * check a call goes through, so the two cannot drift apart. A refusal names the argument and
 * what it takes. It never repeats the value it was sent: that is text from the agent, and may
 * be anything (MS-19, T-3).
 */
import { planFloors, type FloorPlan } from '@ongrid/floorplan/geometry'
import { PATH_MAX, PathRefused, quoted, type Project } from '../fs/projectFiles'
import { PROJECT_FILE, projectPlanFile } from '../command/init'
import { UsageError } from '../command/options'
import { loadPlan, PlanRefused, type LoadedPlan } from '../command/plan'
import { ID_MAX as PLAN_ID_MAX, UNSAFE_TEXT } from '../command/planText'

/** The longest id an argument may hold: a floor, room, opening or wall id, as long as a plan file may hold. */
export const ID_MAX = PLAN_ID_MAX
/** What an id may hold: letters, digits, dash, underscore and dot (T-3). */
export const ID_PATTERN = '^[A-Za-z0-9._-]{1,64}$'
const ID = new RegExp(ID_PATTERN)

/** Why a call was refused, in Grid's words. It comes back as a tool error, never a throw. */
export class ToolRefusal extends Error {
  override readonly name = 'ToolRefusal'
}

/** One argument, written once for the schema and for the check. */
export type ArgSpec =
  | {
      readonly type: 'string'
      readonly description: string
      readonly examples: readonly string[]
      readonly enum?: readonly string[]
      readonly maxLength?: number
      /** An id of the plan: letters, digits, dash, underscore and dot, at most `ID_MAX`. */
      readonly id?: boolean
      readonly required?: boolean
    }
  | {
      readonly type: 'number'
      readonly description: string
      readonly examples: readonly number[]
      readonly minimum: number
      readonly maximum: number
      readonly required?: boolean
    }
  | {
      readonly type: 'boolean'
      readonly description: string
      readonly examples: readonly boolean[]
      readonly required?: boolean
    }
  | {
      readonly type: 'array'
      readonly description: string
      readonly examples: readonly (readonly string[])[]
      readonly items: { readonly id?: boolean; readonly maxLength?: number; readonly enum?: readonly string[] }
      readonly minItems: number
      readonly maxItems: number
      readonly required?: boolean
    }
  | {
      readonly type: 'object'
      readonly description: string
      readonly examples: readonly Record<string, unknown>[]
      /** The JSON Schema `tools/list` shows. */
      readonly schema: Record<string, unknown>
      /**
       * Checks the value; throws ToolRefusal with one line. `earlier` holds the arguments
       * listed before this one, already read, so a refusal they decide can come first.
       */
      readonly read: (value: unknown, earlier: Readonly<Record<string, unknown>>) => unknown
      readonly required?: boolean
    }

export type ArgSpecs = Readonly<Record<string, ArgSpec>>

/** A picture that goes back with the answer, as the MCP image content type. */
export interface AnswerImage {
  readonly data: Uint8Array
  readonly mimeType: 'image/png'
}

/** What a tool gives back: a short text for the agent, the same facts as data, maybe a picture. */
export interface Answer {
  readonly text: string
  readonly data: Record<string, unknown>
  readonly image?: AnswerImage
}

export type Hint = 'read' | 'write-file' | 'change-plan'

/** A tool as `grid serve` offers it. */
export interface GridTool {
  readonly name: `grid_${string}`
  readonly title: string
  readonly description: string
  readonly hint: Hint
  readonly args: ArgSpecs
  readonly outputSchema: Record<string, unknown>
  run(args: Record<string, unknown>, context: ToolContext): Answer | Promise<Answer>
}

/** What a tool may reach: the project folder, or the reason there is none. */
export interface ToolContext {
  readonly project: Project | PathRefused
}

const HINTS: Record<Hint, Record<string, boolean>> = {
  read: { readOnlyHint: true, openWorldHint: false },
  'write-file': { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  'change-plan': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}

function argSchema(spec: ArgSpec): Record<string, unknown> {
  const rest = { ...spec }
  delete rest.required
  if (rest.type === 'string') {
    const { id, ...string } = rest
    return id ? { ...string, pattern: ID_PATTERN, maxLength: ID_MAX } : string
  }
  if (rest.type === 'array') {
    const { items, ...array } = rest
    const item = items.id
      ? { type: 'string', pattern: ID_PATTERN, maxLength: ID_MAX }
      : { type: 'string', ...(items.enum ? { enum: items.enum } : {}), ...(items.maxLength ? { maxLength: items.maxLength } : {}) }
    return { ...array, items: item }
  }
  if (rest.type === 'object') return { ...rest.schema, description: rest.description, examples: rest.examples }
  return rest
}

/** The tool as `tools/list` shows it. */
export function toolDefinition(tool: GridTool): Record<string, unknown> & { name: string } {
  const required = Object.entries(tool.args).filter(([, spec]) => spec.required).map(([name]) => name)
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(tool.args).map(([name, spec]) => [name, argSchema(spec)])),
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
    outputSchema: tool.outputSchema,
    annotations: { title: tool.title, ...HINTS[tool.hint] },
  }
}

/** The characters a plan file may not hold in a name either (MSG-9): one rule for both. */
const CONTROL = UNSAFE_TEXT

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function checkOne(name: string, spec: ArgSpec, value: unknown, earlier: Readonly<Record<string, unknown>> = {}): unknown {
  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string' || value === '') {
        throw new ToolRefusal(spec.enum ? `${name} takes one of ${spec.enum.join(', ')}.` : `${name} takes text, for example ${quoted(spec.examples[0] ?? '')}.`)
      }
      if (spec.id) {
        if (value.length > ID_MAX) throw new ToolRefusal(`${name} is longer than ${ID_MAX} characters, the most an id may have.`)
        if (!ID.test(value)) throw new ToolRefusal(`${name} must be an id of the plan: letters, digits, dash, underscore and dot only.`)
      }
      const max = spec.maxLength
      if (max !== undefined && value.length > max) throw new ToolRefusal(`${name} is longer than ${max} characters.`)
      if (CONTROL.test(value)) throw new ToolRefusal(`${name} holds a control or direction character.`)
      if (spec.enum && !spec.enum.includes(value)) throw new ToolRefusal(`${name} takes one of ${spec.enum.join(', ')}.`)
      return value
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.minimum || value > spec.maximum) {
        throw new ToolRefusal(`${name} takes a number from ${spec.minimum} to ${spec.maximum}.`)
      }
      return value
    }
    case 'boolean': {
      if (typeof value !== 'boolean') throw new ToolRefusal(`${name} takes true or false.`)
      return value
    }
    case 'array': {
      if (!Array.isArray(value) || value.length < spec.minItems || value.length > spec.maxItems) {
        throw new ToolRefusal(`${name} takes a list of ${spec.minItems} to ${spec.maxItems} items, for example ${JSON.stringify(spec.examples[0] ?? [])}.`)
      }
      const item: ArgSpec = { type: 'string', description: '', examples: [], ...spec.items }
      return value.map((one) => checkOne(`each item of ${name}`, item, one))
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ToolRefusal(`${name} takes an object.`)
      return spec.read(value, earlier)
    }
  }
}

/** The arguments of a call, checked against the tool's own list. */
export function readArgs(tool: GridTool, raw: unknown): Record<string, unknown> {
  const names = Object.keys(tool.args)
  if (raw === undefined) raw = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ToolRefusal(`Pass the arguments of ${tool.name} as an object${names.length > 0 ? `: ${listOf(names)}` : ''}.`)
  }
  const given = raw as Record<string, unknown>
  const unknown = Object.keys(given).filter((key) => !Object.hasOwn(tool.args, key))
  if (unknown.length > 0) {
    const shown = unknown.length > 3 ? `${unknown.length} others` : unknown.every((key) => key.length <= ID_MAX && ID.test(key)) ? listOf(unknown.map(quoted)) : 'others'
    throw new ToolRefusal(`${tool.name} takes ${names.length > 0 ? listOf(names) : 'no arguments'}, not ${shown}.`)
  }
  const args: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(tool.args)) {
    const value = given[name]
    if (value === undefined || value === null) {
      if (spec.required) throw new ToolRefusal(`Pass ${name}: ${spec.description.split('. ')[0]!.replace(/\.$/, '')}.`)
      continue
    }
    args[name] = checkOne(name, spec, value, args)
  }
  return args
}

/** The project, or a refusal that says how to start the server with one. */
export function projectOf(context: ToolContext): Project {
  if (context.project instanceof PathRefused) {
    throw new ToolRefusal(`${context.project.message} For the tool server, start grid serve with --project <folder>.`)
  }
  return context.project
}

/** The plan file a call names, or the project's own plan when it names none. */
export function planFileOf(project: Project, plan: unknown): string {
  if (typeof plan === 'string') return plan
  const own = projectPlanFile(project)
  if (own === null) {
    throw new ToolRefusal(`Pass plan: the plan file, as a path inside the project folder. This folder holds no ${PROJECT_FILE}, so there is no plan to fall back on.`)
  }
  return own
}

/** Reads the plan a call names, turning the command's refusals into a tool's. */
export function readPlan(context: ToolContext, plan: unknown): { project: Project; file: string; loaded: LoadedPlan } {
  const project = projectOf(context)
  const file = planFileOf(project, plan)
  try {
    return { project, file, loaded: loadPlan(project, file) }
  } catch (error) {
    throw asRefusal(error)
  }
}

/** The command's own refusals, as a tool refusal; anything else is thrown on. */
export function asRefusal(error: unknown): unknown {
  if (error instanceof PathRefused || error instanceof PlanRefused || error instanceof UsageError) return new ToolRefusal(error.message)
  return error
}

/** The floors of a plan, quoted, for a refusal: ids are text from the plan file. */
function floorList(plan: FloorPlan): string {
  const floors = planFloors(plan)
  const shown = floors.slice(0, 20).map((floor) => quoted(floor.id))
  return `${listOf(shown)}${floors.length > 20 ? ` and ${floors.length - 20} more` : ''}`
}

/**
 * The floor a call asked for, checked against the plan. An unknown floor is refused with the
 * floors the plan has, and without the word that was sent (MS-19).
 */
export function floorArg(plan: FloorPlan, floor: unknown): string | undefined {
  if (floor === undefined) return undefined
  const floors = planFloors(plan)
  if (floors.some((f) => f.id === floor)) return floor as string
  throw new ToolRefusal(`That floor is not in this plan. Its floors: ${floorList(plan)}.`)
}

/** A room the call named, checked against the plan, with the rooms it has when it is not there. */
export function roomArg(plan: FloorPlan, room: unknown, argument = 'room'): string {
  if (plan.rooms.some((r) => r.id === room)) return room as string
  const shown = plan.rooms.slice(0, 30).map((r) => `${quoted(r.id)} (${quoted(r.name)})`)
  const more = plan.rooms.length > 30 ? ` and ${plan.rooms.length - 30} more` : ''
  throw new ToolRefusal(`The ${argument} named is not a room of this plan. Its rooms: ${shown.join(', ') || 'none'}${more}.`)
}

/** An opening the call named, checked against the plan, with the openings it has when it is not there. */
export function openingArg(plan: FloorPlan, opening: unknown): string {
  if (plan.openings.some((o) => o.id === opening)) return opening as string
  const shown = plan.openings.slice(0, 40).map((o) => `${quoted(o.id)} (${o.type})`)
  const more = plan.openings.length > 40 ? ` and ${plan.openings.length - 40} more` : ''
  throw new ToolRefusal(`The opening named is not in this plan. Its doors, windows and openings: ${shown.join(', ') || 'none'}${more}.`)
}

/** Every plan argument takes the same: a path inside the project. */
export const PLAN_ARG: ArgSpec = {
  type: 'string',
  description: 'The plan file, as a path inside the project folder. The project\'s own plan.json when left out, in a folder grid init made.',
  examples: ['plan.json', 'options/option-b.json'],
  maxLength: PATH_MAX,
}

export const FLOOR_ARG: ArgSpec = {
  type: 'string',
  id: true,
  description: 'A floor id from the plan\'s "floors". Every floor when left out.',
  examples: ['ground', 'first'],
}

/** Metres to two places, as every answer writes them. */
export function m(value: number): string {
  return value.toFixed(2)
}

/** The schema of a list of things that are all alike. */
export function listSchema(item: Record<string, unknown>): Record<string, unknown> {
  return { type: 'array', items: item }
}

export function objectSchema(properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)): Record<string, unknown> {
  return { type: 'object', properties, required: [...required] }
}

export const NUMBER = { type: 'number' } as const
export const STRING = { type: 'string' } as const
export const BOOLEAN = { type: 'boolean' } as const
export const NULLABLE_NUMBER = { type: ['number', 'null'] } as const
export const NULLABLE_STRING = { type: ['string', 'null'] } as const
