/**
 * LVL-5 (lab VE-9): the stair window through two storeys, drawn. The geometry is the core's
 * (`planForFloor`, `planSection`); this only paints it.
 */
import { describe, expect, it } from 'vitest'
import { ACROSS_STAIR_WINDOW, stairWindowThrough } from '@ongrid/floorplan/test-support/through'
import { pictureToSvg, planPicture } from '../planSvg'
import { sectionPicture } from '../section'
import { planSection } from '@ongrid/floorplan/geometry'

const windowsIn = (svg: string): string[] => [...svg.matchAll(/data-part="window-symbol" data-opening="([^"]+)"/g)].map((m) => m[1]!)

describe('a window through two storeys, in a wall shared by both floors', () => {
  it('is drawn as a window in the wall on each floor\'s plan', () => {
    const plan = stairWindowThrough()
    for (const floor of ['ground', 'first']) {
      const svg = pictureToSvg(planPicture(plan, { floor, look: 'technical' }))
      expect(windowsIn(svg), floor).toContain('g-w-stair-tall')
    }
  })

  it('is open from its sill to its head in a section through it, the slab between the floors stopping at it', () => {
    const plan = stairWindowThrough()
    const svg = pictureToSvg(sectionPicture(plan, ACROSS_STAIR_WINDOW, { look: 'technical', paperScale: 100 }))
    const section = planSection(plan, ACROSS_STAIR_WINDOW)
    // The wall below the window, with the ground floor, and the wall over it, with the roof: two
    // shapes, as the window parts them from 0.90 to 5.40 m, through the slab level of the first floor.
    expect(section.cut).toHaveLength(2)
    const d = svg.match(/data-part="section-cut" d="([^"]+)"/)![1]!
    const rings = section.cut.reduce((n, shape) => n + 1 + shape.holes.length, 0)
    expect(d.match(/M/g)).toHaveLength(rings)
  })
})
