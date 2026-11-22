import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { loadLanguage, say } from '@ongrid/floorplan/messages'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { approvalWords } from '@ongrid/rules'
import { planToSvg } from '@ongrid/viewer/src/picture'
import { NOTHING_FOUND } from '../../command/check'
import type { LoadedPlan } from '../../command/plan'
import { planPictureOptions, sheetPages, type Sheet, type SheetPicture } from '../pages'
import { layoutSheet, sheetPdf } from '../pdf'

/**
 * MSG-11: the sheet and its drawings in the person's language, with its decimal mark: the label
 * in Spanish, decimal commas, the room names as written, nothing left unfilled, and no word that
 * reads as approval in either language.
 */
function fixture(name: string): LoadedPlan {
  const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures', name), 'utf8')))
  const { issues, broken } = validatePlan(plan)
  return { file: name, plan, issues, broken }
}

const madrid = fixture('madrid-flat.json')
const names = madrid.plan.rooms.map((room) => room.name ?? room.id)
const date = new Date('2026-11-21T12:00:00Z')
const words = { version: '1' as const, name: 'Piso en Madrid' }

/** Every piece of text a sheet prints. */
function sheetText(sheet: Sheet): string[] {
  return sheet.pages.flatMap((page) => [
    page.topLine,
    page.title ?? '',
    page.subtitle ?? '',
    ...page.paragraphs,
    ...page.figures.flatMap((f) => [f.value, f.label]),
    ...(page.table ? [page.table.heading, page.table.note ?? '', ...[...page.table.rows, ...(page.table.total ? [page.table.total] : [])].flatMap((r) => [r.name, r.detail ?? '', r.area])] : []),
    ...page.notes,
    page.footer.label,
    page.footer.date,
  ])
}

const svgTexts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)

beforeAll(async () => {
  await loadLanguage('es')
})

describe('a sheet in Spanish (MSG-11)', () => {
  const client = () => sheetPages(madrid, words, 'client', { name: 'madrid-flat', date, language: 'es' })
  const check = () => sheetPages(madrid, null, 'check', { name: 'madrid-flat', date, language: 'es' })

  it('carries the Spanish label on every page, and its own words in Spanish', () => {
    for (const sheet of [client(), check()]) {
      expect(sheet.language).toBe('es')
      for (const page of sheet.pages) expect(page.footer.label).toBe('Orientación general, no sus normas locales')
      expect(sheet.pages[0]!.footer.date).toBe('21 NOV 2026')
    }
    const text = [...sheetText(client()), ...sheetText(check())]
    for (const own of ['superficie interior bruta', 'Estancias / m²', 'Superficie útil', 'Juego de comprobación', 'Cuadro de estancias', 'Cuadro de puertas y ventanas']) {
      expect(text).toContain(own)
    }
    // The sheet's own words; the notes also carry lines made elsewhere (the check, the area rules).
    const own = [client(), check()].flatMap((sheet) => sheet.pages.flatMap((page) => [page.title ?? '', ...page.figures.map((f) => f.label), page.table?.heading ?? '', page.table?.total?.name ?? '']))
    expect(own.join('\n')).not.toMatch(/\b(Net area|Check set|Room schedule|Door and window|gross internal area|floors?|bedrooms?|In all)\b/)
    expect(text.filter((line) => /^(Not checked|Finding|Left out|Worth a look)\b/.test(line))).toEqual([])
  })

  it('writes decimal commas and the room names as written', () => {
    const sheet = client()
    const floor = sheet.pages.find((page) => page.kind === 'floor')!
    expect(floor.table!.rows.map((row) => row.name).sort()).toEqual([...names].sort())
    for (const row of [...floor.table!.rows, floor.table!.total!]) expect(row.area).toMatch(/^\d+(,\d+)?$|^sin medir$|^contada abajo$/)
    expect(sheet.pages[0]!.figures[0]!.value).toMatch(/^\d+,\d m²$/)
    const schedule = check().pages.find((page) => page.title === 'Cuadro de puertas y ventanas')!
    expect(schedule.table!.rows.every((row) => !/\d\.\d/.test(row.detail ?? ''))).toBe(true)
    expect(schedule.table!.rows.some((row) => /\d,\d/.test(row.detail ?? ''))).toBe(true)
  })

  it('leaves no placeholder and no word that reads as approval', () => {
    const text = [...sheetText(client()), ...sheetText(check())].join('\n')
    expect(text).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
    expect(approvalWords(text, names)).toEqual([])
  })

  it('draws its floor plans in Spanish, with decimal commas', () => {
    const picture = check().pages.find((page) => page.picture?.kind === 'plan')!.picture as Extract<SheetPicture, { kind: 'plan' }>
    const { options } = planPictureOptions(picture, 'es')
    expect(options.language).toBe('es')
    const svg = planToSvg(madrid.plan, { ...options, show: { key: true } })
    const texts = svgTexts(svg)
    expect(texts).toContain('Leyenda')
    expect(texts.filter((t) => /\d\.\d/.test(t))).toEqual([])
    expect(texts.some((t) => /\d,\d/.test(t))).toBe(true)
    expect(svg).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
    expect(approvalWords(texts.join('\n'), names)).toEqual([])
    // grid draw's own picture, with its label.
    const drawn = planToSvg(madrid.plan, { language: 'es', look: 'technical', show: { key: true, colourBy: 'use' } })
    expect(svgTexts(drawn)).toContain(say('es', 'label'))
    expect(approvalWords(svgTexts(drawn).join('\n'), names)).toEqual([])
  })

  it('makes a PDF, its continuation pages titled in Spanish', async () => {
    const sheet = check()
    const long = { ...sheet, pages: sheet.pages.map((page, i) => (i === 1 ? { ...page, notes: Array.from({ length: 60 }, (_, n) => `Nota ${n}: ${'una frase larga sobre esta planta '.repeat(3)}`) } : page)) }
    const laid = await layoutSheet(long)
    expect(laid.pages.some((page) => page.title?.endsWith('(continuación)'))).toBe(true)
    const { pdf } = await sheetPdf(madrid.plan, sheet)
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
  }, 60_000)
})

