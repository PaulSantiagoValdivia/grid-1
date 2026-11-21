import { describe, expect, it } from 'vitest'
import { checkLocalRules as checkPlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { FIGURE_RULES, checkLocalRules } from '..'
import { door, edit, flat, longWallStrip, madeVirtual, twoFloorHouse, withOpening, withoutOpening } from '@ongrid/floorplan/test-support/plans'

/**
 * The full check is the core's plan check with more in it: nothing the core reports is lost,
 * reworded or reordered, and what is added is only what the figure checks give.
 */

const FIGURE_CODES = ['room_too_small', 'no_escape_opening', 'escape_window_too_small', 'escape_window_too_high']

/** Every room a bedroom, so the size and escape checks have something to say. */
const allBedrooms = (plan: FloorPlan): FloorPlan =>
  edit(plan, (copy) => {
    for (const r of copy.rooms) r.use = 'bedroom'
  })

/** The front door stating that it opens into the hall. */
const inward = (plan: FloorPlan): FloorPlan =>
  edit(plan, (copy) => {
    Object.assign(copy.openings.find((o) => o.id === 'front')!, { hinge: 'start', swing: 'left' })
  })

const plans: [string, FloorPlan][] = [
  ['the flat', flat()],
  ['the flat, every room a bedroom', allBedrooms(flat())],
  ['the flat with no front door', withoutOpening(flat(), 'front')],
  ['the flat with a trapped bedroom', withoutOpening(allBedrooms(flat()), 'd_hb')],
  ['the flat with an inward front door', inward(allBedrooms(flat()))],
  ['the flat with an open kitchen', madeVirtual(flat(), 'hk')],
  [
    'the flat with a wall that cannot be drawn',
    edit(allBedrooms(flat()), (copy) => {
      copy.walls.find((w) => w.id === 'bb')!.thickness = 0
    })
  ],
  [
    'the flat with a door to an undrawn space',
    edit(withOpening(flat(), door('back', 'e1', 1.5)), (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'hall')
    })
  ],
  ['the two-floor house', twoFloorHouse()],
  ['the two-floor house, every room a bedroom', allBedrooms(withoutOpening(twoFloorHouse(), 'd_up'))],
  ['the long-wall strip', allBedrooms(longWallStrip())],
  ['an empty plan', { version: '1', units: 'm', walls: [], rooms: [], openings: [] }]
]

describe.each(plans)('the full report for %s', (_name, plan) => {
  const full = checkLocalRules(plan)
  const core = checkPlan(plan)

  it('keeps every plan-check finding, in the same order, adding only the cited figure', () => {
    const kept = full.findings
      .filter((f) => !FIGURE_CODES.includes(f.code))
      .map((finding) => Object.fromEntries(Object.entries(finding).filter(([key]) => key !== 'figure')))
    expect(kept).toEqual(core.findings)
  })

  it('keeps every plan-check notice, in the same order, adding only the rooms without a use', () => {
    expect(full.notChecked.filter((n) => n.reason !== 'no_use')).toEqual(core.notChecked)
    expect(full.notChecked.length - core.notChecked.length).toBe(full.notChecked.filter((n) => n.reason === 'no_use').length)
  })

  it('has the same shape, with the two figure rules after the six of the core', () => {
    expect(full.schemaVersion).toBe(core.schemaVersion)
    expect(full.basis).toBe(core.basis)
    expect(full.label).toBe(core.label)
    expect(full.rules).toEqual([...core.rules, ...FIGURE_RULES])
    expect(JSON.parse(JSON.stringify(full))).toEqual(full)
  })

  it('names, on every figure finding, a rule the report lists', () => {
    const listed = new Set(full.rules.map((r) => r.id))
    for (const finding of full.findings) expect(listed.has(finding.ruleId), finding.code).toBe(true)
  })
})

describe('one call', () => {
  it('gives the findings of both kinds', () => {
    const codes = checkLocalRules(withoutOpening(allBedrooms(flat()), 'd_hb')).findings.map((f) => f.code)
    expect(codes).toContain('no_route_to_exit')
    expect(codes).toContain('no_escape_opening')
  })

  it('leaves the plan it was given untouched', () => {
    const plan = allBedrooms(twoFloorHouse())
    const before = JSON.stringify(plan)
    checkLocalRules(plan)
    expect(JSON.stringify(plan)).toBe(before)
  })
})
