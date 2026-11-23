/**
 * CNT-19 (C29, lab EL-11): parking bays and ramps as things of their own.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { bayFootprint, baysOnFloor, planBayCounts, planRamps, rampsOnFloor } from '../parking'
import { validatePlan } from '../validate'
import { planForFloor } from '../floors'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { BASEMENT_RAMP, basementBays, basementCarPark } from '../../test-support/parking'

const codes = (plan: ReturnType<typeof basementCarPark>, prefix: string) =>
  validatePlan(plan)
    .issues.filter((i) => i.code.startsWith(prefix))
    .map((i) => [i.code, i.id, i.severity])

describe('the basement counts its bays by number (EL-11)', () => {
  it('counts the 16 bays on the basement, numbered 1 to 16', () => {
    const plan = basementCarPark()
    expect(planBayCounts(plan)).toEqual([
      { floor: 'B1', count: 16, numbers: Array.from({ length: 16 }, (_, i) => String(i + 1)), unnumbered: 0 },
    ])
    expect(baysOnFloor(plan, 'B1')).toHaveLength(16)
    expect(baysOnFloor(plan, 'ground')).toHaveLength(0)
  })

  it('keeps each floor\'s bays on its own slice, and counts it the same', () => {
    const plan = basementCarPark()
    const slice = planForFloor(plan, 'B1')
    expect(slice.bays).toHaveLength(16)
    expect(planForFloor(plan, 'ground').bays).toEqual([])
    expect(planBayCounts(slice)[0]!.count).toBe(16)
  })

  it('takes nothing off the area of the room the bays stand in', () => {
    const plan = basementCarPark()
    const without = basementCarPark({ bays: undefined })
    const room = (p: typeof plan) => roomArea(p.rooms.find((r) => r.id === 'car-park')!, indexPlan(p))
    expect(room(plan)).toBeCloseTo(room(without), 9)
  })

  it('lays a bay out by its width across and its length along, turned about its middle', () => {
    const round = (p: { x: number; y: number }) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6]
    expect(bayFootprint({ at: [0, 0], width: 2.5, length: 5 }).map(round)).toEqual([[-1.25, -2.5], [1.25, -2.5], [1.25, 2.5], [-1.25, 2.5]])
    expect(bayFootprint({ at: [0, 0], width: 2.5, length: 5, turn: 90 }).map(round)).toEqual([[2.5, -1.25], [2.5, 1.25], [-2.5, 1.25], [-2.5, -1.25]])
  })

  it('counts unnumbered bays apart, and numbers in number order', () => {
    const plan = basementCarPark({
      bays: [
        { id: 'a', number: '10', at: [5, 15], width: 2.5, length: 5, floor: 'B1' },
        { id: 'b', number: '2', at: [8, 15], width: 2.5, length: 5, floor: 'B1' },
        { id: 'c', at: [11, 15], width: 2.5, length: 5, floor: 'B1' },
      ],
    })
    expect(planBayCounts(plan)).toEqual([{ floor: 'B1', count: 3, numbers: ['2', '10'], unnumbered: 1 }])
  })
})

describe('a ramp states its slope as a number (EL-11)', () => {
  it('works the slope out from the levels it joins and its run, and keeps the one it states', () => {
    const plan = basementCarPark()
    const [ramp] = planRamps(plan).ramps
    expect(ramp).toMatchObject({ id: 'ramp', name: 'Car ramp', from: 'B1', to: 'ground', width: 3.2, statedSlope: 16.7 })
    expect(ramp!.lower).toMatchObject({ floor: 'B1', level: -3 })
    expect(ramp!.upper).toMatchObject({ floor: 'ground', level: 0 })
    expect(ramp!.rise).toBeCloseTo(3, 9)
    expect(ramp!.length).toBeCloseTo(18, 9)
    expect(ramp!.slope).toBeCloseTo(100 / 6, 9)
    expect(ramp!.oneIn).toBeCloseTo(6, 9)
    expect(ramp!.pieces).toHaveLength(1)
    // It is stated within the tolerance of what the levels give: nothing to say.
    expect(codes(plan, 'plan/ramp')).toEqual([])
  })

  it('reads a ramp stated from its upper floor down, and one said by its start and end', () => {
    const plan = basementCarPark({ ramps: [{ id: 'down', from: 'ground', to: 'B1', width: 3, start: [1.8, 27], end: [1.8, 9] }] })
    const [ramp] = planRamps(plan).ramps
    expect(ramp!.lower.floor).toBe('B1')
    expect(ramp!.line[0]).toEqual({ x: 1.8, y: 9 })
    expect(ramp!.statedSlope).toBeNull()
    expect(ramp!.slope).toBeCloseTo(100 / 6, 9)
  })

  it('says when the stated slope is not what the levels and the run give, and keeps both', () => {
    // The lab's ramp room was 9 m long: 3 m up over 9 m is 33.3 %, not the 1 in 6 its name said.
    const plan = basementCarPark({ ramps: [{ ...BASEMENT_RAMP, run: [[1.8, 9], [1.8, 18]] }] })
    const [ramp] = planRamps(plan).ramps
    expect(ramp!.slope).toBeCloseTo(100 / 3, 9)
    expect(ramp!.statedSlope).toBe(16.7)
    const issue = validatePlan(plan).issues.find((i) => i.code === 'plan/ramp-slope-differs')!
    expect(issue).toMatchObject({ id: 'ramp', severity: 'warning' })
    expect(issue.message).toBe('Ramp "Car ramp" ("ramp") states a slope of 16.7 %, but the levels it joins and its run give 33.3 %: 3.00 m up over 9.00 m. Both are kept.')
  })

  it('lays out a ramp that turns, its length along its middle line', () => {
    const plan = basementCarPark({ ramps: [{ id: 'r', from: 'B1', to: 'ground', width: 3, run: [[1.8, 9], [1.8, 18], [10, 18]] }] })
    const [ramp] = planRamps(plan).ramps
    expect(ramp!.length).toBeCloseTo(9 + 8.2, 9)
    expect(ramp!.pieces).toHaveLength(3)
  })

  it('is on both floors it joins, and only those', () => {
    const plan = basementCarPark()
    expect(rampsOnFloor(plan, 'B1').map((r) => r.id)).toEqual(['ramp'])
    expect(rampsOnFloor(planForFloor(plan, 'ground'), 'ground').map((r) => r.id)).toEqual(['ramp'])
  })
})

describe('what is worth a look on bays and ramps', () => {
  it('leaves out a bay on a floor the plan does not have, or with another part\'s id', () => {
    const plan = basementCarPark({
      bays: [
        { id: 'b1', number: '1', at: [5, 15], width: 2.5, length: 5, floor: 'B2' },
        { id: 'col-1', number: '2', at: [8, 15], width: 2.5, length: 5, floor: 'B1' },
        { id: 'b3', number: '3', at: [11, 15], width: 2.5, length: 5, floor: 'B1' },
      ],
    })
    expect(codes(plan, 'plan/bay')).toEqual([
      ['plan/bay-unknown-floor', 'b1', 'error'],
      ['plan/bay-duplicate-id', 'col-1', 'error'],
    ])
    expect(planBayCounts(plan)).toEqual([{ floor: 'B1', count: 1, numbers: ['3'], unnumbered: 0 }])
    expect(validatePlan(plan).issues.find((i) => i.id === 'b1')!.message).toBe('Bay "1" ("b1") is on floor "B2", which the plan does not have, so it is left out.')
  })

  it('says when two bays of one floor share a number, or overlap', () => {
    const bays = basementBays()
    bays[1] = { ...bays[1]!, number: '1' }
    bays[2] = { ...bays[2]!, at: [3.6 + 1.25 + 2.5 * 1 + 1, 15.4] }
    const plan = basementCarPark({ bays })
    expect(codes(plan, 'plan/bay')).toEqual([
      ['plan/bay-number-repeated', 'bay-2', 'warning'],
      ['plan/bays-overlap', 'bay-3', 'warning'],
    ])
    expect(planBayCounts(plan)[0]!.count).toBe(16)
  })

  it('leaves out a ramp that joins no two floors, two floors at one level, or a floor the plan does not have', () => {
    const plan = basementCarPark({
      floors: [
        { id: 'B1', name: 'Basement', level: -1, elevation: -3 },
        { id: 'ground', name: 'Ground floor', level: 0, elevation: 0 },
        { id: 'mezz', name: 'Mezzanine', level: 0.5, elevation: 0 },
      ],
      ramps: [
        { id: 'r1', from: 'B1', to: 'B1', width: 3, run: [[1, 1], [1, 10]] },
        { id: 'r2', from: 'ground', to: 'mezz', width: 3, run: [[1, 1], [1, 10]] },
        { id: 'r3', from: 'B1', to: 'groud', width: 3, run: [[1, 1], [1, 10]] },
        { id: 'r4', from: 'B1', to: 'ground', width: 3, run: [[1, 1], [1, 1]] },
      ],
    })
    expect(codes(plan, 'plan/ramp')).toEqual([
      ['plan/ramp-same-floor', 'r1', 'error'],
      ['plan/ramp-no-rise', 'r2', 'error'],
      ['plan/ramp-unknown-floor', 'r3', 'error'],
      ['plan/ramp-no-run', 'r4', 'error'],
    ])
    expect(planRamps(plan).ramps).toEqual([])
  })

  it('says a slice\'s ramp problems only on the floors the ramp joins', () => {
    const plan = basementCarPark({
      floors: [
        { id: 'B1', name: 'Basement', level: -1, elevation: -3 },
        { id: 'ground', name: 'Ground floor', level: 0, elevation: 0 },
        { id: 'first', name: 'First floor', level: 1 },
      ],
      ramps: [{ ...BASEMENT_RAMP, run: [[1.8, 9], [1.8, 18]] }],
    })
    const sliceCodes = (floor: string) => validatePlan(planForFloor(plan, floor)).issues.filter((i) => i.code.startsWith('plan/ramp')).map((i) => i.code)
    expect(sliceCodes('B1')).toEqual(['plan/ramp-slope-differs'])
    expect(sliceCodes('first')).toEqual([])
  })

  it('refuses a ramp with more points than a stair may have, and reads a plan with none as before', () => {
    expect(() => basementCarPark({ ramps: [{ ...BASEMENT_RAMP, run: Array.from({ length: 65 }, (_, i) => [i, 0]) }] })).toThrow(/at most 64/)
    const plain = parseFloorPlan({ walls: [], rooms: [], openings: [] })
    expect('bays' in plain).toBe(false)
    expect('ramps' in plain).toBe(false)
    expect(planRamps(plain).ramps).toEqual([])
    expect(planBayCounts(plain)).toEqual([])
  })
})
