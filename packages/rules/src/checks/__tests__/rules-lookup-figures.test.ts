import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { RULES as CORE_RULES } from '@ongrid/floorplan/geometry'
import {
  GENERAL_GUIDANCE_LABEL,
  LOOKUP_NOTICE,
  RULES,
  checkLocalRules,
  figuresFromSheet,
  resolveFigure,
  type RuleFigures
} from '..'
import { basisOf } from '../check'
import { edit, flat, madeVirtual, twoFloorHouse, longWallStrip, withoutOpening } from '@ongrid/floorplan/test-support/plans'

/** The plan checks that look at something in these plans: none has a stair room, so the stairs check (LVL-3) is not listed. */
const PLAN_RULES = CORE_RULES.filter((rule) => rule.id !== 'stairs-line-up')

const source = { url: 'https://www.boe.es/x', quote: 'sample passage: at least 30 m2', retrievedAt: '2026-11-14T10:00:00.000Z' }

/** The flat with its bedroom saying what it is, so the figure checks have a room to look at. */
const withBedroom = (): FloorPlan =>
  edit(flat(), (copy) => {
    copy.rooms.find((r) => r.id === 'bedroom')!.use = 'bedroom'
  })

const fixtures: [string, FloorPlan][] = [
  ['the flat', flat()],
  ['the flat with a stated bedroom', withBedroom()],
  ['the flat without its bedroom door', withoutOpening(flat(), 'd_hb')],
  ['the two-floor house', twoFloorHouse()],
  ['the long-wall strip', longWallStrip()],
  ['the flat with an open kitchen', madeVirtual(flat(), 'hk')]
]

const sizeFindings = (plan: FloorPlan, options?: Parameters<typeof checkLocalRules>[1]) =>
  checkLocalRules(plan, options).findings.filter((f) => f.code === 'room_too_small')

/** Every room a bedroom, so both figure checks look at a room and apply their figures (MSG-2). */
const allBedrooms = (plan: FloorPlan): FloorPlan =>
  edit(plan, (copy) => {
    for (const room of copy.rooms) room.use = 'bedroom'
  })

describe('a report with no figures given', () => {
  it('lists no figure of a check that looked at no room (MSG-2)', () => {
    // The flat says no room's use: neither figure check looks at a room, so neither applied a figure.
    const report = checkLocalRules(flat())
    expect(report.figures).toEqual([])
    expect(report.rules.map((r) => r.id)).toEqual(PLAN_RULES.map((r) => r.id))
  })

  it.each(fixtures)('for %s is labelled as general guidance, every figure a baseline with its sources and status', (_name, plan) => {
    const report = checkLocalRules(allBedrooms(plan))
    expect(report.basis).toBe('general-baseline')
    expect(report.label).toBe(GENERAL_GUIDANCE_LABEL)
    expect(report.lookupNotice).toBeUndefined()
    expect(report.figures.map((f) => f.key)).toEqual([
      'habitableRoomMinArea',
      'escapeOpeningMinArea',
      'escapeOpeningMinAreaGrade',
      'escapeOpeningMinWidth',
      'escapeOpeningMinHeight',
      'escapeOpeningMaxSill'
    ])
    for (const figure of report.figures) {
      expect(figure).toMatchObject({ origin: 'baseline', status: 'ai-found', jurisdiction: 'US model codes', readOn: '2026-11-14' })
      if (figure.origin === 'baseline') expect(figure.citations.map((c) => c.document)).toEqual(['IBC', 'IRC'])
    }
  })

  it.each(fixtures)('for %s is the same with an empty figure list, and with the US stated', (_name, plan) => {
    expect(JSON.stringify(checkLocalRules(plan, { figures: {} }))).toBe(JSON.stringify(checkLocalRules(plan)))
    expect(JSON.stringify(checkLocalRules(plan, {}))).toBe(JSON.stringify(checkLocalRules(plan)))
    expect(JSON.stringify(checkLocalRules(plan, { country: 'us' }))).toBe(JSON.stringify(checkLocalRules(plan)))
  })

  it('stays plain data', () => {
    const report = checkLocalRules(withBedroom())
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
    expect(report.schemaVersion).toBe(1)
  })
})

describe('resolveFigure', () => {
  it('ignores a nonsense figure and applies the baseline', () => {
    expect(resolveFigure('routeMinWidth', { routeMinWidth: { value: 1118 } })).toMatchObject({
      key: 'routeMinWidth',
      value: 0.914,
      unit: 'm',
      origin: 'baseline',
      readFor: 'homes',
      citations: [
        { document: 'IBC', edition: '2024', clause: 'Table 1020.3' },
        { document: 'IRC', edition: '2024', clause: 'R318.6' }
      ]
    })
  })

  it.each([NaN, Infinity, -1])('ignores %s', (value) => {
    expect(resolveFigure('routeMinWidth', { routeMinWidth: { value } })!.origin).toBe('baseline')
  })

  it('applies a plausible looked-up figure, with its source, marked as not checked', () => {
    expect(resolveFigure('routeMinWidth', { routeMinWidth: { value: 1.2, source } })).toEqual({
      key: 'routeMinWidth',
      value: 1.2,
      unit: 'm',
      origin: 'lookup',
      readFor: 'homes',
      status: 'ai-found',
      source
    })
  })
})

