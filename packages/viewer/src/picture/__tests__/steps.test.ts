import { describe, expect, it } from 'vitest'
import { ballroomWithStage, genkanFlat } from '@ongrid/floorplan/test-support/plans'
import { planToSvg } from '../planSvg'
import { LIGHT_LOOK } from '../look'

/**
 * LVL-7: where rooms at different levels meet, the 2D picture, which `planToSvg` and the app's
 * canvas share (`scene.ts`), draws the step: a solid line in the wall ink across the opening
 * between a genkan and its hall (lab R-4), and over the dividing lines round a stage (S-17).
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

describe('a step in the 2D picture', () => {
  it('is a line across the genkan\'s opening, in the wall ink, drawn over the gap', () => {
    const svg = planToSvg(genkanFlat())
    const steps = parts(svg, 'step')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toContain('data-opening="g"')
    expect(steps[0]).toContain('data-upper="genkan"')
    expect(steps[0]).toContain(`stroke="${LIGHT_LOOK.wall}"`)
    expect(svg.indexOf('data-part="step"')).toBeGreaterThan(svg.lastIndexOf('data-part="opening"'))
  })

  it('is drawn over each of the stage\'s four edges, which stay dividing lines and no wall', () => {
    const svg = planToSvg(ballroomWithStage())
    expect(parts(svg, 'step').map((s) => /data-wall="([^"]+)"/.exec(s)?.[1])).toEqual(['stg-s', 'stg-e', 'stg-n', 'stg-w'])
    expect(parts(svg, 'virtual')).toHaveLength(4)
    expect(parts(svg, 'wall').some((w) => w.includes('stg-'))).toBe(false)
  })

  it('is not drawn when every room stands on its storey\'s floor', () => {
    expect(parts(planToSvg(genkanFlat(0)), 'step')).toEqual([])
  })
})
