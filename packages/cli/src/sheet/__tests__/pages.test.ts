import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { checkPlan } from '../../command/check'
import type { LoadedPlan } from '../../command/plan'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { planPicture } from '@ongrid/viewer/src/picture'
import { floorFrames, PLAN_BOX, sheetPages } from '../pages'

function fixture(name: string): LoadedPlan {
  const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))
  const { issues, broken } = validatePlan(plan)
  return { file: name, plan, issues, broken }
}

const house = fixture('two-floor-house.json')
const date = new Date('2026-11-21T12:00:00Z')
const words = { version: '1' as const, name: 'Solace House', headline: 'A retreat', intro: ['Intro.'], floors: { ground: ['Ground words.'] } }

describe('the client layout (VEW-7)', () => {
  const sheet = sheetPages(house, words, 'client', { name: 'two-floor-house', date })

  it('is a cover, then one page per floor, lowest first', () => {
    expect(sheet.pages.map((p) => p.kind)).toEqual(['cover', 'floor', 'floor'])
    expect(sheet.pages.map((p) => p.picture && p.picture.kind === 'plan' ? p.picture.floor : null)).toEqual([null, 'ground', 'first'])
  })

  it('puts the label, the page number and the date on every page', () => {
    sheet.pages.forEach((page, i) => {
      expect(page.footer.label).toBe(GENERAL_GUIDANCE_LABEL)
      expect(page.footer.page).toBe(i + 1)
      expect(page.footer.pages).toBe(3)
      expect(page.footer.date).toBe('21 NOV 2026')
    })
  })

  it('uses the words of sheet.json', () => {
    const [cover, ground, first] = sheet.pages
    expect(cover!.title).toBe('Solace House')
    expect(cover!.subtitle).toBe('A retreat')
    expect(cover!.paragraphs).toEqual(['Intro.'])
    expect(ground!.paragraphs).toEqual(['Ground words.'])
    expect(first!.paragraphs).toEqual([])
  })

  it('takes the area table from planAreas, every room on its floor', () => {
    const areas = planAreas(surveyPlan(house.plan))
    for (const floor of areas.floors) {
      const page = sheet.pages.find((p) => p.picture?.kind === 'plan' && p.picture.floor === floor.floor)!
      expect(page.table!.rows.map((r) => r.name)).toEqual(floor.rooms.map((r) => r.name))
    }
  })

  it('shows its figures on the cover, made by Grid', () => {
    const labels = sheet.pages[0]!.figures.map((f) => f.label)
    expect(labels).toContain('floors')
    expect(labels).toContain('bedrooms')
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'floors')!.value).toBe('2')
    // The fixture's rooms have no use, so it has no bedroom.
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'bedrooms')!.value).toBe('0')
  })

  it('writes no words in the author\'s place without sheet.json', () => {
    const bare = sheetPages(house, null, 'client', { name: 'two-floor-house', date })
    expect(bare.pages[0]!.title).toBe('two-floor-house')
    expect(bare.pages[0]!.subtitle).toBeNull()
    expect(bare.pages.every((p) => p.paragraphs.length === 0)).toBe(true)
  })

  it('gives the same pages twice', () => {
    expect(sheetPages(house, words, 'client', { name: 'two-floor-house', date })).toEqual(sheet)
  })
})

describe('one scale for every floor (VEW-7)', () => {
  it('frames every floor so planPicture shows the same size, with nothing cut off', () => {
    const frames = floorFrames(house)
    expect(frames.size).toBe(2)
    const shown = [...frames].map(([floor, frame]) => ({
      own: planPicture(house.plan, { floor, width: PLAN_BOX.width, height: PLAN_BOX.height }).view,
      framed: planPicture(house.plan, { floor, width: PLAN_BOX.width, height: PLAN_BOX.height, frame }).view,
    }))
    for (const { own, framed } of shown) {
      expect(framed.width).toBeCloseTo(shown[0]!.framed.width, 9)
      expect(framed.height).toBeCloseTo(shown[0]!.framed.height, 9)
      const e = 1e-9
      expect(framed.x).toBeLessThanOrEqual(own.x + e)
      expect(framed.y).toBeLessThanOrEqual(own.y + e)
      expect(framed.x + framed.width).toBeGreaterThanOrEqual(own.x + own.width - e)
      expect(framed.y + framed.height).toBeGreaterThanOrEqual(own.y + own.height - e)
    }
  })
})

describe('the check layout (VEW-7)', () => {
  const sheet = sheetPages(house, words, 'check', { name: 'two-floor-house', date })

  it('is a summary, then one page per floor', () => {
    expect(sheet.pages.map((p) => p.kind)).toEqual(['summary', 'floor', 'floor'])
  })

  it('takes nothing from sheet.json', () => {
    const text = JSON.stringify(sheet)
    for (const word of ['Solace House', 'A retreat', 'Intro.', 'Ground words.']) expect(text).not.toContain(word)
  })

  it('draws ids, and gives each room its use', () => {
    const floor = sheet.pages[1]!
    expect(floor.picture).toMatchObject({ kind: 'plan', ids: true })
    expect(floor.table!.rows.every((row) => row.detail !== undefined)).toBe(true)
  })

  it('lists every finding on its own floor', () => {
    for (const page of sheet.pages.slice(1)) {
      const floorId = page.picture?.kind === 'plan' ? page.picture.floor : ''
      const result = checkPlan(house, { floor: floorId })
      for (const finding of result.report.findings) expect(page.notes).toContain(finding.message)
    }
  })

  it('says how many findings there are, and never that the plan passes', () => {
    const summary = sheet.pages[0]!
    expect(summary.figures.map((f) => f.label)).toContain('findings')
    expect(JSON.stringify(sheet)).not.toMatch(/\b(complies|compliant|approved|passes)\b/i)
  })
})
