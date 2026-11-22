/**
 * WRT-6 (lab WR-15, AE-4, AU3-6), on the command and the tool server: squaring a scan is an
 * explicit step that says how far each wall moved; areas from scanned walls carry a give or
 * take; what was assumed is listed to confirm; and a height the file left out is said not stated
 * and never written into the file by Grid's edits.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { checkPlan, checkText } from '../../command/check'
import { loadPlan } from '../../command/plan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/** A 6 × 4 m room as a scan gives it: no wall quite square, no height stated. */
const scanned = (): Record<string, unknown> => ({
  version: '1',
  units: 'm',
  walls: [
    { id: 's', start: [0, 0], end: [6, 0.1], thickness: 0.2, kind: 'exterior' },
    { id: 'e', start: [6, 0.1], end: [6.05, 4], thickness: 0.2, kind: 'exterior' },
    { id: 'n', start: [6.05, 4], end: [0, 4.05], thickness: 0.2, kind: 'exterior' },
    { id: 'w', start: [0, 4.05], end: [0, 0], thickness: 0.2, kind: 'exterior' },
  ],
  rooms: [{ id: 'r', name: 'Living', use: 'living', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [{ id: 'd', wall: 's', type: 'door', offset: 2, width: 0.9, height: 2.1 }],
  marks: ['s', 'e', 'n', 'w'].map((id) => ({ part: 'wall', id, source: 'scanned', tolerance: 0.02 })),
})

/** A square flat with a partition, no height stated anywhere. */
const unstated = (): Record<string, unknown> => ({
  version: '1',
  walls: [
    { id: 's', start: [0, 0], end: [6, 0], thickness: 0.2, kind: 'exterior' },
    { id: 'e', start: [6, 0], end: [6, 4], thickness: 0.2, kind: 'exterior' },
    { id: 'n', start: [6, 4], end: [0, 4], thickness: 0.2, kind: 'exterior' },
    { id: 'w', start: [0, 4], end: [0, 0], thickness: 0.2, kind: 'exterior' },
  ],
  rooms: [{ id: 'r', name: 'Living', use: 'living', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [{ id: 'd', wall: 's', type: 'door', offset: 2, width: 0.9, height: 2.1 }],
  marks: [{ part: 'room', id: 'r', value: 'use', source: 'assumed' }],
})

let b: Bench
beforeAll(() => {
  b = bench({ 'scan.json': scanned(), 'flat.json': unstated() })
})
afterAll(() => b.close())

const file = (name: string): { walls: Record<string, unknown>[]; marks?: unknown[] } => JSON.parse(readFileSync(join(b.folder, name), 'utf8'))
const offSquare = (w: Record<string, unknown>): number => {
  const [a, c] = [w['start'] as number[], w['end'] as number[]]
  const angle = Math.atan2(c[1]! - a[1]!, c[0]! - a[0]!)
  const quarter = Math.PI / 2
  return ((angle % quarter) + quarter) % quarter
}

describe('squaring a scan (AE-4)', () => {
  it('turns every scanned wall onto the main directions and says how far each moved', async () => {
    const reply = await b.call('grid_square_scan', { plan: 'scan.json', out: 'squared.json' })
    expect(reply.isError, reply.text).toBe(false)
    const moves = reply.data!['moves'] as { wall: string; turned: number; moved: number }[]
    expect(moves.map((m) => m.wall).sort()).toEqual(['e', 'n', 's', 'w'])
    for (const m of moves) expect(m.moved).toBeLessThan(0.1)
    expect(moves.find((m) => m.wall === 's')!.turned).toBeLessThan(0)
    expect(reply.text).toMatch(/^Wall "s": turned \d\.\d\d° clockwise, an end moved 0\.\d{3} m\.$/m)
    const after = file('squared.json')
    const angles = after.walls.map(offSquare)
    for (const angle of angles) expect(Math.abs(angle - angles[0]!)).toBeLessThan(1e-3)
    // The marks stay, and no height the scan left out is written.
    expect(after.marks).toEqual(scanned()['marks'])
    expect(after.walls.every((w) => !('height' in w))).toBe(true)
    // Corners still meet: the room keeps its outline.
    const check = await b.call('grid_check', { plan: 'squared.json' })
    expect(check.text).not.toMatch(/wall\/short|wall\/gap|room\/unclosed/)
  })

  it('squares nothing unless a wall is marked scanned or all is asked, and says so', async () => {
    const reply = await b.call('grid_square_scan', { plan: 'flat.json', out: 'none.json' })
    expect(reply).toMatchObject({ isError: true })
    expect(reply.text).toMatch(/No wall is marked scanned/)
    const all = await b.call('grid_square_scan', { plan: 'flat.json', all: true, out: 'all.json' })
    expect(all.isError).toBe(false)
    expect(all.text).toMatch(/on the plan's main directions already: nothing moved/)
  })
})

describe('areas from a scan (AE-4, AE-13)', () => {
  it('carry a give or take, from the walls\' tolerance', async () => {
    const reply = await b.call('grid_areas', { plan: 'scan.json' })
    expect(reply.text).toMatch(/"Living" \(living\): .*from a scan, about ± 1\.\d% \(± 0\.\d\d m²\)/)
    expect(reply.text).toMatch(/^Net: .*from a scan, about ± 1\.\d%/m)
    const sure = reply.data!['sureness'] as { source: string; plusMinus: number; percent: number }
    expect(sure.source).toBe('scanned')
    // Each side of the room times 0.02 m, over the area: about 19.6 m of sides on about 22 m².
    expect(sure.plusMinus).toBeGreaterThan(0.35)
    expect(sure.plusMinus).toBeLessThan(0.42)
  })

  it('say how sure is not stated when a scanned wall has no tolerance, and nothing on a plan with no marks', async () => {
    const plan = scanned()
    plan['marks'] = [{ part: 'wall', id: 's', source: 'scanned' }]
    b.write('scan-loose.json', plan)
    expect((await b.call('grid_areas', { plan: 'scan-loose.json' })).text).toMatch(/from a scan: how sure is not stated/)
    expect((await b.call('grid_areas', { plan: 'flat.json' })).text).not.toMatch(/from a scan|give or take/)
  })
})

describe('what was assumed, and a height left out (WR-15, AU3-6)', () => {
  it('lists the assumed use to confirm, in grid check and grid_check', async () => {
    const result = checkPlan(loadPlan(openProject(b.folder, b.folder), 'flat.json'), {})
    const text = checkText(result, 1)
    expect(text).toMatch(/To confirm \(1\): what the plan marks assumed/)
    expect(text).toMatch(/to confirm, room "r": The use of Room "Living" was assumed, not given or measured\. \[plan\/value-assumed\]/)
    const reply = await b.call('grid_check', { plan: 'flat.json' })
    expect(reply.text).toMatch(/To confirm with the person \(1\), assumed and not given: The use of Room "Living" was assumed/)
  })

  it('says a height that is not stated, never 2.70 m', async () => {
    const person = await b.call('grid_describe', { plan: 'flat.json', for: 'person' })
    expect(person.text).toMatch(/Heights: wall height not stated \(drawn 2\.7 m high\)/)
    expect(person.text).not.toMatch(/walls 2\.7 m high/)
    const rooms = await b.call('grid_describe', { plan: 'flat.json', as: 'rooms' })
    expect(rooms.text).not.toMatch(/height/)
  })

  it('writes no height into a file that stated none when a room is split', async () => {
    const reply = await b.call('grid_split_room', { plan: 'flat.json', room: 'r', side: 'east', size: 2, new_room: 'r2', new_name: 'Study', out: 'split.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(file('split.json').walls.every((w) => !('height' in w) && !('unstated' in w))).toBe(true)
  })
})
