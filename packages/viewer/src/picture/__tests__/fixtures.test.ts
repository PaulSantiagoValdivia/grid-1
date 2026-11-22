import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { planToSvg } from '../planSvg'
import { LIGHT_LOOK } from '../look'

/**
 * CNT-12: fixtures in the 2D picture, which `planToSvg` and the app's canvas share (`scene.ts`):
 * each kind's symbol to scale inside its footprint, in the wall ink on the paper, over the room
 * fills and under the walls, and never a wall or a room of its own.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

const fitted = (): FloorPlan => ({
  ...flat(),
  items: [
    { id: 'run', kind: 'kitchen-run', at: [6.6, 0.4], size: [3, 0.6], height: 0.9 },
    { id: 'bath', kind: 'bath', at: [8.95, 7.55], size: [1.7, 0.7], height: 0.55, turn: 180 },
    { id: 'wc', kind: 'toilet', at: [9.575, 5], size: [0.4, 0.65], height: 0.8, turn: 90 },
    { id: 'shower', kind: 'shower', at: [5.55, 4.55], size: [0.9, 0.9], height: 0.1 }
  ]
})

describe('fixtures in the 2D picture', () => {
  it('draws each fixture as its symbol, over the room fills and under the walls', () => {
    const svg = planToSvg(fitted())
    const groups = parts(svg, 'fixture')
    expect(groups.map((g) => /data-id="([^"]+)"/.exec(g)?.[1])).toEqual(['run', 'bath', 'wc', 'shower'])
    expect(groups[2]).toContain('data-kind="toilet"')
    expect(groups[2]).toContain('data-room="bathroom"')
    for (const ring of parts(svg, 'fixture-ring')) {
      expect(ring).toContain(`fill="${LIGHT_LOOK.paper}"`)
      expect(ring).toContain(`stroke="${LIGHT_LOOK.wall}"`)
    }
    // The shower's two diagonals.
    expect(parts(svg, 'fixture-line')).toHaveLength(2)
    expect(svg.indexOf('data-part="fixture"')).toBeGreaterThan(svg.lastIndexOf('data-part="room"'))
    expect(svg.indexOf('data-part="fixture"')).toBeLessThan(svg.indexOf('data-part="wall"'))
  })

  it('adds no room and no wall, and a plan without fixtures draws as it did', () => {
    const svg = planToSvg(fitted())
    expect(parts(svg, 'room')).toHaveLength(parts(planToSvg(flat()), 'room').length)
    expect(parts(svg, 'wall')).toHaveLength(parts(planToSvg(flat()), 'wall').length)
    expect(planToSvg({ ...flat(), items: [] })).toBe(planToSvg(flat()))
    expect(planToSvg(flat())).not.toContain('fixture')
  })

  it('leaves out a piano, a kind Grid does not hold (CNT-20: a table is furniture now)', () => {
    const svg = planToSvg({ ...flat(), items: [{ id: 't1', kind: 'piano', at: [2, 6], size: [1.6, 0.9], height: 0.75 }] })
    expect(parts(svg, 'fixture')).toEqual([])
  })
})
