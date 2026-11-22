import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench } from './replay/harness'

/**
 * CNT-18: a curved wall through the tool server. A round room and a living room with a half-round
 * bay, a kitchen beside the living room: what each tool answers about them, what the exports say
 * they write as straight pieces, and which edits keep to straight walls.
 */

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra })

const plan = {
  version: '1',
  units: 'm',
  walls: [
    wall('round', [18, 5], [18, 5], { arc: { centre: [15, 5], sweep: 360 } }),
    wall('s', [0, 0], [4, 0], { kind: 'interior' }),
    wall('e', [4, 0], [4, 3]),
    wall('bay', [4, 3], [0, 3], { arc: { centre: [2, 3], sweep: 180 } }),
    wall('w', [0, 3], [0, 0]),
    wall('ks', [0, -3], [4, -3]),
    wall('ke', [4, -3], [4, 0]),
    wall('kw', [0, 0], [0, -3]),
  ],
  rooms: [
    { id: 'drum', name: 'Drum', boundary: ['round'], use: 'living' },
    { id: 'living', name: 'Living', boundary: ['s', 'e', 'bay', 'w'], use: 'living' },
    { id: 'kitchen', name: 'Kitchen', boundary: ['ks', 'ke', 's', 'kw'], use: 'kitchen' },
  ],
  openings: [
    { id: 'd1', wall: 'round', type: 'door', offset: 2, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' },
    { id: 'd2', wall: 's', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'd3', wall: 'ks', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'win', wall: 'bay', type: 'window', offset: 2.5, width: 1.2, sill: 0.9, height: 1.2 },
  ],
}

describe('a curved wall through the tool server (CNT-18)', () => {
  const b = bench({ 'plan.json': plan })
  afterAll(() => b.close())

  it('checks the plan with no part it cannot draw', async () => {
    const reply = await b.call('grid_check', { plan: 'plan.json', full: true })
    expect(reply.isError).toBe(false)
    expect(reply.text).not.toMatch(/can't be drawn|arc-/)
  })

  it('measures the round room within 0.1% of its hand area', async () => {
    const reply = await b.call('grid_areas', { plan: 'plan.json' })
    expect(reply.isError).toBe(false)
    const hand = Math.PI * 2.9 * 2.9
    const rooms = JSON.stringify(reply.data)
    const drum = /"id":"drum"[^}]*?"net":([0-9.]+)/.exec(rooms) ?? /"net":([0-9.]+)[^}]*?"id":"drum"/.exec(rooms)
    expect(drum, rooms.slice(0, 400)).not.toBeNull()
    expect(Math.abs(Number(drum![1]) - hand) / hand).toBeLessThan(0.001)
  })

  it('describes a curved wall by its centre and sweep', async () => {
    const agent = await b.call('grid_describe', { plan: 'plan.json', length: 'walls', for: 'agent' })
    expect(agent.text).toContain(' bay 4,3>0,3 arc(2,3 180°) 0.2 x')
    const person = await b.call('grid_describe', { plan: 'plan.json', length: 'walls', for: 'person' })
    expect(person.text).toContain('From 4, 3 to 0, 3, curving 180° anticlockwise round 2, 3 (radius 2, 6.28 along the curve)')
    const rooms = await b.call('grid_describe', { plan: 'plan.json', as: 'rooms' })
    expect(rooms.text).toContain('raw wall {"id":"bay"')
    expect(rooms.text).toContain('"arc":{"centre":[2,3],"sweep":180}')
  })

  it('exports with the curves it writes as straight pieces named, in its answer and its file', async () => {
    const dxf = await b.call('grid_export', { plan: 'plan.json', format: 'dxf' })
    expect(dxf.isError).toBe(false)
    expect(dxf.data!['approximated']).toEqual([
      { kind: 'room', id: 'drum', floor: 'ground' },
      { kind: 'room', id: 'living', floor: 'ground' },
    ])
    expect(dxf.text).toContain('Wrote the curves of 2 rooms along curved walls ("drum", "living") as straight pieces')
    const obj = await b.call('grid_export', { plan: 'plan.json', format: 'obj' })
    expect(obj.data!['approximated']).toEqual([
      { kind: 'wall', id: 'bay', floor: 'ground' },
      { kind: 'wall', id: 'round', floor: 'ground' },
      { kind: 'room', id: 'drum', floor: 'ground' },
      { kind: 'room', id: 'living', floor: 'ground' },
    ])
    expect(readFileSync(join(b.folder, 'exports', 'plan.obj'), 'utf8')).toContain('# Curved walls written as straight pieces (2): "bay", "round"')
  })

  it('refuses an edit that would move or cut a curved wall, and changes nothing', async () => {
    const merge = await b.call('grid_merge_rooms', { plan: 'plan.json', room: 'living', with: 'kitchen', out: 'merged.json' })
    expect(merge).toMatchObject({ isError: true })
    expect(merge.text).toContain('Wall "bay" is curved, and merging rooms changes straight walls only.')
    const move = await b.call('grid_move_room_side', { plan: 'plan.json', room: 'living', side: 'north', by: 1, out: 'moved.json' })
    expect(move.isError).toBe(true)
    expect(move.text).toContain('Wall "bay" is curved')
    // A side of a straight room beside it still moves.
    const kitchen = await b.call('grid_move_room_side', { plan: 'plan.json', room: 'kitchen', side: 'south', by: 1, out: 'kitchen.json' })
    expect(kitchen.isError, kitchen.text).toBe(false)
  })

  it('changes an opening along a curved wall, and mirrors the curve', async () => {
    const wider = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'win', width: 1.5, out: 'wider.json' })
    expect(wider.isError, wider.text).toBe(false)
    const written = JSON.parse(readFileSync(join(b.folder, 'wider.json'), 'utf8')) as typeof plan
    expect(written.openings.find((o) => o.id === 'win')).toMatchObject({ offset: 2.35, width: 1.5 })
    const mirrored = await b.call('grid_mirror', { plan: 'plan.json', how: 'left-right', out: 'mirrored.json' })
    expect(mirrored.isError, mirrored.text).toBe(false)
    const after = JSON.parse(readFileSync(join(b.folder, 'mirrored.json'), 'utf8')) as typeof plan
    expect(after.walls.find((w) => w.id === 'bay')).toMatchObject({ start: [14, 3], end: [18, 3], arc: { centre: [16, 3], sweep: -180 } })
    const check = await b.call('grid_areas', { plan: 'mirrored.json' })
    expect(check.isError).toBe(false)
  })
})
