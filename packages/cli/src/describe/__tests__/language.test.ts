import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { approvalWords } from '@ongrid/rules'
import { describePlan } from '../../command/describe'
import { languageFor } from '../../command/language'
import type { LoadedPlan } from '../../command/plan'
import { DESCRIBE_LENGTHS } from '../card'

/**
 * MSG-11: `grid describe` in the person's language. The two-bedroom flat has English room names
 * and stated uses, so the Spanish words in its description are Grid's own and its names stay as
 * written. English is held byte for byte by the other tests here.
 */

const fixture = resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json')

function loaded(plan: FloorPlan): LoadedPlan {
  return { file: fixture, plan, issues: [], broken: new Set() } as unknown as LoadedPlan
}

const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(fixture, 'utf8')))
const names = plan.rooms.map((room) => room.name)
/** The agent's form prints the plan's ids bare: they are the plan's words too (`pass-kitchen-living`). */
const ids = [...plan.rooms, ...plan.walls, ...plan.openings].map((part) => part.id)

beforeAll(async () => {
  await loadLanguage('es')
})

describe('grid describe in Spanish', () => {
  it('says the uses, the figures and the words in Spanish, and the names as written', () => {
    const text = describePlan(loaded(plan), 'walls', 'person', { language: 'es' })
    expect(text.split('\n')[0]).toBe('Orientación general, no sus normas locales')
    expect(text).toMatch(/\d+ dormitorios?\b/)
    expect(text).toMatch(/\d+ baños?\b/)
    expect(text).toMatch(/\d,\d+ m²/)
    expect(text).toContain('Esto describe el plano y no comprueba nada')
    for (const name of names) expect(text).toContain(name)
    expect(text).not.toMatch(/\d\.\d/)
    expect(text).not.toMatch(/ from | inside | wall | door /)
  })

  it('leaves no placeholder and no word that reads as approval, at every length and for both readers', () => {
    for (const length of DESCRIBE_LENGTHS) {
      for (const audience of ['person', 'agent'] as const) {
        const text = describePlan(loaded(plan), length, audience, { language: 'es' })
        expect(text, `${length} ${audience}`).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
        expect(approvalWords(text, [...names, ...ids]), `${length} ${audience}`).toEqual([])
      }
    }
  })

  it('keeps the decimal point when the plan states it', () => {
    const pointed = FloorPlanSchema.parse({ ...plan, display: { decimal: 'point' } })
    expect(describePlan(loaded(pointed), 'line', 'person', { language: 'es' })).toMatch(/\d\.\d m²/)
  })

  it('writes in the language the plan states when none is asked for, and English when the plan states none', async () => {
    const spanish = FloorPlanSchema.parse({ ...plan, display: { language: 'es' } })
    expect(describePlan(loaded(spanish), 'line', 'person', { language: await languageFor(undefined, spanish) })).toMatch(/^Un plano de /m)
    expect(describePlan(loaded(plan), 'line', 'person', { language: await languageFor(undefined, plan) })).toMatch(/^A plan of /m)
  })
})
