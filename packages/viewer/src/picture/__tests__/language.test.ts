import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadLanguage, say, labelOfUse } from '@ongrid/floorplan/messages'
import { FloorPlanSchema, ROOM_USES, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture, planToSvg, pictureToSvg } from '../planSvg'
import type { FaultLine } from '../faults'
import { sectionPicture } from '../section'
import { labPlan } from '@ongrid/floorplan/test-support/lab'

/**
 * MSG-11: Grid's own words on a drawing in the person's language, with its decimal mark. The
 * room names stay as the person wrote them; English stays as it was.
 */
const madrid = (): FloorPlan =>
  FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/madrid-flat.json'), 'utf8')))

/** Every text node of an SVG, unescaped. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
const partTexts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<text[^>]*data-part="${part}"[^>]*>([^<]*)</text>`, 'g'))].map((m) => m[1]!)
/** A fault on a floor the drawing does not show: the list under it says there is one elsewhere. */
const elsewhere: FaultLine[] = [{ thing: { kind: 'plan', id: 'plan' }, floor: 'not-this-floor', message: 'x' }]
const shown = { key: true, colourBy: 'use' } as const

beforeAll(async () => {
  await loadLanguage('es')
})

describe('a drawing in Spanish (MSG-11)', () => {
  it('writes the label, the key and the list in Spanish, with decimal commas', () => {
    const svg = planToSvg(madrid(), { language: 'es', show: shown, faults: elsewhere })
    const words = texts(svg)
    expect(words).toContain(say('es', 'label'))
    expect(words).toContain('Orientación general, no sus normas locales')
    expect(words).toContain('Leyenda')
    expect(words).toContain('Muro exterior')
    expect(words).toContain('Estancia: salón')
    expect(words).toContain('Estancia: dormitorio')
    expect(words).toContain('Nada que revisar en esta planta.')
    expect(words).toContain('1 más en otras plantas.')
    expect(svg).toMatch(/aria-label="Plano con \d+ estancias y una leyenda de lo que conviene revisar"/)
    // Every figure has a decimal comma, none a point.
    const figures = [...partTexts(svg, 'dimension-text'), ...words.filter((w) => /\d/.test(w))]
    expect(figures.some((w) => /\d,\d/.test(w))).toBe(true)
    expect(figures.filter((w) => /\d\.\d/.test(w))).toEqual([])
    const areas = partTexts(svg, 'area')
    expect(areas.length).toBeGreaterThan(0)
    for (const area of areas) expect(area).toMatch(/^\d+,\d{2} m²$/)
    expect(svg).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
    expect(words.join('\n')).not.toMatch(/\b(Key|Outside wall|Inside wall|Window|Room:|Nothing to look at)\b/)
  })

  it('keeps every room name as it is written', () => {
    const plan = madrid()
    const english = partTexts(planToSvg(plan), 'label')
    const spanish = partTexts(planToSvg(plan, { language: 'es' }), 'label')
    expect(spanish).toEqual(english)
    expect(spanish).toContain('Salón-comedor')
    expect(spanish).toContain('Baño')
  })

  it("takes the plan's own language, and its stated decimal point", () => {
    const plan = madrid()
    const own = planToSvg({ ...plan, display: { language: 'es' } }, { show: shown })
    expect(texts(own)).toContain('Leyenda')
    expect(partTexts(own, 'dimension-text').every((w) => !/\d\.\d/.test(w))).toBe(true)
    const point = planToSvg({ ...plan, display: { language: 'es', decimal: 'point' } }, { show: shown })
    expect(texts(point)).toContain('Leyenda')
    expect(partTexts(point, 'dimension-text').some((w) => /\d\.\d/.test(w))).toBe(true)
    expect(partTexts(point, 'dimension-text').some((w) => /\d,\d/.test(w))).toBe(false)
    // A language asked for wins over the plan's.
    expect(texts(planToSvg({ ...plan, display: { language: 'es' } }, { language: 'en', show: shown }))).toContain('Key')
  })

  it('leaves English exactly as it was', () => {
    const plan = madrid()
    const options = { show: shown, faults: elsewhere }
    const plain = planToSvg(plan, options)
    expect(planToSvg(plan, { ...options, language: 'en' })).toBe(plain)
    expect(planToSvg({ ...plan, display: { language: 'en' } }, options)).toBe(plain)
    expect(planPicture(plan).language).toBeUndefined()
    // The key's room uses are their ids in English, as they always were.
    for (const use of ROOM_USES) expect(labelOfUse('en', use)).toBe(use)
    expect(pictureToSvg(planPicture(plan, { language: 'es' }))).toContain('Orientación general, no sus normas locales')
  })
})

describe('a section and the marks on a plan in Spanish (LVL-9, after merging main at e486ccba)', () => {
  const line = { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 13 }, toward: 'left' as const }
  const townhouse = () => labPlan('A/scenarios/townhouse.json')

  it('writes its title, levels, heights and the list of what Grid took in Spanish', () => {
    const english = sectionPicture(townhouse(), line, { look: 'technical' })
    const picture = sectionPicture(townhouse(), line, { look: 'technical', language: 'es' })
    const svg = pictureToSvg(picture)
    const words = texts(svg)
    expect(picture.title).toMatch(/^Sección A–A, que corta \d+ estancias?$/)
    expect(svg).toMatch(/aria-label="Sección A–A, que corta \d+ estancias?, y una leyenda de lo que conviene revisar"/)
    expect(svg).toContain('Orientación general, no sus normas locales')
    expect(words).toContain('Sección A–A')
    expect(words.some((w) => /^Corte de \(4,90; -2,00\) a \(4,90; 13,00\), mirando a la izquierda/.test(w))).toBe(true)
    expect(words.some((w) => / Terreno$/.test(w))).toBe(true)
    expect(words.some((w) => /^\d+,\d{2} m$/.test(w))).toBe(true)
    // Every sentence of what was taken is said in Spanish, as many as in English.
    expect(english.section.assumed.length).toBeGreaterThan(0)
    for (const a of picture.section.assumed) expect(words.join('\n')).not.toContain(a.words.slice(0, 30))
    expect(svg).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
    // The plan's own floor names ("Ground floor") stay as written.
    expect(words.join('\n')).not.toMatch(/\b(Section|Cut from|Hatched|Also taken)\b|\b(Ground|Roof)$/m)
  })

  it('keeps the English as it was, and its sentences as data', () => {
    const picture = sectionPicture(townhouse(), line)
    expect(picture.title).toMatch(/^Section A–A through \d+ rooms?$/)
    expect(picture.language).toBeUndefined()
    for (const a of picture.section.assumed) {
      expect(a.said).toBeDefined()
      expect(Object.keys(a)).not.toContain('said')
    }
  })

  it('names the elevation marks by the way they face in Spanish', () => {
    const svg = planToSvg(townhouse(), { language: 'es', marks: { section: null, elevations: true, levels: false } })
    const marks = [...svg.matchAll(/<g [^>]*data-part="elevation-mark"[^>]*data-faces="([a-z-]+)"[\s\S]*?<text[^>]*>([^<]*)<\/text>/g)].map((m) => [m[1], m[2]])
    expect(marks.length).toBeGreaterThan(0)
    for (const [faces, letters] of marks) expect(letters).toBe(say('es', `drawing.mark.faces.${faces as 'north'}`))
  })
})
