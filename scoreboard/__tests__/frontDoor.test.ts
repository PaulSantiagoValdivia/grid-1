/**
 * MSG-1 (lab MS-20, Z-8): the front door, `inspectPlan`, over the 3,000 damaged plans and the
 * 442 sound ones. Nothing throws, no check fails inside Grid, every line carries a code the
 * catalogue words, and each code is worded one way only.
 */
import { describe, expect, it } from 'vitest'
import { CODES, inspectPlan, PLURALS, type ResultLine } from '@ongrid/rules'
import * as data from '../src/data'
import { basePlans, damageSet, soundPlans } from '../src/damage'

/**
 * A message with the plan's names, its figures and the kind of part taken out. MSG-5: a line for
 * several rooms is read back to its one room's words (`PLURALS`).
 */
const wordingOf = (message: string): string =>
  PLURALS.reduce((text, [one, many]) => text.replace(many, one), message)
    .replace(/"(?:[^"\\]|\\.)*"(?:, "(?:[^"\\]|\\.)*")*/g, 'NAME')
    .replace(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g, 'N')
    // MSG-6: a part whose id cannot be read is named by its place.
    .replace(/\bThe (?:wall|room|door|window|opening|floor|item) at [a-z]+\[N\]/g, 'THING')
    .replace(/\b(?:Door|Window|Opening|Wall|Room|Floor) NAME|\bThe plan\b/g, 'THING')

describe('the front door over the damage set', () => {
  it('reads all 3,000 damaged plans and 442 sound ones: 0 exceptions, 0 checks failed, one wording per code', () => {
    const examples = data.benchExamples()
    const bases = basePlans(examples.twoBedFlat, examples.minimal)
    const plans = [...[...damageSet(bases)].map((d) => d.plan as unknown), ...soundPlans(bases).map((s) => s.plan as unknown)]
    expect(plans.length).toBe(3442)

    let thrown = 0
    let refused = 0
    const failed: string[] = []
    const unknown = new Set<string>()
    const wordings = new Map<string, Set<string>>()
    for (const plan of plans) {
      let lines: readonly ResultLine[]
      try {
        const result = inspectPlan(plan)
        if (!result.read) refused++
        expect(result.count).toBe(result.lines.length)
        lines = result.lines
      } catch {
        thrown++
        continue
      }
      for (const line of lines) {
        if (line.code === 'plan/check-failed') failed.push(line.found)
        if (!Object.hasOwn(CODES, line.code)) unknown.add(line.code)
        wordings.set(line.code, (wordings.get(line.code) ?? new Set()).add(wordingOf(line.message)))
      }
    }
    expect(thrown).toBe(0)
    expect(failed).toEqual([])
    expect([...unknown]).toEqual([])
    // The lab counted 506 plans the schema refuses whole (MS-20); since LVL-1 two of them read,
    // and since MSG-6 every one is read part by part, with the damaged value named.
    expect(refused).toBe(0)
    for (const [code, set] of wordings) expect([...set], code).toHaveLength(1)
  }, 600_000)
})
