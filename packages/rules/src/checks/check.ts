/**
 * The full check: the core's plan checks, plus the checks that apply a figure.
 *
 * One call, one report. The plan checks run in the core, unchanged; the figure checks
 * run here, on each floor read the way the core reads it, and their findings and notices
 * are merged into the same report. Pure: a plan in, plain data out. No AI, no file, no
 * network.
 */

import { checkPlanSanity, floorBuilding, floorStatesBuilding, planFloors, planForFloor, type FloorPlan } from '@ongrid/floorplan/geometry'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { BUILDING_TYPE_TEXT, type BuildingType } from '@ongrid/floorplan/types/floorplan'
import { FIGURE_LIMITS, FIGURE_RULES, RULE_BUILDINGS, RULE_FIGURES, RULE_READ_FOR, RULE_USES, ruleReadsBuilding, type FigureRuleId } from './catalogue'
import { allSkipped, coverageOf, LOOKS_AT, planCheckScopes, type FloorScope } from './coverage'
import { escapeCheck, hasEscapeFigures, type EscapeFigures } from './escape'
import { buildingKindsText, resolveFigure, type FigureKey } from './figures'
import { messages, type FigureSubject } from './messages'
import { countryInText } from '@ongrid/floorplan/types/places'
import { placeFor, type WithoutPlace } from './place'
import { sizeCheck } from './size'
import type { AppliedFigure, CheckCoverage, FindingCode, NotChecked, RuleFigures, RuleFinding, RulesReport } from './types'
import { GENERAL_GUIDANCE_LABEL, LOOKUP_NOTICE } from './types'

/** Getting out comes first in the list: exit findings, then escape openings, then sizes. */
const ESCAPE_CODES: readonly FindingCode[] = ['no_escape_opening', 'escape_window_too_small', 'escape_window_too_high']
const GROUP_OF = (code: FindingCode): number =>
  code === 'room_too_small' ? 2 : ESCAPE_CODES.includes(code) ? 1 : 0

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** What a skipped check is called in its notice, and in a short report's coverage (COD-3). */
export const SUBJECT: Record<FigureRuleId, FigureSubject> = {
  'habitable-room-area': 'Room sizes',
  'escape-opening': 'Escape openings'
}

export interface CheckOptions {
  /** Looked-up figures. A missing, non-finite or implausible one is ignored. */
  readonly figures?: RuleFigures
  /**
   * Where the plan will be built, for this check: a country's name or its two- or three-letter
   * code on Grid's list (`US`, `USA`, `United States`, `ES`, `Spain`), in place of the plan's
   * own `site.country` (COD-3). One not on the list throws `PlaceRefused`. The figures carried
   * here are from US model codes: with another country, a check only runs on figures that were
   * looked up, and says so when it has none.
   */
  readonly country?: string
  /**
   * With no place stated, in the plan or here: `no-figures` (the default, `WITHOUT_PLACE`) applies
   * no figure, and the report says how many lines the US figures would have given; `us-figures`
   * applies the US figures, as before COD-3, and the report says the place was assumed.
   */
  readonly withoutPlace?: WithoutPlace
}

/** The findings only the figure checks give, and the notices only they give, to count what the US figures would have given. */
const FIGURE_FINDINGS: ReadonlySet<FindingCode> = new Set(['room_too_small', ...ESCAPE_CODES])
const FIGURE_NOTICES: ReadonlySet<NotChecked['reason']> = new Set(['no_use', 'above_escape_storeys'])

/** COD-3: how many lines the figure checks give on this plan with the US figures. */
function usLinesOf(plan: FloorPlan): number {
  const us = checkLocalRules(plan, { country: 'US' })
  return us.findings.filter((f) => FIGURE_FINDINGS.has(f.code)).length + us.notChecked.filter((n) => FIGURE_NOTICES.has(n.reason)).length
}

/** 'local-lookup' when a check applied a looked-up figure. */
export function basisOf(figures: readonly AppliedFigure[]): RulesReport['basis'] {
  return figures.some((figure) => figure.origin === 'lookup') ? 'local-lookup' : 'general-baseline'
}

