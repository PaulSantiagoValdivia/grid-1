import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { sheetPages } from '../pages'
import { sheetPdf } from '../pdf'

const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-floor-house.json'), 'utf8')))
const loaded = { file: 'two-floor-house.json', plan, ...validatePlan(plan) }
const date = new Date('2026-11-21T12:00:00Z')

/** Pages in a PDF, by its page objects. Skia writes each page as its own object. */
function pageCount(pdf: Uint8Array): number {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

describe('the sheet as a PDF (VEW-7)', () => {
  it('writes one PDF page for each page of the client sheet', async () => {
    const sheet = sheetPages(loaded, { version: '1', name: 'Solace House' }, 'client', { name: 'two-floor-house', date })
    const pdf = await sheetPdf(plan, sheet)
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(sheet.pages.length)
  }, 30_000)

  it('writes one PDF page for each page of the check sheet', async () => {
    const sheet = sheetPages(loaded, null, 'check', { name: 'two-floor-house', date })
    expect(pageCount(await sheetPdf(plan, sheet))).toBe(sheet.pages.length)
  }, 30_000)
})
