/**
 * LVL-8: `grid draw --facade <side>`, run the way a person runs it: the built file, as its own
 * Node process, on a plan file with two floors and an opening pattern. `npm test` builds it first.
 */
import { spawnSync, type SpawnSyncReturns } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'

const bundle = join(resolve(__dirname, '../../..'), 'dist', 'grid.mjs')
const made: string[] = []
let dir: string

const wall = (id: string, start: number[], end: number[], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })
const PLAN = {
  version: '1',
  floors: [
    { id: 'ground', name: 'Ground floor', level: 0 },
    { id: 'first', name: 'First floor', level: 1 },
  ],
  walls: [
    wall('gs', [0, 0], [10, 0], 'ground'),
    wall('ge', [10, 0], [10, 8], 'ground'),
    wall('gn', [10, 8], [0, 8], 'ground'),
    wall('gw', [0, 8], [0, 0], 'ground'),
    wall('fs', [0, 3], [6, 3], 'first'),
    wall('fe', [6, 3], [6, 8], 'first'),
    wall('fn', [6, 8], [0, 8], 'first'),
    wall('fw', [0, 8], [0, 3], 'first'),
  ],
  rooms: [
    { id: 'g', name: 'Living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'ground' },
    { id: 'f', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' },
  ],
  openings: [{ id: 'front', wall: 'gs', type: 'door', offset: 4.5, width: 1, height: 2.1 }],
  patterns: [{ id: 'row', wall: 'fs', opening: { type: 'window', width: 1, height: 1.2, sill: 0.9 }, count: 3, margins: { start: 0.6, end: 0.6 } }],
}

beforeAll(() => {
  if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-facade-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(PLAN))
})

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function grid(...args: string[]): { status: number | null; out: string; err: string; stdout: Buffer } {
  const run: SpawnSyncReturns<Buffer> = spawnSync(process.execPath, [bundle, ...args], { cwd: dir, timeout: 60_000 })
  if (run.error) throw run.error
  return { status: run.status, out: run.stdout.toString('utf8'), err: run.stderr.toString('utf8'), stdout: run.stdout }
}

describe('grid draw --facade', () => {
  it('draws a side of the building as an SVG in the technical look, with the label, every floor and the pattern\'s windows', () => {
    const run = grid('draw', 'plan.json', '--facade', 'south')
    expect(run.status, run.err).toBe(0)
    expect(run.out.startsWith('<svg')).toBe(true)
    expect(run.out).toContain('aria-label="South facade of the plan, 2 floors at their levels"')
    expect(run.out).toContain(GENERAL_GUIDANCE_LABEL)
    expect(run.out).toContain('data-part="facade-ground"')
    expect(run.out).toContain('stroke="#000000"')
    for (const id of ['front', 'row-first-1', 'row-first-2', 'row-first-3']) expect(run.out).toContain(`data-id="${id}"`)
  })

  it('writes a PNG with --png and --out, and takes --look and --scale', () => {
    const run = grid('draw', 'plan.json', '--facade', 'east', '--png', '--look', 'working', '--scale', '2', '--out', 'east.png')
    expect(run.status, run.err).toBe(0)
    const png = readFileSync(join(dir, 'east.png'))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    // 1200 px wide at scale 1, so 2400 px at scale 2.
    expect(png.readUInt32BE(16)).toBe(2400)
  })

  it('refuses a side Grid does not draw, and what belongs to a floor plan or the 3D model, by name', () => {
    const cases: [string[], string][] = [
      [['--facade', 'up'], '--facade "up" is not a side Grid draws: use one of north, east, south, west'],
      [['--facade', 'north', '--3d'], '--facade draws one side of the building and --3d the model'],
      [['--facade', 'north', '--floor', 'first'], 'a facade shows every floor at its level'],
      [['--facade', 'north', '--ids'], '--ids is for a floor plan, not a facade'],
      [['--facade', 'north', '--hide', 'areas'], '--hide is for a floor plan, not a facade'],
      [['--facade', 'north', '--units', 'mm'], '--units is for a floor plan, not a facade'],
      [['--facade', 'north', '--scale', '2'], '--scale only applies to a PNG'],
      [['--facade', 'north', '--facade', 'south'], '--facade was given more than once'],
    ]
    for (const [args, words] of cases) {
      const run = grid('draw', 'plan.json', ...args)
      expect(run.status, args.join(' ')).toBe(2)
      expect(run.out).toBe('')
      expect(run.err).toContain(words)
    }
  })
})
