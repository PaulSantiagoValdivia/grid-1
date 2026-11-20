/**
 * `grid describe <plan>`: a short account of the plan in a person's terms, so an agent can
 * check its own work without reading the file. See `describe/card.ts` for what each length
 * holds and how the person's form differs from the agent's.
 */
import { DESCRIBE_AUDIENCES, DESCRIBE_LENGTHS, describeText, type DescribeAudience, type DescribeLength } from '../describe/card'
import { planFacts } from '../describe/facts'
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
  ...PROJECT_OPTION,
}

export interface DescribeRequest {
  readonly length?: string
  readonly for?: string
}

function oneOf<T extends string>(option: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  const names = allowed.map((name) => name).join(', ')
  throw new UsageError(`${option} takes one of ${names}: got ${JSON.stringify(value)}.`)
}

/** The length and audience asked for, checked before the plan is read. */
export function checkDescribeRequest(request: DescribeRequest): { length: DescribeLength; audience: DescribeAudience } {
  return {
    length: oneOf('--length', request.length, DESCRIBE_LENGTHS, 'rooms'),
    audience: oneOf('--for', request.for, DESCRIBE_AUDIENCES, 'person'),
  }
}

export function describePlan(loaded: LoadedPlan, length: DescribeLength, audience: DescribeAudience): string {
  return describeText(planFacts(loaded.plan), length, audience)
}
