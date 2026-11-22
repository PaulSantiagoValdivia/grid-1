// MSG-16 on the lab's own plans: where each opening stands, and the door swings in the report.
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { inspectPlan } from '@ongrid/rules'
import { basePlans, damageSet } from '../src/damage'
import * as data from '../src/data'

const labPlan = (name: string): FloorPlan => {
  const stored = data.labPlans().find((p) => p.name === name)
  if (!stored) throw new Error(`no lab plan ${name}`)
  return parseFloorPlan(JSON.parse(stored.text))
}

/** Whether a drawing issue names `id`, as the scoreboard reads a line: by its id or in its words. */
const names = (plan: unknown, id: string): boolean =>
  validatePlan(parseFloorPlan(plan)).issues.some((i) => i.id === id || i.message.includes(`"${id}"`))

describe('MSG-16 on the lab plans', () => {
  it('names every one of the 141 openings the damage set pushes to the end of its wall', () => {
    const examples = data.benchExamples()
    const pushed = [...damageSet(basePlans(examples.twoBedFlat, examples.minimal))].filter(
      (d) => d.mutation.kind === 'move an opening' && /flush to the end|to the very start/.test(d.mutation.detail)
    )
    expect(pushed).toHaveLength(141)
    expect(pushed.filter((d) => !names(d.plan, d.mutation.target!)).map((d) => `${d.base.name}: ${d.mutation.detail}`)).toEqual([])
  }, 300_000)

  it("CP4-11 names each of the three partitions that meet the south wall inside a 3 m window", () => {
    const found = validatePlan(labPlan('CP4/scenarios/testfit/option-b.json'))
      .issues.filter((i) => i.code === 'wall/ends-in-opening' && i.message.includes('wall "ext-s"'))
      .map((i) => [i.id, (i as { hits?: readonly string[] }).hits?.[0]])
    expect(found).toEqual([
      ['s-x1', 'win-s-2'],
      ['s-x2', 'win-s-3'],
      ['s-x3', 'win-s-4']
    ])
  })

  it('MS-8 names the opening, or the wall that ends in it, in each of the lab plans', () => {
    const cases: [string, string][] = [
      ['AU1/scenarios/MS-8/door-in-the-corner.json', 'door'],
      ['AU1/scenarios/MS-8/window-in-the-corner.json', 'window'],
      ['AU1/scenarios/MS-8/v-open-2-silent-door-on-virtual.json', 'ghost'],
      ['AU1/scenarios/MS-8/d1-door-across-wall-junction.json', 'corr-exit'],
      ['AU1/scenarios/MS-8/villa-straddle-door.json', 'd-straddle']
    ]
    for (const [name, opening] of cases) {
      const said = validatePlan(labPlan(name)).issues.filter((i) => /crosses-wall|ends-in-opening|on-dividing-line/.test(i.code))
      expect(said.some((i) => i.id === opening || (i as { hits?: readonly string[] }).hits?.includes(opening)), name).toBe(true)
    }
  })

  it('F28 puts a door swing that hits a wall in the report, naming the wall', () => {
    const plan = labPlan('AU1/scenarios/MS-8/door-in-the-corner.json')
    const swung = {
      ...plan,
      walls: [...plan.walls, { id: 'stub', start: [1.5, 0.6], end: [1.5, 1.6], thickness: 0.1, height: 2.7, kind: 'partition' }],
      openings: plan.openings.map((o) => (o.id === 'door' ? { ...o, offset: 1, hinge: 'start', swing: 'left' } : o))
    }
    const line = inspectPlan(swung).lines.find((l) => l.code === 'opening/door-blocked')
    expect(line?.thing).toEqual({ kind: 'opening', id: 'door' })
    expect(line?.also).toContain('stub')
  })
})
