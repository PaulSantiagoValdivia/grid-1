/**
 * LVL-4 (lab VE-7): the record's line for a door or window below the ground the site states, what
 * the check looked at, and the floor at grade restated against the ground.
 */
import { describe, expect, it } from 'vitest'
import { checkLocalRules, inspectPlan } from '../..'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { flat } from '@ongrid/floorplan/test-support/plans'
import type { FloorPlan } from '@ongrid/floorplan/geometry'

const basement = (ground?: number): FloorPlan => {
  const plan = labPlan('A/scenarios/basement-flat.json')
  return ground === undefined ? plan : { ...plan, site: { ground } }
}

describe('openings below the ground in the result record (LVL-4)', () => {
  it('is a finding on the opening, saying how deep it lies', () => {
    const lines = inspectPlan(basement(0)).lines.filter((l) => l.code === 'opening/below-ground')
    // In the report's order: by the room they are in (the bedroom, then the living room), then by id.
    expect(lines.map((l) => [l.kind, l.thing.kind, l.thing.id, l.floor])).toEqual([
      ['finding', 'opening', 'b-w-bed', 'basement'],
      ['finding', 'opening', 'b-entry', 'basement'],
      ['finding', 'opening', 'b-w-living', 'basement']
    ])
    const living = lines.find((l) => l.thing.id === 'b-w-living')!
    expect(living.message).toBe('The window in "Living + kitchen" lies wholly below the ground: its top is 0.55 m under the ground level the site states')
    expect(living.found).toBe('a door or window in an outside wall whose top is 0.55 m under the ground level the site states')
  })

  it('says nothing, and lists no such check, when the plan states no ground', () => {
    const result = inspectPlan(basement())
    expect(result.lines.map((l) => l.code)).not.toContain('opening/below-ground')
    expect(checkLocalRules(basement()).rules.map((r) => r.id)).not.toContain('openings-above-ground')
  })

  it('looks at every door and window it can draw once the ground is stated', () => {
    const report = checkLocalRules(basement(0))
    const coverage = report.coverage.find((c) => c.ruleId === 'openings-above-ground')!
    expect(coverage.looksAt).toBe('door')
    expect(coverage.lookedAtCount).toBe(6)
    expect(coverage.findings).toBe(3)
    expect(report.rules.map((r) => r.id)).toContain('openings-above-ground')
    expect(report.label).toBe('General guidance, not your local rules')
  })
})

describe('the floor at grade (LVL-4)', () => {
  /** The flat's bedroom with its use stated and one window too small to escape through, on a floor at level 1. */
  const upstairs = (ground?: number): FloorPlan => {
    const plan = flat()
    return {
      ...plan,
      floors: [{ id: 'ground', name: 'Ground floor', level: 1, elevation: 0 }],
      rooms: plan.rooms.map((r) => (r.id === 'bedroom' ? { ...r, use: 'bedroom' as const } : r)),
      openings: [...plan.openings, { id: 'w_bed', wall: 'n2', type: 'window' as const, offset: 1, width: 0.6, sill: 0.6, height: 0.7 }],
      ...(ground === undefined ? {} : { site: { ground } })
    }
  }
  const figure = (plan: FloorPlan): string[] =>
    checkLocalRules(plan).findings.filter((f) => f.rooms.includes('bedroom') && f.figures !== undefined).flatMap((f) => f.figures!.map((x) => x.key))

  it('is the floor at level 0 when no ground is stated, as before', () => {
    expect(figure(upstairs())).toContain('escapeOpeningMinArea')
    expect(figure(upstairs())).not.toContain('escapeOpeningMinAreaGrade')
  })

  it('is the floor nearest the stated ground, whatever its level', () => {
    expect(figure(upstairs(0))).toContain('escapeOpeningMinAreaGrade')
  })
})
