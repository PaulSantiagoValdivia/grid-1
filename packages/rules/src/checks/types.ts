/**
 * The report of the full check: the plan checks of the core, plus the checks that
 * apply a figure from a building code.
 *
 * Every type here widens the core's own, so a report from this package reads like a
 * report from the core with more in it. Plain data, so it survives `JSON.stringify`.
 * A report never says a plan complies: no findings only means these checks found
 * nothing.
 */

import type {
  FindingCode as PlanFindingCode,
  NotChecked as PlanNotChecked,
  NotCheckedReason as PlanNotCheckedReason,
  RuleCitation,
  RuleFinding as PlanRuleFinding,
  RulesReport as PlanRulesReport
} from '@ongrid/floorplan/geometry'
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'
import type { BuildingKind, FigureKey, FigureUnit, VerificationStatus } from './figures'

export { GENERAL_GUIDANCE_LABEL, RULES_REPORT_SCHEMA_VERSION } from '@ongrid/floorplan/geometry'
export type { Rule, RuleCitation, RuleSource, RouteStep } from '@ongrid/floorplan/geometry'

/**
 * Added to a report that applied at least one looked-up figure. The report keeps its
 * general-guidance label as well.
 */
export const LOOKUP_NOTICE =
  'Some figures were found online by an AI and have not been checked by a person. Check their sources' as const

/** Where a looked-up figure was read: shown to the user, never trusted. */
export interface FigureCitation {
  readonly url: string
  readonly quote: string
  readonly retrievedAt: string
}

/** Figures a check may be given, by key. Missing, non-finite or implausible ones are ignored. */
export type RuleFigures = { readonly [K in FigureKey]?: { readonly value: number; readonly source?: FigureCitation } }

/** A figure a check applied, as the report and its findings name it. */
export type AppliedFigure =
  | {
      readonly key: FigureKey
      readonly value: number
      readonly unit: FigureUnit
      /** One of the figures this package carries. */
      readonly origin: 'baseline'
      readonly status: VerificationStatus
      /** The kind of building the figure was read for (COD-2). */
      readonly readFor: BuildingKind
      /** Where the figure applies, such as "US model codes". */
      readonly jurisdiction: string
      readonly citations: readonly RuleCitation[]
      /** The day the sources were read, as YYYY-MM-DD. */
      readonly readOn: string
    }
  | {
      readonly key: FigureKey
      readonly value: number
      readonly unit: FigureUnit
      /** Given by the caller, from a rules lookup. */
      readonly origin: 'lookup'
      /** A looked-up figure is never more than found: nobody has checked it. */
      readonly status: 'ai-found'
      /** The kind of building the figure was read for: the one the lookup asked about (COD-2). */
      readonly readFor: BuildingKind
      readonly source?: FigureCitation
    }

/** The findings only the figure checks give. */
export type FigureFindingCode =
  /** A bedroom, living or dining room is under the minimum net area. */
  | 'room_too_small'
  /** A bedroom has no window or door on an exterior wall. */
  | 'no_escape_opening'
  /** A bedroom's outside windows are all too narrow, too low or too small. */
  | 'escape_window_too_small'
  /** A bedroom's outside window is big enough, but its sill is too high. */
  | 'escape_window_too_high'

export type FindingCode = PlanFindingCode | FigureFindingCode

export interface RuleFinding extends Omit<PlanRuleFinding, 'code'> {
  readonly code: FindingCode
  /**
   * On `room_too_small`: the room's net area in m², rounded to 0.01. On `escape_window_too_small`:
   * the window's area as drawn, rounded the same way. Either keeps more digits when at 0.01 it
   * would read as its minimum (ARE-7): 6.4951 m² against 6.5 is 6.495. The check compares the
   * area as measured, never this figure. Optional, like `through`.
   */
  readonly area?: number
  /**
   * On `room_too_small`: the minimum it falls short of, in m². On `escape_window_too_small`: the
   * minimum window area for that floor, in m², when there is one.
   */
  readonly minimum?: number
  /**
   * Only on `escape_window_too_small`: the window's width and height as drawn, in m, to 0.001,
   * or to more digits when at 0.001 they would read as their figure (ARE-7).
   */
  readonly width?: number
  readonly height?: number
  /** Only on `escape_window_too_high`: the window's sill as drawn, in m, to 0.001 or past it as above, and the maximum. */
  readonly sill?: number
  readonly maximum?: number
  /**
   * The figures the finding compared the plan against, each with its origin, its sources and
   * how far it has been checked. Absent on a finding that compared nothing.
   */
  readonly figures?: readonly AppliedFigure[]
  /**
   * CNT-8, only on a finding about a room with zones: the use its figure was applied for, read
   * from the room as a whole, and the zone it was read from (`zone`, also the second of `rooms`)
   * when it is not the room's own. Optional, like `through`.
   */
  readonly use?: RoomUse
  readonly zone?: string
}

