import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { LIMITS, RULES as PLAN_RULES } from '@ongrid/floorplan/geometry'
import { FIGURE_LIMITS, FIGURE_RULES, FIGURES, GENERAL_GUIDANCE_LABEL, RULE_FIGURES, RULES, checkLocalRules } from '..'

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

  it('are the plan checks of the core, then the two that apply a figure', () => {
    expect(RULES).toEqual([...PLAN_RULES, ...FIGURE_RULES])
    expect(FIGURE_RULES.map((r) => r.id)).toEqual(['habitable-room-area', 'escape-opening'])
  })

  it('leave the report at schema version 1', () => {
    expect(checkLocalRules(empty()).schemaVersion).toBe(1)
  })
})

describe('sources', () => {
  it('keep the plan checks free of any document', () => {
    for (const rule of PLAN_RULES) {
      expect(rule.source.kind).toBe('plan-sanity')
      expect(rule.source.citations).toBeUndefined()
    }
  })

  it('say the figure rules come from US model codes, and name both documents', () => {
    for (const rule of FIGURE_RULES) {
      expect(rule.source.kind).toBe('building-code')
      expect(rule.source.label).toBe('US model codes: IBC 2024 and IRC 2024')
      const documents = new Set(rule.source.citations!.map((c) => `${c.document} ${c.edition}`))
      expect([...documents].sort()).toEqual(['IBC 2024', 'IRC 2024'])
    }
  })

  it('cite, on each figure rule, exactly the clauses its figures were read in', () => {
    const clauses = (id: 'habitable-room-area' | 'escape-opening') =>
      FIGURE_RULES.find((r) => r.id === id)!.source.citations!.map((c) => `${c.document} ${c.clause}`)
    expect(clauses('habitable-room-area')).toEqual(['IBC 1208.4', 'IRC R312.1'])
    expect(clauses('escape-opening')).toEqual([
      'IBC 1031.2',
      'IRC R319.1',
      'IBC 1031.3.1',
      'IRC R319.2.1',
      'IBC 1031.3.2',
      'IRC R319.2.2',
      'IBC 1031.3.3',
      'IRC R319.2.3'
    ])
    for (const rule of FIGURE_RULES) {
      for (const key of RULE_FIGURES[rule.id]) {
        for (const { document, clause } of FIGURES[key].provenance.citations) {
          expect(clauses(rule.id)).toContain(`${document} ${clause}`)
        }
      }
    }
  })

  it('never name a standard whose text cannot be read freely', () => {
    for (const rule of RULES) expect(JSON.stringify(rule)).not.toMatch(/\bISO\b/)
  })
})

describe('the report', () => {
  it('is plain data, labelled as general guidance; with nothing to look at it applies no rule, and says so (MSG-2)', () => {
    const report = checkLocalRules(empty())
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
    expect(report.basis).toBe('general-baseline')
    expect(report.label).toBe('General guidance, not your local rules')
    expect(GENERAL_GUIDANCE_LABEL).toBe(report.label)
    // Every rule has its coverage; none looked at anything, so none is listed as applied.
    expect(report.coverage.map((c) => c.ruleId)).toEqual(RULES.map((r) => r.id))
    expect(report.coverage.map((c) => c.lookedAtCount)).toEqual(RULES.map(() => 0))
    expect(report.rules).toEqual([])
    expect(report.figures).toEqual([])
    expect(report.findings).toEqual([])
    expect(report.notChecked.map((n) => n.reason)).toEqual(['no_rooms'])
  })

  it('always says what the checks never look at: the core lines, then the figure checks own', () => {
    expect(checkLocalRules(empty()).limits).toEqual([...LIMITS, ...FIGURE_LIMITS])
    for (const line of FIGURE_LIMITS) expect(line).not.toMatch(/\b(comply|complies|approved|passes)\b/i)
  })

  it('lists ceiling height, and which walls carry load, as never looked at', () => {
    const limits = checkLocalRules(empty()).limits
    expect(limits).toContainEqual(expect.stringMatching(/^Ceiling height is not checked\b/))
    expect(limits).toContainEqual(expect.stringMatching(/^Which walls carry load is not known\b/))
    expect(limits.filter((line) => /ceiling height|carry load/i.test(line))).toHaveLength(2)
  })
})
