import { describe, expect, it } from 'vitest'
import { ESCAPE_TOP_LEVEL, FIGURE_KEYS, FIGURES, VERIFICATION_STATUSES, baselineApplies, isPlausible, resolveFigure } from '../figures'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

describe('the figures', () => {
  it('are the eight fixed keys, each described once', () => {
    expect(FIGURE_KEYS).toEqual([
      'habitableRoomMinArea',
      'escapeOpeningMinArea',
      'escapeOpeningMinAreaGrade',
      'escapeOpeningMinWidth',
      'escapeOpeningMinHeight',
      'escapeOpeningMaxSill',
      'routeMinWidth',
      'exitDoorClearWidth'
    ])
    expect(Object.keys(FIGURES).sort()).toEqual([...FIGURE_KEYS].sort())
    for (const key of FIGURE_KEYS) expect(FIGURES[key].key).toBe(key)
  })

  it('use only metres or square metres', () => {
    for (const key of FIGURE_KEYS) expect(['m', 'm²']).toContain(FIGURES[key].unit)
  })

  it('have a baseline inside their own plausible range', () => {
    for (const key of FIGURE_KEYS) {
      const { baseline, min, max } = FIGURES[key]
      expect(baseline, key).toBeGreaterThanOrEqual(min)
      expect(baseline, key).toBeLessThanOrEqual(max)
      expect(isPlausible(key, baseline), key).toBe(true)
    }
  })

  it('hold the values the sources print, one value per figure', () => {
    expect(Object.fromEntries(FIGURE_KEYS.map((key) => [key, FIGURES[key].baseline]))).toEqual({
      habitableRoomMinArea: 6.5,
      escapeOpeningMinArea: 0.53,
      escapeOpeningMinAreaGrade: 0.46,
      escapeOpeningMinWidth: 0.508,
      escapeOpeningMinHeight: 0.61,
      escapeOpeningMaxSill: 1.118,
      routeMinWidth: 0.914,
      exitDoorClearWidth: 0.813
    })
  })
})

