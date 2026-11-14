import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { checkLocalRules } from '..'
import { door, edit, flat, twoFloorHouse, withOpening, withoutOpening } from './fixtures'

const unnamed = (plan: FloorPlan): FloorPlan =>
  edit(plan, (copy) => {
    for (const r of copy.rooms) r.name = ''
  })

/** One plan per code, plus not-checked notices of both kinds. */
const plans: [string, FloorPlan][] = [
  ['no exit', withoutOpening(flat(), 'front')],
  ['no door', withoutOpening(flat(), 'd_bb')],
  ['no route', withoutOpening(flat(), 'd_hb')],
  [
    'door to an undrawn space',
    edit(withOpening(flat(), door('back', 'e1', 1.5)), (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'hall')
    })
  ],
  ['no stairs', twoFloorHouse()],
  [
    'cannot be drawn',
    edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 'bb')!.thickness = 0
    })
  ]
]

const FORBIDDEN = /\b(id|ids|virtual|boundary|entity|entities|complies|comply|passes|passed|approved)\b/i

describe.each(plans)('the messages for %s', (_name, plan) => {
  const lines = (p: FloorPlan) => {
    const report = checkLocalRules(p)
    return [...report.findings, ...report.notChecked].map((f) => f.message)
  }

  it('are plain language, with no data-model or compliance words', () => {
    expect(lines(plan).length).toBeGreaterThan(0)
    for (const line of lines(plan)) {
      expect(line).not.toMatch(FORBIDDEN)
      expect(line.trim()).toBe(line)
      expect(line).not.toContain('\n')
    }
  })

  it('name rooms by their names, or by what the plan calls them when they have none', () => {
    const report = checkLocalRules(plan)
    const names = new Map(plan.rooms.map((r) => [r.id, r.name] as const))
    // The rooms without a use are counted, not named: a list of names
    // in the footer would grow with every room of the plan.
    const named = (items: typeof report.notChecked) => items.filter((n) => n.reason !== 'no_use')
    for (const item of [...report.findings, ...named(report.notChecked)]) {
      for (const room of item.rooms) expect(item.message).toContain(names.get(room))
    }
    for (const item of report.notChecked.filter((n) => n.reason === 'no_use')) {
      expect(item.message).toContain(String(item.rooms.length))
    }
    const bare = checkLocalRules(unnamed(plan))
    for (const item of [...bare.findings, ...named(bare.notChecked)]) {
      for (const room of item.rooms) expect(item.message).toContain(room)
    }
  })
})
