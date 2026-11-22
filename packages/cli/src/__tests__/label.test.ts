/**
 * QAR-10: the label test. The release step runs this file as a gate of its own
 * (`scripts/release/gates.mjs`), so a release stops by name when a report loses its label or a
 * line reads as approval. Every way Grid reports on a plan is here: the result record, the rules
 * report, `grid check` as a person runs it, the `grid_check` tool, and the text the package and
 * the plugin carry. The checks on single wordings stay with their own code; this file holds the
 * promise across all of them.
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GENERAL_GUIDANCE_LABEL, checkLocalRules, inspectPlan } from '@ongrid/rules'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { packageReadme, pluginFiles } from '../distribution/listing'
import { openProject } from '../fs/projectFiles'
import { GRID_TOOLS } from '../mcp/serveTools'

/** The words that would say a plan meets a code or has been passed by someone. */
const APPROVAL = /\b(complies|comply|compliant|compliance|approved|approves|passes|passed|certified|meets the code|meets the rules)\b/i
const LABEL = 'General guidance, not your local rules'

const cli = resolve(__dirname, '../..')
const bundle = join(cli, 'dist', 'grid.mjs')
const fixtures = resolve(cli, '../floorplan/fixtures')
const plans = readdirSync(fixtures).filter((name) => name.endsWith('.json')).sort()

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-label-'))
  for (const name of plans) writeFileSync(join(dir, name), readFileSync(join(fixtures, name)))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function read(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as unknown
}

it('the label reads as it always has', () => {
  expect(GENERAL_GUIDANCE_LABEL).toBe(LABEL)
})

describe.each(plans)('the result record for %s', (name) => {
  it.each([undefined, 'ES'])('carries the label, and no line reads as approval (country %s)', (country) => {
    const result = inspectPlan(read(name), country === undefined ? {} : { country })
    expect(result.label).toBe(LABEL)
    for (const line of result.lines) {
      for (const text of [line.message, line.found, line.needed, line.fix]) expect(text, `${line.code}: ${text}`).not.toMatch(APPROVAL)
    }
  })

  it('the rules report carries the label', () => {
    const plan = FloorPlanSchema.parse(read(name))
    expect(checkLocalRules(plan).label).toBe(LABEL)
  })
})

it('a refused plan still carries the label', () => {
  for (const raw of ['not json', '[]', { walls: 'none' }]) {
    const result = inspectPlan(raw)
    expect(result.read).toBe(false)
    expect(result.label).toBe(LABEL)
  }
})

describe('grid check, as a person runs it', () => {
  beforeAll(() => {
    if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
  })

  it.each(plans)('prints the label first for %s, and in its JSON', (name) => {
    const text = spawnSync(process.execPath, [bundle, 'check', name], { cwd: dir, encoding: 'utf8' })
    expect(text.stdout.split('\n')[0], text.stderr).toBe(LABEL)
    expect(text.stdout).not.toMatch(APPROVAL)
    const json = spawnSync(process.execPath, [bundle, 'check', name, '--json'], { cwd: dir, encoding: 'utf8' })
    const parsed = JSON.parse(json.stdout) as { label: string; result: { label: string } }
    expect(parsed.label).toBe(LABEL)
    expect(parsed.result.label).toBe(LABEL)
  })
})

it('grid_check leads with the label', async () => {
  const tool = GRID_TOOLS.find((t) => t.name === 'grid_check')
  expect(tool).toBeDefined()
  const project = openProject(dir, dir)
  for (const name of plans) {
    const answer = await tool!.run({ plan: name }, { project })
    expect(answer.text.split('\n')[0]).toBe(LABEL)
    expect(answer.text).not.toMatch(APPROVAL)
  }
})

it('the package README and the plugin skill keep the label', () => {
  expect(packageReadme()).toContain(`"${LABEL}"`)
  expect(pluginFiles('0.0.0')['skills/grid/SKILL.md']).toContain(`"${LABEL}"`)
})
