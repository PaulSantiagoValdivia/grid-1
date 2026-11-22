/**
 * LVL-8, as an agent meets it: `grid_view kind=facade` draws one side of the building in elevation,
 * and a plan's opening patterns are read as the plain openings they expand into by every reading
 * tool, kept as patterns by the tools that write the plan, and kept through rooms text.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const wall = (id: string, start: number[], end: number[], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })

/** Two floors, the first set 3 m back from the south; a row of windows on each floor's south wall. */
function house(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '1',
    units: 'm',
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
      { id: 'g', name: 'Living', use: 'living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'ground' },
      { id: 'f', name: 'Bedroom', use: 'bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' },
    ],
    openings: [{ id: 'front', wall: 'gs', type: 'door', offset: 4.5, width: 1, height: 2.1, hinge: 'start', swing: 'left' }],
    patterns: [
      { id: 'north-row', wall: 'gn', opening: { type: 'window', width: 1.2, height: 1.4, sill: 0.9 }, count: 2, margins: { start: 5, end: 1 }, floors: ['first'] },
    ],
    ...extra,
  }
}

let b: Bench
beforeAll(() => {
  b = bench({
    'house.json': house(),
    'edit.json': house(),
    'rooms.json': house(),
    'lost.json': house({ patterns: [{ id: 'lost', wall: 'gnn', opening: { type: 'window', width: 1, height: 1 }, count: 1 }] }),
  })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

const file = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>

describe('grid_view kind=facade', () => {
  it('draws one side in elevation, with the walls, openings and floors it shows', async () => {
    const reply = await ok('grid_view', { plan: 'house.json', kind: 'facade', side: 'north' })
    expect(reply.image).toBe(true)
    const facade = reply.data!['facade'] as { side: string; walls: string[]; openings: string[]; levels: { floor: string; level: number }[]; ground: { stated: boolean } }
    expect(reply.data!['kind']).toBe('facade')
    expect(facade.side).toBe('north')
    expect(facade.walls).toEqual(['gn', 'fn'])
    expect(facade.openings).toEqual(['north-row-ground-1', 'north-row-ground-2', 'north-row-first-1', 'north-row-first-2'])
    expect(facade.levels.map((l) => [l.floor, l.level])).toEqual([['ground', 0], ['first', 2.95]])
    expect(facade.ground.stated).toBe(false)
    expect(reply.text).toContain('Facade of the north side of the drawing')
    expect(reply.text).toContain('The site states no ground level')
  })

  it('takes the technical look, and needs a side', async () => {
    expect((await ok('grid_view', { plan: 'house.json', kind: 'facade', side: 'south', look: 'technical' })).text).toContain('technical')
    const none = await b.call('grid_view', { plan: 'house.json', kind: 'facade' })
    expect(none.isError).toBe(true)
    expect(none.text).toContain('kind=facade needs side')
  })

  it('refuses a side with another kind, and another kind\'s arguments with a facade', async () => {
    const plan = await b.call('grid_view', { plan: 'house.json', kind: 'plan', side: 'north' })
    expect(plan.isError).toBe(true)
    expect(plan.text).toContain('not side')
    const floor = await b.call('grid_view', { plan: 'house.json', kind: 'facade', side: 'north', floor: 'first' })
    expect(floor.isError).toBe(true)
    expect(floor.text).toContain('kind=facade takes side, look, not floor')
  })
})

describe('opening patterns through the tools', () => {
  it('are read as plain openings: the schedule lists the windows a pattern places', async () => {
    const reply = await ok('grid_schedule', { plan: 'house.json', of: 'openings' })
    for (const id of ['north-row-ground-1', 'north-row-first-2']) expect(reply.text).toContain(id)
  })

  it('say what kept a pattern\'s openings from being placed, in grid_check', async () => {
    const reply = await ok('grid_check', { plan: 'lost.json' })
    expect(reply.text).toContain('pattern/unknown-wall')
    expect(reply.text).toContain('Opening pattern "lost"')
  })

  it('stay patterns when a tool changes the plan: no window a pattern places is written out', async () => {
    await ok('grid_change_opening', { plan: 'edit.json', opening: 'front', width: 1.1 })
    const after = file('edit.json')
    expect(after['patterns']).toEqual(house()['patterns'])
    expect((after['openings'] as { id: string }[]).map((o) => o.id)).toEqual(['front'])
  })

  it('stay patterns through rooms text: read back without their openings, written again with the pattern kept', async () => {
    const back = await ok('grid_describe', { plan: 'rooms.json', as: 'rooms' })
    expect(back.text).not.toContain('north-row-')
    expect(back.text).toContain('opening pattern is not rooms text')
    const wrote = await ok('grid_write_rooms', { plan: 'rooms.json', rooms: back.text })
    expect(wrote.text).toContain("Kept the plan's opening pattern as the file has it: rooms text does not write it.")
    expect(wrote.text).not.toContain('With the walls written now')
    const after = file('rooms.json')
    expect(after['patterns']).toEqual(house()['patterns'])
    expect((after['openings'] as { id: string }[]).map((o) => o.id)).toEqual(['front'])
    // Written again, the pattern still finds its wall, and places the same windows.
    const view = await ok('grid_view', { plan: 'rooms.json', kind: 'facade', side: 'north' })
    expect((view.data!['facade'] as { openings: string[] }).openings).toHaveLength(4)
    const check = await ok('grid_check', { plan: 'rooms.json' })
    expect(check.text).not.toContain('pattern/')
  })

  it('are named in grid_write_rooms\'s answer when the walls written leave a pattern without its wall (WRT-4)', async () => {
    const back = await ok('grid_describe', { plan: 'rooms.json', as: 'rooms' })
    expect(back.text).toMatch(/\bid gn\b/)
    const wrote = await ok('grid_write_rooms', { plan: 'rooms.json', rooms: back.text.replace(/\bid gn\b/, 'id gn-new') })
    expect(wrote.text).toContain(`Kept the plan's opening pattern as the file has it: rooms text does not write it. With the walls written now: Opening pattern "north-row" names wall "gn", which the plan does not have, so none of its openings is placed`)
    expect(file('rooms.json')['patterns']).toEqual(house()['patterns'])
  })
})
