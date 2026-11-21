import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/** VEW-7: `grid sheet`, run as a person runs it: the built file, in a temporary folder. */

const cli = resolve(__dirname, '../../..')
const bundle = join(cli, 'dist', 'grid.mjs')

const made: string[] = []
let dir: string

beforeAll(() => {
  if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-sheet-'))
  made.push(dir)
  writeFileSync(join(dir, 'two-floor-house.json'), readFileSync(join(cli, 'fixtures', 'two-floor-house.json')))
})

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function grid(args: readonly string[]): { status: number | null; out: string; err: string } {
  const run = spawnSync(process.execPath, [bundle, ...args], { cwd: dir, timeout: 60_000 })
  if (run.error) throw run.error
  return { status: run.status, out: run.stdout.toString('utf8'), err: run.stderr.toString('utf8') }
}

describe('grid sheet (VEW-7)', () => {
  it('writes a client sheet into exports/ beside the plan', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'client'])
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
    expect(run.out).toMatch(/Wrote exports\/two-floor-house-client\.pdf/)
    expect(readFileSync(join(dir, 'exports', 'two-floor-house-client.pdf')).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
  it('writes a check sheet to --out', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'check', '--out', 'set.pdf'])
    expect(run.status).toBe(0)
    expect(existsSync(join(dir, 'set.pdf'))).toBe(true)
  })
  it('needs --layout, naming both', () => {
    const run = grid(['sheet', 'two-floor-house.json'])
    expect(run.status).toBe(2)
    expect(run.err).toMatch(/--layout.*client.*check/)
  })
  it('refuses --sheet with the check layout', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'check', '--sheet', 'sheet.json'])
    expect(run.status).toBe(2)
    expect(run.err).toMatch(/--sheet/)
  })
  it('refuses an --out that is not a .pdf', () => {
    expect(grid(['sheet', 'two-floor-house.json', '--layout', 'client', '--out', 'x.png']).status).toBe(2)
  })
  it('reads sheet.json beside the plan, and refuses a bad one without repeating it', () => {
    writeFileSync(join(dir, 'sheet.json'), JSON.stringify({ version: '1', floors: { roof: ['secret words'] } }))
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'client'])
    expect(run.status).toBe(1)
    expect(run.err).toMatch(/"roof"/)
    expect(run.err).not.toMatch(/secret words/)
  })
  it('ignores sheet.json with the check layout', () => {
    writeFileSync(join(dir, 'sheet.json'), '{ not json')
    expect(grid(['sheet', 'two-floor-house.json', '--layout', 'check']).status).toBe(0)
  })

  function expectCleanRefusal(run: { status: number | null; err: string }, status: number): void {
    expect(run.status).toBe(status)
    expect(run.err.startsWith('grid: ')).toBe(true)
    expect(run.err.trimEnd().split('\n')).toHaveLength(1)
    expect(run.err).not.toMatch(/something went wrong|EISDIR|EFBIG|\n\s+at /)
  }

  it('refuses a folder named sheet.json beside the plan, cleanly', () => {
    mkdirSync(join(dir, 'sheet.json'))
    expectCleanRefusal(grid(['sheet', 'two-floor-house.json', '--layout', 'client']), 1)
  })
  it('refuses an oversize sheet.json beside the plan, cleanly', () => {
    writeFileSync(join(dir, 'sheet.json'), ' '.repeat(65 * 1024))
    expectCleanRefusal(grid(['sheet', 'two-floor-house.json', '--layout', 'client']), 1)
  })
  it('uses a named --sheet file instead of sheet.json beside the plan', () => {
    writeFileSync(join(dir, 'sheet.json'), '{ not json')
    writeFileSync(join(dir, 'words.json'), JSON.stringify({ version: '1', name: 'Words House', intro: ['A short welcome.'] }))
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'client', '--sheet', 'words.json'])
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
  })
  it('refuses a named --sheet file that is missing', () => {
    expectCleanRefusal(grid(['sheet', 'two-floor-house.json', '--layout', 'client', '--sheet', 'nope.json']), 1)
  })
  it('refuses an unknown --layout, naming both', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'poster'])
    expect(run.status).toBe(2)
    expect(run.err).toMatch(/client.*check|check.*client/)
  })
  it('refuses a plan that does not validate', () => {
    writeFileSync(join(dir, 'bad.json'), '{"walls": 1}')
    expectCleanRefusal(grid(['sheet', 'bad.json', '--layout', 'check']), 1)
  })
  it('still writes a check sheet for a plan with findings', () => {
    writeFileSync(join(dir, 'front-door-into-bedroom.json'), readFileSync(join(cli, 'fixtures', 'front-door-into-bedroom.json')))
    const check = grid(['check', 'front-door-into-bedroom.json'])
    expect(check.out).toMatch(/\S/)
    const run = grid(['sheet', 'front-door-into-bedroom.json', '--layout', 'check'])
    expect(run.status).toBe(0)
    expect(existsSync(join(dir, 'exports', 'front-door-into-bedroom-check.pdf'))).toBe(true)
  })
})
