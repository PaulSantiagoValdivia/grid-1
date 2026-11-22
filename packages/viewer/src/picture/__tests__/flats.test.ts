import { describe, expect, it } from 'vitest'
import { duplexHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { planToSvg } from '../planSvg'
import { LIGHT_LOOK } from '../look'

/**
 * SHT-11 with CNT-4: each flat the plan lists is drawn as its outline, a chain line along the
 * middle of the walls round its rooms, in the paper's colour over the walls and under the
 * openings. The outline is the core's (`flatOutlines`); a duplex is drawn on each of its floors.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

describe('a flat in the 2D picture', () => {
  it('is one chain line round its rooms, after the walls and before the openings', () => {
    const svg = planToSvg(duplexHouse(), { floor: 'ground' })
    const flats = parts(svg, 'flat')
    expect(flats.map((f) => /data-id="([^"]+)"/.exec(f)![1])).toEqual(['D1', 'S1'])
    expect(flats[0]).toContain('data-name="Duplex 1"')
    const lines = parts(svg, 'flat-outline')
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line).toContain(`stroke="${LIGHT_LOOK.paper}"`)
      expect(line).toContain('stroke-dasharray')
    }
    expect(svg.indexOf('data-part="flat"')).toBeGreaterThan(svg.lastIndexOf('data-part="wall"'))
    expect(svg.indexOf('data-part="flat"')).toBeLessThan(svg.indexOf('data-part="opening"'))
  })

  it('draws a duplex on its upper floor too, and nothing on a plan that lists no flats', () => {
    expect(parts(planToSvg(duplexHouse(), { floor: 'first' }), 'flat').map((f) => /data-id="([^"]+)"/.exec(f)![1])).toEqual(['D1'])
    expect(parts(planToSvg(twoFloorHouse(), { floor: 'ground' }), 'flat')).toEqual([])
  })
})
