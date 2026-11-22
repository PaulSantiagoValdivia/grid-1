/**
 * The rules, as data.
 *
 * All six are checks on the drawing itself: a building has a way out, every room
 * has a door, every room reaches the way out, every door leads somewhere, a stair
 * or a lift drawn on each floor lines up (LVL-3), and no door or window in an outside wall
 * lies below the ground the site states (LVL-4). None
 * applies a figure and none is taken from a building code, so none cites one.
 * Building codes ask for more than this; `LIMITS` says what these checks leave out.
 */

import { english, said, type MessageKey } from '../../messages/say'
import type { Rule, RuleSource } from './types'

export const PLAN_SANITY: RuleSource = {
  kind: 'plan-sanity',
  label: english(said('check.source.planSanity'))
}

export const RULES: readonly Rule[] = [
  {
    id: 'floor-has-exit',
    title: english(said('check.title.floor-has-exit')),
    source: PLAN_SANITY
  },
  {
    id: 'room-has-door',
    title: english(said('check.title.room-has-door')),
    source: PLAN_SANITY
  },
  {
    id: 'room-reaches-exit',
    title: english(said('check.title.room-reaches-exit')),
    source: PLAN_SANITY
  },
  {
    id: 'door-leads-somewhere',
    title: english(said('check.title.door-leads-somewhere')),
    source: PLAN_SANITY
  },
  {
    id: 'stairs-line-up',
    title: english(said('check.title.stairs-line-up')),
    source: PLAN_SANITY
  },
  {
    id: 'openings-above-ground',
    title: english(said('check.title.openings-above-ground')),
    source: PLAN_SANITY
  }
]

// The plan file says nothing about structure, so no check can tell a load-bearing wall from a partition (the last limit).
export const PLAN_LIMIT_KEYS = [
  'check.limit.plan.0',
  'check.limit.plan.1',
  'check.limit.plan.2',
  'check.limit.plan.3',
  'check.limit.plan.4',
  'check.limit.plan.5'
] as const satisfies readonly MessageKey[]

/** What the plan checks never look at. Shown with every report. */
export const LIMITS: readonly string[] = PLAN_LIMIT_KEYS.map((key) => english(said(key)))
