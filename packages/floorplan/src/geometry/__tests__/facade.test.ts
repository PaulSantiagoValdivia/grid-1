/**
 * LVL-8: a facade from the model: the walls that face a side, every floor at its level, openings
 * at their sills and heads, the ground, and how far back each face stands.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { labPlan } from '../../test-support/lab'
import { FACADE_SIDES, planFacade } from '../facade'
import { planFacing } from '../orientation'
import { floorElevations } from '../elevations'

const wall = (id: string, start: [number, number], end: [number, number], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })

/**
 * A house of two floors: the ground floor 10 m by 8 m, the first floor 6 m by 5 m over its north
 * west corner, so the first floor stands 3 m back from the south side and 4 m back from the east.
 * The ground is 15 cm below the ground floor.
 */
function steppedHouse(extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({
    version: '1',
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 },
    ],
    site: { ground: -0.15 },
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
    openings: [
      { id: 'front', wall: 'gs', type: 'door', offset: 4.5, width: 1, height: 2.1 },
      { id: 'w-first', wall: 'fs', type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 },
    ],
    ...extra,
  })
}

describe('the facade of a side', () => {
  it('draws the walls that face that side, and no other', () => {
    const plan = steppedHouse()
    expect(planFacade(plan, 'south').walls).toEqual(['gs', 'fs'])
    expect(planFacade(plan, 'north').walls).toEqual(['gn', 'fn'])
    expect(planFacade(plan, 'east').walls).toEqual(['ge', 'fe'])
    expect(planFacade(plan, 'west').walls).toEqual(['gw', 'fw'])
  })

  it('stacks the floors at their levels: each wall from its floor level, each slab under it, each roof on top', () => {
    const facade = planFacade(steppedHouse(), 'south')
    const of = (kind: string, floor: string) => facade.faces.filter((f) => f.kind === kind && f.floor === floor).map((f) => [f.bottom, f.top])
    expect(of('wall', 'ground')).toEqual([[0, 2.7]])
    expect(of('wall', 'first')).toEqual([[2.95, 5.65]])
    expect(of('slab', 'first')).toEqual([[2.7, 2.95]])
    expect(of('roof', 'ground')).toEqual([[2.7, 2.95]])
    expect(of('roof', 'first')).toEqual([[5.65, 5.9]])
    expect(facade.levels.map((l) => [l.floor, l.name, l.level])).toEqual([
      ['ground', 'Ground floor', 0],
      ['first', 'First floor', 2.95],
    ])
    // The same levels the 3D view and the IFC stack the floors at.
    expect(floorElevations(steppedHouse()).floors.get('first')!.floorLevel).toBe(2.95)
  })

  it('reaches the building\'s corners, walls and all, left to right as a person outside sees it', () => {
    const south = planFacade(steppedHouse(), 'south')
    const ground = south.faces.find((f) => f.wall === 'gs')!
    // Seen from the south, east is on the right: u runs with x, to the outside faces of the corners.
    expect([ground.u0, ground.u1]).toEqual([-0.15, 10.15])
    const north = planFacade(steppedHouse(), 'north')
    const back = north.faces.find((f) => f.wall === 'gn')!
    // Seen from the north, east is on the left: u runs against x.
    expect([back.u0, back.u1]).toEqual([-10.15, 0.15])
  })

  it('puts each opening at its sill and its head, from its floor\'s level', () => {
    const facade = planFacade(steppedHouse(), 'south')
    const openings = facade.faces.flatMap((f) => f.openings).sort((a, b) => a.bottom - b.bottom)
    expect(openings).toEqual([
      { id: 'front', type: 'door', wall: 'gs', u0: 4.5, u1: 5.5, bottom: 0, top: 2.1 },
      { id: 'w-first', type: 'window', wall: 'fs', u0: 2, u1: 3.2, bottom: 3.85, top: 5.05 },
    ])
    expect(facade.openings).toEqual(['front', 'w-first'])
  })

  it('gives each face how far back it stands, and comes farthest first, so a nearer face hides what is behind it', () => {
    const facade = planFacade(steppedHouse(), 'south')
    const tier = (wallId: string) => facade.faces.find((f) => f.wall === wallId)!
    expect([tier('gs').depth, tier('gs').tier]).toEqual([0, 0])
    expect([tier('fs').depth, tier('fs').tier]).toEqual([3, 1])
    const depths = facade.faces.map((f) => f.depth)
    expect(depths).toEqual([...depths].sort((a, b) => b - a))
    // Seen from the north both floors' walls stand in one plane.
    expect(new Set(planFacade(steppedHouse(), 'north').faces.filter((f) => f.kind === 'wall').map((f) => f.tier))).toEqual(new Set([0]))
  })

  it('stands on the ground the site states, and outlines what stands above it', () => {
    const facade = planFacade(steppedHouse(), 'south')
    expect(facade.ground).toEqual({ level: -0.15, stated: true })
    // The silhouette: the ground floor's 10.3 m from the ground to its roof, the first floor's 6.3 m on top.
    expect(facade.outline).toHaveLength(1)
    const ring = facade.outline[0]!
    const area = Math.abs(ring.slice(0, -1).reduce((sum, [u, z], i) => sum + u * ring[i + 1]![1] - ring[i + 1]![0] * z, 0)) / 2
    expect(area).toBeCloseTo(10.3 * (2.95 + 0.15) + 6.3 * (5.9 - 2.95), 6)
    expect(facade.extent).toEqual({ u0: -0.15, u1: 10.15, bottom: -0.25, top: 5.9 })
    // With no ground stated, the ground floor's floor level, 0, as LVL-4 reads it.
    const { site: _site, ...rest } = steppedHouse()
    void _site
    expect(planFacade(rest as FloorPlan, 'south').ground).toEqual({ level: 0, stated: false })
  })

  it('names the way the side faces only by a north the plan states', () => {
    expect(planFacade(steppedHouse(), 'south').compass).toBeNull()
    // North 90° counter-clockwise from the top of the drawing: north is to the left, so the bottom
    // of the drawing, its south side, faces west.
    expect(planFacade(steppedHouse({ north: 90 }), 'south').compass).toEqual({ bearing: 270, faces: 'west' })
  })

  it('draws a pattern\'s openings as the plain openings it expands into', () => {
    const plan = steppedHouse({ patterns: [{ id: 'row', wall: 'gs', opening: { type: 'window', width: 1, height: 1.2, sill: 0.9 }, count: 2, margins: { start: 1, end: 1 } }] })
    const facade = planFacade(plan, 'south')
    expect(facade.openings).toEqual(['front', 'w-first', 'row-ground-1', 'row-ground-2'])
  })

  it('cuts a wall to the roof the floor states, so a gable end is a gable, and shows the slope it looks at (LVL-6)', () => {
    const w = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, height: 6 })
    const plan = parseFloorPlan({
      version: '1',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0, roof: { shape: 'gable', eaves: 2.5, ridge: 5, ridgeRuns: 'east-west' } }],
      walls: [w('s', [0, 0], [10, 0]), w('e', [10, 0], [10, 6]), w('n', [10, 6], [0, 6]), w('w', [0, 6], [0, 0])],
      rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'] }],
      openings: [],
    })
    // Seen from the east the end wall rises to the ridge, 5 m, in the middle of its 6 m.
    const gable = planFacade(plan, 'east').faces.find((f) => f.wall === 'e')!
    expect(gable.top).toBe(5)
    expect(gable.outline).toContainEqual([3, 5])
    expect(gable.outline.filter(([, z]) => z === 2.5).length).toBeGreaterThanOrEqual(2)
    // Seen from the south the side wall stops at the eaves, and the roof's plane rises behind it.
    const south = planFacade(plan, 'south')
    expect(south.faces.find((f) => f.wall === 's')!.top).toBe(2.5)
    expect(south.faces.some((f) => f.kind === 'roof-plane' && f.top > 5)).toBe(true)
  })

  it('says nothing faces a side when the plan has no outside face', () => {
    const empty = parseFloorPlan({ version: '1', walls: [], rooms: [], openings: [] })
    expect(planFacade(empty, 'north')).toMatchObject({ faces: [], extent: null, walls: [], openings: [] })
  })
})

