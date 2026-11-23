import { describe, expect, it } from 'vitest'
import { basementCarPark } from '@ongrid/floorplan/test-support/parking'
import { planToSvg } from '../planSvg'

/**
 * CNT-19 (lab EL-11): parking bays and a ramp in the 2D picture, in the working look and the
 * technical one, through the one drawing function (`planScene`): each bay its marking and its
 * number, the ramp its outline, its middle line with an arrow pointing up and its slope.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

const texts = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<text [^>]*data-part="${part}"[^>]*>([^<]*)</text>`, 'g'))].map((m) => m[1]!)

describe('parking bays and ramps in the 2D picture', () => {
  for (const look of ['working', 'technical'] as const) {
    it(`draws the basement's 16 bays with their numbers and the ramp with its slope, in the ${look} look`, () => {
      const svg = planToSvg(basementCarPark(), { look, floor: 'B1' })
      expect(parts(svg, 'bay')).toHaveLength(16)
      expect(texts(svg, 'bay-number').sort((a, b) => Number(a) - Number(b))).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)))
      expect(parts(svg, 'ramp')).toHaveLength(1)
      expect(parts(svg, 'ramp')[0]).toContain('data-end="lower"')
      expect(parts(svg, 'ramp-arrow')).toHaveLength(1)
      expect(texts(svg, 'ramp-slope')).toEqual(['16.7 %'])
    })
  }

  it('draws the ramp on the floor it arrives on too, and no bay there', () => {
    const svg = planToSvg(basementCarPark(), { floor: 'ground' })
    expect(parts(svg, 'bay')).toHaveLength(0)
    expect(parts(svg, 'ramp')[0]).toContain('data-end="upper"')
  })

  it('writes the slope with the decimal mark of the plan\'s language', () => {
    const svg = planToSvg(basementCarPark({ display: { language: 'es' } }), { floor: 'B1' })
    expect(texts(svg, 'ramp-slope')).toEqual(['16,7 %'])
  })
})
