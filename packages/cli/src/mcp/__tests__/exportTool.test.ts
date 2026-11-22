import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench } from './replay/harness'

/**
 * HND-6: grid_export answers with every part of the plan its file leaves out, and refuses a file
 * that would hold nothing of the plan.
 */

const sample = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) as {
  walls: { id: string; start: number[]; end: number[] }[]
  rooms: { id: string }[]
  openings: { id: string }[]
}

/** The flat with its first wall made zero-length, and a second copy of its first room. */
function broken(): Record<string, unknown> {
  const plan = structuredClone(sample)
  plan.walls[0]!.end = [...plan.walls[0]!.start]
  return { ...plan, rooms: [...plan.rooms, { ...plan.rooms[0]! }] }
}

describe('grid_export says what the file leaves out (HND-6)', () => {
  const b = bench({
    'plan.json': sample,
    'broken.json': broken(),
    'empty.json': { version: '1', units: 'm', walls: [], rooms: [], openings: [] },
  })
  afterAll(() => b.close())

  it('leaves nothing out of the sound flat, and says nothing', async () => {
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'ifc' })
    expect(reply.isError).toBe(false)
    expect(reply.data).toMatchObject({ leftOut: 0, leftOutParts: [] })
    expect(reply.text).not.toContain('Left out')
  })

  it('lists each part left out, by kind, id, place, floor and code', async () => {
    const reply = await b.call('grid_export', { plan: 'broken.json', format: 'ifc' })
    expect(reply.isError).toBe(false)
    const parts = reply.data!['leftOutParts'] as { kind: string; id: string | null; place: string | null; floor: string | null; code: string | null }[]
    expect(reply.data!['leftOut']).toBe(parts.length)
    const wall = sample.walls[0]!.id
    expect(parts).toContainEqual({ kind: 'wall', id: wall, place: null, floor: 'ground', code: 'wall/zero-length' })
    // The second copy of the room, which the reader left out (MSG-6), by its place in the file.
    expect(parts[0]).toEqual({ kind: 'room', id: sample.rooms[0]!.id, place: `rooms[${sample.rooms.length}]`, floor: null, code: 'plan/id-clash' })
    expect(parts.every((part) => part.code !== null)).toBe(true)
    expect(reply.text).toMatch(/^Left out \d+ parts of the plan, and the file says so: .*grid check says why\.$/m)
    expect(readFileSync(join(b.folder, 'exports', 'broken.ifc'), 'latin1')).toContain(`IFCPROPERTYSINGLEVALUE('Parts',$,IFCINTEGER(${parts.length}),$)`)
  })

  it('refuses a plan with nothing to draw, and writes nothing', async () => {
    const reply = await b.call('grid_export', { plan: 'empty.json', format: 'glb' })
    expect(reply).toMatchObject({ isError: true, text: 'Nothing to export: empty.json has no wall, room or fixture that can be drawn. No file was written.' })
    expect(existsSync(join(b.folder, 'exports', 'empty.glb'))).toBe(false)
  })
})
