/**
 * `grid describe <plan>`: a short account of the plan in a person's terms, so an agent can
 * check its own work without reading the file. See `describe/card.ts` for what each length
 * holds and how the person's form differs from the agent's.
 *
 * `--as rooms` (WRT-2) reads the plan back as rooms text instead: the way an agent writes a
 * plan, to change and write again with `grid write`, losing nothing.
 */
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/floorplan/geometry'
import { readRoomsText } from '@ongrid/floorplan/rooms'
import { DESCRIBE_AUDIENCES, DESCRIBE_LENGTHS, describeText, type DescribeAudience, type DescribeLength } from '../describe/card'
import { planFacts } from '../describe/facts'
import { fixtureCountText, planFixtures } from '../quantities/fixtures'
import type { LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

export const DESCRIBE_OPTIONS: OptionSpecs = {
  '--length': {
    takesValue: true,
    help: 'line (one line), rooms (each room, its openings and neighbours) or walls (the rooms, then every wall and its openings). rooms when left out.',
  },
  '--for': {
    takesValue: true,
    help: 'person (names only, never an id) or agent (terse, with every id, to edit the plan from). person when left out.',
  },
  '--as': {
    takesValue: true,
    help: 'rooms: the plan as rooms text, to change and write again with grid write. It takes no --length or --for.',
  },
  ...PROJECT_OPTION,
}

export interface DescribeRequest {
  readonly length?: string | undefined
  readonly for?: string | undefined
  readonly as?: string | undefined
}

function oneOf<T extends string>(option: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  const names = allowed.map((name) => name).join(', ')
  throw new UsageError(`${option} takes one of ${names}: got ${JSON.stringify(value)}.`)
}

/** The length and audience asked for, checked before the plan is read. */
export function checkDescribeRequest(request: DescribeRequest): { length: DescribeLength; audience: DescribeAudience; as: 'words' | 'rooms' } {
  const as = oneOf('--as', request.as, ['rooms'] as const, 'rooms')
  if (request.as !== undefined && (request.length !== undefined || request.for !== undefined)) {
    throw new UsageError(`--as ${as} reads the plan back as rooms text, which has no ${request.length !== undefined ? '--length' : '--for'}: leave it out.`)
  }
  return {
    length: oneOf('--length', request.length, DESCRIBE_LENGTHS, 'rooms'),
    audience: oneOf('--for', request.for, DESCRIBE_AUDIENCES, 'person'),
    as: request.as === undefined ? 'words' : as,
  }
}

/**
 * The plan as rooms text, losing nothing: what `grid write` writes back as it is. Its first line
 * is the label as a comment (MSG-3), which writing it back ignores.
 */
export function describeRooms(loaded: LoadedPlan): string {
  return `# ${GENERAL_GUIDANCE_LABEL}\n${readRoomsText(loaded.plan).text}`
}

export function describePlan(loaded: LoadedPlan, length: DescribeLength, audience: DescribeAudience): string {
  // MSG-3: the label is the first line of every description, the one-line one too.
  return `${GENERAL_GUIDANCE_LABEL}\n${describeBody(loaded, length, audience)}`
}

function describeBody(loaded: LoadedPlan, length: DescribeLength, audience: DescribeAudience): string {
  const text = describeText(planFacts(loaded.plan), length, audience)
  // CNT-12: the fixtures, counted, on the longer descriptions of a plan that has some.
  if (length === 'line' || (loaded.plan.items ?? []).length === 0) return text
  const fixtures = planFixtures(loaded.plan)
  if (fixtures.rows.length === 0) return text
  const where = audience === 'agent' ? ' grid_schedule lists each with its room and size.' : ''
  return `${text}Fixtures: ${fixtureCountText(fixtures.counts)}.${where}\n`
}
