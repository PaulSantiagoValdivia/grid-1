import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { changesOutsideScope, diffPlans } from '../diff'
import { edit, opening, plan, room, wall, withWall } from './diff-fixtures'

/**
 * The ground floor of a test house, 10 × 8 m: the open kitchen
 * and living room on the west, the guest WC south-east and the study north-east. `g-w9` divides
 * the living room from the study; `g-w6` is the living room's north wall and meets it at (6.5, 8).
 */
function house(): FloorPlan {
  return plan({
    walls: [
      wall('g-w1', [0, 0], [6.5, 0], { kind: 'exterior' }),
      wall('g-w2', [6.5, 0], [10, 0], { kind: 'exterior' }),
      wall('g-w3', [10, 0], [10, 2.5], { kind: 'exterior' }),
      wall('g-w4', [10, 2.5], [10, 8], { kind: 'exterior' }),
      wall('g-w5', [10, 8], [6.5, 8], { kind: 'exterior' }),
      wall('g-w6', [6.5, 8], [0, 8], { kind: 'exterior' }),
      wall('g-w7', [0, 8], [0, 0], { kind: 'exterior' }),
      wall('g-w8', [6.5, 0], [6.5, 2.5], { thickness: 0.14 }),
      wall('g-w9', [6.5, 2.5], [6.5, 8], { thickness: 0.14 }),
      wall('g-w10', [6.5, 2.5], [10, 2.5], { thickness: 0.14 })
    ],
    rooms: [
      room('g-r1', 'Open kitchen and living room', ['g-w1', 'g-w8', 'g-w9', 'g-w6', 'g-w7']),
      room('g-r2', 'Guest WC', ['g-w2', 'g-w3', 'g-w10', 'g-w8']),
      room('g-r3', 'Study', ['g-w10', 'g-w4', 'g-w5', 'g-w9'])
    ],
    openings: [opening('g-o3', 'g-w6', 'window', 2, 2.4), opening('g-o10', 'g-w9', 'door', 1, 0.9)]
  })
}

/** "Make the study bigger": its west wall 0.5 m west, the walls meeting it follow. */
function biggerStudy(source: FloorPlan): FloorPlan {
  return edit(source, (copy) => {
    const find = (id: string) => copy.walls.find((w) => w.id === id)!
    find('g-w9').start = [6, 2.5]
    find('g-w9').end = [6, 8]
    find('g-w10').start = [6, 2.5]
    find('g-w5').end = [6, 8]
    find('g-w6').start = [6, 8]
  })
}

function outside(base: FloorPlan, head: FloorPlan): string[] {
  return changesOutsideScope(diffPlans(base, head), base, head, { rooms: ['g-r3'] }).changes.map(
    (change) => change.id
  )
}

describe('a wall trimmed to stay joined to a wall inside the area', () => {
  it('is not returned, nor the window that moved with it', () => {
    const base = house()
    expect(outside(base, biggerStudy(base))).toEqual([])
  })

  it('is returned when it also got thicker', () => {
    const base = house()
    const head = withWall(biggerStudy(base), 'g-w6', { thickness: 0.3 })
    expect(outside(base, head)).toContain('wall:g-w6:modified')
  })

  it('is returned when it also moved sideways', () => {
    const base = house()
    const head = withWall(biggerStudy(base), 'g-w6', { start: [6, 8.2], end: [0, 8.2] })
    expect(outside(base, head)).toContain('wall:g-w6:modified')
  })

  it('is returned when the wall it meets is outside the area too', () => {
    // g-w7 is the living room's west wall: trimming g-w1 to meet a moved g-w7 was not asked for.
    const base = house()
    const head = edit(base, (copy) => {
      const find = (id: string) => copy.walls.find((w) => w.id === id)!
      find('g-w7').start = [0.5, 8]
      find('g-w7').end = [0.5, 0]
      find('g-w1').start = [0.5, 0]
    })
    expect(outside(base, head)).toEqual(expect.arrayContaining(['wall:g-w1:modified', 'wall:g-w7:modified']))
  })

  it('is returned when it stopped meeting the wall', () => {
    // Shortened by 1 m, past the moved study wall: a gap, not a join.
    const base = house()
    const head = withWall(biggerStudy(base), 'g-w6', { start: [5, 8] })
    expect(outside(base, head)).toContain('wall:g-w6:modified')
  })
})
