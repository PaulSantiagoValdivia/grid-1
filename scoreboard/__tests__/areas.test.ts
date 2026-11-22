/**
 * ARE-9 over the lab's plans and the sound ones: per floor, the gross external area is the net
 * area plus the walls plus the floor no room claims, within 1e-6 m², once the floor rooms count
 * that is not enclosed floor counted once is taken off; and on a sound plan there is none.
 */
import { describe, expect, it } from 'vitest'
import { indexPlan, planAreaFigures, tolerance, validatePlan, type FloorAreaFigures } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import * as data from '../src/data'
import { basePlans, soundPlans } from '../src/damage'

const ROOM_FAULT = /^room\/(overlap|space-mismatch|not-enclosed|inside-no-host)$/

const gap = (f: FloorAreaFigures): number => f.grossExternal! - (f.net + f.overStairs + f.outsideRooms + f.walls! + f.unclaimed! - f.offSpace!)

function read(text: string): FloorPlan | null {
  try {
    return parseFloorPlan(JSON.parse(text))
  } catch {
    return null
  }
}

describe('ARE-9 the areas over the scoreboard plans', () => {
  it('adds up on every floor of the sound plans, with no room floor off its space', () => {
    const examples = data.benchExamples()
    const plans = soundPlans(basePlans(examples.twoBedFlat, examples.minimal))
    let floors = 0
    for (const { plan } of plans) {
      for (const f of planAreaFigures(parseFloorPlan(plan)).floors) {
        floors++
        expect(f.grossExternal).not.toBeNull()
        expect(Math.abs(f.offSpace!)).toBeLessThan(1e-6)
        expect(Math.abs(f.grossExternal! - (f.net + f.walls! + f.unclaimed!))).toBeLessThan(1e-6)
        if (f.grossInternal !== null) expect(f.grossInternal).toBeLessThanOrEqual(f.grossExternal! + 1e-6)
      }
    }
    expect(floors).toBeGreaterThan(400)
  }, 600_000)

  it('adds up on every floor of the lab plans; room floor off its space is named, or under what a message names', () => {
    // The lab's size probes of thousands of rooms are left to the scoreboard: here they only cost time.
    const plans = data.labPlans().map((p) => read(p.text)).filter((p): p is FloorPlan => p !== null && p.rooms.length <= 300)
    expect(plans.length).toBeGreaterThan(1000)
    const unnamed: number[] = []
    for (const plan of plans) {
      const index = indexPlan(plan)
      const faulty = validatePlan(plan, index).issues.some((issue) => ROOM_FAULT.test(issue.code))
      for (const f of planAreaFigures(plan, { index }).floors) {
        if (f.grossExternal === null) continue
        expect(Math.abs(gap(f))).toBeLessThan(1e-6)
        if (f.grossInternal !== null) {
          expect(f.grossInternal).toBeLessThanOrEqual(f.grossExternal + 1e-6)
          if (Math.abs(f.offSpace!) < 1e-6) expect(f.grossInternal).toBeGreaterThanOrEqual(f.net - 1e-6)
        }
        if (!faulty && Math.abs(f.offSpace!) >= 1e-6) unnamed.push(Math.abs(f.offSpace!))
      }
    }
    for (const off of unnamed) expect(off).toBeLessThan(tolerance('areaReported'))
  }, 900_000)
})