describe('on the plans Grid already knows', () => {
  const fixture = (name: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

  it('draws the walls CNT-3 says face each side, on a house drawn square to the page', () => {
    for (const name of ['three-bed-house.json', 'two-bed-flat.json', 'villa.json']) {
      const plan = fixture(name)
      const facing = planFacing(plan)
      for (const side of FACADE_SIDES) {
        const expected = [...new Set(facing.walls.filter((w) => w.faces === side).map((w) => w.wall))]
        expect(planFacade(plan, side).walls.slice().sort(), `${name} ${side}`).toEqual(expected.sort())
      }
    }
  })

  it('stacks the lab\'s odd house: the ground floor to 2.70 m, the first floor from 2.95 m, a roof on each', () => {
    const plan = labPlan('F/scenarios/odd-house.json')
    const facade = planFacade(plan, 'south')
    const floors = [...new Set(facade.faces.map((f) => f.floor))]
    expect(floors.length).toBe(2)
    const [lower, upper] = facade.levels
    expect(lower!.level).toBe(0)
    expect(upper!.level).toBeCloseTo(2.95, 9)
    expect(Math.max(...facade.faces.filter((f) => f.kind === 'wall' && f.floor === lower!.floor).map((f) => f.top))).toBeCloseTo(2.7, 9)
    expect(Math.min(...facade.faces.filter((f) => f.kind === 'wall' && f.floor === upper!.floor).map((f) => f.bottom))).toBeCloseTo(2.95, 9)
    expect(facade.faces.filter((f) => f.kind === 'roof').map((f) => f.floor).sort()).toEqual([...new Set(facade.faces.filter((f) => f.kind === 'roof').map((f) => f.floor))].sort())
  })
})
