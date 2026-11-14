/**
 * The rules that apply a figure, as data.
 *
 * The core's plan checks are checks on the drawing and cite nothing. The two rules here
 * compare the plan with figures, so each names the documents and clauses its figures
 * were read in. The figures themselves, with their full provenance, are in `figures.ts`.
 */

import { RULES as PLAN_RULES } from '@ongrid/core/geometry'
import type { RoomUse } from '@ongrid/core/types/floorplan'
import { ESCAPE_TOP_LEVEL, FIGURES, US_MODEL_CODES, type FigureKey, type SourceCitation } from './figures'
import type { Rule, RuleCitation } from './types'

const SOURCE_LABEL = `${US_MODEL_CODES}: IBC 2024 and IRC 2024` as const

/** Each document and clause once, in the order first met. */
function citationsOf(sources: readonly (readonly SourceCitation[])[]): RuleCitation[] {
  const seen = new Map<string, RuleCitation>()
  for (const { document, edition, clause } of sources.flat()) {
    seen.set(`${document} ${edition} ${clause}`, { document, edition, clause })
  }
  return [...seen.values()]
}

const ofFigures = (keys: readonly FigureKey[]): (readonly SourceCitation[])[] =>
  keys.map((key) => FIGURES[key].provenance.citations)

/** The figures each rule compares a plan against. */
export const RULE_FIGURES = {
  'habitable-room-area': ['habitableRoomMinArea'],
  'escape-opening': [
    'escapeOpeningMinArea',
    'escapeOpeningMinAreaGrade',
    'escapeOpeningMinWidth',
    'escapeOpeningMinHeight',
    'escapeOpeningMaxSill'
  ]
} as const satisfies Record<string, readonly FigureKey[]>

export type FigureRuleId = keyof typeof RULE_FIGURES

export const FIGURE_RULES: readonly (Rule & { readonly id: FigureRuleId })[] = [
  {
    id: 'habitable-room-area',
    title: 'Rooms people live or sleep in have a minimum floor area',
    source: {
      kind: 'building-code',
      label: SOURCE_LABEL,
      citations: citationsOf(ofFigures(RULE_FIGURES['habitable-room-area']))
    }
  },
  {
    id: 'escape-opening',
    title: 'Bedrooms have a window or door to the outside someone can escape through',
    source: {
      kind: 'building-code',
      label: SOURCE_LABEL,
      citations: citationsOf([ESCAPE_TOP_LEVEL.provenance.citations, ...ofFigures(RULE_FIGURES['escape-opening'])])
    }
  }
]

/** Every rule a full check can apply: the core's plan checks, then the figure checks. */
export const RULES: readonly Rule[] = [...PLAN_RULES, ...FIGURE_RULES]

/** The rooms the area rule sizes: where people live, sleep or eat. Kitchens are left out. */
export const HABITABLE_USES: readonly RoomUse[] = ['bedroom', 'living', 'dining']

/** What the figure checks never look at. Shown with every report, after the core's own. */
export const FIGURE_LIMITS: readonly string[] = [
  'Windows are measured as drawn: the part that opens may be smaller',
  'Where an escape window or door leads, and basements without a bedroom, are not checked',
  'The shortest side of a room, and the total size of a home, are not checked'
]