export type NotCheckedReason =
  | PlanNotCheckedReason
  /** These rooms don't say what they're for, so their size was not checked. */
  | 'no_use'
  /**
   * The plan is for a country the carried figures do not cover, and no figure was looked
   * up for it, so a figure check did not run. About the whole plan.
   */
  | 'no_figures_for_place'
  /**
   * MSG-2 (lab CH-4): bedrooms on a floor above the third storey, where the escape figures carried
   * here stop, so their escape openings were not checked. On that floor; its rooms are the bedrooms.
   */
  | 'above_escape_storeys'
  /** MSG-2 (lab CH-1): the plan has no rooms, so no check that looks at rooms ran. About the whole plan. */
  | 'no_rooms'

export interface NotChecked extends Omit<PlanNotChecked, 'reason'> {
  readonly reason: NotCheckedReason
  /** Only on `no_figures_for_place`: the check that did not run. Optional, like `through`. */
  readonly ruleId?: string
}

/**
 * Why a check did not look at a part (MSG-2). Three kinds: the check could not look at it
 * (`cannot_be_drawn`, `no_stairs`, `way_out_not_drawn`, `no_use`, `no_figures_for_place`,
 * `above_escape_storeys`, `no_rooms`, `alone_off_ground`), the check is not about it
 * (`use_not_covered`), or it looked at it as part of its room (`part_of_room`, CNT-8).
 */
export type SkipReason =
  | 'cannot_be_drawn'
  | 'no_stairs'
  | 'way_out_not_drawn'
  | 'no_use'
  | 'no_figures_for_place'
  | 'above_escape_storeys'
  | 'no_rooms'
  /** The only room on a floor off the ground: reached by a stair the plan cannot draw, so not asked for a door. */
  | 'alone_off_ground'
  /** The check's figure is for rooms of other uses. */
  | 'use_not_covered'
  /** CNT-8: a zone of another room, which the check looks at as a whole, with the zone's use. */
  | 'part_of_room'

/** Parts of one floor, by id. `floor` is empty for parts of the whole plan. */
export interface CoverageGroup {
  readonly floor: string
  readonly ids: readonly string[]
}

/** Parts a check did not look at, on one floor, and why. */
export interface CoverageSkip extends CoverageGroup {
  readonly reason: SkipReason
  /** One wording per reason, in plain words. */
  readonly why: string
}

/**
 * What one check looked at in this plan (MSG-2, lab CH-1, CH-4): the parts it looked at and the
 * parts it skipped, with the reason, each by floor. Every room of the plan is either under
 * `lookedAt` or under `skipped` of each check that looks at rooms, so an empty list of findings
 * can be read for what it is: these parts were looked at and nothing was found in them.
 */
export interface CheckCoverage {
  readonly ruleId: string
  readonly title: string
  /** What the check looks at: whole floors, rooms, or doors and openings. */
  readonly looksAt: 'floor' | 'room' | 'door'
  readonly lookedAt: readonly CoverageGroup[]
  /** How many parts it looked at: the ids under `lookedAt`, counted. */
  readonly lookedAtCount: number
  readonly skipped: readonly CoverageSkip[]
  /** How many parts it skipped. */
  readonly skippedCount: number
  /** How many findings it gave. */
  readonly findings: number
  /**
   * A check that applied figures: the kinds of building they were read for (COD-2), so a pass
   * with no finding still says it. Left out for a check that uses no figure, or did not run.
   */
  readonly readFor?: readonly BuildingKind[]
  /**
   * CNT-8, only on a figure check that looked at a room with zones: each such room, by floor and
   * id, with the use the check applied to it as a whole, and the zone it read that use from
   * (null for the room's own), so a pass with no finding says it too.
   */
  readonly wholeRooms?: readonly WholeRoom[]
}

/** A room with zones a figure check looked at as a whole (CNT-8). */
export interface WholeRoom {
  readonly floor: string
  readonly room: string
  readonly use: RoomUse
  readonly zone: string | null
}

export interface RulesReport extends Omit<PlanRulesReport, 'basis' | 'findings' | 'notChecked'> {
  /** What the plan was checked against: `local-lookup` once any looked-up figure is applied. */
  readonly basis: 'general-baseline' | 'local-lookup'
  /** Only on a `local-lookup` report. */
  readonly lookupNotice?: typeof LOOKUP_NOTICE
  /** Exit findings first, then escape openings, then sizes; each by floor level, code and rooms. */
  readonly findings: readonly RuleFinding[]
  readonly notChecked: readonly NotChecked[]
  /** Every figure the checks applied, baseline or looked up. */
  readonly figures: readonly AppliedFigure[]
  /**
   * MSG-2: what each check looked at and skipped, one entry per check Grid has, in `RULES` order,
   * whether it ran or not. `rules` lists only the checks that looked at something.
   */
  readonly coverage: readonly CheckCoverage[]
}
