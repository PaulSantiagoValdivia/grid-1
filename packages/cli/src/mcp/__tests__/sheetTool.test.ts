import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'

/** VEW-7: grid_sheet writes the plan as a PDF sheet into exports/. */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function context() {
  const dir = mkdtempSync(join(tmpdir(), 'grid-sheet-tool-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(sample))
  return { dir, context: { project: openProject(dir, dir) } }
}

const tool = GRID_TOOLS.find((t) => t.name === 'grid_sheet')!
const call = async (args: Record<string, unknown>, ctx = context()) => (await tool.run(args, ctx.context)) as { text: string; data: Record<string, unknown> }

describe('grid_sheet (VEW-7)', () => {
  it('writes a check sheet and lists its pages', async () => {
    const ctx = context()
    const reply = await call({ plan: 'plan.json', layout: 'check' }, ctx)
    expect(reply.data['written']).toMatch(/exports\/.*-check\.pdf$/)
    const pages = reply.data['pages'] as unknown[]
    expect(pages.length).toBeGreaterThan(1)
    expect(reply.text).toContain(`${pages.length} pages`)
    expect(readdirSync(join(ctx.dir, 'exports')).some((f) => f.endsWith('-check.pdf'))).toBe(true)
    expect(readFileSync(join(ctx.dir, reply.data['written'] as string)).subarray(0, 5).toString()).toBe('%PDF-')
  }, 60_000)

  it('takes the words as an object', async () => {
    const reply = await call({ plan: 'plan.json', layout: 'client', sheet: { version: '1', name: 'Test House' } })
    expect((reply.data['pages'] as { title: string }[])[0]!.title).toBe('Test House')
  }, 60_000)

  it('refuses words with the check layout', async () => {
    await expect(call({ plan: 'plan.json', layout: 'check', sheet: { version: '1' } })).rejects.toThrow(/sheet/)
  })

  it('refuses bad words in one line, without repeating them', async () => {
    const error = await call({ plan: 'plan.json', layout: 'client', sheet: { version: '1', headline: 'secret\nwords' } }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toMatch(/headline/)
    expect(message).not.toContain('secret')
    expect(message).not.toContain('\n')
  })

  it('refuses words for a floor the plan does not have', async () => {
    await expect(call({ plan: 'plan.json', layout: 'client', sheet: { version: '1', floors: { attic99: ['x'] } } })).rejects.toThrow(/floors/)
  })
})
