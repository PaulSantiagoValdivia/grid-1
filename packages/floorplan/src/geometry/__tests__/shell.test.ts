/**
 * ARE-13: each floor's outline, shared out wall by wall, and the part of it no floor above
 * covers. Every expected figure is worked out by hand in the comment beside it.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { planShell, shellKnown, type FloorShell } from '../shell'

type W = [id: string, from: [number, number], to: [number, number], height?: number, floor?: string]

function plan(walls: readonly W[], rooms: { id: string; boundary: string[]; floor?: string }[], floors?: { id: string; name: string; level: number }[]) {
  return parseFloorPlan({
    version: '1',
    units: 'm',
    ...(floors ? { floors } : {}),
    walls: walls.map(([id, start, end, height, floor]) => ({ id, start, end, thickness: 0.3, height: height ?? 2.6, kind: 'exterior', ...(floor ? { floor } : {}) })),
    rooms: rooms.map((r) => ({ name: r.id, ...r })),
    openings: [],
  })
}

const known = (shell: ReturnType<typeof planShell>[number]): FloorShell => {
  if (!shellKnown(shell)) throw new Error(shell.reason)
  return shell
}
const faces = (shell: FloorShell): Record<string, number> => Object.fromEntries(shell.faces.map((f) => [f.wall, Number(f.length.toFixed(3))]))

describe('the outline, wall by wall', () => {
  it('gives each outer wall its face, corners in', () => {
    // A 4 x 3 m box on centre lines, 0.3 m walls: the outline is 4.3 x 3.3 = 14.19 m², 15.2 m round.
    const [floor] = planShell(plan([['s', [0, 0], [4, 0]], ['e', [4, 0], [4, 3]], ['n', [4, 3], [0, 3]], ['w', [0, 3], [0, 0]]], [{ id: 'r', boundary: ['s', 'e', 'n', 'w'] }]))
    const shell = known(floor!)
    expect(shell.area).toBeCloseTo(14.19, 6)
    expect(shell.perimeter).toBeCloseTo(15.2, 6)
    // Each side's edge runs the length of its wall and half a wall past each end, to the corner.
    expect(faces(shell)).toEqual({ s: 4.3, e: 3.3, n: 4.3, w: 3.3 })
    expect(shell.open).toBeCloseTo(14.19, 6)
  })

  it('shares one side between two walls in a row where they meet, each at its own height', () => {
    // The south side is two walls, 0 to 2 m at 3.0 m high and 2 to 4 m at 2.5 m. The edge's 4.3 m
    // splits at x = 2: 0.15 + 2 = 2.15 m each.
    const [floor] = planShell(plan(
      [['s1', [0, 0], [2, 0], 3], ['s2', [2, 0], [4, 0], 2.5], ['e', [4, 0], [4, 3]], ['n', [4, 3], [0, 3]], ['w', [0, 3], [0, 0]]],
      [{ id: 'r', boundary: ['s1', 's2', 'e', 'n', 'w'] }],
    ))
    const shell = known(floor!)
    expect(faces(shell)).toEqual({ s1: 2.15, s2: 2.15, e: 3.3, n: 4.3, w: 3.3 })
    expect(shell.faces.find((f) => f.wall === 's1')!.height).toBe(3)
  })
})

describe('the part of each floor no floor above covers', () => {
  it('is the whole top floor, and the lower floor less the part under it', () => {
    // Ground: 8 x 4 m on centre lines, outline 8.3 x 4.3 = 35.69 m². First: 4 x 4 m over its west
    // half, outline 4.3 x 4.3 = 18.49 m². Open: ground 35.69 - 18.49 = 17.20, first 18.49.
    const floors = [{ id: 'g', name: 'Ground', level: 0 }, { id: 'f', name: 'First', level: 1 }]
    const shells = planShell(plan(
      [
        ['gs', [0, 0], [8, 0], 2.6, 'g'], ['ge', [8, 0], [8, 4], 2.6, 'g'], ['gn', [8, 4], [0, 4], 2.6, 'g'], ['gw', [0, 4], [0, 0], 2.6, 'g'],
        ['fs', [0, 0], [4, 0], 2.6, 'f'], ['fe', [4, 0], [4, 4], 2.6, 'f'], ['fn', [4, 4], [0, 4], 2.6, 'f'], ['fw', [0, 4], [0, 0], 2.6, 'f'],
      ],
      [{ id: 'gr', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'g' }, { id: 'fr', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'f' }],
      floors,
    )).map(known)
    expect(shells.map((s) => [s.floor, Number(s.area.toFixed(2)), Number(s.open!.toFixed(2))])).toEqual([['g', 35.69, 17.2], ['f', 18.49, 18.49]])
  })
})
