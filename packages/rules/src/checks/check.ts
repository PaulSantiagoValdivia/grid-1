/**
 * The full check: the core's plan checks, plus the checks that apply a figure.
 *
 * One call, one report. The plan checks run in the core, unchanged; the figure checks
 * run here, on each floor read the way the core reads it, and their findings and notices
 * are merged into the same report. Pure: a plan in, plain data out. No AI, no file, no
 * network.
 */

import { checkPlanSanity, floorBuilding, floorStatesBuilding, groundLevel, planFloors, planForFloor, statedGround, type FloorPlan } from '@ongrid/floorplan/geometry'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { BUILDING_TYPE_TEXT, type BuildingType } from '@ongrid/floorplan/types/floorplan'
import { FIGURE_LIMITS, FIGURE_RULES, RULE_BUILDINGS, RULE_FIGURES, RULE_READ_FOR, RULE_USES, ruleReadsBuilding, type FigureRuleId } from './catalogue'
import { allSkipped, coverageOf, LOOKS_AT, planCheckScopes, type FloorScope } from './coverage'
import { escapeCheck, hasEscapeFigures, type EscapeFigures } from './escape'
import { buildingKindsText, resolveFigure, type FigureKey } from './figures'
import { messages, type FigureSubject } from './messages'
import { sizeCheck } from './size'
import type { AppliedFigure, CheckCoverage, FindingCode, NotChecked, RuleFigures, RuleFinding, RulesReport, WholeRoom } from './types'
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
  const base = checkPlanSanity(plan)
  const floors = planFloors(plan)
  // LVL-4: the floor at grade is the ground floor, restated against the site's ground level.
  const atGround = new Set(
    statedGround(plan) === null ? floors.filter((f) => f.level === 0).map((f) => f.id) : groundLevel(plan).groundFloors.map((f) => f.id)
  )
  const level = new Map(floors.map((f) => [f.id, f.level] as const))
  const names = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const roomName = (id: string): string => names.get(id) ?? id

  const findings: RuleFinding[] = [...base.findings]
  const notChecked: NotChecked[] = []
  // MSG-2: what each figure check looked at, floor by floor.
  const scopes: Record<FigureRuleId, [string, FloorScope][]> = { 'habitable-room-area': [], 'escape-opening': [] }
  // CNT-8: the rooms with zones each figure check looked at as a whole, and the use it applied.
  const whole: Record<FigureRuleId, WholeRoom[]> = { 'habitable-room-area': [], 'escape-opening': [] }
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
    const escapes = reads('escape-opening')
      ? escapeCheck(storey, leftOut.rooms, floor.id, floor.level, roomName, escape, atGround.has(floor.id))
      : null
    if (escapes === null) {
      // Skipped above, with the reason.
    } else if (ran['escape-opening']) {
      findings.push(...escapes.findings)
      scopes['escape-opening'].push([floor.id, escapes.scope])
      whole['escape-opening'].push(...escapes.wholeRooms)
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
    } else scopes['escape-opening'].push([floor.id, allSkipped(storey, 'no_figures_for_place')])
    if (!reads('habitable-room-area')) {
      // Skipped above, with the reason.
    } else if (minRoomArea !== null) {
      // Sizes don't need stairs either: every floor is checked.
      const sizes = sizeCheck(storey, leftOut.rooms, floor.id, floorName, roomName, minRoomArea)
      findings.push(...sizes.findings)
      notChecked.push(...sizes.notChecked)
      scopes['habitable-room-area'].push([floor.id, sizes.scope])
      whole['habitable-room-area'].push(...sizes.wholeRooms)
    } else scopes['habitable-room-area'].push([floor.id, allSkipped(storey, 'no_figures_for_place')])
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
  // plan's kind of building left it out on every floor already.
  for (const rule of FIGURE_RULES) {
    if (ran[rule.id]) continue
    if (notFor[rule.id].length === floors.length) continue
    notChecked.push({
      reason: 'no_figures_for_place',
      ruleId: rule.id,
      floor: '',
      rooms: [],
      openings: [],
      message: messages.noFiguresForPlace(SUBJECT[rule.id], (options.country ?? '').trim().toUpperCase())
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
      const read = kinds.length > 0 ? { ...covered, readFor: kinds, ...reads } : { ...covered, ...reads }
      return whole[rule.id].length > 0 ? { ...read, wholeRooms: whole[rule.id] } : read
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
