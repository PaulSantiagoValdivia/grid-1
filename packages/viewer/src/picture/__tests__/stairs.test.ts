import { describe, expect, it } from 'vitest'
import { stairHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { planToSvg } from '../planSvg'
import { LIGHT_LOOK } from '../look'

/**
 * LVL-3: a stair the plan states, in the 2D picture that `planToSvg` and the app's canvas share
 * (`scene.ts`): its flight in outline, a line at every riser, and its walking line ending in an
 * arrow pointing up, on both floors it joins. The geometry is the core's (`planStairs`).
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

describe('a stair in the 2D picture', () => {
  it('is drawn on its lower floor with a line at each of its 14 risers and an arrow', () => {
    const svg = planToSvg(stairHouse(), { floor: 'ground' })
    const stair = parts(svg, 'stair')
    expect(stair).toHaveLength(1)
    expect(stair[0]).toContain('data-id="s1"')
    expect(stair[0]).toContain('data-end="lower"')
    expect(parts(svg, 'stair-riser')).toHaveLength(14)
    expect(parts(svg, 'stair-outline')).toHaveLength(1)
    expect(parts(svg, 'stair-arrow')).toHaveLength(1)
    expect(parts(svg, 'stair-line')[0]).toContain(`stroke="${LIGHT_LOOK.wall}"`)
  })

  it('is drawn on its upper floor too', () => {
    expect(parts(planToSvg(stairHouse(), { floor: 'first' }), 'stair')[0]).toContain('data-end="upper"')
  })

  it('is not drawn in a plan that states none', () => {
    expect(parts(planToSvg(twoFloorHouse(), { floor: 'ground' }), 'stair')).toEqual([])
  })
})
