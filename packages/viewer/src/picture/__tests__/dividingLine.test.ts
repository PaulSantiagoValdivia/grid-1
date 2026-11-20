import { describe, expect, it } from 'vitest'
import { planToSvg } from '../planSvg'
import { openPlan } from './openPlan'

/**
 * ARE-2: a dividing line (a virtual wall) is a line on the floor. The 2D picture, which
 * `planToSvg` and the app's canvas share (`scene.ts`), draws it dashed, over floor that runs
 * on under it from one room to the other.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

describe('a dividing line in the 2D picture', () => {
  const svg = planToSvg(openPlan())

  it('is drawn dashed, over the floor of both rooms, which meet on it', () => {
    expect({ rooms: parts(svg, 'room'), line: parts(svg, 'virtual'), opening: parts(svg, 'opening') }).toMatchSnapshot()
  })

  it('is drawn after the floor, so the floor never hides it', () => {
    expect(svg.indexOf('data-part="virtual"')).toBeGreaterThan(svg.lastIndexOf('data-part="room"'))
  })

  it('takes no floor, whatever thickness it states', () => {
    expect(planToSvg(openPlan({ thickness: 0.3 }))).toBe(svg)
  })
})
