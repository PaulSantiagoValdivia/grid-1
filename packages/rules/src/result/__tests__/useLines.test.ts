/**
 * CNT-13: the fixtures in `grid check`'s one list. A door that swings into a fixture names it
 * (S-8), and a fixture in front of a doorway or a window says what it measured, with what depth,
 * as an indicator. No line reads as a pass (MSG-3).
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Item, Opening } from '@ongrid/floorplan/geometry'
import { approvalWords, GENERAL_GUIDANCE_LABEL, inspectPlan } from '../..'

function kitchen(items: Item[], openings: Opening[]): FloorPlan {
  const corners: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]]
  const walls = corners.map((start, i) => ({ id: `w${i + 1}`, start, end: corners[(i + 1) % 4]!, thickness: 0.2, height: 2.7, kind: 'exterior' as const }))
  return { version: '1', units: 'm', walls, rooms: [{ id: 'r1', name: 'Kitchen', use: 'kitchen', boundary: ['w1', 'w2', 'w3', 'w4'] }], openings, items }
}

const door: Opening = { id: 'd1', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }
const window_: Opening = { id: 'win', wall: 'w3', type: 'window', offset: 1, width: 1.2, sill: 0.8, height: 1.2 }
const table: Item = { id: 'table-2', kind: 'kitchen-run', label: 'Table 2', at: [1.5, 0.8], size: [0.8, 0.5], height: 0.75 }
const run: Item = { id: 'run', kind: 'kitchen-run', at: [1.8, 2.6], size: [1.2, 0.6], height: 0.9, turn: 180 }
const wc: Item = { id: 'wc', kind: 'toilet', at: [1.8, 0.4], size: [0.4, 0.6], height: 0.8 }

const lineOf = (plan: FloorPlan, code: string) => inspectPlan(plan).lines.find((l) => l.code === code)

describe('a door swing that hits a fixture (S-8)', () => {
  it('names "Table 2", not a wall, and lists it in also', () => {
    const line = lineOf(kitchen([table], [door]), 'opening/door-hits-item')!
    expect(line).toMatchObject({ kind: 'worth-a-look', thing: { kind: 'opening', id: 'd1' }, also: ['table-2'] })
    expect(line.message).toBe('Door "d1" hits "Table 2" (kitchen run "table-2") when it opens')
    expect(line.message).not.toMatch(/wall/)
    expect(line.found).toBe('its leaf sweeps the floor where that fixture stands')
    expect(line.fix).toMatch(/move the fixture out of its swing/)
  })
})

describe('a fixture in front of a doorway or a window', () => {
  it('says what it covers of the doorway and what clear width is left, within Grid\'s own depth, as an indicator', () => {
    const line = lineOf(kitchen([wc], [{ ...door, hinge: undefined, swing: undefined }]), 'item/blocks-doorway')!
    expect(line).toMatchObject({ kind: 'worth-a-look', thing: { kind: 'item', id: 'wc' }, also: ['d1'] })
    expect(line.message).toBe('Toilet "wc" stands in front of the doorway of "d1", an indicator')
    expect(line.found).toBe('Toilet "wc" stands in front of door "d1": it covers 0.30 m of its 0.90 m hole, and the doorway leaves 0.55 m clear, less 0.05 m for the open leaf. Measured within Grid\'s own approach depth of 0.30 m: an indicator, not a rule.')
  })

  it('says how much of a window a fixture higher than its sill covers, and nothing for one lower', () => {
    const line = lineOf(kitchen([run], [door, window_]), 'item/blocks-window')!
    expect(line).toMatchObject({ kind: 'worth-a-look', thing: { kind: 'item', id: 'run' }, also: ['win'] })
    expect(line.message).toBe('Kitchen run "run" stands in front of window "win", higher than its sill, an indicator')
    expect(line.found).toContain('0.90 m high, stands in front of window "win", whose sill is at 0.80 m: it covers 0.60 m of the window\'s 1.20 m')
    expect(line.found).toContain('an indicator, not a rule')
    expect(lineOf(kitchen([run], [door, { ...window_, sill: 1 }]), 'item/blocks-window')).toBeUndefined()
  })

  it('adds no line to a plan without fixtures', () => {
    const codes = inspectPlan(kitchen([], [door, window_])).lines.map((l) => l.code)
    expect(codes.filter((c) => /door-hits-item|blocks-/.test(c))).toEqual([])
  })

  it('keeps the label, and no line reads as a pass', () => {
    const result = inspectPlan(kitchen([table, run, wc], [door, window_]))
    expect(result.label).toBe(GENERAL_GUIDANCE_LABEL)
    for (const line of result.lines) expect(approvalWords([line.message, line.found, line.needed, line.fix].join(' | ')), line.code).toEqual([])
  })
})