export function checkLocalRules(plan: FloorPlan, options: CheckOptions = {}): RulesReport {
  // COD-3: the caller's place, else the plan's; with none, no figure is applied.
  const place = placeFor(plan, options)
  const skippedFor = place === null ? 'no_place' : 'no_figures_for_place'
  const resolve = (key: FigureKey): AppliedFigure | null => (place === null ? null : resolveFigure(key, options.figures, place.country))
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
  const base = checkPlanSanity(plan)
  const floors = planFloors(plan)
  const level = new Map(floors.map((f) => [f.id, f.level] as const))
  const names = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const roomName = (id: string): string => names.get(id) ?? id

  const findings: RuleFinding[] = [...base.findings]
  const notChecked: NotChecked[] = []
  // MSG-2: what each figure check looked at, floor by floor.
  const scopes: Record<FigureRuleId, [string, FloorScope][]> = { 'habitable-room-area': [], 'escape-opening': [] }
  const read = new Map<string, ReturnType<typeof drawable>>()
  // CNT-5: the floors, by rule, that the plan says are a kind of building the rule does not read.
  const notFor: Record<FigureRuleId, { floor: string; rooms: string[]; building: BuildingType }[]> = { 'habitable-room-area': [], 'escape-opening': [] }
  for (const floor of floors) {
    const floorName = floor.name || floor.id
    const drawn = drawable(planForFloor(plan, floor.id))
    read.set(floor.id, drawn)
    const { storey, leftOut } = drawn
    // The plan checks' notices for this floor first, then this floor's own.
    notChecked.push(...base.notChecked.filter((notice) => notice.floor === floor.id))
    // CNT-5: a figure check runs on a floor only where the plan says it is a kind of building
    // the check's figures were read for, or does not say. Elsewhere every room is skipped.
    const building = floorBuilding(plan, floor.id)
    const reads = (rule: FigureRuleId): boolean => ruleReadsBuilding(rule, building)
    for (const rule of FIGURE_RULES) {
      if (reads(rule.id) || building === undefined) continue
      scopes[rule.id].push([floor.id, allSkipped(storey, 'not_for_building', building)])
      notFor[rule.id].push({ floor: floor.id, rooms: storey.rooms.map((room) => room.id), building })
    }
    // Escape openings don't need stairs: every floor up to the third storey is checked.
    const escapes = reads('escape-opening') ? escapeCheck(storey, leftOut.rooms, floor.id, floor.level, roomName, escape) : null
    if (escapes === null) {
      // Skipped above, with the reason.
    } else if (ran['escape-opening']) {
      findings.push(...escapes.findings)
      scopes['escape-opening'].push([floor.id, escapes.scope])
      // Above the third storey the figures here stop: said, never passed in silence (CH-4).
      const above = escapes.scope.skipped.above_escape_storeys ?? []
      if (above.length > 0) {
        notChecked.push({
          reason: 'above_escape_storeys',
          floor: floor.id,
          rooms: [...above],
          openings: [],
          message: messages.aboveEscapeStoreys(floorName, above.length)
        })
      }
    } else scopes['escape-opening'].push([floor.id, allSkipped(storey, skippedFor)])
    if (!reads('habitable-room-area')) {
      // Skipped above, with the reason.
    } else if (minRoomArea !== null) {
      // Sizes don't need stairs either: every floor is checked.
      const sizes = sizeCheck(storey, leftOut.rooms, floor.id, floorName, roomName, minRoomArea)
      findings.push(...sizes.findings)
      notChecked.push(...sizes.notChecked)
      scopes['habitable-room-area'].push([floor.id, sizes.scope])
    } else scopes['habitable-room-area'].push([floor.id, allSkipped(storey, skippedFor)])
  }
  // A plan of walls alone: no check that looks at rooms ran, and the report says so (CH-1).
  if (plan.rooms.length === 0) {
    notChecked.push({ reason: 'no_rooms', floor: '', rooms: [], openings: [], message: messages.noRooms() })
  }
  // CNT-5: a check the plan's kind of building leaves out is said once, about the whole plan, when
  // the plan's own kind is the reason on every floor; otherwise once on each floor it left out.
  for (const rule of FIGURE_RULES) {
    const left = notFor[rule.id]
    if (left.length === 0) continue
    const readFor = buildingKindsText(RULE_READ_FOR[rule.id])
    const whole = left.length === floors.length && floors.every((f) => !floorStatesBuilding(plan, f.id))
    if (whole) {
      notChecked.push({
        reason: 'not_for_building',
        ruleId: rule.id,
        floor: '',
        rooms: [],
        openings: [],
        building: left[0]!.building,
        message: messages.notForBuilding(SUBJECT[rule.id], readFor, BUILDING_TYPE_TEXT[left[0]!.building])
      })
      continue
    }
    for (const { floor, rooms, building } of left) {
      const named = floors.find((f) => f.id === floor)
      notChecked.push({
        reason: 'not_for_building',
        ruleId: rule.id,
        floor,
        rooms: [...rooms].sort(byText),
        openings: [],
        building,
        message: messages.floorNotForBuilding(named?.name || floor, SUBJECT[rule.id], readFor, BUILDING_TYPE_TEXT[building])
      })
    }
  }
  // A check with no figure for the place did not run: said once, about the whole plan, unless the
  // plan's kind of building left it out on every floor already. With no place, the report says so
  // at its top instead (`withoutPlace`, COD-3), and the coverage gives why.
  for (const rule of FIGURE_RULES) {
    if (ran[rule.id] || place === null) continue
    if (notFor[rule.id].length === floors.length) continue
    notChecked.push({
      reason: 'no_figures_for_place',
      ruleId: rule.id,
      floor: '',
      rooms: [],
      openings: [],
      message: messages.noFiguresForPlace(SUBJECT[rule.id], countryInText(place.country))
    })
  }

  // Every check Grid has, with what it looked at; a check that looked at nothing is not listed as
  // applied, nor are its figures (MSG-2).
  const findingsOf = (ruleId: string): number => findings.filter((f) => f.ruleId === ruleId).length
  const planScopes = planCheckScopes(plan, base, read)
  const coverage: CheckCoverage[] = [
    // A plan check this file does not know yet keeps no coverage, and stays listed: a test fails.
    ...base.rules.filter((rule) => Object.hasOwn(LOOKS_AT, rule.id)).map((rule) => coverageOf(rule, planScopes.get(rule.id) ?? [], findingsOf(rule.id))),
    // COD-2: a figure check that looked at something says which kind of building its figures were
    // read for, so a pass with no finding says it too. One that looked at nothing used no figure.
    // CNT-5: and which uses it looks at and which kinds of building it runs in.
    ...FIGURE_RULES.map((rule) => {
      const covered = coverageOf(rule, scopes[rule.id], findingsOf(rule.id), RULE_READ_FOR[rule.id])
      const kinds = ran[rule.id] && covered.lookedAtCount > 0 ? [...new Set(RULE_FIGURES[rule.id].flatMap((key) => resolve(key)?.readFor ?? []))] : []
      const reads = { uses: [...RULE_USES[rule.id]], buildings: [...RULE_BUILDINGS[rule.id]] }
      return kinds.length > 0 ? { ...covered, readFor: kinds, ...reads } : { ...covered, ...reads }
    })
  ]
  const looked = new Set([
    ...coverage.filter((c) => c.lookedAtCount > 0).map((c) => c.ruleId),
    ...base.rules.filter((rule) => !Object.hasOwn(LOOKS_AT, rule.id)).map((rule) => rule.id)
  ])
  const applied = FIGURE_RULES.filter((rule) => ran[rule.id] && looked.has(rule.id)).flatMap((rule) =>
    RULE_FIGURES[rule.id].flatMap((key) => resolve(key) ?? [])
  )
  const basis = basisOf(applied)

  return {
    schemaVersion: base.schemaVersion,
    basis,
    label: GENERAL_GUIDANCE_LABEL,
    ...(basis === 'local-lookup' ? { lookupNotice: LOOKUP_NOTICE } : {}),
    place,
    ...(place === null ? { withoutPlace: { usLines: usLinesOf(plan) } } : {}),
    rules: [...base.rules, ...FIGURE_RULES].filter((rule) => looked.has(rule.id)),
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
    figures: applied,
    coverage
  }
}