describe('a sheet in English (MSG-11)', () => {
  it('is the same with English asked for as with none', () => {
    const plain = sheetPages(madrid, words, 'client', { name: 'madrid-flat', date })
    expect(sheetPages(madrid, words, 'client', { name: 'madrid-flat', date, language: 'en' })).toEqual(plain)
    expect(plain.pages[0]!.footer.label).toBe(say('en', 'label'))
  })

  it("says the check's own words for nothing found", () => {
    expect(say('en', 'sheet.nothingFound')).toBe(NOTHING_FOUND)
  })
})

describe("a sheet in Spanish in the person's own units (MSG-11, WRT-7)", () => {
  const inUnits = (display: NonNullable<LoadedPlan['plan']['display']>): LoadedPlan => ({ ...madrid, plan: { ...madrid.plan, display } })
  const both = (loaded: LoadedPlan): Sheet[] => [
    sheetPages(loaded, words, 'client', { name: 'madrid-flat', date, language: 'es' }),
    sheetPages(loaded, null, 'check', { name: 'madrid-flat', date, language: 'es' }),
  ]
  const schedule = (sheet: Sheet, title: string) => sheet.pages.find((page) => page.title === title)!.table!

  it('reads in Spanish in feet and inches: square feet, feet and inches, and square metres with a decimal comma beside them', () => {
    const [client, check] = both(inUnits({ length: 'ft-in' }))
    const gross = client!.pages[0]!.figures.find((f) => f.label === 'superficie interior bruta')!
    expect(gross.value).toMatch(/^\d+ pies²$/)
    expect(client!.pages[0]!.figures.find((f) => f.label === 'altura libre')!.value).toMatch(/^\d+'-\d+"$/)
    expect(client!.pages.find((page) => page.kind === 'floor')!.table!.heading).toBe('Estancias / pies²')
    const rooms = schedule(check!, 'Cuadro de estancias')
    expect(rooms.heading).toBe('Cuadro de estancias / pies²')
    expect(rooms.rows.some((row) => /\d+'-\d+" de alto/.test(row.detail ?? ''))).toBe(true)
    expect(rooms.total!.detail).toMatch(/^\d+ estancias, \d+,\d m²$/)
    const openings = schedule(check!, 'Cuadro de puertas y ventanas')
    expect(openings.rows.some((row) => /^\d+'-\d+" × \d+'-\d+"/.test(row.detail ?? ''))).toBe(true)
    expect(openings.rows.some((row) => /antepecho \d+"/.test(row.detail ?? ''))).toBe(true)
    for (const sheet of [client!, check!]) {
      const text = sheetText(sheet).join('\n')
      // The sheet's own words; its notes also carry the schedules' rules, made elsewhere and in English for now.
      const own = sheet.pages.flatMap((page) => [...page.figures.flatMap((f) => [f.value, f.label]), ...(page.table ? [page.table.heading, ...[...page.table.rows, ...(page.table.total ? [page.table.total] : [])].flatMap((r) => [r.detail ?? '', r.area])] : [])])
      expect(own.join('\n')).not.toMatch(/\bsq ft\b|\bhigh\b|\bsill\b|\brooms\b/)
      expect(text).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
      expect(approvalWords(text, names)).toEqual([])
      for (const page of sheet.pages) expect(page.footer.label).toBe('Orientación general, no sus normas locales')
    }
  })

  it('reads in Spanish in millimetres, with square metres to a decimal comma', () => {
    const [client, check] = both(inUnits({ length: 'mm' }))
    expect(client!.pages[0]!.figures.find((f) => f.label === 'superficie interior bruta')!.value).toMatch(/^\d+,\d m²$/)
    expect(client!.pages[0]!.figures.find((f) => f.label === 'altura libre')!.value).toMatch(/^\d+ mm$/)
    const rooms = schedule(check!, 'Cuadro de estancias')
    expect(rooms.heading).toBe('Cuadro de estancias / m²')
    expect(rooms.rows.some((row) => /\d+ mm de alto/.test(row.detail ?? ''))).toBe(true)
    const openings = schedule(check!, 'Cuadro de puertas y ventanas')
    expect(openings.rows.some((row) => /^\d+ mm × \d+ mm/.test(row.detail ?? ''))).toBe(true)
    for (const sheet of [client!, check!]) {
      const figures = sheet.pages.flatMap((page) => [...page.figures.map((f) => f.value), ...(page.table ? [...page.table.rows, ...(page.table.total ? [page.table.total] : [])].map((r) => r.area) : [])])
      expect(figures.filter((figure) => /\d\.\d/.test(figure))).toEqual([])
      expect(sheetText(sheet).join('\n')).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
    }
  })

  it("keeps the display's own decimal mark when it states one", () => {
    const [client] = both(inUnits({ length: 'm', decimal: 'point' }))
    expect(client!.pages[0]!.figures.find((f) => f.label === 'superficie interior bruta')!.value).toMatch(/^\d+\.\d m²$/)
    const [commaFeet] = both(inUnits({ length: 'ft-in', area: 'm2', decimal: 'comma' }))
    expect(commaFeet!.pages[0]!.figures.find((f) => f.label === 'superficie interior bruta')!.value).toMatch(/^\d+,\d m²$/)
  })
})
