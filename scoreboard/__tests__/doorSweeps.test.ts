// QAR-7: the door-swing check tries each door only against the walls and doors near it, and the
// corners are joined with the same index. Both must say exactly what trying every pair said, so
// here they are held to the code as it was (allPairs/), on the lab's plans, its generated floors
// among them. The floors over 1,000 rooms and the 5,000-room timing run only when asked:
// GRID_TIMING=1.
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Opening, PlanDrawing } from '@ongrid/floorplan/geometry'
import { buildFloorPlan, planFloors, planForFloor, validateDoorSweeps, validateFloorDoorSweeps, wallJoints } from '@ongrid/floorplan/geometry'
import * as data from '../src/data'
import { allPairsFloorDoorSweeps } from './allPairs/sweep'
import { wallJoints as allPairsWallJoints } from './allPairs/joints'

type SwingOf = (opening: Opening) => { hinge?: Opening['hinge']; swing?: Opening['swing'] }

/** The doors as the plan writes them. */
const asWritten: SwingOf = (o) => o
/** Every door given a hinge and a swing, by its place in the plan, so every door is checked. */
const everyDoor = (plan: FloorPlan): SwingOf => {
  const place = new Map(plan.openings.map((o, i) => [o.id, i]))
  return (o) => {
    const i = place.get(o.id) ?? 0
    return { hinge: i % 2 === 0 ? 'start' : 'end', swing: i % 4 < 2 ? 'left' : 'right' }
  }
}

const parsed = (text: string): FloorPlan | null => {
  try {
    return parseFloorPlan(JSON.parse(text))
  } catch {
    return null
  }
}

interface Tally {
  floors: number
  findings: Record<string, number>
}

/** Sets old against new on every floor of `plan`, and counts what they found. */
function holdToAllPairs(plan: FloorPlan, tally: Tally): void {
  expect([...wallJoints(plan.walls)]).toEqual([...allPairsWallJoints(plan.walls)])
  for (const floor of planFloors(plan)) {
    const slice = planForFloor(plan, floor.id)
    let drawing: PlanDrawing
    try {
      drawing = buildFloorPlan(slice)
    } catch {
      continue
    }
    tally.floors++
    for (const swingOf of [asWritten, everyDoor(plan)]) {
      const indexed = validateFloorDoorSweeps(slice, drawing, swingOf)
      expect(indexed).toEqual(allPairsFloorDoorSweeps(slice, drawing, swingOf))
      for (const issue of indexed) tally.findings[issue.code] = (tally.findings[issue.code] ?? 0) + 1
    }
  }
}

/** The lab's floors past this size take minutes to draw, and run only with GRID_TIMING=1. */
const LARGE = 1000
const SC_2 = 'AU4/L-rerun/scenarios/size/grid-5000-pieces.json'

const storedPlans = (): { name: string; plan: FloorPlan }[] =>
  [...data.labPlans(), ...data.generatedPlans()].flatMap((stored) => {
    const plan = parsed(stored.text)
    return plan ? [{ name: stored.name, plan }] : []
  })

describe('the door-swing check with a spatial index (QAR-7)', () => {
  it('finds what trying every pair found, on the lab plans', () => {
    const tally: Tally = { floors: 0, findings: {} }
    const plans = storedPlans().filter(({ plan }) => plan.rooms.length <= LARGE)
    for (const { plan } of plans) holdToAllPairs(plan, tally)
    // The lab's generated floors up to 1,000 rooms are among them, and there are enough of
    // each finding that a difference would show.
    expect(plans.filter(({ plan }) => plan.rooms.length >= 500).length).toBeGreaterThan(0)
    expect(tally.floors).toBeGreaterThan(3000)
    expect(tally.findings['opening/door-blocked']).toBeGreaterThan(500)
    expect(tally.findings['opening/doors-collide']).toBeGreaterThan(50)
  }, 600_000)
})

// SC-2: the lab timed the check at 75.9 s on its 5,000-room floor. Drawing the lab's floors of
// 2,000 to 5,000 rooms (`buildFloorPlan`, untimed here) takes minutes, so this runs only with
// GRID_TIMING=1.
describe.skipIf(!process.env.GRID_TIMING)('the door-swing check on the lab\'s largest floors (QAR-7, SC-2)', () => {
  const large = (): { name: string; plan: FloorPlan }[] => storedPlans().filter(({ plan }) => plan.rooms.length > LARGE)

  it('finds what trying every pair found, on floors of 2,000 to 5,000 rooms', () => {
    const tally: Tally = { floors: 0, findings: {} }
    const plans = large()
    for (const { plan } of plans) holdToAllPairs(plan, tally)
    expect(plans.length).toBeGreaterThanOrEqual(4)
    expect(tally.findings['opening/door-blocked']).toBeGreaterThan(100)
  }, 3_600_000)

  it('takes under 2 s on the 5,000-room floor', () => {
    const plan = large().find(({ name }) => name === SC_2)!.plan
    const slice = planForFloor(plan, planFloors(plan)[0]!.id)
    let start = performance.now()
    const drawing = buildFloorPlan(slice)
    const build = (performance.now() - start) / 1000

    const timed = (body: () => unknown): number => {
      const at = performance.now()
      body()
      return (performance.now() - at) / 1000
    }
    const results: Record<string, unknown> = {}
    const seconds = {
      asWritten: timed(() => (results.asWritten = validateFloorDoorSweeps(slice, drawing, asWritten))),
      everyDoor: timed(() => (results.everyDoor = validateFloorDoorSweeps(slice, drawing, everyDoor(plan)))),
      allPairs: timed(() => (results.allPairs = allPairsFloorDoorSweeps(slice, drawing, asWritten)))
    }
    start = performance.now()
    validateDoorSweeps(plan, asWritten)
    const whole = (performance.now() - start) / 1000

    console.log(
      `QAR-7 SC-2: ${plan.rooms.length} rooms, ${plan.walls.length} walls, ` +
        `${plan.openings.filter((o) => o.type === 'door').length} doors. ` +
        `Given the drawing: ${seconds.asWritten.toFixed(2)} s as written, ${seconds.everyDoor.toFixed(2)} s with every door swung, ` +
        `${seconds.allPairs.toFixed(1)} s trying every pair. ` +
        `buildFloorPlan ${build.toFixed(1)} s; validateDoorSweeps on the plan, which builds it, ${whole.toFixed(1)} s.`
    )
    expect(results.asWritten).toEqual(results.allPairs)
    expect(seconds.asWritten).toBeLessThan(2)
    expect(seconds.everyDoor).toBeLessThan(2)
  }, 3_600_000)
})
