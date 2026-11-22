import { describe, expect, it } from 'vitest'
import { refurbishment } from '@ongrid/floorplan/test-support/phases'
import { flat } from '@ongrid/floorplan/test-support/plans'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '../planSvg'
import { LOOKS, LOOK_NAMES } from '../look'

/**
 * CNT-10 (done when 1): a plan with phases is drawn as a demolition and new-work drawing is, in
 * every look: what is to be demolished as a dashed outline with no fill, what is new filled, what
 * stays in its tone; and the key says which is which.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
const attr = (tag: string, name: string): string | undefined => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]

describe('a plan with phases in the 2D picture', () => {
  for (const name of LOOK_NAMES) {
    const look = LOOKS[name]
    it(`draws demolished parts dashed and new parts filled in the ${name} look`, () => {
      const svg = planToSvg(refurbishment(), { look: name })
      const demolished = parts(svg, 'demolished-wall')
      expect(demolished.map((p) => attr(p, 'data-id'))).toEqual(['wk', 'wk'])
      for (const p of demolished) {
        expect(attr(p, 'fill')).toBe('none')
        expect(attr(p, 'stroke')).toBe(look.phases.demolished)
        expect(attr(p, 'stroke-dasharray')).toMatch(/^[\d.]+ [\d.]+$/)
      }
      const openings = parts(svg, 'demolished-opening')
      expect(openings.map((p) => attr(p, 'data-id')).sort()).toEqual(['d-bath-old', 'd-kitchen', 'win-south-old'])
      for (const p of openings) expect(attr(p, 'stroke-dasharray')).toBeDefined()
      const walls = parts(svg, 'wall')
      const fillOf = (id: string) => walls.filter((p) => attr(p, 'data-id') === id).map((p) => [attr(p, 'data-phase'), attr(p, 'fill')])
      const solid = name === 'technical' ? '#000000' : look.colors.wall
      expect(fillOf('wst')[0]).toEqual(['new', look.phases.new ?? solid])
      expect(fillOf('wx')[0]).toEqual(['existing', look.phases.existing ?? look.colors.wall])
      expect(fillOf('wst')[0]![1]).not.toBe(fillOf('wx')[0]![1])
      // The demolished wall is no wall of the drawing after the work, and has no sizes of its own.
      expect(walls.some((p) => attr(p, 'data-id') === 'wk')).toBe(false)
      expect(svg).toContain('To be demolished')
      expect(svg).toContain('New wall')
      expect(svg).toContain('Existing wall')
    })
  }

  it('draws a plan with no phases as before: no phase, no key', () => {
    const svg = planToSvg(parseFloorPlan(flat()), { look: 'technical' })
    expect(svg).not.toContain('data-phase')
    expect(svg).not.toContain('demolished')
    expect(svg).not.toContain('Existing wall')
  })
})
