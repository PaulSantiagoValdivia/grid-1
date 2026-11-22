import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { GENERAL_GUIDANCE_LABEL, LIMITS, RULES, checkPlanSanity } from '../rules'

const empty = (): FloorPlan => ({ version: '1', units: 'm', walls: [], rooms: [], openings: [] })

describe('the rules', () => {
  it('each have an id, a title and a source', () => {
    expect(RULES.length).toBeGreaterThan(0)
    for (const rule of RULES) {
      expect(rule.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
      expect(rule.title.trim()).not.toBe('')
      expect(rule.source.label.trim()).not.toBe('')
    }
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length)
  })

  it('are the six plan checks, none of which needs a figure', () => {
    expect(RULES.map((r) => r.id)).toEqual([
      'floor-has-exit',
      'room-has-door',
      'room-reaches-exit',
      'door-leads-somewhere',
      // LVL-3: a stair or a lift drawn on each floor lines up.
      'stairs-line-up',
      // LVL-4: no door or window below the ground the site states.
      'openings-above-ground'
    ])
  })

  it('leave the report at schema version 1', () => {
    expect(checkPlanSanity(empty()).schemaVersion).toBe(1)
  })
})

describe('sources', () => {
  it('say each rule is a check on the drawing, and cite no document', () => {
    for (const rule of RULES) {
      expect(rule.source).toEqual({ kind: 'plan-sanity', label: 'Plan sanity check, not a code citation' })
      expect(rule.source.citations).toBeUndefined()
    }
  })

  it('never name a building code or a standard', () => {
    for (const rule of RULES) expect(`${rule.title} ${rule.source.label}`).not.toMatch(/\b(IBC|IRC|ISO|CTE)\b/)
  })
})

describe('the report', () => {
  it('is plain data, labelled as general guidance, with every rule it applied', () => {
    const report = checkPlanSanity(empty())
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
    expect(report.basis).toBe('general-baseline')
    expect(report.label).toBe('General guidance, not your local rules')
    expect(GENERAL_GUIDANCE_LABEL).toBe(report.label)
    expect(report.rules.map((r) => r.id)).toEqual(RULES.map((r) => r.id))
    expect(report.findings).toEqual([])
    expect(report.notChecked).toEqual([])
  })

  it('always says what the checks never look at, even with nothing found', () => {
    const report = checkPlanSanity(empty())
    expect(report.limits).toEqual(LIMITS)
    expect(report.limits.length).toBeGreaterThan(0)
    for (const line of report.limits) expect(line).not.toMatch(/\b(comply|complies|approved|passes)\b/i)
  })

  it('says it does not know which walls carry load', () => {
    expect(checkPlanSanity(empty()).limits).toContainEqual(expect.stringMatching(/^Which walls carry load is not known\b/))
  })
})
