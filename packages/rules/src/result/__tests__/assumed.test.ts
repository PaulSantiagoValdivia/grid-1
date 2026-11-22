/**
 * WRT-6 (lab WR-15): what the plan marks assumed is listed for the person to confirm, as lines
 * of their own kind, last, so the other lines keep their numbers.
 */
import { describe, expect, it } from 'vitest'
import { inspectPlan } from '../..'
import { flat } from '@ongrid/floorplan/test-support/plans'

const withMarks = (marks: unknown[]): Record<string, unknown> => ({ ...flat(), marks })

describe('what was assumed, in the result record (WRT-6)', () => {
  it('gives each assumed value a to-confirm line, last, on its part', () => {
    const before = inspectPlan(flat())
    const result = inspectPlan(withMarks([
      { part: 'wall', id: 's1', value: 'height', source: 'assumed' },
      { part: 'room', id: 'kitchen', source: 'assumed', tolerance: 0.05 },
      { part: 'room', id: 'bedroom', value: 'use', source: 'given' },
    ]))
    const confirm = result.lines.filter((l) => l.kind === 'to-confirm')
    expect(confirm.map((l) => [l.code, l.thing.kind, l.thing.id, l.floor])).toEqual([
      ['plan/value-assumed', 'wall', 's1', 'ground'],
      ['plan/value-assumed', 'room', 'kitchen', 'ground'],
    ])
    expect(confirm[0]!.message).toBe('The height of Wall "s1" was assumed, not given or measured')
    expect(confirm[1]!.message).toBe('Room "Kitchen" was assumed, not given or measured')
    expect(confirm[1]!.found).toBe('marked assumed in the plan\'s marks, give or take 0.05 m')
    expect(result.counts['to-confirm']).toBe(2)
    expect(result.count).toBe(before.count + 2)
    // Last: every other line keeps its number.
    expect(result.lines.slice(0, before.count)).toEqual(before.lines)
  })

  it('names a mark on a part the plan does not have, and lists nothing to confirm for it', () => {
    const result = inspectPlan(withMarks([{ part: 'opening', id: 'patio', source: 'assumed' }]))
    expect(result.lines.filter((l) => l.kind === 'to-confirm')).toEqual([])
    const line = result.lines.find((l) => l.code === 'plan/mark-no-part')
    expect(line).toMatchObject({ kind: 'worth-a-look', thing: { kind: 'plan', id: '' }, also: ['patio'] })
    expect(line!.message).toBe('A mark names Opening "patio", which the plan does not have, so the mark is not read')
  })

  it('has nothing to confirm in a plan with no marks', () => {
    expect(inspectPlan(flat()).counts['to-confirm']).toBe(0)
  })
})
