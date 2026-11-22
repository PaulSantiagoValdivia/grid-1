/**
 * VEW-9: a route's rooms, doors and walked length.
 *
 * The two-bed flat is `packages/floorplan/fixtures/two-bed-flat.json`, the lab prototype's flat:
 * Bedroom 1 is 4.40 × 3.10 m inside, its door 0.80 m wide in the 0.10 m wall to the Hall, whose
 * middle is 0.65 m from the Hall's west wall. Walked from the middle of Bedroom 1 (6.85, 1.70) to
 * the door's middle on the bedroom's face (5.30, 3.25), 2.19 m, through the wall, 0.10 m, and on
 * to the middle of the Hall (5.30, 5.40), 2.05 m: 4.34 m, the prototype's figure.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { routeBetween } from '../measure'
import { surveyPlan } from '../survey'
import { lengthAcross } from '../walked'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const FLAT = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')) as Record<string, unknown>
const survey = surveyPlan(parseFloorPlan(FLAT))

describe('a route, walked (VEW-9)', () => {
  it('from Bedroom 1 to the Hall: the rooms, the door and 4.34 m', () => {
    const route = routeBetween(survey, 'bed1', 'hall')!
    expect(route.rooms).toEqual(['bed1', 'hall'])
    expect(route.steps.map((s) => [s.type, s.via, s.into])).toEqual([['door', 'door-bed1', 'hall']])
    expect(route.length!).toBeCloseTo(4.342, 3)
    expect(route.legs.map((l) => [l.room, Number(l.length.toFixed(3))])).toEqual([['bed1', 2.192], ['hall', 2.05]])
  })

  it('to the way out: it ends at the outside face of the door out', () => {
    // On through the Hall to the front door's middle on its face (5.30, 7.45), 4.10 m, and through the 0.30 m outside wall.
    const route = routeBetween(survey, 'bed1', 'outside')!
    expect(route.steps.map((s) => s.via)).toEqual(['door-bed1', 'door-entrance'])
    expect(route.length!).toBeCloseTo(2.192 + 0.1 + 4.1 + 0.3, 3)
  })

  it('across a room it keeps to the floor: round an inside corner, not through it', () => {
    // An L: 4 × 4 without its north-east quarter (2..4, 2..4). A straight line from (3.5, 1.5)
    // to (1.5, 3.5) would cut across (2.5, 2.5), off the floor: the walk turns at (2, 2).
    const polygon = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }]
    const a = { x: 3.5, y: 1.5 }
    const b = { x: 1.5, y: 3.5 }
    const round = Math.hypot(1.5, 0.5) * 2
    expect(lengthAcross({ polygon, holes: [] }, a, b)).toBeCloseTo(round, 6)
    // Where the line keeps to the floor, it is straight.
    expect(lengthAcross({ polygon, holes: [] }, { x: 0.5, y: 0.5 }, { x: 3.5, y: 1.5 })).toBeCloseTo(Math.hypot(3, 1), 6)
  })

  it('round a hole in the floor (ARE-6), not across it', () => {
    const polygon = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }]
    // A 2 × 2 hole in the middle, clockwise as the survey keeps holes.
    const hole = [{ x: 2, y: 1 }, { x: 2, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 1 }]
    const across = lengthAcross({ polygon, holes: [hole] }, { x: 1, y: 2 }, { x: 5, y: 2 })!
    expect(across).toBeCloseTo(2 * Math.hypot(1, 1) + 2, 6)
  })
})

describe('grid_measure what=route says the length', () => {
  let b: Bench
  afterEach(() => b?.close())

  it('in its text and its data, with the rule', async () => {
    b = bench({ 'flat.json': FLAT })
    const reply = await b.call('grid_measure', { plan: 'flat.json', what: 'route', room: 'bed1', to: 'hall' })
    expect(reply.isError).toBe(false)
    expect(reply.text).toContain('From "Bedroom 1" to "Hall": door "door-bed1" 0.80 m into "Hall".')
    expect(reply.text).toContain('Walked, 4.34 m: "Bedroom 1" 2.19 m, "Hall" 2.05 m, and 0.10 m through the walls.')
    expect(reply.text).toContain('round inside corners')
    const answer = reply.data!['answer'] as { rooms: string[]; length: number }
    expect(answer.rooms).toEqual(['bed1', 'hall'])
    expect(answer.length).toBeCloseTo(4.34, 2)
  })

  it('with a width too, for the way it gets through by', async () => {
    b = bench({ 'flat.json': FLAT })
    const reply = await b.call('grid_measure', { plan: 'flat.json', what: 'route', room: 'bed1', to: 'hall', width: 0.6 })
    expect(reply.text).toContain('Walked, 4.34 m.\nWalked from the middle of the room it starts in')
    const answer = reply.data!['answer'] as { way: { length: number } }
    expect(answer.way.length).toBeCloseTo(4.34, 2)
  })
})
