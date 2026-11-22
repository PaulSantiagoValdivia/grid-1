/**
 * MSG-3: no line Grid writes reads as a pass or as the reader's law. Over every fixture and
 * every 20th lab plan the schema reads (56 of them): the report `grid check` prints, the result
 * record's lines, the notes a person reads and both descriptions. Over every fixture and every
 * 100th lab plan: every export file and the drawing, each of which carries the label. Quoted
 * text and the plan's own names are the user's (`approvalWords`), so they are left out.
 *
 * A sample, because all 1,100 lab plans take about ten minutes here and the sample a few
 * seconds. `GRID_SCAN_ALL=1` scans every lab plan, reports and exports alike (reviews/MSG-3.md
 * says how far that got).
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { EXPORT_FORMATS, exportPlan } from '@ongrid/floorplan/export'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { approvalWords, GENERAL_GUIDANCE_LABEL, planNotes, type NoteText } from '@ongrid/rules'
import { planToSvg } from '@ongrid/viewer/src/picture'
import { checkPlan, checkText } from '../../packages/cli/src/command/check'
import { describePlan } from '../../packages/cli/src/command/describe'
import type { LoadedPlan } from '../../packages/cli/src/command/plan'
import * as data from '../src/data'

/** Every name and id a plan holds: the user's text, which an export writes unquoted. */
function userText(plan: FloorPlan): string[] {
  const parts: { id?: string; name?: string }[] = [...plan.walls, ...plan.rooms, ...plan.openings, ...(plan.floors ?? []), ...(plan.items ?? [])]
  return parts.flatMap((part) => [part.id ?? '', part.name ?? ''])
}

/** Grid's own words in a note: the parts that are not names from the plan. */
const own = (parts: readonly NoteText[]): string => parts.filter((part) => !part.name).map((part) => part.text).join('')

function loaded(name: string, plan: FloorPlan): LoadedPlan {
  const { issues, broken } = validatePlan(plan)
  return { file: name, plan, issues, broken }
}

const lab = data.labPlans().flatMap((stored) => {
  try {
    const parsed = FloorPlanSchema.safeParse(JSON.parse(stored.text))
    return parsed.success ? [{ name: stored.name, plan: parsed.data }] : []
  } catch {
    return []
  }
})

/** Every lab plan with GRID_SCAN_ALL=1; otherwise every `n`th. */
const every = (n: number): typeof lab => (process.env['GRID_SCAN_ALL'] === '1' ? lab : lab.filter((_, i) => i % n === 0))

const fixtures = resolve(__dirname, '../../packages/floorplan/fixtures')
const fixturePlans = readdirSync(fixtures)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, plan: FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(fixtures, name), 'utf8'))) }))

/** The text of an export file: a GLB's JSON chunk, every other format as it is. */
function fileText(bytes: string | Uint8Array): string {
  if (typeof bytes === 'string') return bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(12, true)
  return new TextDecoder().decode(bytes.subarray(20, 20 + length))
}

describe('no line Grid writes reads as a pass (MSG-3)', () => {
  it('reads most of the lab plans', () => {
    expect(lab.length).toBeGreaterThan(1000)
  })

  it('over the fixtures and every 20th lab plan: the report, its lines, the notes and the descriptions', () => {
    const found: string[] = []
    for (const { name, plan } of [...fixturePlans, ...every(20)]) {
      const users = userText(plan)
      const say = (where: string, text: string): void => {
        const words = approvalWords(text, users)
        if (words.length > 0) found.push(`${name} ${where}: ${words.join(', ')}`)
      }
      const one = loaded(name, plan)
      const result = checkPlan(one, {})
      // MSG-10: the short report, the default, and the whole one.
      const text = checkText(result, 1)
      expect(text.split('\n')[0], name).toBe(GENERAL_GUIDANCE_LABEL)
      say('grid check', text)
      const full = checkText(result, 1, { full: true })
      expect(full.split('\n')[0], name).toBe(GENERAL_GUIDANCE_LABEL)
      say('grid check --full', full)
      for (const line of result.result.lines) say(line.code, [line.message, line.found, line.needed, line.fix].join(' | '))
      const notes = planNotes(plan, result.report)
      for (const note of notes.notes) say(`note ${note.id}`, `${own(note.title)} ${note.detail.map((d) => own([d])).join(' ')}`)
      say('not checked', notes.notChecked.join(' '))
      for (const audience of ['person', 'agent'] as const) say(`describe ${audience}`, describePlan(one, 'walls', audience))
    }
    expect(found).toEqual([])
  }, 300_000)

  it('over every export file and the drawing of the fixtures and every 100th lab plan, which carry the label', () => {
    const sample = [...fixturePlans, ...every(100)]
    const found: string[] = []
    for (const { name, plan } of sample) {
      const users = userText(plan)
      const files: [string, string][] = EXPORT_FORMATS.map((format) => [
        format,
        fileText(exportPlan(plan, format, { projectId: 'scan', projectName: 'Scan', now: new Date('2026-11-22T00:00:00Z') }).data)
      ])
      files.push(['svg', planToSvg(plan)])
      for (const [format, text] of files) {
        expect(text, `${name} ${format}`).toContain(GENERAL_GUIDANCE_LABEL)
        const words = approvalWords(text, users)
        if (words.length > 0) found.push(`${name} ${format}: ${words.join(', ')}`)
      }
    }
    expect(found).toEqual([])
  }, 300_000)
})

describe('the scan itself', () => {
  it('finds each forbidden word, and leaves quoted text and codes alone', () => {
    expect(approvalWords('The plan passes and complies; it is compliant, approved and meets code.')).toEqual([
      'passes',
      'complies',
      'compliant',
      'approved',
      'meets code'
    ])
    expect(approvalWords('Room "Approved store" is small. [opening/too-small-to-pass]')).toEqual([])
    expect(approvalWords('Approved store is small.', ['Approved store'])).toEqual([])
    expect(approvalWords('That only means these checks found nothing, not that the plan meets any rule.')).toEqual([])
  })
})
