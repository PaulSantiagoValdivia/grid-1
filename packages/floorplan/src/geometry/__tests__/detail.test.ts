import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { buildFloorPlan, type PlanOpening } from '../floorplan'
import { hatchLines, openingDetail, planWallMaterials, wallDrawnKind } from '../detail'
import { limit } from '../tolerances'

/** SHT-10: what a drawing needs to draw walls by kind, and a plan in detail at 1:50 and larger. */

const length = ([a, b]: readonly [{ x: number; y: number }, { x: number; y: number }]): number => Math.hypot(b.x - a.x, b.y - a.y)

function plan() {
  return parseFloorPlan({
    version: '1',
    units: 'm',
    types: { walls: [{ id: 'brick', name: 'Brick', material: 'Brick' }, { id: 'stud', name: 'Stud', material: 'Plasterboard' }, { id: 'again', name: 'More brick', material: 'Brick' }] },
    walls: [
      { id: 'w1', start: [0, 0], end: [6, 0], thickness: 0.3, height: 2.7, wallType: 'brick' },
      { id: 'w2', start: [6, 0], end: [6, 4], thickness: 0.3, height: 2.7, wallType: 'brick' },
      { id: 'w3', start: [6, 4], end: [0, 4], thickness: 0.3, height: 2.7, wallType: 'brick' },
      { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.3, height: 2.7, wallType: 'brick' },
      { id: 'w5', start: [3, 0], end: [3, 4], thickness: 0.1, height: 2.7, kind: 'partition', wallType: 'stud' }
    ],
    rooms: [
      { id: 'r1', name: 'Living', boundary: ['w1', 'w5', 'w3', 'w4'] },
      { id: 'r2', name: 'Kitchen', boundary: ['w1', 'w2', 'w3', 'w5'] }
    ],
    openings: [
      { id: 'd', wall: 'w1', type: 'door', offset: 1, width: 0.9, height: 2.1 },
      { id: 'low', wall: 'w3', type: 'window', offset: 1, width: 1.2, height: 1.2, sill: 0.9 },
      { id: 'high', wall: 'w2', type: 'window', offset: 1, width: 1, height: 0.5, sill: limit('planCutHeight') }
    ]
  })
}

describe('walls by kind', () => {
  it('draws a wall facing outside or another home as outside, a stated partition inside as a partition, any other as inside', () => {
    expect(wallDrawnKind({ exposure: 'exterior' })).toBe('outside')
    expect(wallDrawnKind({ exposure: 'separating' })).toBe('outside')
    expect(wallDrawnKind({ exposure: 'interior' })).toBe('inside')
    expect(wallDrawnKind({ exposure: 'detached' })).toBe('inside')
    expect(wallDrawnKind({ exposure: 'interior', partition: true })).toBe('partition')
  })

  it('marks the stated partitions that stand inside, and each wall\'s material, in the drawing', () => {
    const drawing = buildFloorPlan(plan())
    expect(drawing.walls.map((wall) => [wall.id, wallDrawnKind(wall), wall.material])).toEqual([
      ['w1', 'outside', 'Brick'],
      ['w2', 'outside', 'Brick'],
      ['w3', 'outside', 'Brick'],
      ['w4', 'outside', 'Brick'],
      ['w5', 'partition', 'Plasterboard']
    ])
    expect(planWallMaterials(plan())).toEqual(['Brick', 'Plasterboard'])
  })

  it('marks a window at or above the plan\'s cut as above it', () => {
    const drawing = buildFloorPlan(plan())
    expect(drawing.openings.map((o) => [o.id, o.above ?? false])).toEqual([
      ['d', false],
      ['high', true],
      ['low', false]
    ])
  })
})

describe('hatch lines', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ]

  it('fills a ring with lines the spacing apart, cut to it', () => {
    const level = hatchLines(square, 0.25, 0)
    // The edges at 0 and 1 meet it at a corner only, and are no line.
    expect(level.map(([a]) => a.y)).toEqual([0, 0.25, 0.5, 0.75])
    for (const line of level) expect(length(line)).toBeCloseTo(1, 12)
    const diagonal = hatchLines(square, 0.1, Math.PI / 4)
    for (const [a, b] of diagonal) for (const p of [a, b]) expect(p.x >= -1e-12 && p.x <= 1 + 1e-12 && p.y >= -1e-12 && p.y <= 1 + 1e-12).toBe(true)
    expect(diagonal.length).toBe(15)
  })

  it('leaves the notch of a concave ring open', () => {
    // A U, open at the top between x = 1 and x = 2.
    const u = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 }
    ]
    const at = hatchLines(u, 0.5, 0).filter(([a]) => Math.abs(a.y - 1.5) < 1e-9)
    expect(at.map(([a, b]) => [a.x, b.x])).toEqual([
      [0, 1],
      [2, 3]
    ])
  })

  it('draws none for a spacing of nothing or a ring of two points', () => {
    expect(hatchLines(square, 0, 0)).toEqual([])
    expect(hatchLines(square.slice(0, 2), 0.1, 0)).toEqual([])
  })
})

describe('a door\'s and a window\'s detail', () => {
  const drawing = buildFloorPlan(plan())
  const opening = (id: string): PlanOpening => drawing.openings.find((o) => o.id === id)!

  it('frames a door through its wall and a window in the middle of it, at each side', () => {
    const door = openingDetail(opening('d'))
    expect(door.frames).toHaveLength(2)
    expect(door.glass).toEqual([])
    expect(door.sills).toEqual([])
    const ys = door.frames[0]!.map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.3, 12)
    const xs = door.frames[0]!.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(limit('frameFace'), 12)
    const window = openingDetail(opening('low'))
    const depth = window.frames[0]!.map((p) => p.y)
    expect(Math.max(...depth) - Math.min(...depth)).toBeCloseTo(limit('frameDepth'), 12)
  })

  it('gives a window two panes apart in its middle and a sill out from each face', () => {
    const window = openingDetail(opening('low'))
    expect(window.glass.map(([a]) => a.y).sort()).toEqual([4 - limit('glassThickness') / 2, 4 + limit('glassThickness') / 2].map((y) => expect.closeTo(y, 12)))
    for (const pane of window.glass) expect(length(pane)).toBeCloseTo(1.2 - 2 * limit('frameFace'), 12)
    const out = 0.15 + limit('sillProjection')
    expect(window.sills.map(([a]) => a.y).sort()).toEqual([4 - out, 4 + out].map((y) => expect.closeTo(y, 12)))
    for (const sill of window.sills) expect(length(sill)).toBeCloseTo(1.2 + 2 * limit('sillProjection'), 12)
  })

  it('has none for a doorless opening', () => {
    expect(openingDetail({ ...opening('d'), type: 'opening' })).toEqual({ frames: [], glass: [], sills: [] })
  })
})
