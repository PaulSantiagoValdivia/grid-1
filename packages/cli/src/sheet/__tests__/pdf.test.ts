import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { loadCanvas } from '../../draw/canvas'
import { registerSheetFonts, SANS, SERIF } from '../fonts'
import { sheetPages, type Sheet, type SheetPage } from '../pages'
import { A3, layoutSheet, sheetPdf, wrapLines } from '../pdf'

const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-floor-house.json'), 'utf8')))
const loaded = { file: 'two-floor-house.json', plan, ...validatePlan(plan) }
const date = new Date('2026-11-21T12:00:00Z')

/** Pages in a PDF, by its page objects. Skia writes each page as its own object. */
function pageCount(pdf: Uint8Array): number {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

const clientSheet = () => sheetPages(loaded, { version: '1', name: 'Solace House' }, 'client', { name: 'two-floor-house', date })
const checkSheet = () => sheetPages(loaded, null, 'check', { name: 'two-floor-house', date })

/** A check sheet whose first floor page holds 80 long notes. */
function crowded(): { sheet: Sheet; notes: string[] } {
  const base = checkSheet()
  const notes = Array.from({ length: 80 }, (_, i) => `Note ${i}: ${'a long sentence about what was found on this floor '.repeat(3)}${i}`)
  const pages = base.pages.map((page, i): SheetPage => (i === 1 ? { ...page, notes } : page))
  return { sheet: { ...base, pages }, notes }
}

describe('the sheet as a PDF (VEW-7)', () => {
  it('writes one PDF page for each page of the client sheet', async () => {
    const sheet = clientSheet()
    const result = await sheetPdf(plan, sheet)
    expect(Buffer.from(result.pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(pageCount(result.pdf)).toBe(sheet.pages.length)
    expect(result.sheet.pages).toHaveLength(sheet.pages.length)
  }, 30_000)

  it('writes one PDF page for each page of the check sheet', async () => {
    const sheet = checkSheet()
    expect(pageCount((await sheetPdf(plan, sheet)).pdf)).toBe(sheet.pages.length)
  }, 30_000)

  it('moves what does not fit onto continuation pages, with every note once', async () => {
    const { sheet, notes } = crowded()
    const result = await sheetPdf(plan, sheet)
    expect(result.sheet.pages.length).toBeGreaterThan(sheet.pages.length)
    expect(pageCount(result.pdf)).toBe(result.sheet.pages.length)
    const shown = result.sheet.pages.flatMap((p) => p.notes)
    for (const note of notes) expect(shown.filter((n) => n === note)).toHaveLength(1)
    const more = result.sheet.pages.filter((p) => p.title?.endsWith('(continued)'))
    expect(more.length).toBeGreaterThan(0)
    for (const page of more) { expect(page.picture).toBeNull(); expect(page.figures).toEqual([]) }
  }, 60_000)

  it('numbers the footers 1 to n of n', async () => {
    const laid = await layoutSheet(crowded().sheet)
    expect(laid.pages.map((p) => p.footer.page)).toEqual(laid.pages.map((_, i) => i + 1))
    for (const page of laid.pages) expect(page.footer.pages).toBe(laid.pages.length)
  }, 30_000)

  it('wraps a 120-character name and a 200-character headline inside the page width', async () => {
    const name = 'Wide name '.repeat(12).slice(0, 120)
    const headline = 'A headline that goes on and on about the house '.repeat(5).slice(0, 200)
    const canvas = await loadCanvas()
    registerSheetFonts(canvas)
    const ctx = canvas.createCanvas(10, 10).getContext('2d')
    const width = A3.width - 96
    for (const [text, family, size] of [[name, SERIF, 34], [headline, SANS, 13], ['U'.repeat(150), SERIF, 34]] as const) {
      ctx.font = `${size}px "${family}"`
      expect(ctx.measureText(text).width).toBeGreaterThan(width)
      const lines = wrapLines(ctx, text, width)
      expect(lines.length).toBeGreaterThan(1)
      for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(width)
      expect(lines.join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''))
    }
    const words = { version: '1', name, headline } as never
    const sheet = sheetPages(loaded, words, 'client', { name: 'x', date })
    expect(pageCount((await sheetPdf(plan, sheet)).pdf)).toBe((await layoutSheet(sheet)).pages.length)
  }, 60_000)
})
