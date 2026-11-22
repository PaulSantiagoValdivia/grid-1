/**
 * `grid describe <plan>`: a short account of the plan in a person's terms, so an agent can
 * check its own work without reading the file. See `describe/card.ts` for what each length
 * holds and how the person's form differs from the agent's.
 *
 * `--as rooms` (WRT-2) reads the plan back as rooms text instead: the way an agent writes a
 * plan, to change and write again with `grid write`, losing nothing.
 *
 * `--lang` (MSG-11) writes the person's form in a language, with its decimal mark unless the
 * plan's display states one. Names from the plan stay as written. The agent's form is a format
 * of codes and ids that stays as it is; only its label is in the language.
 */
import { ITEM_KINDS } from '@ongrid/floorplan/types/floorplan'
import { DEFAULT_LANGUAGE, say, type Language, type MessageKey } from '@ongrid/floorplan/messages'
import { readRoomsText } from '@ongrid/floorplan/rooms'
import { DESCRIBE_AUDIENCES, DESCRIBE_LENGTHS, describeText, type DescribeAudience, type DescribeLength, type Words } from '../describe/card'
import { planFacts } from '../describe/facts'
import { personFacing } from '../describe/facing'
import { facingDescription } from '../quantities/facing'
import { fixtureCountText, planFixtures, type Fixtures } from '../quantities/fixtures'
import { askedLanguage, LANG_OPTION } from './language'
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
  ...LANG_OPTION,
  ...PROJECT_OPTION,
}

export interface DescribeRequest {
  readonly length?: string | undefined
  readonly for?: string | undefined
  readonly as?: string | undefined
  /** `--lang`: the language asked for, resolved with the plan's by `languageFor` once it is read. */
  readonly lang?: string | undefined
}

export interface DescribeOptions {
  /** MSG-11: the language to write in, its messages loaded (`languageFor`). English when left out. */
  readonly language?: Language | undefined
}

function oneOf<T extends string>(option: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  const names = allowed.map((name) => name).join(', ')
  throw new UsageError(`${option} takes one of ${names}: got ${JSON.stringify(value)}.`)
}

/** The length and audience asked for, checked before the plan is read. */
export function checkDescribeRequest(request: DescribeRequest): { length: DescribeLength; audience: DescribeAudience; as: 'words' | 'rooms'; language: Language | undefined } {
  const as = oneOf('--as', request.as, ['rooms'] as const, 'rooms')
  if (request.as !== undefined && (request.length !== undefined || request.for !== undefined)) {
    throw new UsageError(`--as ${as} reads the plan back as rooms text, which has no ${request.length !== undefined ? '--length' : '--for'}: leave it out.`)
  }
  return {
    length: oneOf('--length', request.length, DESCRIBE_LENGTHS, 'rooms'),
    audience: oneOf('--for', request.for, DESCRIBE_AUDIENCES, 'person'),
    as: request.as === undefined ? 'words' : as,
    language: askedLanguage(request.lang),
  }
}

/**
 * The plan as rooms text, losing nothing: what `grid write` writes back as it is. Its first line
 * is the label as a comment (MSG-3), which writing it back ignores.
 */
export function describeRooms(loaded: LoadedPlan, options: DescribeOptions = {}): string {
  // LVL-8: the openings the file states, not the ones its patterns place: `grid write` keeps the
  // patterns as the file has them, so their openings written here would be placed twice.
  const plan = loaded.stated ?? loaded.plan
  const patterns = plan.patterns?.length ?? 0
  const language = options.language ?? DEFAULT_LANGUAGE
  const kept = patterns === 0 ? '' : `# ${say(language, patterns === 1 ? 'describe.rooms.patterns.one' : 'describe.rooms.patterns.many', { count: patterns })}\n`
  return `# ${say(language, 'label')}\n${kept}${readRoomsText(plan).text}`
}

/** The description, in the language of `options` (MSG-11; English when left out), ending in a new line. */
export function describePlan(loaded: LoadedPlan, length: DescribeLength, audience: DescribeAudience, options: DescribeOptions = {}): string {
  const w: Words = { language: options.language ?? DEFAULT_LANGUAGE, options: { decimal: loaded.plan.display?.decimal } }
  // MSG-3: the label is the first line of every description, the one-line one too.
  return `${say(w.language, 'label')}\n${describeBody(loaded, length, audience, w)}`
}

/** The fixtures counted, in the person's words: `1 toilet, 2 basins`. */
function personFixtures(counts: Fixtures['counts'], w: Words): string {
  const list = ITEM_KINDS.filter((kind) => counts[kind] > 0)
    .map((kind) => say(w.language, `describe.fixture.${kind}.${counts[kind] === 1 ? 'one' : 'many'}` as MessageKey, { count: counts[kind] }, w.options))
  return say(w.language, 'describe.fixtures', { list: list.join(say(w.language, 'join.comma')) }, w.options)
}

function describeBody(loaded: LoadedPlan, length: DescribeLength, audience: DescribeAudience, w: Words): string {
  const described = describeText(planFacts(loaded.plan), length, audience, w)
  // CNT-3: north, the ways the rooms face and the front, on the longer descriptions of a plan
  // that states any of them.
  const facing = length === 'line' ? [] : audience === 'person' ? personFacing(loaded.plan, w) : facingDescription(loaded.plan, audience)
  // They go before the closing line, which says the description checks nothing.
  const close = described.lastIndexOf('\n', described.length - 2) + 1
  const gap = audience === 'person' ? '\n' : ''
  const text = facing.length === 0 ? described : `${described.slice(0, close)}${facing.join('\n')}\n${gap}${described.slice(close)}`
  // CNT-12: the fixtures, counted, on the longer descriptions of a plan that has some.
  if (length === 'line' || (loaded.plan.items ?? []).length === 0) return text
  const fixtures = planFixtures(loaded.plan)
  if (fixtures.rows.length === 0) return text
  if (audience === 'person') return `${text}${personFixtures(fixtures.counts, w)}\n`
  return `${text}Fixtures: ${fixtureCountText(fixtures.counts)}. grid_schedule lists each with its room and size.\n`
}
