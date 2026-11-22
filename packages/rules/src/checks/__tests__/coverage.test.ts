/**
 * MSG-2: every check Grid has says what it looked at. A check added without its coverage fails
 * here, so it cannot run in silence.
 */
import { describe, expect, it } from 'vitest'
import { RULES as PLAN_RULES } from '@ongrid/floorplan/geometry'
import { edit, flat, twoFloorHouse, withoutOpening } from '@ongrid/floorplan/test-support/plans'
import { checkLocalRules, LOOKS_AT, RULES, skipWhy } from '..'
import type { SkipReason } from '../types'

const REASONS: SkipReason[] = ['no_place', 'cannot_be_drawn', 'no_stairs', 'way_out_not_drawn', 'no_use', 'no_figures_for_place', 'above_escape_storeys', 'no_rooms', 'alone_off_ground', 'use_not_covered']

describe('what each check looked at', () => {
  it('knows what every check looks at, the core plan checks among them', () => {
    expect(Object.keys(LOOKS_AT).sort()).toEqual(RULES.map((r) => r.id).sort())
    for (const rule of PLAN_RULES) expect(Object.hasOwn(LOOKS_AT, rule.id), rule.id).toBe(true)
  })

  it('words every reason, plainly, never as a pass', () => {
    for (const reason of REASONS) {
      for (const rule of RULES) {
        const why = skipWhy(reason, rule.id)
        expect(why.length).toBeGreaterThan(0)
        expect(why).not.toMatch(/\b(comply|complies|approved|passes|fine|ok)\b/i)
      }
    }
  })

  it('in a country with no figures, says every room was skipped by the figure checks for that reason', () => {
    const report = checkLocalRules(flat(), { country: 'ES' })
    for (const id of ['habitable-room-area', 'escape-opening']) {
      const c = report.coverage.find((x) => x.ruleId === id)!
      expect(c.lookedAtCount).toBe(0)
      expect(c.skipped.map((s) => s.reason)).toEqual(['no_figures_for_place'])
      expect(c.skippedCount).toBe(flat().rooms.length)
    }
  })

  it('with no place stated, says every room was skipped by the figure checks for that reason (COD-3)', () => {
    const report = checkLocalRules(flat())
    for (const id of ['habitable-room-area', 'escape-opening']) {
      const c = report.coverage.find((x) => x.ruleId === id)!
      expect(c.lookedAtCount).toBe(0)
      expect(c.skipped.map((s) => [s.reason, s.why])).toEqual([['no_place', 'no place is stated, so no figure was applied']])
      expect(c.skippedCount).toBe(flat().rooms.length)
      expect(c.readFor).toBeUndefined()
    }
  })

  it('upstairs with no stairs: the routes skip the floor, the doors are still looked at', () => {
    const report = checkLocalRules(withoutOpening(twoFloorHouse(), 'd_up'))
    const routes = report.coverage.find((c) => c.ruleId === 'room-reaches-exit')!
    expect(routes.skipped.filter((s) => s.reason === 'no_stairs').length).toBeGreaterThan(0)
    const door = report.coverage.find((c) => c.ruleId === 'room-has-door')!
    expect(door.lookedAtCount + door.skippedCount).toBe(twoFloorHouse().rooms.length)
  })

  it('a room that cannot be drawn is skipped by every room check, for that reason', () => {
    const broken = edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 'bb')!.thickness = 0
    })
    // COD-3: the US stated, so the figure checks run and skip the room too.
    const report = checkLocalRules(broken, { country: 'US' })
    const left = report.notChecked.find((n) => n.reason === 'cannot_be_drawn')!.rooms
    expect(left.length).toBeGreaterThan(0)
    for (const c of report.coverage.filter((x) => x.looksAt === 'room')) {
      const skipped = c.skipped.filter((s) => s.reason === 'cannot_be_drawn').flatMap((s) => s.ids)
      expect(skipped, c.ruleId).toEqual([...left].sort())
    }
  })
})
