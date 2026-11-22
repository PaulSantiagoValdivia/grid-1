/**
 * LVL-6, lab VE-5: the converted loft's attic bedroom, 21.66 m², has by hand 18.42 m² with at least
 * 1.5 m of headroom and 12.28 m² with at least 2.2 m (worked out in
 * `packages/floorplan/src/geometry/__tests__/roofs-lab.test.ts`). The lab's plan states no roof; the
 * test states the gable its walls show: eaves 1.0 m on the knee walls' lines, ridge 3.6 m.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../survey'
import { planAreas } from '../areas'
import { planTakeoff } from '../takeoff'
import { roomHeight } from '../measure'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const LOFT = 'A/scenarios/loft-sloped.json'

function loftRaw(): Record<string, unknown> {
  const raw = JSON.parse(labPlanText(LOFT)) as { floors: Record<string, unknown>[] }
  raw.floors[0]!['roof'] = { shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' }
  return raw
}

describe('the converted loft by headroom band (VE-5)', () => {
  const plan = parseFloorPlan(loftRaw())

  it('gives the attic bedroom 18.42 m² with at least 1.5 m and 12.28 m² with at least 2.2 m', () => {
    const areas = planAreas(surveyPlan(plan))
    const bed = areas.floors[0]!.rooms.find((r) => r.id === 'bed')!
    expect(bed.net!.toFixed(2)).toBe('21.66')
    expect(bed.headroom!.bands.map((b) => [b.height, b.area.toFixed(2)])).toEqual([
      [1.5, '18.42'],
      [2.2, '12.28']
    ])
    // The floor's bands add up its rooms'; the rule is stated with the measures.
    const floor = areas.floors[0]!.headroom!
    expect(floor[0]!.area).toBeCloseTo(areas.floors[0]!.rooms.reduce((t, r) => t + r.headroom!.bands[0]!.area, 0), 9)
    expect(areas.headroom).toEqual(floor)
    expect(areas.measures.map((m) => m.measure)).toEqual(['net', 'grossInternal', 'grossExternal', 'headroom'])
  })

  it('gives no bands on a plan that states no roof', () => {
    const areas = planAreas(surveyPlan(parseFloorPlan(JSON.parse(labPlanText(LOFT)))))
    expect(areas.headroom).toBeNull()
    expect(areas.floors[0]!.rooms.every((r) => r.headroom === undefined)).toBe(true)
    expect(areas.measures.map((m) => m.measure)).toEqual(['net', 'grossInternal', 'grossExternal'])
  })

  it('gives the bedroom\'s height from the knee walls\' faces to the ridge', () => {
    const height = roomHeight(plan, 'bed')
    expect(height.from).toBe('roof')
    expect(height.roof!.lowest.toFixed(2)).toBe('1.13')
    expect(height.roof!.highest.toFixed(2)).toBe('3.60')
  })

  it('takes the gable wall\'s face under the roof, not as a 3.6 m rectangle', () => {
    const takeoff = planTakeoff(surveyPlan(plan))
    const bed = takeoff.rooms.find((r) => r.id === 'bed')!
    const before = planTakeoff(surveyPlan(parseFloorPlan(JSON.parse(labPlanText(LOFT))))).rooms.find((r) => r.id === 'bed')!
    expect(bed.wallFace).toBeLessThan(before.wallFace)
    const roof = takeoff.envelope.floors[0]!.roof!
    expect(roof.shape).toBe('gable')
    expect(roof.pitch).toBeCloseTo((Math.atan(2.6 / 3) * 180) / Math.PI, 9)
    expect(roof.slopeArea).toBeCloseTo(roof.area * Math.hypot(1, 2.6 / 3), 6)
  })
})

describe('the tools', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({ 'plan.json': loftRaw() })
  })
  afterAll(() => b.close())

  it('grid_areas says the bedroom\'s bands, and the rule they follow', async () => {
    const reply = await b.call('grid_areas', {})
    expect(reply.isError).toBe(false)
    expect(reply.text).toContain('"Attic bedroom" (bedroom): 3.80 m × 5.70 m, 21.66 m²; at least 1.50 m 18.42 m², at least 2.20 m 12.28 m², headroom 1.13 m to 3.60 m')
    expect(reply.text).toContain('Area by headroom: at least 1.50 m ')
    expect(reply.text).toContain('Area by headroom is the floor of each room with at least 1.5 m, and with at least 2.2 m, of height over it')
    expect((reply.data!['headroom'] as { height: number }[]).map((b) => b.height)).toEqual([1.5, 2.2])
  })

  it('grid_takeoff gives the gable roof on plan and on its slope', async () => {
    const reply = await b.call('grid_takeoff', {})
    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/Roof over .*, where nothing is above: [\d.]+ m², on plan; a gable roof, pitched 40\.9°, [\d.]+ m² on its slope; assumed\./)
  })

  it('grid_check refuses the window above the roof, and the door', async () => {
    const reply = await b.call('grid_check', { full: true })
    expect(reply.text).toContain('w-bed-gable-corner')
    expect(reply.text).toContain('reaches above the roof over its wall')
  })
})
