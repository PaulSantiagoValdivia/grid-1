/**
 * ARE-6: the measuring tools on a ring gallery round a courtyard. The room's widest circle and
 * what fits in it are on its floor, never in the courtyard, and its sides include the core's.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { fitInRoom, measureRoom, roomHeight } from '../measure'
import { surveyPlan } from '../survey'

const ring = () =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/ring-gallery.json'), 'utf8')))

describe('measuring a room with a hole (ARE-6)', () => {
  it('finds the widest circle on the gallery floor, and the perimeter round the outline and the hole', () => {
    const room = surveyPlan(ring()).byId.get('ring')!
    expect(room.holes).toHaveLength(1)
    const measured = measureRoom(room)
    expect(measured.area).toBeCloseTo(75.6, 9)
    // The gallery is 2.70 m wide between the faces; its corners hold a little more. The circle
    // of the outline alone would have been 9.70 m, in the courtyard.
    expect(measured.widestCircle).toBeGreaterThan(2.7 - 1e-6)
    expect(measured.widestCircle).toBeLessThan(3.2)
    const { x, y } = measured.circleAt
    expect(x > 2.85 && x < 7.15 && y > 2.85 && y < 7.15).toBe(false)
    // 4 × 9.70 round the outside and 4 × 4.30 round the core.
    expect(measured.perimeter).toBeCloseTo(56, 9)
    expect(fitInRoom(room, { width: 4, depth: 4 }).fits).toBe(false)
    expect(fitInRoom(room, { width: 2, depth: 2 }).fits).toBe(true)
  })

  it('rests the ceiling on the core walls too', () => {
    const plan = ring()
    const low = { ...plan, walls: plan.walls.map((w) => (w.id === 'cn' ? { ...w, height: 2.4 } : w)) }
    expect(roomHeight(low, 'ring').walls?.low).toBe(2.4)
  })
})
