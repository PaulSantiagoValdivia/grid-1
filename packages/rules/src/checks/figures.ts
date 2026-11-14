/**
 * The figures the checks compare a plan against, as data.
 *
 * Every figure carries where it was read (document, edition, clause), where it applies,
 * when it was read and whether a person has checked it. A figure is a number, a unit and
 * a pointer to its source: no text of any document is stored here.
 *
 * The baselines are from two US model codes. A model code is not law until a state or
 * a city adopts it, and other countries have their own rules, so a check that uses a
 * baseline says so, and does not run when the plan is for another country.
 *
 * The ranges catch a unit slip (813 for 0.813) and a nonsense value in a looked-up
 * figure; they are not a judgement on any code.
 */

import type { RuleCitation } from '@ongrid/core/geometry'
import type { AppliedFigure, RuleFigures } from './types'

export const FIGURE_KEYS = [
  'habitableRoomMinArea',
  'escapeOpeningMinArea',
  'escapeOpeningMinAreaGrade',
  'escapeOpeningMinWidth',
  'escapeOpeningMinHeight',
  'escapeOpeningMaxSill',
  'routeMinWidth',
  'exitDoorClearWidth'
] as const

export type FigureKey = (typeof FIGURE_KEYS)[number]

export type FigureUnit = 'm' | 'm²'

/**
 * How far a figure has been checked.
 *
 * - `ai-found`: an AI read it; no person has opened the source.
 * - `human-entered`: a person typed it from a secondary source.
 * - `checked-once`: a named person opened the document at the clause and confirmed it.
 * - `checked-twice`: a second, different person did the same.
 * - `disputed`: a check failed or the source changed. A disputed figure is not applied.
 */
export const VERIFICATION_STATUSES = ['ai-found', 'human-entered', 'checked-once', 'checked-twice', 'disputed'] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

/** The same citation a rule carries, with who publishes the document and where it was read. */
export interface SourceCitation extends RuleCitation {
  readonly publisher: string
  readonly url: string
}

/** One check of a figure against its source, by a person. Never an AI. */
export interface Verification {
  readonly by: string
  readonly on: string
}

export interface Provenance {
  /** Where the figure applies. */
  readonly jurisdiction: string
  /** Every document the figure was read in. */
  readonly citations: readonly SourceCitation[]
  /** The figure as the documents print it, before any conversion. */
  readonly original: { readonly value: number; readonly unit: 'in' | 'sq ft' | 'storeys' }
  /** Whether the metric value is printed in the documents or converted here. */
  readonly metric: 'as-printed' | 'converted'
  /** Who and what the figure is about, in our own words. */
  readonly appliesTo: string
  /** The day the sources were read, as YYYY-MM-DD. */
  readonly readOn: string
  readonly foundBy: string
  readonly verifiedBy: readonly Verification[]
  readonly status: VerificationStatus
  /** The day after which the figure should be read again, as YYYY-MM-DD. */
  readonly reviewBy: string
}

export interface FigureSpec {
  readonly key: FigureKey
  readonly unit: FigureUnit
  /** The plausible range of a looked-up value, both ends included. */
  readonly min: number
  readonly max: number
  /** The figure used when none was looked up. */
  readonly baseline: number
  readonly provenance: Provenance
}

export const US_MODEL_CODES = 'US model codes' as const

const PUBLISHER = 'International Code Council'
const IBC_EGRESS = 'https://codes.iccsafe.org/content/IBC2024V2.0/chapter-10-means-of-egress'
const IBC_INTERIOR = 'https://codes.iccsafe.org/content/IBC2024V2.0/chapter-12-interior-environment'
const IRC_PLANNING = 'https://codes.iccsafe.org/content/IRC2024P1/chapter-3-building-planning'

const ibc = (clause: string, url: string): SourceCitation => ({ document: 'IBC', edition: '2024', clause, publisher: PUBLISHER, url })
const irc = (clause: string): SourceCitation => ({ document: 'IRC', edition: '2024', clause, publisher: PUBLISHER, url: IRC_PLANNING })

/** What every baseline here shares: read by an AI on one day, and not yet checked by a person. */
const read = (
  citations: readonly SourceCitation[],
  original: Provenance['original'],
  appliesTo: string,
  metric: Provenance['metric'] = 'as-printed'
): Provenance => ({
  jurisdiction: US_MODEL_CODES,
  citations,
  original,
  metric,
  appliesTo,
  readOn: '2026-11-14',
  foundBy: 'AI research',
  verifiedBy: [],
  status: 'ai-found',
  reviewBy: '2027-11-14'
})

const BEDROOM_OPENING = 'The escape opening of a bedroom, measured as the clear opening when it is open'

