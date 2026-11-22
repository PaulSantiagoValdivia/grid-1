/**
 * CNT-3: north, front and where the building is, as an agent meets them. "Which rooms face
 * east" is answered by grid_measure what=facing from each outside wall; grid_describe says the
 * north and the ways; grid_view draws the north arrow; grid_check names a front that faces
 * nowhere and a plan whose y runs down; grid_mirror mirrors the stated north with the walls.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

/** A 6 × 4 m house: the living room to the west, the kitchen to the east, a window in each. */
function plan(extra: Record<string, unknown> = {}): unknown {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7 })
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s1', [0, 0], [3, 0]),
      wall('s2', [3, 0], [6, 0]),
      wall('e', [6, 0], [6, 4]),
      wall('n2', [6, 4], [3, 4]),
      wall('n1', [3, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      wall('mid', [3, 0], [3, 4]),
    ],
    rooms: [
      { id: 'living', name: 'Living', boundary: ['s1', 'mid', 'n1', 'w'], use: 'living' },
      { id: 'kitchen', name: 'Kitchen', boundary: ['s2', 'e', 'n2', 'mid'], use: 'kitchen' },
    ],
    openings: [
      { id: 'entry', wall: 's1', type: 'door', offset: 1, width: 0.9, height: 2.1 },
      { id: 'kw', wall: 'e', type: 'window', offset: 1.5, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'lw', wall: 'n1', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'between', wall: 'mid', type: 'door', offset: 1.5, width: 0.8, height: 2.1 },
    ],
    ...extra,
  }
}

