import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { checkLocalRules, inspectPlan } from '@ongrid/rules'
import { planToSvg } from '@ongrid/viewer/src/picture'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { drawPlan } from '../drawPlan'
import { twoBedFlat } from './twoBedFlat'

/** CNT-3: a plan that states its north gets a north arrow, and nothing else changes. */

const withNorth = (north: number, extra: Record<string, unknown> = {}): FloorPlan => parseFloorPlan({ ...twoBedFlat(), north, ...extra })
const arrows = (svg: string): string[] => [...svg.matchAll(/<g data-part="north-arrow"[^>]*>/g)].map((m) => m[0])

describe('the north arrow', () => {
  it('is drawn once, in the corner, turned to the stated north', () => {
    const svg = planToSvg(withNorth(30))
    const found = arrows(svg)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('rotate(-30)')
    expect(svg.slice(svg.indexOf('data-part="north-arrow"'))).toContain('>N</text>')
    expect(arrows(planToSvg(withNorth(0)))[0]).not.toContain('rotate(')
  })

  it('is not drawn for a plan that states no north, whose picture is as it was', () => {
    expect(arrows(planToSvg(twoBedFlat()))).toEqual([])
    // Stating a front, a site or a y direction draws nothing.
    const stated = parseFloorPlan({ ...twoBedFlat(), yAxis: 'up', site: { origin: [0, 0] } })
    expect(planToSvg(stated)).toBe(planToSvg(twoBedFlat()))
  })

  it('gives way to a north symbol the plan places itself, which then points north', () => {
    const svg = planToSvg(withNorth(90, { annotations: [{ id: 'n', kind: 'symbol', symbol: 'north', at: [1, 1] }] }))
    expect(arrows(svg)).toEqual([])
    expect(svg).toMatch(/data-part="note-symbol" data-id="n"[^>]*rotate\(-90\)/)
  })

  it('is in the PNG and changes no area and no check', async () => {
    const png = await drawPlan(withNorth(45), { format: 'png' })
    expect(Buffer.from(png.subarray(1, 4)).toString('latin1')).toBe('PNG')
    expect(planAreas(surveyPlan(withNorth(45)))).toEqual(planAreas(surveyPlan(twoBedFlat())))
    expect(checkLocalRules(withNorth(45))).toEqual(checkLocalRules(twoBedFlat()))
    expect(inspectPlan(withNorth(45)).lines).toEqual(inspectPlan(twoBedFlat()).lines)
  })
})
