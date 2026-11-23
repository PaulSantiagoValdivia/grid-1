/**
 * CMD-7 (lab F6, Z-11): the sample plans in `docs/samples/` are realistic and whole: a flat, a
 * two-storey house and an open-plan home, each as rooms text and as the plan file `grid write`
 * writes from it (with the site, which rooms text has no words for). Each is read by
 * `parseFloorPlan`, has no drawing problem and nothing to look at, and every check looks at more
 * than none of its parts, so no check skips it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { validatePlan } from '@ongrid/floorplan/geometry/validate'
import { inspectPlan } from '@ongrid/rules'

const folder = resolve(__dirname, '../../../../../docs/samples')
const SAMPLES = ['flat', 'house', 'open-plan']

describe('the sample plans', () => {
  it('are the three the guide names, each as rooms text and a plan file', () => {
    expect(readdirSync(folder).sort()).toEqual(SAMPLES.flatMap((name) => [`${name}.json`, `${name}.rooms`]).sort())
  })

  for (const name of SAMPLES) {
    describe(name, () => {
      const raw = JSON.parse(readFileSync(join(folder, `${name}.json`), 'utf8')) as Record<string, unknown>
      const text = readFileSync(join(folder, `${name}.rooms`), 'utf8')

      it('is read by parseFloorPlan, with no drawing problem', () => {
        const plan = parseFloorPlan(raw)
        expect(validatePlan(plan).issues).toEqual([])
      })

      it('is the plan its rooms text writes, with a site', () => {
        const written = compileRoomsText(text)
        expect(written.problems).toEqual([])
        const plan = parseFloorPlan(raw)
        const fromText = parseFloorPlan(written.plan)
        expect(plan.walls).toEqual(fromText.walls)
        expect(plan.rooms).toEqual(fromText.rooms)
        expect(plan.openings).toEqual(fromText.openings)
        expect(plan.floors).toEqual(fromText.floors)
        expect(plan.site?.country).toBeDefined()
      })

      it('has every check look at more than none of its parts, and nothing to look at', () => {
        const result = inspectPlan(raw)
        expect(result.coverage.length).toBeGreaterThanOrEqual(9)
        expect(result.coverage.filter((check) => check.lookedAtCount === 0).map((check) => check.ruleId)).toEqual([])
        expect(result.lines.filter((line) => line.kind !== 'not-checked')).toEqual([])
      })
    })
  }
})
