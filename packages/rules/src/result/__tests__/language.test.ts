/**
 * MSG-11: the record in Spanish. The codes, kinds, things and values are the same in every
 * language; the label, each line's message, found, needed and fix are said in the language,
 * with its decimal comma, and no Spanish line reads as a pass or as approval (MSG-3's words,
 * with Spanish ones added). Room names stay as written.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadLanguage, say } from '@ongrid/floorplan/messages'
import { approvalWords, GENERAL_GUIDANCE_LABEL, inspectPlan, type GridResult } from '../..'

const fixtures = resolve(__dirname, '../../../../floorplan/fixtures')
const fixturePlans = readdirSync(fixtures)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, text: readFileSync(resolve(fixtures, name), 'utf8') }))

/** Every 40th lab plan, sound and broken alike, as the scoreboard stores them. */
const labPlans = gunzipSync(readFileSync(resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')))
  .toString('utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as { name: string; text: string })
  .filter((_, i) => i % 40 === 0)

/** The plan's names and ids: the person's words, which a line may repeat as they are. */
function userText(text: string): string[] {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    const parts = ['walls', 'rooms', 'openings', 'floors', 'items', 'stairs'].flatMap((key) => (Array.isArray(raw[key]) ? (raw[key] as Record<string, unknown>[]) : []))
    return parts.flatMap((part) => [part?.['id'], part?.['name'], part?.['label']]).filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

const words = (result: GridResult): string[] => [result.label, ...result.lines.flatMap((line) => [line.message, line.found, line.needed, line.fix])]

beforeAll(async () => {
  await loadLanguage('es')
})

describe('the record in Spanish (MSG-11)', () => {
  it('reads enough plans to mean something', () => {
    expect(fixturePlans.length).toBeGreaterThan(5)
    expect(labPlans.length).toBeGreaterThan(25)
  })

  it('keeps every code, kind, thing, figure and value, and says the words in Spanish', () => {
    for (const { name, text } of [...fixturePlans, ...labPlans]) {
      const english = inspectPlan(text)
      const spanish = inspectPlan(text, { language: 'es' })
      expect(english.label, name).toBe(GENERAL_GUIDANCE_LABEL)
      expect(english.language, name).toBeUndefined()
      expect(spanish.label, name).toBe(say('es', 'label'))
      expect(spanish.language, name).toBe('es')
      const shape = (r: GridResult): unknown[] => r.lines.map((l) => [l.code, l.kind, l.thing, l.floor, l.also, l.figures ?? null, l.fixes ?? null, l.values ?? null])
      expect(shape(spanish), name).toEqual(shape(english))
      expect(spanish.count, name).toBe(english.count)
    }
  })

  it('leaves no placeholder unfilled and no English wording behind', () => {
    const left: string[] = []
    for (const { name, text } of [...fixturePlans, ...labPlans]) {
      const result = inspectPlan(text, { language: 'es' })
      for (const line of result.lines) {
        for (const said of [line.message, line.found, line.needed, line.fix]) {
          if (/\{[A-Za-z]+\}/.test(said)) left.push(`${name} ${line.code}: ${said}`)
          // A few English words Grid writes and Spanish does not: a sign of a sentence left untranslated.
          if (/\b(?:the|which|has|is not|does not|should)\b/.test(said.replace(/"(?:[^"\\]|\\.)*"/g, ''))) left.push(`${name} ${line.code} (English?): ${said}`)
        }
      }
    }
    expect(left).toEqual([])
  })

  it('writes figures with a decimal comma, and a stated decimal point when the plan asks for it', () => {
    const flat = fixturePlans.find((p) => p.name === 'madrid-flat.json')!.text
    const spanish = inspectPlan(flat, { language: 'es' })
    const found = spanish.lines.map((l) => l.found).join('\n')
    expect(found).toMatch(/\d,\d{2} m\b/)
    expect(found).not.toMatch(/\d\.\d{2} m\b/)
    const pointed = inspectPlan(flat, { language: 'es', decimal: 'point' })
    expect(pointed.lines.map((l) => l.found).join('\n')).toMatch(/\d\.\d{2} m\b/)
  })

  it('never reads as a pass or as approval, in Spanish (MSG-3)', () => {
    const found: string[] = []
    for (const { name, text } of [...fixturePlans, ...labPlans]) {
      const users = userText(text)
      for (const said of words(inspectPlan(text, { language: 'es' }))) {
        const hits = approvalWords(said, users)
        if (hits.length > 0) found.push(`${name}: ${hits.join(', ')} in ${said}`)
      }
    }
    expect(found).toEqual([])
  })

  it('names the Spanish words that read as approval, and leaves quoted names alone', () => {
    expect(approvalWords('El plano cumple la normativa')).toEqual(['cumple'])
    expect(approvalWords('Proyecto aprobado y homologado')).toEqual(['aprobado', 'homologado'])
    expect(approvalWords('Es válido; conforme a la norma; certificado')).toEqual(['conforme', 'certificado', 'válido'])
    expect(approvalWords('Estancia "Aprobado": sin uso indicado')).toEqual([])
    expect(approvalWords('Grid lee "cumple"')).toEqual([])
  })

  it('reads "dormitorio" as a bedroom and checks it as one, keeping the room\'s name as written', () => {
    const flat = JSON.parse(fixturePlans.find((p) => p.name === 'two-bed-flat.json')!.text) as { rooms: { id: string; name: string; use?: string }[] }
    const bedroom = flat.rooms.find((room) => room.use === 'bedroom')!
    bedroom.use = 'dormitorio'
    bedroom.name = 'dormitorio'
    // COD-3: the room sizes are checked only with a place stated.
    const asSpanish = inspectPlan(JSON.stringify(flat), { language: 'es', country: 'US' })
    const asEnglish = inspectPlan(JSON.stringify({ ...flat, rooms: flat.rooms.map((r) => (r.id === bedroom.id ? { ...r, use: 'bedroom' } : r)) }), { country: 'US' })
    expect(asSpanish.lines.map((l) => l.code)).toEqual(asEnglish.lines.map((l) => l.code))
    expect(asSpanish.lines.some((l) => l.code === 'plan/unknown-use')).toBe(false)
    const coverage = asSpanish.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(coverage.lookedAt.flatMap((g) => g.ids)).toContain(bedroom.id)
  })
})
