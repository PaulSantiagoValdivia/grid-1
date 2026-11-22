/**
 * The result record (MSG-1): everything Grid tells an agent about a plan, in one list with one
 * count. `docs/result-contract.md` is the contract this file follows: what each field means,
 * what may change and what may not.
 *
 * Plain data, so it survives `JSON.stringify`. Nothing here says a plan complies: a record with
 * no lines only means these checks found nothing.
 */

import type { GENERAL_GUIDANCE_LABEL, LOOKUP_NOTICE, AppliedFigure, CheckCoverage, Rule } from '../checks/types'

/** Raised when a field changes meaning or is taken away; adding a field or a code keeps it. */
export const RESULT_VERSION = 1 as const

/**
 * What a line is, in the order the list gives them.
 *
 * - `refused`: the plan could not be read, so nothing else was checked.
 * - `left-out`: a part that cannot be drawn. It is skipped by every view, measure and export.
 * - `worth-a-look`: a part that is drawn, and is very likely a mistake; and first, a word in the
 *   file Grid does not read (MSG-4): an unknown field or room use, or an empty plan.
 * - `finding`: what a plan check found (a way out, a door, a room's size, an escape window).
 * - `not-checked`: something a check could not look at in this plan, and why.
 */
export const LINE_KINDS = ['refused', 'left-out', 'worth-a-look', 'finding', 'not-checked'] as const
export type LineKind = (typeof LINE_KINDS)[number]

/**
 * How far a number Grid gives is borne out by the plan (MSG-2, lab AA-12, AC-9): `proven` when
 * every part it is made of was measured and nothing in the drawing questions them; `not-proven`
 * when a part was left out or is in doubt, and it says which; `not-looked-at` when nothing it
 * would be made of could be measured. A number is never shown as more than its state.
 */
export const NUMBER_STATES = ['proven', 'not-proven', 'not-looked-at'] as const
export type NumberState = (typeof NUMBER_STATES)[number]

/** What a line is about. The plan as a whole has the id `''`. An `item` is a fixture (CNT-12); a `stair` a stated stair (LVL-3). */
export type ThingKind = 'plan' | 'floor' | 'wall' | 'room' | 'opening' | 'item' | 'stair'

export interface Thing {
  readonly kind: ThingKind
  readonly id: string
}

export interface ResultLine {
  /** Stable: `<thing>/<what>`, lowercase words joined by dashes. Never reused for another meaning. */
  readonly code: string
  readonly kind: LineKind
  readonly thing: Thing
  /** The id of the floor the thing is on; null for the plan as a whole. */
  readonly floor: string | null
  /** The ids of the other parts the line names: the wall a door hits, the rooms a door joins. */
  readonly also: readonly string[]
  /** The one wording of this code, with the plan's names and the figures filled in. */
  readonly message: string
  /** What was found, in words and figures. */
  readonly found: string
  /** What would be right, in words and figures. */
  readonly needed: string
  /** What to change. A suggestion: the plan is the author's. */
  readonly fix: string
  /**
   * On a finding that compared the plan with a figure: the figures, each with its origin, its
   * sources and how far it has been checked.
   */
  readonly figures?: readonly AppliedFigure[]
}

export interface GridResult {
  readonly resultVersion: typeof RESULT_VERSION
  /** First in every record and every rendering of it. */
  readonly label: typeof GENERAL_GUIDANCE_LABEL
  /** False when the plan was refused: then the lines are its refusals and nothing else ran. */
  readonly read: boolean
  /** How many lines there are: the one number for how much there is to look at. */
  readonly count: number
  /** The same lines counted by kind. They add up to `count`. */
  readonly counts: Readonly<Record<LineKind, number>>
  /** Every line, refusals first, then by kind in `LINE_KINDS` order. */
  readonly lines: readonly ResultLine[]
  /** What the plan was checked against: `local-lookup` once a looked-up figure was applied. */
  readonly basis: 'general-baseline' | 'local-lookup'
  /** Only when a looked-up figure was applied. */
  readonly lookupNotice?: typeof LOOKUP_NOTICE
  /** Every check that ran and looked at something. Empty when the plan was refused. */
  readonly checks: readonly Rule[]
  /**
   * MSG-2: what each check looked at and skipped, with the reason and a count, whether it ran or
   * not. Empty when the plan was refused, or when the checks could not run.
   */
  readonly coverage: readonly CheckCoverage[]
  /** Every figure a check applied. */
  readonly figures: readonly AppliedFigure[]
  /** What these checks never look at, whatever the plan: the same lines every time. */
  readonly limits: readonly string[]
}