describe('where each figure comes from', () => {
  const all = [...FIGURE_KEYS.map((key) => [key, FIGURES[key].provenance] as const), ['escapeTopLevel', ESCAPE_TOP_LEVEL.provenance] as const]

  it('is in the data: place, documents, clauses, the day read and how far it was checked', () => {
    for (const [key, p] of all) {
      expect(p.jurisdiction, key).toBe('US model codes')
      expect(p.citations.length, key).toBeGreaterThan(0)
      for (const c of p.citations) {
        expect(c.edition, key).toBe('2024')
        expect(c.clause.trim(), key).not.toBe('')
        expect(c.publisher.trim(), key).not.toBe('')
        expect(c.url, key).toMatch(/^https:\/\//)
      }
      expect(p.readOn, key).toMatch(ISO_DAY)
      expect(p.reviewBy, key).toMatch(ISO_DAY)
      expect(p.reviewBy > p.readOn, key).toBe(true)
      expect(p.appliesTo.trim(), key).not.toBe('')
      expect(VERIFICATION_STATUSES, key).toContain(p.status)
    }
  })

  it('names both model codes for every figure, since a house may be built to either', () => {
    for (const [key, p] of all) expect(p.citations.map((c) => c.document).sort(), key).toEqual(['IBC', 'IRC'])
  })

  it('cites the clauses that were read', () => {
    const clauses = (key: (typeof FIGURE_KEYS)[number]) => FIGURES[key].provenance.citations.map((c) => c.clause)
    expect(clauses('habitableRoomMinArea')).toEqual(['1208.4', 'R312.1'])
    expect(clauses('escapeOpeningMinArea')).toEqual(['1031.3.1', 'R319.2.1'])
    expect(clauses('escapeOpeningMinAreaGrade')).toEqual(['1031.3.1', 'R319.2.1'])
    expect(clauses('escapeOpeningMinWidth')).toEqual(['1031.3.2', 'R319.2.2'])
    expect(clauses('escapeOpeningMinHeight')).toEqual(['1031.3.2', 'R319.2.2'])
    expect(clauses('escapeOpeningMaxSill')).toEqual(['1031.3.3', 'R319.2.3'])
    expect(clauses('routeMinWidth')).toEqual(['Table 1020.3', 'R318.6'])
    expect(clauses('exitDoorClearWidth')).toEqual(['1010.1.1', 'R318.2'])
    expect(ESCAPE_TOP_LEVEL.provenance.citations.map((c) => c.clause)).toEqual(['1031.2', 'R319.1'])
  })

  it('never claims a check no person has made', () => {
    for (const [key, p] of all) {
      const checked = p.status === 'checked-once' || p.status === 'checked-twice'
      const needed = p.status === 'checked-twice' ? 2 : checked ? 1 : 0
      expect(p.verifiedBy.length >= needed, key).toBe(true)
      if (p.status === 'checked-twice') expect(new Set(p.verifiedBy.map((v) => v.by)).size, key).toBeGreaterThanOrEqual(2)
      for (const v of p.verifiedBy) expect(v.by, key).not.toMatch(/\bAI\b/i)
    }
  })

  it('says when a metric value is our own conversion: the hallway width is printed in inches only', () => {
    expect(FIGURES.routeMinWidth.provenance.metric).toBe('converted')
    expect(FIGURES.routeMinWidth.provenance.original).toEqual({ value: 36, unit: 'in' })
    expect(FIGURES.escapeOpeningMinWidth.provenance.metric).toBe('as-printed')
  })

  it('stores no passage of any document: every line of our own words is short', () => {
    for (const [key, p] of all) expect(p.appliesTo.length, key).toBeLessThan(200)
  })
})

describe('isPlausible', () => {
  it.each([NaN, Infinity, -Infinity])('rejects %s', (value) => {
    for (const key of FIGURE_KEYS) expect(isPlausible(key, value)).toBe(false)
  })

  it('rejects a value given in millimetres', () => {
    expect(isPlausible('routeMinWidth', 1118)).toBe(false)
    expect(isPlausible('exitDoorClearWidth', 813)).toBe(false)
  })

  it('rejects what is not a number', () => {
    expect(isPlausible('routeMinWidth', '1.2' as unknown as number)).toBe(false)
    expect(isPlausible('routeMinWidth', null as unknown as number)).toBe(false)
  })

  it('accepts the ends of the range', () => {
    expect(isPlausible('routeMinWidth', 0.7)).toBe(true)
    expect(isPlausible('routeMinWidth', 2.5)).toBe(true)
  })
})

describe('resolveFigure', () => {
  const source = { url: 'https://example.org/rules', quote: 'at least 9 m2', retrievedAt: '2026-11-14T10:00:00.000Z' }

  it('gives the baseline, with its sources and status, when nothing was looked up', () => {
    expect(resolveFigure('habitableRoomMinArea')).toEqual({
      key: 'habitableRoomMinArea',
      value: 6.5,
      unit: 'm²',
      origin: 'baseline',
      status: 'ai-found',
      jurisdiction: 'US model codes',
      citations: [
        { document: 'IBC', edition: '2024', clause: '1208.4' },
        { document: 'IRC', edition: '2024', clause: 'R312.1' }
      ],
      readOn: '2026-11-14'
    })
  })

  it('gives a plausible looked-up figure, always marked as found and not checked', () => {
    expect(resolveFigure('habitableRoomMinArea', { habitableRoomMinArea: { value: 9, source } }, 'IT')).toEqual({
      key: 'habitableRoomMinArea',
      value: 9,
      unit: 'm²',
      origin: 'lookup',
      status: 'ai-found',
      source
    })
  })

  it('falls back to the baseline for an implausible looked-up figure', () => {
    expect(resolveFigure('habitableRoomMinArea', { habitableRoomMinArea: { value: 900 } })?.origin).toBe('baseline')
  })

  it('gives nothing for another country with no looked-up figure: a US figure is not its rule', () => {
    expect(resolveFigure('habitableRoomMinArea', undefined, 'ES')).toBeNull()
    expect(resolveFigure('habitableRoomMinArea', { habitableRoomMinArea: { value: 900 } }, 'ES')).toBeNull()
  })
})

describe('baselineApplies', () => {
  it('is true with no country stated, and for the US however it is written', () => {
    for (const country of [undefined, '', '  ', 'US', 'us', ' Us ']) expect(baselineApplies(country), String(country)).toBe(true)
  })

  it('is false for any other country', () => {
    for (const country of ['ES', 'GB', 'DE', 'IT', 'Spain']) expect(baselineApplies(country), country).toBe(false)
  })
})
