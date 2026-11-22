/**
 * ARE-14 (lab R-1, AC-14): the `outdoor_rules` argument of `grid_areas`: the share of each kind of
 * outdoor space a rule the person states counts, with the rule in their words and where it comes
 * from. Grid holds no such rule of its own: with none stated, outdoor space is left out of every
 * total, and the answer says so.
 */
import { OUTDOOR_KINDS, type OutdoorKind } from '@ongrid/floorplan/types/floorplan'
import type { OutdoorWeight } from '@ongrid/floorplan/geometry/areas'
import { UNSAFE_TEXT } from '../command/planText'
import { ToolRefusal, type ArgSpec } from './toolkit'

/** The longest rule an outdoor share may carry, in characters. */
export const OUTDOOR_RULE_MAX = 300

export type OutdoorRules = Readonly<Partial<Record<OutdoorKind, OutdoorWeight>>>

export const OUTDOOR_RULES_ARG: ArgSpec = {
  type: 'object',
  description:
    'Only when the person states a rule that counts part of an outdoor space, such as half of each balcony: by kind of outdoor space, the share it counts (0 to 1) and the rule in their words with where it comes from. '
    + 'The figure it gives is added beside the net, never into it. Grid checks no such rule and holds none of its own; left out, outdoor space is in no total.',
  examples: [{ balcony: { share: 0.5, rule: 'Half of each balcony, as the person\'s lender counts it' } }],
  schema: {
    type: 'object',
    properties: Object.fromEntries(OUTDOOR_KINDS.map((kind) => [kind, {
      type: 'object',
      properties: {
        share: { type: 'number', minimum: 0, maximum: 1, description: 'The share of its floor the rule counts, from 0 to 1.' },
        rule: { type: 'string', maxLength: OUTDOOR_RULE_MAX, description: 'The rule in the person\'s words, with where it comes from.' },
      },
      required: ['share', 'rule'],
      additionalProperties: false,
    }])),
    additionalProperties: false,
    minProperties: 1,
  },
  read(value) {
    const given = value as Record<string, unknown>
    const kinds = Object.keys(given)
    if (kinds.length === 0) throw new ToolRefusal(`outdoor_rules takes at least one kind of outdoor space: ${OUTDOOR_KINDS.join(', ')}.`)
    const out: Partial<Record<OutdoorKind, OutdoorWeight>> = {}
    for (const kind of kinds) {
      if (!(OUTDOOR_KINDS as readonly string[]).includes(kind)) throw new ToolRefusal(`outdoor_rules names a kind of outdoor space Grid does not know; the kinds are ${OUTDOOR_KINDS.join(', ')}.`)
      const entry = given[kind]
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new ToolRefusal(`outdoor_rules.${kind} takes an object with share and rule.`)
      const fields = entry as Record<string, unknown>
      const unknown = Object.keys(fields).filter((field) => field !== 'share' && field !== 'rule')
      if (unknown.length > 0) throw new ToolRefusal(`outdoor_rules.${kind} takes share and rule only.`)
      const share = fields['share']
      if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) throw new ToolRefusal(`outdoor_rules.${kind}.share takes a number from 0 to 1, such as 0.5 for half.`)
      const rule = fields['rule']
      if (typeof rule !== 'string' || rule.trim() === '') throw new ToolRefusal(`outdoor_rules.${kind}.rule takes the rule in the person's words, with where it comes from.`)
      if (rule.length > OUTDOOR_RULE_MAX || UNSAFE_TEXT.test(rule)) throw new ToolRefusal(`outdoor_rules.${kind}.rule takes one line of at most ${OUTDOOR_RULE_MAX} characters.`)
      out[kind as OutdoorKind] = { weight: share, rule: rule.trim() }
    }
    return out
  },
}
