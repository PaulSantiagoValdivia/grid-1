import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { runGrid } from '../../command/main'

/**
 * WRT-7: the person's units and decimal mark at the edge. A room 3.81 m inside and 2.86 m deep
 * with a window whose sill is 1.2192 m: in feet and inches it is 12'-6" with a sill of 48"; in
 * millimetres, 3810 by 2860. The file stays in metres whatever is shown.
 */

const t = 0.3
const W = 3.81 + t
const D = 2.86 + t
const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: t, height: 2.7, kind: 'exterior' })
const plan = {
  version: '1',
  units: 'm',
  walls: [wall('s', [0, 0], [W, 0]), wall('e', [W, 0], [W, D]), wall('n', [W, D], [0, D]), wall('w', [0, D], [0, 0])],
  rooms: [{ id: 'bed', name: 'Bedroom', use: 'bedroom', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [
    { id: 'win', wall: 's', type: 'window', offset: 1, width: 1.2, sill: 1.2192, height: 1.2 },
    { id: 'door', wall: 'n', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' },
  ],
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': plan, 'feet.json': { ...plan, display: { length: 'ft-in' } } })
})
afterAll(() => b.close())

async function grid(...args: string[]): Promise<string> {
  let out = ''
  let err = ''
  const status = await runGrid(args, { stdout: (d) => (out += typeof d === 'string' ? d : ''), stderr: (e) => (err += e), stdoutIsTerminal: false, cwd: b.folder })
  expect(err).toBe('')
  expect(status).toBe(0)
  return out
}

describe('feet and inches (WRT-7)', () => {
  it('prints dimensions as 12\'-6" and the window sill as 48" in the schedule', async () => {
    const svg = await grid('draw', 'plan.json', '--units', 'ft-in')
    expect(svg).toContain(`12'-6"`)
    expect(svg).toMatch(/sq ft/)
    const schedule = await b.call('grid_schedule', { units: 'ft-in' })
    expect(schedule.text).toContain('sill 48"')
    const areas = await b.call('grid_areas', { units: 'ft-in' })
    expect(areas.text).toContain(`12'-6" × 9'-5"`)
  })

  it('takes the plan\'s own display when the call names none', async () => {
    expect(await grid('draw', 'feet.json')).toContain(`12'-6"`)
    expect((await b.call('grid_schedule', { plan: 'feet.json' })).text).toContain('sill 48"')
  })
})

describe('millimetres and the decimal comma (WRT-7)', () => {
  it('prints dimensions as 3810 and 2860, and areas with the decimal comma', async () => {
    const svg = await grid('draw', 'plan.json', '--units', 'mm')
    expect(svg).toContain('>3810<')
    expect(svg).toContain('>2860<')
    const areas = await b.call('grid_areas', { units: 'm', decimal: 'comma' })
    expect(areas.text).toContain('3,81 m × 2,86 m, 10,90 m²')
  })
})

describe('the file stays in metres (WRT-7)', () => {
  it('is byte-identical whatever display it is read, drawn or measured under', async () => {
    const before = readFileSync(join(b.folder, 'plan.json'), 'utf8')
    for (const units of ['m', 'cm', 'mm', 'ft-in']) {
      for (const decimal of ['point', 'comma']) {
        await grid('draw', 'plan.json', '--units', units, '--decimal', decimal)
        await b.call('grid_areas', { units, decimal })
        await b.call('grid_schedule', { units, decimal })
      }
    }
    expect(readFileSync(join(b.folder, 'plan.json'), 'utf8')).toBe(before)
  })

  it('writes the same file for the same change typed in any unit and either decimal mark', async () => {
    const written = new Set<string>()
    for (const [i, [by, decimal]] of ([['0,3', 'comma'], ['300 mm', 'point'], ['30 cm', 'point'], ['0.3', 'point']] as const).entries()) {
      await grid('edit', 'move-side', 'plan.json', '--room', 'bed', '--side', 'east', '--by', by, '--decimal', decimal, '--out', `moved-${i}.json`)
      written.add(readFileSync(join(b.folder, `moved-${i}.json`), 'utf8'))
    }
    expect(written.size).toBe(1)
  })
})

describe('a decimal comma in the file (WRT-7, lab WR-18)', () => {
  it('gives one message that names the decimal comma', async () => {
    const text = JSON.stringify(plan, null, 2).replace('"offset": 1,\n      "width": 1.2,\n      "sill": 1.2192', '"offset": 1,\n      "width": 1.2,\n      "sill": 1,2192')
    expect(text).toContain('"sill": 1,2192')
    writeFileSync(join(b.folder, 'comma.json'), text)
    let out = ''
    await runGrid(['check', 'comma.json', '--json'], { stdout: (d) => (out += typeof d === 'string' ? d : ''), stderr: () => {}, stdoutIsTerminal: false, cwd: b.folder })
    const lines = (JSON.parse(out) as { result: { lines: Array<{ code: string; found?: string; message: string }> } }).result.lines
    const about = lines.filter((line) => JSON.stringify(line).includes('1,2192'))
    expect(about).toHaveLength(1)
    expect(JSON.stringify(about[0])).toMatch(/decimal comma/)
  })
})
