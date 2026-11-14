import { describe, expect, it } from 'vitest'
import { FIGURE_KEYS } from '../../checks/figures'
import {
  LOCATION_INVALID_MESSAGE,
  RULES_TRANSPORT_JSON_SCHEMA,
  RulesLocationSchema,
  RulesSheetSchema,
  RulesTransportSchema,
  dropReason,
  type RulesSheet
} from '../rulesSheet'

const figure = (extra: Record<string, unknown> = {}) => ({
  value: 1.2,
  unit: 'm',
  sourceUrl: 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-5515',
  quote: 'Sample passage: a clear width of at least 1.20 m',
  retrievedAt: '2026-11-14T10:00:00.000Z',
  ...extra
})

const sheet = (figures: Record<string, unknown> = { routeMinWidth: figure() }): RulesSheet =>
  RulesSheetSchema.parse({
    schemaVersion: 1,
    location: { municipality: 'Valencia', country: 'Spain' },
    lookedUpAt: '2026-11-14T10:00:00.000Z',
    figures,
    dropped: [{ key: 'exitDoorClearWidth', reason: 'out_of_range' }],
    notFound: ['escapeOpeningMaxSill']
  })

describe('the location', () => {
  it('tidies control characters and runs of spaces, and trims both fields', () => {
    expect(RulesLocationSchema.parse({ municipality: '  San   Sebasti\u00e1n \n', country: '\tSpain\u0007' })).toEqual({
      municipality: 'San Sebasti\u00e1n',
      country: 'Spain'
    })
  })

  it.each([
    ['an empty municipality', { municipality: '   ', country: 'Spain' }],
    ['a municipality of 101 characters', { municipality: 'x'.repeat(101), country: 'Spain' }],
    ['a country of 61 characters', { municipality: 'Valencia', country: 'x'.repeat(61) }],
    ['a number', { municipality: 42, country: 'Spain' }],
    ['an extra field', { municipality: 'Valencia', country: 'Spain', path: '/' }]
  ])('refuses %s with a plain message', (_label, input) => {
    const result = RulesLocationSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]!.message).toBe(LOCATION_INVALID_MESSAGE)
  })

  it('accepts 100 and 60 characters', () => {
    expect(RulesLocationSchema.safeParse({ municipality: 'x'.repeat(100), country: 'y'.repeat(60) }).success).toBe(true)
  })

  it('says it in plain words', () => {
    expect(LOCATION_INVALID_MESSAGE).toBe('Use a town or city and a country.')
  })
})

describe('the transport schema', () => {
  const figures = RULES_TRANSPORT_JSON_SCHEMA.properties.figures

  it('requires every figure key, closes every object, and allows null for each', () => {
    expect(RULES_TRANSPORT_JSON_SCHEMA.required).toEqual(['figures'])
    expect(RULES_TRANSPORT_JSON_SCHEMA.additionalProperties).toBe(false)
    expect(figures.required).toEqual([...FIGURE_KEYS])
    expect(Object.keys(figures.properties)).toEqual([...FIGURE_KEYS])
    expect(figures.additionalProperties).toBe(false)
    for (const key of FIGURE_KEYS) {
      const [entry, none] = figures.properties[key].anyOf
      expect(none).toEqual({ type: 'null' })
      expect(entry.additionalProperties).toBe(false)
      expect(entry.required).toEqual(['value', 'unit', 'sourceUrl', 'quote'])
    }
  })

  it('asks the model for no time: the caller sets it', () => {
    expect(JSON.stringify(RULES_TRANSPORT_JSON_SCHEMA)).not.toContain('retrievedAt')
  })

  it('round-trips through JSON', () => {
    expect(JSON.parse(JSON.stringify(RULES_TRANSPORT_JSON_SCHEMA))).toEqual(RULES_TRANSPORT_JSON_SCHEMA)
  })

  it('is mirrored by the Zod parse of an answer', () => {
    const answer = { figures: Object.fromEntries(FIGURE_KEYS.map((k) => [k, null])) }
    expect(RulesTransportSchema.safeParse(answer).success).toBe(true)
    const missing = { figures: Object.fromEntries(FIGURE_KEYS.slice(1).map((k) => [k, null])) }
    expect(RulesTransportSchema.safeParse(missing).success).toBe(false)
    expect(RulesTransportSchema.safeParse({ ...answer, extra: 1 }).success).toBe(false)
    expect(RulesTransportSchema.safeParse({ figures: { ...answer.figures, other: null } }).success).toBe(false)
  })
})

