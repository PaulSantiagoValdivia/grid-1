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

/** The pages of a PDF: its page objects, as Skia writes them, one `/Type /Page` each. */
function pageCount(file: string): number {
  return readFileSync(file).toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0
}

describe('grid sheet (VEW-7)', () => {
  it.each(['client', 'check'])('writes the expected pages, the same twice (%s)', (layout) => {
    // A cover or a summary, then one page per floor: the house has two floors and short words.
    // The check set ends with the room schedule and the door and window schedule (ARE-12).
    const file = join(dir, 'exports', `two-floor-house-${layout}.pdf`)
    const counts = [1, 2].map(() => {
      expect(grid(['sheet', 'two-floor-house.json', '--layout', layout]).status).toBe(0)
      return pageCount(file)
    })
    expect(counts).toEqual(layout === 'check' ? [5, 5] : [3, 3])
  })

  it('writes a client sheet into exports/ beside the plan', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'client'])
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
    // QAR-4: the command prints the path as the system writes it, `exports\…` on Windows.
    expect(run.out).toContain(`Wrote ${join('exports', 'two-floor-house-client.pdf')}`)
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
  it('names the sheet.json it read beside the plan relative to the project, even for a plan named by its full path', () => {
    mkdirSync(join(dir, 'house'))
    writeFileSync(join(dir, 'house', 'plan.json'), readFileSync(join(cli, 'fixtures', 'two-floor-house.json')))
    writeFileSync(join(dir, 'house', 'sheet.json'), JSON.stringify({ version: '1', floors: { roof: ['secret words'] } }))
    const run = grid(['sheet', join(dir, 'house', 'plan.json'), '--layout', 'client'])
    expect(run.status).toBe(1)
    expect(run.err).toBe('grid: "house/sheet.json" is not a sheet: floors names "roof", which is not a floor of the plan.\n')
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
  it('refuses an --out whose folder does not exist, in one line, as grid export does', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'check', '--out', 'nope/x.pdf'])
    expectCleanRefusal(run, 1)
    expect(run.err).toBe('grid: Can\'t write nope/x.pdf: its folder does not exist.\n')
  })
  it('refuses an --out that is a folder, in one line', () => {
    mkdirSync(join(dir, 'dirout.pdf'))
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'check', '--out', 'dirout.pdf'])
    expectCleanRefusal(run, 1)
    expect(run.err).toBe('grid: Can\'t write dirout.pdf: it is a folder.\n')
  })
  it('refuses to write into exports/ when the sheet\'s name there is a folder, in one line', () => {
    mkdirSync(join(dir, 'exports', 'two-floor-house-client.pdf'), { recursive: true })
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'client'])
    // The same line grid export gives when its file in exports/ is a folder.
    expect(run.status).toBe(1)
    expect(run.err.trimEnd().split('\n')).toHaveLength(1)
    expect(run.err).toMatch(/^grid: Can't write the export beside two-floor-house\.json: /)
    expect(run.err).not.toMatch(/something went wrong|\n\s+at /)
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
  it.each([[[]], [['--out', 'set.pdf']]])('says which parts it leaves out, as grid draw does (%j)', (out) => {
    const plan = JSON.parse(readFileSync(join(cli, 'fixtures', 'two-floor-house.json'), 'utf8')) as { rooms: { id: string; boundary: string[] }[] }
    plan.rooms.find((r) => r.id === 'study')!.boundary = ['nope-a', 'nope-b', 'nope-c']
    writeFileSync(join(dir, 'broken.json'), JSON.stringify(plan))
    const line = 'Left out 1 part that can\'t be drawn: study. grid check says why.\n'
    // grid draw then names the doors it drew as undecided (SHT-1); the sheet says that on the page.
    expect(grid(['draw', 'broken.json', '--floor', 'first']).err).toBe(`${line}Drew 2 doors with no stated swing as undecided, a dashed line and "?": "balcony", "d_up". Set each one's hinge and swing in the plan.\n`)
    const run = grid(['sheet', 'broken.json', '--layout', 'client', ...out])
    expect(run.status).toBe(0)
    expect(run.err).toBe(line)
  })
  it('still writes a check sheet for a plan with findings', () => {
    // Bedroom 2 loses its only door, so the check finds it shut off.
    const plan = JSON.parse(readFileSync(join(cli, 'fixtures', 'two-bed-flat.json'), 'utf8')) as { openings: { id: string }[] }
    writeFileSync(join(dir, 'shut.json'), JSON.stringify({ ...plan, openings: plan.openings.filter((o) => o.id !== 'bed2-door') }))
    expect(grid(['check', 'shut.json']).out).toMatch(/^To look at \(\d+\): 1 finding\b/m)
    const run = grid(['sheet', 'shut.json', '--layout', 'check'])
    expect(run.status).toBe(0)
    expect(existsSync(join(dir, 'exports', 'shut-check.pdf'))).toBe(true)
  })
})
