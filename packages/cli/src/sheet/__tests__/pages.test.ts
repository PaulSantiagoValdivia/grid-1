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
import { floorFrames, LEFT_OUT_LIMIT, PLAN_BOX, sheetPages } from '../pages'

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

/** The house with its first floor larger and shifted, so the two floors differ in size and place. */
function skewedHouse(): LoadedPlan {
  const plan = structuredClone(house.plan)
  for (const wall of plan.walls) {
    if (wall.floor !== 'first') continue
    wall.start = [wall.start[0] * 1.5 + 3, wall.start[1] * 1.5 + 2]
    wall.end = [wall.end[0] * 1.5 + 3, wall.end[1] * 1.5 + 2]
  }
  const { issues, broken } = validatePlan(plan)
  return { file: 'skewed', plan, issues, broken }
}

describe('one scale for every floor (VEW-7)', () => {
  const skewed = skewedHouse()
  const box = { width: PLAN_BOX.width, height: PLAN_BOX.height }
  const shown = [...floorFrames(skewed)].map(([floor, frame]) => ({
    frame,
    own: planPicture(skewed.plan, { floor, ...box }).view,
    framed: planPicture(skewed.plan, { floor, ...box, frame }).view,
  }))

  it('has floors of different size and place', () => {
    expect(shown[1]!.own.width).not.toBeCloseTo(shown[0]!.own.width, 3)
  })

  it('shows every floor at one size', () => {
    expect(shown.length).toBe(2)
    for (const { framed } of shown) {
      expect(framed.width).toBeCloseTo(shown[0]!.framed.width, 9)
      expect(framed.height).toBeCloseTo(shown[0]!.framed.height, 9)
    }
  })

  it('cuts nothing off', () => {
    const e = 1e-9
    for (const { own, framed } of shown) {
      expect(framed.x).toBeLessThanOrEqual(own.x + e)
      expect(framed.y).toBeLessThanOrEqual(own.y + e)
      expect(framed.x + framed.width).toBeGreaterThanOrEqual(own.x + own.width - e)
      expect(framed.y + framed.height).toBeGreaterThanOrEqual(own.y + own.height - e)
    }
  })

  it('centres each frame on its own floor, Y up', () => {
    const [a, b] = shown
    expect(a!.frame.min.x + a!.frame.width / 2).not.toBeCloseTo(b!.frame.min.x + b!.frame.width / 2, 3)
    for (const { frame, own } of shown) {
      expect(frame.min.x + frame.width / 2).toBeCloseTo(own.x + own.width / 2, 9)
      expect(frame.min.y + frame.height / 2).toBeCloseTo(-(own.y + own.height / 2), 9)
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

  it('draws ids', () => {
    expect(sheet.pages[1]!.picture).toMatchObject({ kind: 'plan', ids: true })
  })

  it('gives each room its use, and the client cover counts bedrooms', () => {
    const plan = structuredClone(house.plan)
    const room = plan.rooms.find((r) => r.id === 'hall')!
    room.use = 'bedroom'
    const { issues, broken } = validatePlan(plan)
    const withUse: LoadedPlan = { file: 'use', plan, issues, broken }
    const check = sheetPages(withUse, null, 'check', { name: 'x', date })
    const rows = check.pages.flatMap((p) => p.table?.rows ?? [])
    expect(rows.find((r) => r.name === 'Hall')!.detail).toBe('bedroom')
    const client = sheetPages(withUse, null, 'client', { name: 'x', date })
    expect(client.pages[0]!.figures.find((f) => f.label === 'bedrooms')!.value).toBe('1')
  })

  it('lists a drawing problem on no floor once, on the summary', () => {
    const issue = { code: 'test', entity: 'plan' as const, id: 'p', message: 'A plan-wide problem.', severity: 'warning' as const }
    const loaded: LoadedPlan = { ...house, issues: [...house.issues, issue] }
    const made = sheetPages(loaded, null, 'check', { name: 'x', date })
    const line = 'Worth a look, plan "p": A plan-wide problem.'
    expect(made.pages[0]!.notes).toContain(line)
    for (const page of made.pages.slice(1)) expect(page.notes).not.toContain(line)
  })

  it('lists the notices of its floor, and the whole-plan ones once on the summary', () => {
    const lines = (p: { notes: readonly string[] }) => p.notes.filter((n) => n.startsWith('Not checked: '))
    const whole = checkPlan(house, {})
    for (const page of sheet.pages.slice(1)) {
      const floorId = page.picture?.kind === 'plan' ? page.picture.floor : ''
      const own = whole.report.notChecked.filter((n) => n.floor === floorId)
      expect(lines(page)).toEqual(own.map((n) => `Not checked: ${n.message}`))
    }
    expect(lines(sheet.pages[0]!)).toEqual(whole.report.notChecked.filter((n) => n.floor === '').map((n) => `Not checked: ${n.message}`))
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

/** The house with the study's walls gone from its boundary, so the study cannot be drawn. */
function brokenStudy(): LoadedPlan {
  const plan = structuredClone(house.plan)
  plan.rooms.find((r) => r.id === 'study')!.boundary = ['nope-a', 'nope-b', 'nope-c']
  const { issues, broken } = validatePlan(plan)
  return { file: 'broken', plan, issues, broken }
}

describe('a part that cannot be drawn (VEW-7)', () => {
  const broken = brokenStudy()
  const floorPage = (sheet: ReturnType<typeof sheetPages>, floor: string) =>
    sheet.pages.find((p) => p.picture?.kind === 'plan' && p.picture.floor === floor)!

  it('is left out of the plan as read', () => {
    expect([...broken.broken]).toEqual(['study'])
  })

  it('is said on its floor of a client sheet, and only there', () => {
    const sheet = sheetPages(broken, null, 'client', { name: 'x', date })
    expect(floorPage(sheet, 'first').notes).toContain(LEFT_OUT_LIMIT)
    expect(floorPage(sheet, 'ground').notes).not.toContain(LEFT_OUT_LIMIT)
    const whole = sheetPages(house, null, 'client', { name: 'x', date })
    expect(whole.pages.every((p) => !p.notes.includes(LEFT_OUT_LIMIT))).toBe(true)
  })

  it('is listed on its floor of a check sheet', () => {
    const sheet = sheetPages(broken, null, 'check', { name: 'x', date })
    expect(floorPage(sheet, 'first').notes.some((n) => n.startsWith('Left out, room "study": '))).toBe(true)
    expect(floorPage(sheet, 'ground').notes.some((n) => n.startsWith('Left out, '))).toBe(false)
  })
})