describe('the sheet', () => {
  it('round-trips through JSON', () => {
    const value = sheet()
    expect(RulesSheetSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value)
  })

  it.each([
    ['an http: URL', { sourceUrl: 'http://www.boe.es/x' }],
    ['a URL with a user name', { sourceUrl: 'https://someone@www.boe.es/x' }],
    ['a URL with a password', { sourceUrl: 'https://a:b@www.boe.es/x' }],
    ['a javascript: URL', { sourceUrl: 'javascript:alert(1)' }],
    ['an empty quote', { quote: '   ' }],
    ['a quote with no digit', { quote: 'Sample passage with no figure' }],
    ['the wrong unit', { unit: 'mm' }],
    ['a value out of range', { value: 1200 }]
  ])('refuses a figure with %s', (_label, extra) => {
    expect(() => sheet({ routeMinWidth: figure(extra) })).toThrow()
  })

  it('refuses a key it does not know', () => {
    expect(() => sheet({ stairWidth: figure() })).toThrow()
  })
})

describe('dropReason', () => {
  const entry = { value: 1.2, unit: 'm', sourceUrl: 'https://www.boe.es/x', quote: 'at least 1.20 m' }

  it('keeps a figure with a source, a quote, its unit and a plausible value', () => {
    expect(dropReason('routeMinWidth', entry)).toBeNull()
  })

  it.each([
    ['no_source', { sourceUrl: '' }],
    ['no_source', { sourceUrl: 'not a url' }],
    ['not_https', { sourceUrl: 'http://www.boe.es/x' }],
    ['not_https', { sourceUrl: 'https://u:p@www.boe.es/x' }],
    ['not_https', { sourceUrl: `https://www.boe.es/${'x'.repeat(2048)}` }],
    ['no_quote', { quote: '' }],
    ['no_quote', { quote: 'no figure here' }],
    ['no_quote', { quote: `1 ${'x'.repeat(500)}` }],
    ['wrong_unit', { unit: 'mm' }],
    ['out_of_range', { value: 1118 }],
    ['out_of_range', { value: Number.NaN }]
  ])('gives %s', (reason, extra) => {
    expect(dropReason('routeMinWidth', { ...entry, ...extra })).toBe(reason)
  })

  it('gives the first failing reason, in a fixed order', () => {
    expect(dropReason('routeMinWidth', { value: 1118, unit: 'mm', sourceUrl: 'http://x.es', quote: '' })).toBe('not_https')
    expect(dropReason('routeMinWidth', { value: 1118, unit: 'mm', sourceUrl: '', quote: '' })).toBe('no_source')
    expect(dropReason('routeMinWidth', { ...entry, value: 1118, unit: 'mm' })).toBe('wrong_unit')
  })

  it('keeps a quote of 160 characters and drops one of 161: a quote is short or it is not kept', () => {
    expect(dropReason('routeMinWidth', { ...entry, quote: `1${'x'.repeat(159)}` })).toBeNull()
    expect(dropReason('routeMinWidth', { ...entry, quote: `1${'x'.repeat(160)}` })).toBe('no_quote')
  })

  it('reads 813 m for a door width as out of range', () => {
    expect(dropReason('exitDoorClearWidth', { ...entry, value: 813 })).toBe('out_of_range')
  })
})
