/**
 * LVL-4, lab AC-6: the quantities give the roof over every part with nothing above, not the top
 * floor's outline. The lab's first tool took the odd house's roof as 43.99 m², the first floor's
 * outline; the true flat roof is 83.31 m², 39.32 over the ground floor's living room and 43.99
 * over the first floor. Until the plan states a roof, every slab and roof line is marked assumed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { labPlan, labPlanText } from '@ongrid/floorplan/test-support/lab'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const ODD = 'F/scenarios/odd-house.json'

describe('the roof and slabs of the odd house (AC-6)', () => {
  const takeoff = planTakeoff(surveyPlan(labPlan(ODD)))

  it('gives the roof as 83.31 m², not the top floor\'s 43.99', () => {
    const { envelope } = takeoff
    expect(envelope.roof).toBeCloseTo(83.31, 2)
    expect(envelope.floors.map((f) => [f.floor, Number(f.roof!.area.toFixed(2))])).toEqual([['ground', 39.32], ['first', 43.99]])
    expect(envelope.roof!).not.toBeCloseTo(43.99, 2)
  })

  it('marks every slab and roof line assumed, with what was assumed', () => {
    const { envelope } = takeoff
    expect(envelope.state).toBe('assumed')
    for (const line of envelope.floors) {
      expect(line.state).toBe('assumed')
      expect(line.assumed).toContain('the roof is flat, over every part with nothing above, with no overhang and no fall: the plan states no roof')
      expect(line.assumed).toContain('the slab is 0.25 m thick: the floor states no slab thickness')
    }
    expect(envelope.floors[1]!.assumed).toContain('the opening over a stair room is the floor it shares with the stair room below: the plan states no stair there')
  })

  it('takes the opening over the stair off the first floor\'s slab, which the lab could not (36.19 m² with the landing in it)', () => {
    const first = takeoff.envelope.floors.find((f) => f.floor === 'first')!
    expect(first.slab!.kind).toBe('floor')
    expect(first.slab!.openings.map((o) => [o.kind, o.via])).toEqual([['stair-room', 'g-stair|f-landing']])
    // The landing's floor is the opening: the first floor's outline less it.
    expect(first.slab!.area).toBeCloseTo(first.outline! - first.slab!.openings[0]!.area, 6)
    expect(first.slab!.openings[0]!.area).toBeCloseTo(10.57, 2)
  })
})

describe('grid_takeoff', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({ 'plan.json': JSON.parse(labPlanText(ODD)) })
  })
  afterAll(() => b.close())

  it('says the roof in all, and that it is assumed', async () => {
    const reply = await b.call('grid_takeoff', {})
    expect(reply.isError).toBe(false)
    expect(reply.text).toContain('Roof in all: 83.31 m², assumed.')
    expect(reply.text).toContain('Roof over ("Ground floor"), where nothing is above: 39.32 m²; assumed.')
    expect((reply.data!['envelope'] as { roof: number }).roof).toBeCloseTo(83.31, 2)
  })

  it('gives the slab and roof lines in the spreadsheet, each marked assumed', async () => {
    const reply = await b.call('grid_takeoff', { format: 'csv' })
    const roofs = reply.text.split('\n').filter((line) => line.startsWith('roof,') || line.startsWith('total,"roof'))
    expect(roofs).toHaveLength(3)
    for (const line of roofs) expect(line.endsWith(',assumed')).toBe(true)
  })
})

describe('ceilings in the take-off', () => {
  it('gives each room its ceiling height and its lowered zones', () => {
    const plan = parseFloorPlan({
      walls: [
        { id: 's', start: [0, 0], end: [6, 0], kind: 'exterior' }, { id: 'e', start: [6, 0], end: [6, 4], kind: 'exterior' },
        { id: 'n', start: [6, 4], end: [0, 4], kind: 'exterior' }, { id: 'w', start: [0, 4], end: [0, 0], kind: 'exterior' },
      ],
      rooms: [{ id: 'k', name: 'Kitchen', boundary: ['s', 'e', 'n', 'w'], height: 2.6, ceiling: { lowered: [{ name: 'Bulkhead', points: [[0, 3], [6, 3], [6, 4], [0, 4]], height: 2.3 }] } }],
    })
    const [kitchen] = planTakeoff(surveyPlan(plan)).rooms
    expect(kitchen!.ceilingHeight).toBe(2.6)
    expect(kitchen!.lowered.map((z) => [z.name, z.height, Number(z.area.toFixed(2))])).toEqual([['Bulkhead', 2.3, Number((5.8 * 0.9).toFixed(2))]])
  })
})
