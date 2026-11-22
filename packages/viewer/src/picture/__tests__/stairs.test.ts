import { describe, expect, it } from 'vitest'
import { stairHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { planToSvg } from '../planSvg'
import { LIGHT_LOOK } from '../look'

/**
 * LVL-3: a stair the plan states, in the 2D picture that `planToSvg` and the app's canvas share
 * (`scene.ts`): its flight in outline, a line at every riser, and its walking line ending in an
 * arrow pointing up, on both floors it joins. SHT-11: on its lower floor it is cut, with a break
 * line, and dashed above the cut. The geometry is the core's (`planStairs`, `stairSymbol`).
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

describe('a stair in the 2D picture', () => {
  it('is drawn on its lower floor cut at 1.2 m: solid below a break line, dashed above, with an arrow (SHT-11)', () => {
    const svg = planToSvg(stairHouse(), { floor: 'ground' })
    const stair = parts(svg, 'stair')
    expect(stair).toHaveLength(1)
    expect(stair[0]).toContain('data-id="s1"')
    expect(stair[0]).toContain('data-end="lower"')
    // 14 risers: 4 below the break, 2 it crosses (each in two pieces) and 8 above it.
    const risers = parts(svg, 'stair-riser')
    expect(risers).toHaveLength(16)
    expect(risers.filter((r) => !r.includes('data-above'))).toHaveLength(6)
    expect(risers.filter((r) => r.includes('data-above="true"') && r.includes('stroke-dasharray'))).toHaveLength(10)
    expect(parts(svg, 'stair-break')).toHaveLength(1)
    expect(parts(svg, 'stair-arrow')).toHaveLength(1)
    // The walking line in two: solid up to the break, dashed past it.
    expect(parts(svg, 'stair-line')).toHaveLength(2)
    expect(parts(svg, 'stair-line')[0]).toContain(`stroke="${LIGHT_LOOK.wall}"`)
  })

  it('is drawn whole on its upper floor: every riser solid, no break', () => {
    const svg = planToSvg(stairHouse(), { floor: 'first' })
    expect(parts(svg, 'stair')[0]).toContain('data-end="upper"')
    expect(parts(svg, 'stair-riser')).toHaveLength(14)
    expect(svg).not.toContain('data-above')
    expect(parts(svg, 'stair-break')).toEqual([])
    expect(parts(svg, 'stair-outline')).toHaveLength(1)
    expect(parts(svg, 'stair-arrow')).toHaveLength(1)
  })

  it('is not drawn in a plan that states none', () => {
    expect(parts(planToSvg(twoFloorHouse(), { floor: 'ground' }), 'stair')).toEqual([])
  })
})
