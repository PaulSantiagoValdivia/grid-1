/**
 * CNT-17: a plan that marks rooms or routes as needing to be accessible gets one line saying they
 * were not checked, never a line that says they are accessible or that the plan complies.
 */
import { describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL, inspectPlan } from '../..'

const ROOM = {
  version: '1',
  units: 'm',
  walls: [
    { id: 's', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
    { id: 'e', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
    { id: 'n', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
    { id: 'w', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
  ],
  rooms: [{ id: 'bath', name: 'Bathroom', use: 'bathroom', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [{ id: 'd1', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }],
}

describe('what the plan marks as needing to be accessible (CNT-17)', () => {
  it('is said once as not checked, with what is marked, and no other line changes', () => {
    const plain = inspectPlan(ROOM)
    const marked = inspectPlan({ ...ROOM, accessible: { rooms: ['bath'], routes: [{ to: 'bath' }, { from: 'bath', to: 'bath' }] } })
    expect(plain.lines.some((l) => l.code === 'plan/not-checked-access')).toBe(false)
    const line = marked.lines.find((l) => l.code === 'plan/not-checked-access')!
    expect(line).toMatchObject({
      kind: 'not-checked',
      thing: { kind: 'plan', id: '' },
      message: 'What the plan marks as needing to be accessible (1 room and 2 routes) was not checked: Grid holds no figure for it that a named person has confirmed',
      found: '1 room and 2 routes marked as needing to be accessible',
      fix: 'Nothing to change in the plan: grid_measure what=access measures the doors, corridors, turning space and steps of what is marked, as numbers, against the person\'s own figures.',
    })
    expect(line.also).toEqual(['bath'])
    expect(marked.lines.filter((l) => l.code !== 'plan/not-checked-access')).toEqual(plain.lines)
    expect(marked.label).toBe(GENERAL_GUIDANCE_LABEL)
  })

  it('says nothing for an empty mark', () => {
    expect(inspectPlan({ ...ROOM, accessible: {} }).lines.some((l) => l.code === 'plan/not-checked-access')).toBe(false)
  })

  it('never reads as approval, and never says the plan is accessible (MSG-3)', () => {
    const marked = inspectPlan({ ...ROOM, accessible: { rooms: ['bath'] } })
    for (const l of marked.lines) {
      const text = `${l.message} ${l.found} ${l.needed} ${l.fix}`
      expect(approvalWords(text)).toEqual([])
      expect(text).not.toMatch(/\b(is|are) accessible\b/i)
    }
  })
})