let b: Bench
beforeAll(() => {
  b = bench({
    'plain.json': plan(),
    'north.json': plan({ north: 90, front: { opening: 'entry' }, site: { origin: [1, 1], latitude: 40.5, longitude: -3.25 } }),
    'tilted.json': plan({ north: 30 }),
    'down.json': plan({ yAxis: 'down', front: { wall: 'mid' } }),
  })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

type Answer = { north: Record<string, unknown>; rooms: { id: string; faces: string[]; windows: string[] }[]; walls: { wall: string; faces: string }[]; openings: { id: string; faces: string }[]; front: Record<string, unknown> | null }
const answer = (reply: Reply): Answer => reply.data!['answer'] as Answer

describe('which rooms face east (grid_measure what=facing)', () => {
  it('answers from each outside wall by the north the plan states', async () => {
    const reply = await ok('grid_measure', { plan: 'north.json', what: 'facing' })
    const a = answer(reply)
    expect(a.north).toEqual({ stated: true, degrees: 90, words: '90° counter-clockwise from the top of the drawing' })
    // North points to -x: the kitchen's east wall faces south, the living room's west wall north.
    expect(a.rooms).toEqual([
      expect.objectContaining({ id: 'living', faces: ['north', 'east', 'west'], windows: ['east'] }),
      expect.objectContaining({ id: 'kitchen', faces: ['south', 'east', 'west'], windows: ['south'] }),
    ])
    const east = a.rooms.filter((r) => r.faces.includes('east')).map((r) => r.id)
    expect(east).toEqual(['living', 'kitchen'])
    expect(a.front).toEqual({ part: 'opening', id: 'entry', wall: 's1', faces: 'west', bearing: 270 })
    expect(reply.text.split('\n')[0]).toBe('North, as the plan states it: 90° counter-clockwise from the top of the drawing (north 90).')
    expect(reply.text).toContain('  east: "Living" (living, window), "Kitchen" (kitchen)')
  })

  it('takes the top of the drawing as north when the plan states none, and says so first', async () => {
    const reply = await ok('grid_measure', { plan: 'plain.json', what: 'facing' })
    expect(answer(reply).north).toEqual({ stated: false, assumed: 'the top of the drawing, +y' })
    expect(reply.text.split('\n')[0]).toMatch(/^The plan states no north, so these directions take north as the top of the drawing \(\+y\), which is not known to be north/)
    expect(answer(reply).rooms.find((r) => r.id === 'kitchen')!.faces[0]).toBe('east')
  })

  it('answers for one room, and refuses an argument facing does not take', async () => {
    const reply = await ok('grid_measure', { plan: 'tilted.json', what: 'facing', room: 'kitchen' })
    expect(answer(reply).rooms.map((r) => r.id)).toEqual(['kitchen'])
    expect(reply.text).toContain('"Kitchen" faces south-east (')
    const refused = await b.call('grid_measure', { plan: 'plain.json', what: 'facing', wall: 'e' })
    expect(refused.isError).toBe(true)
  })
})

describe('grid_describe, grid_view and grid_check', () => {
  it('describes a plan that states its north with the ways, and one that states none as before', async () => {
    const stated = (await ok('grid_describe', { plan: 'north.json', for: 'person' })).text
    expect(stated).toContain('North, as the plan states it: 90° counter-clockwise from the top of the drawing. The sides named here are the drawing\'s: its top faces east, its right side south, its foot west and its left side north.')
    expect(stated).toContain('Rooms facing each way, by their outside walls: north, Living; east, Living, Kitchen; south, Kitchen; west, Living, Kitchen.')
    expect(stated).not.toContain('where north is')
    const agent = (await ok('grid_describe', { plan: 'north.json' })).text
    expect(agent).toContain('NORTH 90 ccw from +y; drawing top faces east')
    expect(agent).toContain('FRONT opening entry faces west')
    const plain = (await ok('grid_describe', { plan: 'plain.json', for: 'person' })).text
    expect(plain).toContain('where north is')
    expect(plain).not.toMatch(/North, as the plan|Rooms facing/)
  })

  it('says where the north arrow points on a plan that states its north', async () => {
    const view = await ok('grid_view', { plan: 'north.json', kind: 'plan' })
    expect(view.text).toContain('The north arrow in its top-right corner points to the north the plan states, 90° counter-clockwise from the top of the drawing')
    expect((await ok('grid_view', { plan: 'plain.json', kind: 'plan' })).text).toContain('the plan holds no real north')
  })

  it('names a front that faces nowhere and a plan whose y runs down', async () => {
    const lines = (await ok('grid_check', { plan: 'down.json' })).data!['lines'] as { code: string; message: string; also: string[] }[]
    expect(lines.find((l) => l.code === 'plan/y-down')!.message).toMatch(/^The plan says its y runs down the page, so every drawing and export shows the building mirrored/)
    expect(lines.find((l) => l.code === 'plan/front-not-said')).toMatchObject({ message: 'The front names wall "mid", which does not face outside, so no front is said', also: ['mid'] })
    const plain = (await ok('grid_check', { plan: 'plain.json' })).data!['lines'] as { code: string }[]
    expect(plain.filter((l) => l.code === 'plan/y-down' || l.code === 'plan/front-not-said')).toEqual([])
  })
})

describe('mirroring keeps the real directions (grid_mirror)', () => {
  it('mirrors the stated north and the site, so left to right swaps the real east and west', async () => {
    const before = answer(await ok('grid_measure', { plan: 'tilted.json', what: 'facing' }))
    const reply = await ok('grid_mirror', { plan: 'tilted.json', how: 'left-right', out: 'tilted-mirrored.json' })
    expect(reply.text).toContain('The plan\'s north is mirrored with it: 30° → 330° counter-clockwise from the top of the drawing.')
    const written = JSON.parse(readFileSync(join(b.folder, 'tilted-mirrored.json'), 'utf8')) as Record<string, unknown>
    expect(written['north']).toBe(330)
    expect(written['yAxis']).toBeUndefined()
    const after = answer(await ok('grid_measure', { plan: 'tilted-mirrored.json', what: 'facing' }))
    const swap: Record<string, string> = { north: 'north', 'north-east': 'north-west', east: 'west', 'south-east': 'south-west', south: 'south', 'south-west': 'south-east', west: 'east', 'north-west': 'north-east' }
    for (const w of before.walls) expect(after.walls.find((x) => x.wall === w.wall)!.faces, w.wall).toBe(swap[w.faces])

    const site = await ok('grid_mirror', { plan: 'north.json', how: 'top-bottom', out: 'north-flipped.json' })
    expect(site.isError).toBe(false)
    const flipped = JSON.parse(readFileSync(join(b.folder, 'north-flipped.json'), 'utf8')) as Record<string, unknown>
    expect(flipped['north']).toBe(270)
    expect(flipped['site']).toEqual({ origin: [1, 3], latitude: 40.5, longitude: -3.25 })
    expect(flipped['front']).toEqual({ opening: 'entry' })
  })

  it('leaves a plan that states no north without one', async () => {
    await ok('grid_mirror', { plan: 'plain.json', how: 'left-right', out: 'plain-mirrored.json' })
    const written = JSON.parse(readFileSync(join(b.folder, 'plain-mirrored.json'), 'utf8')) as Record<string, unknown>
    expect(Object.keys(written).filter((k) => ['north', 'site', 'front', 'yAxis'].includes(k))).toEqual([])
  })
})
