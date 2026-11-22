/**
 * BRF-4 (C16): a floor's stated outline on its plan. Massing before any wall is a line round the
 * floor, framed by the picture, not an empty drawing; a floor that states no outline draws none.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { buildFloorPlan, planForFloor } from '@ongrid/floorplan/geometry'
import { planToSvg } from '../planSvg'

const OUTLINE = [[3, 5], [15.762, 5], [18.482, 22], [3, 22]]
const massing = parseFloorPlan({
  version: '1',
  units: 'm',
  floors: [
    { id: 'ground', name: 'Ground floor', level: 0, height: 3, outline: OUTLINE },
    { id: 'first', name: 'First floor', level: 1, height: 3 },
  ],
})

describe('a floor outline on its plan (BRF-4)', () => {
  it('draws the outline round its floor, and frames it', () => {
    const drawing = buildFloorPlan(planForFloor(massing, 'ground'))
    expect(drawing.outline?.map((p) => [p.x, p.y])).toEqual(OUTLINE)
    expect([drawing.bounds.min.x, drawing.bounds.min.y, drawing.bounds.max.x, drawing.bounds.max.y]).toEqual([3, 5, 18.482, 22])
    const svg = planToSvg(massing, { floor: 'ground' })
    expect(svg.match(/data-part="floor-outline"/g)).toHaveLength(1)
  })

  it('draws none on a floor that states none', () => {
    expect(buildFloorPlan(planForFloor(massing, 'first')).outline).toBeUndefined()
    expect(planToSvg(massing, { floor: 'first' })).not.toContain('floor-outline')
  })
})