describe('a report with a looked-up figure', () => {
  const figures: RuleFigures = { habitableRoomMinArea: { value: 30, source } }

  it('applies it: the room is measured against the looked-up minimum, and the finding carries it', () => {
    expect(sizeFindings(withBedroom())).toEqual([])
    const [finding] = sizeFindings(withBedroom(), { figures })
    expect(finding).toMatchObject({ rooms: ['bedroom'], minimum: 30, message: '"Bedroom" is under 30 m²' })
    expect(finding!.figures).toEqual([
      { key: 'habitableRoomMinArea', value: 30, unit: 'm²', origin: 'lookup', readFor: 'homes', status: 'ai-found', source }
    ])
  })

  it('keeps the general-guidance label, and adds a line saying figures were found online', () => {
    const report = checkLocalRules(withBedroom(), { figures })
    expect(report.basis).toBe('local-lookup')
    expect(report.label).toBe(GENERAL_GUIDANCE_LABEL)
    expect(report.lookupNotice).toBe(LOOKUP_NOTICE)
  })

  it('is a lookup report exactly when a check applied a looked-up figure', () => {
    const lookedUp = resolveFigure('habitableRoomMinArea', figures)!
    const baseline = resolveFigure('habitableRoomMinArea')!
    expect(basisOf([lookedUp, baseline])).toBe('local-lookup')
    expect(basisOf([baseline])).toBe('general-baseline')
    expect(basisOf([])).toBe('general-baseline')
  })

  it('stays general guidance when the only looked-up figure is implausible', () => {
    const report = checkLocalRules(withBedroom(), { figures: { habitableRoomMinArea: { value: 900, source } } })
    expect(report.basis).toBe('general-baseline')
    expect(report.lookupNotice).toBeUndefined()
    expect(sizeFindings(withBedroom(), { figures: { habitableRoomMinArea: { value: 900, source } } })).toEqual([])
  })

  it('stays general guidance when the looked-up figure is one no check reads', () => {
    const report = checkLocalRules(flat(), { figures: { exitDoorClearWidth: { value: 0.8, source } } })
    expect(report.basis).toBe('general-baseline')
    expect(report.figures.map((f) => f.key)).not.toContain('exitDoorClearWidth')
  })

  it('never says a plan complies', () => {
    expect(LOOKUP_NOTICE).not.toMatch(/\b(comply|complies|passes|approved|meets)\b/i)
    expect(LOOKUP_NOTICE.trim()).toBe(LOOKUP_NOTICE)
  })
})

describe('a plan for a country the carried figures do not cover', () => {
  it('runs no figure check on US figures, and says so once for each check', () => {
    const report = checkLocalRules(withBedroom(), { country: 'es' })
    expect(report.figures).toEqual([])
    expect(report.rules).toEqual(PLAN_RULES)
    expect(report.findings.filter((f) => f.figures !== undefined)).toEqual([])
    expect(report.notChecked.filter((n) => n.reason === 'no_figures_for_place')).toEqual([
      {
        reason: 'no_figures_for_place',
        ruleId: 'habitable-room-area',
        floor: '',
        rooms: [],
        openings: [],
        message: 'Room sizes were not checked: the figures here are from US model codes, and this plan is for ES'
      },
      {
        reason: 'no_figures_for_place',
        ruleId: 'escape-opening',
        floor: '',
        rooms: [],
        openings: [],
        message: 'Escape openings were not checked: the figures here are from US model codes, and this plan is for ES'
      }
    ])
  })

  it('still runs the plan checks of the core, which need no figure', () => {
    const trapped = withoutOpening(withBedroom(), 'd_hb')
    const plan = (options?: Parameters<typeof checkLocalRules>[1]) =>
      checkLocalRules(trapped, options).findings.filter((f) => f.figures === undefined && f.ruleId !== 'escape-opening')
    expect(plan({ country: 'ES' })).toEqual(plan())
    expect(plan().length).toBeGreaterThan(0)
  })

  it('runs a check on the figures that were looked up for the place, and only those', () => {
    const report = checkLocalRules(withBedroom(), { country: 'IT', figures: { habitableRoomMinArea: { value: 30, source } } })
    expect(report.figures.map((f) => [f.key, f.origin])).toEqual([['habitableRoomMinArea', 'lookup']])
    expect(report.rules.map((r) => r.id)).toEqual([...PLAN_RULES.map((r) => r.id), 'habitable-room-area'])
    expect(report.findings.filter((f) => f.code === 'room_too_small')).toHaveLength(1)
    expect(report.notChecked.filter((n) => n.reason === 'no_figures_for_place').map((n) => n.message)).toEqual([
      'Escape openings were not checked: the figures here are from US model codes, and this plan is for IT'
    ])
    // Not listed: the escape check, and the stairs check (LVL-3), which finds no stair room here.
    expect(RULES.length).toBe(report.rules.length + 2)
  })
})

describe('figuresFromSheet', () => {
  it('maps the kept figures with their source and time, and nothing else', () => {
    const sheet = {
      figures: {
        routeMinWidth: { value: 1.2, unit: 'm', sourceUrl: source.url, quote: 'sample: 1.20 m', retrievedAt: source.retrievedAt },
        habitableRoomMinArea: { value: 9, unit: 'm²', sourceUrl: source.url, quote: '9 m2', retrievedAt: source.retrievedAt }
      },
      dropped: [{ key: 'exitDoorClearWidth', reason: 'out_of_range' }],
      notFound: ['escapeOpeningMaxSill']
    }
    expect(figuresFromSheet(sheet)).toEqual({
      routeMinWidth: { value: 1.2, source: { url: source.url, quote: 'sample: 1.20 m', retrievedAt: source.retrievedAt } },
      habitableRoomMinArea: { value: 9, source: { url: source.url, quote: '9 m2', retrievedAt: source.retrievedAt } }
    })
  })

  it('gives no figures for a sheet with none', () => {
    expect(figuresFromSheet({ figures: {} })).toEqual({})
  })
})
