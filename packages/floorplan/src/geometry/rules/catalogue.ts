/**
 * The rules, as data.
 *
 * All five are checks on the drawing itself: a building has a way out, every room
 * has a door, every room reaches the way out, every door leads somewhere, and a stair
 * or a lift drawn on each floor lines up (LVL-3). None
 * applies a figure and none is taken from a building code, so none cites one.
 * Building codes ask for more than this; `LIMITS` says what these checks leave out.
 */

import type { Rule, RuleSource } from './types'

export const PLAN_SANITY: RuleSource = {
  kind: 'plan-sanity',
  label: 'Plan sanity check, not a code citation'
}

export const RULES: readonly Rule[] = [
  {
    id: 'floor-has-exit',
    title: 'The ground floor has at least one way out of the building',
    source: PLAN_SANITY
  },
  {
    id: 'room-has-door',
    title: 'Every room has a door or an opening to another space',
    source: PLAN_SANITY
  },
  {
    id: 'room-reaches-exit',
    title: 'Every room has a route to a way out of the building',
    source: PLAN_SANITY
  },
  {
    id: 'door-leads-somewhere',
    title: 'Every door leads to a room or to the outside',
    source: PLAN_SANITY
  },
  {
    id: 'stairs-line-up',
    title: 'A stair or a lift shaft drawn as a room on each floor lies over itself from floor to floor',
    source: PLAN_SANITY
  }
]

/** What the plan checks never look at. Shown with every report. */
export const LIMITS: readonly string[] = [
  'A route counts whatever it goes through: a bedroom, a bathroom, a kitchen or a garage',
  'The length of a route and the number of ways out are not checked',
  'A route may go up or down a stair, but how steep or wide the stair is is not checked, and a lift is never taken as a way out',
  'Which way a door opens, and how wide doors and corridors are, are not checked',
  // The plan file says nothing about structure, so no check can tell a load-bearing wall from a partition.
  'Which walls carry load is not known: the plan does not record it, so nothing here looks at structure'
]
