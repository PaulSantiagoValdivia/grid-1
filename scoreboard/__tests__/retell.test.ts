/**
 * MSG-3: the retelling prompt set and its scorer, offline. The prompts are built from real
 * reports and carry the rule an agent is given; the scorer gives each fixed sample retelling
 * (`scoreboard/retell/samples.json`, written by hand) the score it must. Nothing is sent to a
 * model here: that run is the owner's (`npm run retell`, reviews/MSG-3.md).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { RETELLING_RULE } from '../../packages/cli/src/mcp/retelling'
import { retellCases, retellPrompt, retellSummary, runRetellings, scoreRetelling, type RetellPrompt } from '../src/retell'

interface Sample {
  readonly id: string
  readonly case: string
  readonly retelling: string
  readonly expect: { readonly ok: boolean; readonly labelFirst: boolean; readonly forbidden: readonly string[]; readonly unsourced: readonly string[] }
}

const samples = (JSON.parse(readFileSync(resolve(__dirname, '../retell/samples.json'), 'utf8')) as { samples: Sample[] }).samples
const cases = retellCases()
const prompts = new Map<string, RetellPrompt>(cases.map((one) => [one.id, retellPrompt(one)]))

describe('the retelling prompts', () => {
  it('has a dozen cases with distinct ids, each asking a question a person asks', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12)
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
  })

  it.each(cases.map((c) => c.id))('%s: gives the model the rule and a real report that leads with the label', (id) => {
    const prompt = prompts.get(id)!
    expect(prompt.system).toContain(RETELLING_RULE)
    expect(prompt.report.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(prompt.user).toContain(prompt.report.trimEnd())
    expect(approvalWords(prompt.report, prompt.userText)).toEqual([])
  })

  it('covers reports with figures, with findings and with figures for another place not applied', () => {
    expect([...prompts.values()].filter((p) => p.figures.length > 0).length).toBeGreaterThanOrEqual(8)
    expect(prompts.get('studio-ok-to-build')!.report).toContain('[room/too-small]')
    expect(prompts.get('berlin-local-rules')!.figures).toEqual([])
  })
})

describe('the scorer, on fixed sample retellings', () => {
  it('has a sample for each way a retelling can fail, and some that hold', () => {
    expect(samples.some((s) => s.expect.ok)).toBe(true)
    expect(samples.some((s) => !s.expect.labelFirst)).toBe(true)
    expect(samples.some((s) => s.expect.forbidden.length > 0)).toBe(true)
    expect(samples.some((s) => s.expect.unsourced.length > 0)).toBe(true)
  })

  it.each(samples.map((s) => s.id))('%s', (id) => {
    const sample = samples.find((s) => s.id === id)!
    const prompt = prompts.get(sample.case)
    expect(prompt, sample.case).toBeDefined()
    const score = scoreRetelling(prompt!, sample.retelling)
    expect(score.ok).toBe(sample.expect.ok)
    expect(score.labelFirst).toBe(sample.expect.labelFirst)
    expect(score.forbidden).toEqual(sample.expect.forbidden)
    expect(score.figures.filter((f) => f.given && !(f.basis && f.status)).map((f) => f.key)).toEqual(sample.expect.unsourced)
  })

  it('scores a whole run through a stand-in for the model, offline', async () => {
    const good = samples.find((s) => s.id === 'good-retelling')!.retelling
    const bad = samples.find((s) => s.id === 'says-it-complies')!.retelling
    const two = [prompts.get('studio-ok-to-build')!, prompts.get('studio-meets-code')!]
    const { scores, answers } = await runRetellings(two, async (prompt) => (prompt.id === 'studio-ok-to-build' ? good : bad))
    expect(Object.keys(answers)).toEqual(['studio-ok-to-build', 'studio-meets-code'])
    expect(retellSummary(scores)).toEqual({ total: 2, ok: 1, labelFirst: 2, noForbidden: 1, figuresSourced: 2 })
  })
})
