/**
 * The plan check contract: plain data, so it survives `JSON.stringify` and can be
 * read by a program and a warnings list alike.
 *
 * Everything here is computed from the plan. Nothing comes from an AI, and a
 * report never says a plan complies: no findings only means these checks found
 * nothing.
 */

export const RULES_REPORT_SCHEMA_VERSION = 1 as const

/** The label every report carries. */
export const GENERAL_GUIDANCE_LABEL = 'General guidance, not your local rules' as const

/** One place a rule's figure was read: the document, its edition and the clause number. */
export interface RuleCitation {
  readonly document: string
  readonly edition: string
  readonly clause: string
}

/**
 * Where a rule comes from.
 *
 * A `plan-sanity` rule follows from the drawing alone: it cites no document, and none
 * should be read into it. A `building-code` rule applies figures, and names where each
 * was read.
 */
export interface RuleSource {
  readonly kind: 'plan-sanity' | 'building-code'
  /** One line a report can show as it is. */
  readonly label: string
  /** Only on a `building-code` rule. */
  readonly citations?: readonly RuleCitation[]
}

export interface Rule {
  readonly id: string
  readonly title: string
  readonly source: RuleSource
}

export type FindingCode =
  /** The floor has no door or opening to the outside, and no door to a space left undrawn. */
  | 'no_exit'
  /** A room has no door, opening or open side to another space. */
  | 'room_without_door'
  /** A room has a way out of itself but none that leads to an exit. */
  | 'no_route_to_exit'
  /** A door leads, through a wall that is not exterior, to a space not drawn as a room. */
  | 'door_to_undrawn_space'
  /** LVL-1: a door or opening to the outside on a floor standing above the ground; never a way out. */
  | 'door_to_outside_above_ground'
  /**
   * LVL-3: rooms used as a stair on two neighbouring levels, none lying over one on the other, so
   * they join nothing. On the upper floor; its rooms are the upper level's, then the lower's.
   */
  | 'stair_out_of_line'
  /** LVL-3: the same for rooms used as a lift: the shaft is out of line. */
  | 'lift_out_of_line'

/** One way through from a room: the room on its other side, and the opening or virtual wall. */
export interface RouteStep {
  readonly room: string
  readonly via: string
}

export interface RuleFinding {
  readonly code: FindingCode
  readonly ruleId: string
  readonly floor: string
  readonly rooms: readonly string[]
  readonly openings: readonly string[]
  /** One line of plain English, built from a fixed template. */
  readonly message: string
  /**
   * Only on `no_route_to_exit`: every way through the room, by the room beyond it, then by id.
   * Optional, so the report stays at schema version 1.
   */
  readonly through?: readonly RouteStep[]
}

export type NotCheckedReason =
  /**
   * Not the ground floor, and no stair joins it to the ground floor (LVL-3): no stair the plan
   * states, and no room used as a stair lying over one on the floor below.
   */
  | 'no_stairs'
  /** The plan validation rejects it, so it was left out of the routes. */
  | 'cannot_be_drawn'
  /**
   * The floor's only doors out lead to a space that is not drawn, as the entrance of a flat
   * does. Whether that space is a way out cannot be told, so the routes were not checked.
   */
  | 'way_out_not_drawn'

export interface NotChecked {
  readonly reason: NotCheckedReason
  /** The floor the notice is about. Empty for a notice about the whole plan. */
  readonly floor: string
  readonly rooms: readonly string[]
  readonly openings: readonly string[]
  readonly message: string
}

export interface RulesReport {
  readonly schemaVersion: typeof RULES_REPORT_SCHEMA_VERSION
  /** What the plan was checked against. */
  readonly basis: 'general-baseline'
  readonly label: typeof GENERAL_GUIDANCE_LABEL
  /** Every rule that was applied. */
  readonly rules: readonly Rule[]
  /** Ordered by floor level, then code, then the rooms they name. */
  readonly findings: readonly RuleFinding[]
  /** What could not be checked in this plan, and why. */
  readonly notChecked: readonly NotChecked[]
  /**
   * What these checks never look at, whatever the plan: the same fixed lines in every
   * report, so no findings is not read as more than it is.
   */
  readonly limits: readonly string[]
}
