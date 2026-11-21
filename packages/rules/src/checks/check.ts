/**
 * The full check: the core's plan checks, plus the checks that apply a figure.
 *
 * One call, one report. The plan checks run in the core, unchanged; the figure checks
 * run here, on each floor read the way the core reads it, and their findings and notices
 * are merged into the same report. Pure: a plan in, plain data out. No AI, no file, no
 * network.
 */

import { checkPlanSanity, planFloors, planForFloor, type FloorPlan } from '@ongrid/floorplan/geometry'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { FIGURE_LIMITS, FIGURE_RULES, RULE_FIGURES, type FigureRuleId } from './catalogue'
import { escapeCheck, hasEscapeFigures, type EscapeFigures } from './escape'
import { resolveFigure, type FigureKey } from './figures'
import { messages, type FigureSubject } from './messages'
import { sizeCheck } from './size'
import type { AppliedFigure, FindingCode, NotChecked, RuleFigures, RuleFinding, RulesReport } from './types'
import { GENERAL_GUIDANCE_LABEL, LOOKUP_NOTICE } from './types'

/** Getting out comes first in the list: exit findings, then escape openings, then sizes. */
const ESCAPE_CODES: readonly FindingCode[] = ['no_escape_opening', 'escape_window_too_small', 'escape_window_too_high']
const GROUP_OF = (code: FindingCode): number =>
  code === 'room_too_small' ? 2 : ESCAPE_CODES.includes(code) ? 1 : 0

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** What a skipped check is called in its notice. */
const SUBJECT: Record<FigureRuleId, FigureSubject> = {
  'habitable-room-area': 'Room sizes',
  'escape-opening': 'Escape openings'
}

export interface CheckOptions {
  /** Looked-up figures. A missing, non-finite or implausible one is ignored. */
  readonly figures?: RuleFigures
  /**
   * Where the plan will be built, as a two-letter country code (ISO 3166-1, such as `US`
   * or `ES`). The figures carried here are from US model codes: with another country
   * stated, a check only runs on figures that were looked up, and says so when it has none.
   * Not stated, the carried figures apply and every finding names them as its basis.
   */
  readonly country?: string
}

/** 'local-lookup' when a check applied a looked-up figure. */
export function basisOf(figures: readonly AppliedFigure[]): RulesReport['basis'] {
  return figures.some((figure) => figure.origin === 'lookup') ? 'local-lookup' : 'general-baseline'
}

export function checkLocalRules(plan: FloorPlan, options: CheckOptions = {}): RulesReport {
  const resolve = (key: FigureKey): AppliedFigure | null => resolveFigure(key, options.figures, options.country)
  const minRoomArea = resolve('habitableRoomMinArea')
  const escape: EscapeFigures = {
    minArea: resolve('escapeOpeningMinArea'),
    minAreaGrade: resolve('escapeOpeningMinAreaGrade'),
    minWidth: resolve('escapeOpeningMinWidth'),
    minHeight: resolve('escapeOpeningMinHeight'),
    maxSill: resolve('escapeOpeningMaxSill')
  }
  const ran: Record<FigureRuleId, boolean> = {
    'habitable-room-area': minRoomArea !== null,
    'escape-opening': hasEscapeFigures(escape)
  }
  const applied = FIGURE_RULES.flatMap((rule) => RULE_FIGURES[rule.id].flatMap((key) => resolve(key) ?? []))
  const basis = basisOf(applied)

  const base = checkPlanSanity(plan)
  const floors = planFloors(plan)
  const level = new Map(floors.map((f) => [f.id, f.level] as const))
  const names = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const roomName = (id: string): string => names.get(id) ?? id

  const findings: RuleFinding[] = [...base.findings]
  const notChecked: NotChecked[] = []
  for (const floor of floors) {
    const floorName = floor.name || floor.id
    const { storey, leftOut } = drawable(planForFloor(plan, floor.id))
    // The plan checks' notices for this floor first, then this floor's own.
    notChecked.push(...base.notChecked.filter((notice) => notice.floor === floor.id))
    // Escape openings don't need stairs: every floor up to the third storey is checked.
    findings.push(...escapeCheck(storey, leftOut.rooms, floor.id, floor.level, roomName, escape))
    if (minRoomArea !== null) {
      // Sizes don't need stairs either: every floor is checked.
      const sizes = sizeCheck(storey, leftOut.rooms, floor.id, floorName, roomName, minRoomArea)
      findings.push(...sizes.findings)
      notChecked.push(...sizes.notChecked)
    }
  }
  // A check with no figure for the place did not run: said once, about the whole plan.
  for (const rule of FIGURE_RULES) {
    if (ran[rule.id]) continue
    notChecked.push({
      reason: 'no_figures_for_place',
      ruleId: rule.id,
      floor: '',
      rooms: [],
      openings: [],
      message: messages.noFiguresForPlace(SUBJECT[rule.id], (options.country ?? '').trim().toUpperCase())
    })
  }

  return {
    schemaVersion: base.schemaVersion,
    basis,
    label: GENERAL_GUIDANCE_LABEL,
    ...(basis === 'local-lookup' ? { lookupNotice: LOOKUP_NOTICE } : {}),
    rules: [...base.rules, ...FIGURE_RULES.filter((rule) => ran[rule.id])],
    findings: findings.sort(
      (a, b) =>
        GROUP_OF(a.code) - GROUP_OF(b.code) ||
        (level.get(a.floor) ?? 0) - (level.get(b.floor) ?? 0) ||
        byText(a.floor, b.floor) ||
        byText(a.code, b.code) ||
        byText(a.rooms.join(','), b.rooms.join(',')) ||
        byText(a.openings.join(','), b.openings.join(','))
    ),
    notChecked,
    limits: [...base.limits, ...FIGURE_LIMITS],
    figures: applied
  }
}
