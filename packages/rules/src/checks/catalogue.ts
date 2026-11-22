/**
 * The rules that apply a figure, as data.
 *
 * The core's plan checks are checks on the drawing and cite nothing. The two rules here
 * compare the plan with figures, so each names the documents and clauses its figures
 * were read in. The figures themselves, with their full provenance, are in `figures.ts`.
 */

import { RULES as PLAN_RULES } from '@ongrid/floorplan/geometry'
import type { BuildingType, RoomUse } from '@ongrid/floorplan/types/floorplan'
import { ESCAPE_TOP_LEVEL, FIGURES, READ_FOR_BUILDINGS, US_MODEL_CODES, readForCovers, type BuildingKind, type FigureKey, type SourceCitation } from './figures'
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

/**
 * The room uses each figure rule looks at (WRT-3, lab AB-8). The checks go by a room's stated
 * use and never by its name, so a change of use can change which of them apply to it.
 */
export const RULE_USES: Readonly<Record<FigureRuleId, readonly RoomUse[]>> = {
  'habitable-room-area': HABITABLE_USES,
  'escape-opening': ['bedroom']
}

/**
 * CNT-5: the kinds of building each figure rule's figures were read for, from the figures
 * themselves (and the escape rule's top storey), so a figure read for another kind changes it.
 */
export const RULE_READ_FOR: Readonly<Record<FigureRuleId, readonly BuildingKind[]>> = {
  'habitable-room-area': [...new Set(RULE_FIGURES['habitable-room-area'].map((key) => FIGURES[key].provenance.readFor))],
  'escape-opening': [
    ...new Set([ESCAPE_TOP_LEVEL.provenance.readFor, ...RULE_FIGURES['escape-opening'].map((key) => FIGURES[key].provenance.readFor)])
  ]
}

/**
 * CNT-5: the kinds of building a plan may state that each figure rule reads. On a floor the plan
 * says is another kind, the rule looks at no room, and the report says why. Where the plan does
 * not say, every rule runs, as before.
 */
export const RULE_BUILDINGS: Readonly<Record<FigureRuleId, readonly BuildingType[]>> = {
  'habitable-room-area': [...new Set(RULE_READ_FOR['habitable-room-area'].flatMap((kind) => READ_FOR_BUILDINGS[kind]))],
  'escape-opening': [...new Set(RULE_READ_FOR['escape-opening'].flatMap((kind) => READ_FOR_BUILDINGS[kind]))]
}

/** Whether a figure rule runs in a building, or a floor, of this kind: always when it is not stated. */
export function ruleReadsBuilding(ruleId: FigureRuleId, building: BuildingType | undefined): boolean {
  return readForCovers(RULE_READ_FOR[ruleId], building)
}

/**
 * The figure rules that look at a room of this use, in a building of this kind (CNT-5: every kind
 * when it is not stated); none for a room with no use stated.
 */
export function rulesForUse(use: RoomUse | undefined, building?: BuildingType): readonly (Rule & { readonly id: FigureRuleId })[] {
  if (use === undefined) return []
  return FIGURE_RULES.filter((rule) => RULE_USES[rule.id].includes(use) && ruleReadsBuilding(rule.id, building))
}

/** What the figure checks never look at. Shown with every report, after the core's own. */
export const FIGURE_LIMITS: readonly string[] = [
  'Windows are measured as drawn: the part that opens may be smaller',
  'Where an escape window or door leads, and basements without a bedroom, are not checked',
  'The shortest side of a room, and the total size of a home, are not checked',
  // Until a ceiling-height check exists, which needs each room's own height and the roof plane over a slope.
  'Ceiling height is not checked, in any room or under a sloping roof'
]
