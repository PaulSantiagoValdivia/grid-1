/**
 * CNT-5 (lab EL-3): in the lab's non-home buildings, the agents wrote each room's use in their own
 * words (classroom, consulting, warehouse, retail…), and Grid, which knew nine uses of a home, read
 * 69 to 99.5% of their floor as having no use stated. With the uses past homes, and the words
 * that plainly mean one read as it, under 10% is left. The share is of the net floor area, by
 * `planAreaFigures`; "before" reads the same plans with only the nine uses Grid knew before CNT-5.
 */
import { describe, expect, it } from 'vitest'
import { planAreaFigures } from '@ongrid/floorplan/geometry/areas'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import * as data from '../src/data'

/**
 * The lab's five non-home buildings whose rooms carry the agents' own words for their use. The
 * gym is not among them: its "Studio" is a word Grid does not read as a use (a studio is a flat
 * as often as a room to train in), so it falls from 86% to 30%, its studio.
 */
const BUILDINGS = ['clinic', 'office', 'school', 'shop', 'warehouse'].map((name) => `C/scenarios/${name}.json`)

/** The nine uses Grid knew before CNT-5, read whatever their capitals as they were then. */
const BEFORE_USES = ['bedroom', 'living', 'dining', 'kitchen', 'bathroom', 'corridor', 'stair', 'storage', 'other']

/** The share of the plan's net floor area with no use stated, in per cent. */
function noUseShare(plan: FloorPlan): number {
  const areas = planAreaFigures(plan)
  return (100 * (areas.byUse['not said'] ?? 0)) / (areas.net.area ?? 0)
}

describe('the share of floor with no use stated in the lab\'s non-home buildings (EL-3)', () => {
  const texts = new Map(data.labPlans().map((plan) => [plan.name, plan.text]))
  const raw = (name: string): Record<string, unknown> => {
    const text = texts.get(name)
    expect(text, name).toBeDefined()
    return JSON.parse(text!) as Record<string, unknown>
  }

  it.each(BUILDINGS)('%s: from 69–99.5% before CNT-5 to under 10%', (name) => {
    const file = raw(name)
    const before = FloorPlanSchema.parse({
      ...file,
      rooms: (file['rooms'] as Record<string, unknown>[]).map((room) => {
        const use = typeof room['use'] === 'string' ? room['use'].toLowerCase() : undefined
        const rest = { ...room }
        delete rest['use']
        return use !== undefined && BEFORE_USES.includes(use) ? { ...rest, use } : rest
      }),
    })
    const beforeShare = noUseShare(before)
    expect(beforeShare, name).toBeGreaterThanOrEqual(68.5)
    expect(beforeShare, name).toBeLessThanOrEqual(99.6)
    expect(noUseShare(FloorPlanSchema.parse(file)), name).toBeLessThan(10)
  })
})