export const FIGURES: Readonly<Record<FigureKey, FigureSpec>> = {
  habitableRoomMinArea: {
    key: 'habitableRoomMinArea',
    unit: 'm²',
    min: 4,
    max: 30,
    baseline: 6.5,
    provenance: read(
      [ibc('1208.4', IBC_INTERIOR), irc('R312.1')],
      { value: 70, unit: 'sq ft' },
      'Rooms of a home that people live, sleep or eat in. Kitchens are left out'
    )
  },
  escapeOpeningMinArea: {
    key: 'escapeOpeningMinArea',
    unit: 'm²',
    min: 0.2,
    max: 2,
    baseline: 0.53,
    provenance: read([ibc('1031.3.1', IBC_EGRESS), irc('R319.2.1')], { value: 5.7, unit: 'sq ft' }, BEDROOM_OPENING)
  },
  escapeOpeningMinAreaGrade: {
    key: 'escapeOpeningMinAreaGrade',
    unit: 'm²',
    min: 0.2,
    max: 2,
    baseline: 0.46,
    provenance: read(
      [ibc('1031.3.1', IBC_EGRESS), irc('R319.2.1')],
      { value: 5, unit: 'sq ft' },
      `${BEDROOM_OPENING}, where its sill is close to the ground outside. The check reads that as the ground floor, which is an approximation`
    )
  },
  escapeOpeningMinWidth: {
    key: 'escapeOpeningMinWidth',
    unit: 'm',
    min: 0.3,
    max: 1.5,
    baseline: 0.508,
    provenance: read([ibc('1031.3.2', IBC_EGRESS), irc('R319.2.2')], { value: 20, unit: 'in' }, BEDROOM_OPENING)
  },
  escapeOpeningMinHeight: {
    key: 'escapeOpeningMinHeight',
    unit: 'm',
    min: 0.3,
    max: 2,
    baseline: 0.61,
    provenance: read([ibc('1031.3.2', IBC_EGRESS), irc('R319.2.2')], { value: 24, unit: 'in' }, BEDROOM_OPENING)
  },
  escapeOpeningMaxSill: {
    key: 'escapeOpeningMaxSill',
    unit: 'm',
    min: 0.5,
    max: 2,
    baseline: 1.118,
    provenance: read(
      [ibc('1031.3.3', IBC_EGRESS), irc('R319.2.3')],
      { value: 44, unit: 'in' },
      'The bottom of a bedroom escape opening, measured from the floor of the room'
    )
  },
  // Stored and shown. No check measures a hallway yet.
  routeMinWidth: {
    key: 'routeMinWidth',
    unit: 'm',
    min: 0.7,
    max: 2.5,
    baseline: 0.914,
    provenance: read(
      [ibc('Table 1020.3', IBC_EGRESS), irc('R318.6')],
      { value: 36, unit: 'in' },
      'A hallway inside a home',
      'converted'
    )
  },
  // Stored and shown. No check measures a door's clear width yet.
  exitDoorClearWidth: {
    key: 'exitDoorClearWidth',
    unit: 'm',
    min: 0.6,
    max: 1.5,
    baseline: 0.813,
    provenance: read(
      [ibc('1010.1.1', IBC_EGRESS), irc('R318.2')],
      { value: 32, unit: 'in' },
      'The main exit door of a home, measured clear with the door open. Other doors inside an ordinary home have no minimum in these codes'
    )
  }
}

/**
 * The highest floor whose bedrooms need an escape opening: below the fourth storey, so
 * up to `Floor.level` 2. Basements are below it and are included. Not a figure a lookup
 * can replace: it says where the rule applies, not what it measures.
 */
export const ESCAPE_TOP_LEVEL = {
  level: 2,
  provenance: read(
    [ibc('1031.2', IBC_EGRESS), irc('R319.1')],
    { value: 3, unit: 'storeys' },
    'Bedrooms up to the third storey above the ground, and in basements'
  )
} as const

export function isFigureKey(key: unknown): key is FigureKey {
  return typeof key === 'string' && (FIGURE_KEYS as readonly string[]).includes(key)
}

/** A finite number inside the key's range. */
export function isPlausible(key: FigureKey, value: number): boolean {
  const spec = FIGURES[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max
}

/** Whether the baselines apply where the plan will be built. No country stated means yes. */
export function baselineApplies(country: string | undefined): boolean {
  return country === undefined || country.trim() === '' || country.trim().toUpperCase() === 'US'
}

/**
 * The figure a check applies for `key`: the looked-up one when it is plausible; otherwise
 * the baseline, where the baselines apply; otherwise `null`, and the check that needs it
 * does not run on that figure.
 */
export function resolveFigure(key: FigureKey, figures?: RuleFigures, country?: string): AppliedFigure | null {
  const spec = FIGURES[key]
  const given = figures?.[key]
  if (given !== undefined && isPlausible(key, given.value)) {
    return {
      key,
      value: given.value,
      unit: spec.unit,
      origin: 'lookup',
      status: 'ai-found',
      ...(given.source === undefined ? {} : { source: given.source })
    }
  }
  if (!baselineApplies(country) || spec.provenance.status === 'disputed') return null
  const { jurisdiction, citations, status, readOn } = spec.provenance
  return {
    key,
    value: spec.baseline,
    unit: spec.unit,
    origin: 'baseline',
    status,
    jurisdiction,
    citations: citations.map(({ document, edition, clause }) => ({ document, edition, clause })),
    readOn
  }
}
