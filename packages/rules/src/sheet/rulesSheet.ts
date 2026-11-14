/**
 * Where a project will be built, and the rules sheet a lookup finds for it.
 *
 * A sheet is data from the web: only numbers with an https source and a quote are
 * kept, and nothing in it is ever put into an assistant's instructions. Where the
 * two are stored is the store's business (`store/store.ts`).
 */

import { z } from 'zod'
import { FIGURE_KEYS, FIGURES, isPlausible, type FigureKey } from '../checks/figures'

export const LOCATION_INVALID_MESSAGE = 'Use a town or city and a country.'

/** Control characters become spaces, runs collapse, ends trimmed. */
const tidy = (value: unknown): unknown =>
  typeof value === 'string' ? value.replace(/[\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim() : value

const field = (max: number) =>
  z.preprocess(tidy, z.string({ message: LOCATION_INVALID_MESSAGE }).min(1, LOCATION_INVALID_MESSAGE).max(max, LOCATION_INVALID_MESSAGE))

export const RulesLocationSchema = z
  .object({ municipality: field(100), country: field(60) }, { message: LOCATION_INVALID_MESSAGE })
  .strict(LOCATION_INVALID_MESSAGE)

export type RulesLocation = z.infer<typeof RulesLocationSchema>

// ── What the lookup is asked to return ──────────────────────────────────────

const TRANSPORT_FIGURE = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'unit', 'sourceUrl', 'quote'],
  properties: {
    value: { type: 'number' },
    unit: { type: 'string' },
    sourceUrl: { type: 'string' },
    quote: { type: 'string' }
  }
} as const

interface TransportJsonSchema {
  readonly type: 'object'
  readonly additionalProperties: false
  readonly required: readonly ['figures']
  readonly properties: {
    readonly figures: {
      readonly type: 'object'
      readonly additionalProperties: false
      readonly required: readonly FigureKey[]
      readonly properties: Readonly<
        Record<FigureKey, { readonly anyOf: readonly [typeof TRANSPORT_FIGURE, { readonly type: 'null' }] }>
      >
    }
  }
}

/**
 * The JSON schema a lookup's answer must follow: strict, every key required, null instead of
 * optional, no limits (the limits are checked afterwards, by `dropReason`, where a failure
 * drops one figure, not the answer).
 */
export const RULES_TRANSPORT_JSON_SCHEMA: TransportJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['figures'],
  properties: {
    figures: {
      type: 'object',
      additionalProperties: false,
      required: [...FIGURE_KEYS],
      properties: Object.fromEntries(
        FIGURE_KEYS.map((key) => [key, { anyOf: [TRANSPORT_FIGURE, { type: 'null' }] }] as const)
      ) as TransportJsonSchema['properties']['figures']['properties']
    }
  }
}

const TransportFigureSchema = z
  .object({ value: z.number(), unit: z.string(), sourceUrl: z.string(), quote: z.string() })
  .strict()

export type TransportFigure = z.infer<typeof TransportFigureSchema>

/** The answer's shape, as the schema file states it. Anything else is unreadable. */
export const RulesTransportSchema = z
  .object({
    figures: z
      .object(
        Object.fromEntries(FIGURE_KEYS.map((key) => [key, TransportFigureSchema.nullable()])) as Record<
          FigureKey,
          z.ZodNullable<typeof TransportFigureSchema>
        >
      )
      .strict()
  })
  .strict()

// ── Keeping or dropping a figure ─────────────────────────────────────────────

export const DROP_REASONS = ['no_source', 'not_https', 'no_quote', 'wrong_unit', 'out_of_range'] as const
export type DropReason = (typeof DROP_REASONS)[number]

export const MAX_SOURCE_URL = 2048
/** Long enough to hold the number and its few words of context, and no longer. */
export const MAX_QUOTE = 160

function sourceReason(sourceUrl: string): DropReason | null {
  let url: URL
  try {
    url = new URL(sourceUrl.trim())
  } catch {
    return 'no_source'
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || sourceUrl.trim().length > MAX_SOURCE_URL) {
    return 'not_https'
  }
  return null
}

function quoteReason(quote: string): DropReason | null {
  const trimmed = quote.trim()
  return trimmed.length === 0 || trimmed.length > MAX_QUOTE || !/\d/.test(trimmed) ? 'no_quote' : null
}

/** Why a figure is not kept, the first failing reason in a fixed order; `null` keeps it. */
export function dropReason(key: FigureKey, entry: TransportFigure): DropReason | null {
  return (
    sourceReason(entry.sourceUrl) ??
    quoteReason(entry.quote) ??
    (entry.unit !== FIGURES[key].unit ? 'wrong_unit' : null) ??
    (isPlausible(key, entry.value) ? null : 'out_of_range')
  )
}

// ── The sheet ────────────────────────────────────────────────────────────────

const IsoTime = z.string().datetime()

const CitedFigureSchema = z
  .object({
    value: z.number(),
    unit: z.string(),
    sourceUrl: z.string(),
    quote: z.string(),
    /** Set by the caller when the lookup finished, never taken from the answer. */
    retrievedAt: IsoTime
  })
  .strict()

export type CitedFigure = z.infer<typeof CitedFigureSchema>

const keptFigure = (key: FigureKey) =>
  CitedFigureSchema.refine((entry) => dropReason(key, entry) === null, { message: 'This figure is not kept.' })

export const RulesSheetSchema = z
  .object({
    schemaVersion: z.literal(1),
    location: RulesLocationSchema,
    lookedUpAt: IsoTime,
    figures: z
      .object(
        Object.fromEntries(FIGURE_KEYS.map((key) => [key, keptFigure(key).optional()])) as Record<
          FigureKey,
          z.ZodOptional<ReturnType<typeof keptFigure>>
        >
      )
      .strict(),
    dropped: z.array(z.object({ key: z.enum(FIGURE_KEYS), reason: z.enum(DROP_REASONS) }).strict()),
    notFound: z.array(z.enum(FIGURE_KEYS))
  })
  .strict()

export type RulesSheet = z.infer<typeof RulesSheetSchema>

// ── The lookup's result ──────────────────────────────────────────────────────

export const RULES_LOOKUP_MESSAGES = {
  no_location: 'Add where the project will be built first.',
  usage_limit: 'The lookup reached a usage limit. Try again later.',
  auth: 'Sign in again to look up local rules.',
  cancelled: 'The lookup was stopped.',
  timeout: 'The lookup took too long and was stopped. Try again.',
  invalid_output: "The answer couldn't be read. Try again.",
  unavailable: "The lookup isn't available right now."
} as const

export type RulesLookupErrorCode = keyof typeof RULES_LOOKUP_MESSAGES

/** Resolved, never thrown, so the caller can tell a stop from a failure. */
export type RulesLookupResult =
  | { readonly ok: true; readonly sheet: RulesSheet }
  | { readonly ok: false; readonly code: RulesLookupErrorCode; readonly message: string }
