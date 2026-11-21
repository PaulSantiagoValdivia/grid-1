import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * `grid tidy` (MSG-12): the faults where walls meet, and the fixes made with `--apply`. Run in
 * this process through `runGrid`, as the built file runs it.
 */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

interface Ran {
  readonly status: number
  readonly out: string
  readonly err: string
}

async function grid(dir: string, ...args: string[]): Promise<Ran> {
  let out = ''
  let err = ''
  const status = await runGrid(args, {
    stdout: (data) => (out += typeof data === 'string' ? data : Buffer.from(data).toString('utf8')),
    stderr: (text) => (err += text),
    stdoutIsTerminal: false,
    cwd: dir,
  })
  return { status, out, err }
}

/**
 * The sample flat, with the east wall 1.5 m short of its north-east corner (MS-2). (Its north
 * wall short instead gets no fix: its windows would leave the wall when its start moves.)
 */
function shortEast(): Record<string, unknown> {
  const plan = JSON.parse(readFileSync(sample, 'utf8')) as { walls: { id: string; end: number[] }[] } & Record<string, unknown>
  const east = plan.walls.find((w) => w.id === 'east')!
  east.end = [10, 6]
  return { ...plan, note: 'a key Grid does not know, kept as it is' }
}

function folder(plan: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-tidy-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
  return dir
}

describe('grid tidy', () => {
  it('finds nothing on the sound sample flat', async () => {
    const dir = folder(JSON.parse(readFileSync(sample, 'utf8')))
    const run = await grid(dir, 'tidy', 'plan.json')
    expect(run.status).toBe(0)
    expect(run.out).toBe('General guidance, not your local rules\n\nWall faults: none found where walls meet.\n')
  })

  it('names the east wall that stops 1.5 m short, with the gap and the fix', async () => {
    const dir = folder(shortEast())
    const run = await grid(dir, 'tidy', 'plan.json', '--json')
    const list = JSON.parse(run.out) as { label: string; faults: { id: string; walls: string[]; message: string; fix: string | null }[] }
    expect(list.label).toBe('General guidance, not your local rules')
    const fault = list.faults.find((f) => f.walls[0] === 'east')!
    expect(fault.message).toMatch(/1\.5/)
    expect(fault.fix).not.toBeNull()
    const text = (await grid(dir, 'tidy', 'plan.json')).out
    expect(text).toContain(`- ${JSON.stringify(fault.id)}: ${fault.message}`)
    expect(text).toContain(`grid tidy --apply ${fault.id}`)
  })

  it('makes the fix with --apply, keeps every other key, and the fault is gone', async () => {
    const dir = folder(shortEast())
    const { faults } = JSON.parse((await grid(dir, 'tidy', 'plan.json', '--json')).out) as { faults: { id: string }[] }
    const run = await grid(dir, 'tidy', 'plan.json', '--apply', faults.map((f) => f.id).join(','))
    expect(run.status).toBe(0)
    expect(run.out).toContain('Applied (')
    expect(run.out).toContain('Wall faults left: none.')
    expect(run.out).toMatch(/Wrote plan\.json\n$/)
    const written = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { note: string; walls: { id: string; end: number[] }[] }
    expect(written.note).toBe('a key Grid does not know, kept as it is')
    expect(written.walls.find((w) => w.id === 'east')!.end).toEqual([10, 7.5])
    expect((await grid(dir, 'tidy', 'plan.json')).out).toContain('Wall faults: none found')
  })

  it('writes to --out and leaves the plan as it is', async () => {
    const dir = folder(shortEast())
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const run = await grid(dir, 'tidy', 'plan.json', '--apply', 'all', '--out', 'tidied.json')
    expect(run.out).toMatch(/Wrote tidied\.json\n$/)
    expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
    expect((await grid(dir, 'tidy', 'tidied.json')).out).toContain('Wall faults: none found')
  })

  it('says why a fault asked for was skipped, and writes nothing when no fix was made', async () => {
    const dir = folder(shortEast())
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const run = await grid(dir, 'tidy', 'plan.json', '--apply', 'short:nothing:end')
    expect(run.status).toBe(0)
    expect(run.out).toContain('- "short:nothing:end": not found in this plan')
    expect(run.out).toContain('No fix was made, so nothing was written.')
    expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
  })

  it.each([
    [['--out', 'x.json'], '--out goes with --apply'],
    [['--apply', 'all', '--out', 'x.txt'], '--out must name a .json file'],
    [['--apply', ' , '], '--apply needs fault ids'],
    [['--apply', 'a\nb'], '--apply takes fault ids separated by commas, on one line'],
    [['--floor', 'ground'], '--floor'],
  ])('refuses %j', async (args, message) => {
    const dir = folder(shortEast())
    const run = await grid(dir, 'tidy', 'plan.json', ...args)
    expect(run.status).toBe(2)
    expect(run.err).toContain(message)
  })
})
