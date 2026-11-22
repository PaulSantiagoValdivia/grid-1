import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { compareBuildings } from '@ongrid/floorplan/geometry'
import { comparisonPicture, COMPARISON_COLORS, UNCHANGED_COLORS } from '../comparison'
import { pictureToSvg } from '../planSvg'

/**
 * WRT-8: the picture of a comparison draws what the core says changed, in three colours, over the
 * later plan in pale, and works nothing out itself.
 */
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(resolve(__dirname, '../../../../floorplan/fixtures'), 'two-bed-flat.json'), 'utf8')))

describe('the picture of a comparison', () => {
  it('marks the wall taken out in red, the one built in green and the rooms that changed in amber, with their areas', () => {
    const before = flat()
    // The wall between the kitchen and the living room moved 0.5 m north.
    const after: FloorPlan = { ...before, walls: before.walls.map((w) => (w.id === 'living-north' ? { ...w, start: [w.start[0], w.start[1] + 0.5], end: [w.end[0], w.end[1] + 0.5] } : w)) }
    const compared = compareBuildings(before, after)
    const svg = pictureToSvg(comparisonPicture(compared.aligned, after, compared.marks))
    expect(svg).toContain(`data-part="removed-wall" data-id="living-north" d="`)
    expect(svg).toMatch(new RegExp(`data-part="removed-wall" data-id="living-north"[^>]*fill="${COMPARISON_COLORS.removed}"`))
    expect(svg).toMatch(new RegExp(`data-part="added-wall" data-id="living-north"[^>]*fill="${COMPARISON_COLORS.added}"`))
    expect(svg).toContain('Living room: 18.48 m² to 20.68 m²')
    expect(svg).toContain('data-part="comparison-key"')
    // What stayed is drawn in the pale look.
    expect(svg).toContain(UNCHANGED_COLORS.wallExterior)
  })

  it('draws no mark when nothing changed', () => {
    const plan = flat()
    const compared = compareBuildings(plan, plan)
    const svg = pictureToSvg(comparisonPicture(compared.aligned, plan, compared.marks))
    expect(svg).not.toMatch(/data-part="(removed|added|changed)-/)
  })
})
