import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import type { LoadedPlan } from '../../command/plan'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { floorFrames, sheetPages } from '../pages'

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
  it('frames every floor at the same size, so every floor page has the same scale', () => {
    const frames = [...floorFrames(house).values()]
    expect(frames.length).toBe(2)
    for (const frame of frames) {
      expect(frame.width).toBeCloseTo(frames[0]!.width, 9)
      expect(frame.height).toBeCloseTo(frames[0]!.height, 9)
    }
  })
})
