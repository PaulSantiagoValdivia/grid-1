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
} from '@ongrid/core/geometry'
import type { FigureKey, FigureUnit, VerificationStatus } from './figures'

export { GENERAL_GUIDANCE_LABEL, RULES_REPORT_SCHEMA_VERSION } from '@ongrid/core/geometry'
export type { Rule, RuleCitation, RuleSource, RouteStep } from '@ongrid/core/geometry'

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
   * the window's area as drawn, rounded the same way. Optional, like `through`.
   */
  readonly area?: number
  /**
   * On `room_too_small`: the minimum it falls short of, in m². On `escape_window_too_small`: the
   * minimum window area for that floor, in m², when there is one.
   */
  readonly minimum?: number
  /** Only on `escape_window_too_small`: the window's width and height as drawn, in m, to 0.001. */
  readonly width?: number
  readonly height?: number
  /** Only on `escape_window_too_high`: the window's sill as drawn, in m, to 0.001, and the maximum. */
  readonly sill?: number
  readonly maximum?: number
  /**
   * The figures the finding compared the plan against, each with its origin, its sources and
   * how far it has been checked. Absent on a finding that compared nothing.
   */
  readonly figures?: readonly AppliedFigure[]
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

export interface NotChecked extends Omit<PlanNotChecked, 'reason'> {
  readonly reason: NotCheckedReason
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
}
