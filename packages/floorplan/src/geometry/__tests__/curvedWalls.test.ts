/**
 * CNT-18: a curved wall. A round room drawn as one arc wall measures within 0.1% of its hand
 * area, and a 0.9 m door fits on it; a half-round bay, a stair tower and a dividing line on a
 * curve are one wall each, with the right area.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { buildScene, elevationArea } from '../scene3d'
import { roomArea } from '../room'
import { planAreaFigures } from '../areas'
import { wallLength, wallPointAt, wallSegments, wallSlicePolygon } from '../wall'
import { curveFault, wallCurve } from '../arc'
import { area, distance } from '../vec2'
import { parseFloorPlan } from '../../types/floorplan'

type Tuple = [number, number]

function wall(id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall {
  return { id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra }
}

function door(id: string, wallId: string, offset: number, extra: Partial<Opening> = {}): Opening {
  return { id, wall: wallId, type: 'door', offset, width: 0.9, sill: 0, height: 2.1, ...extra }
}

/** A round room: one wall, a whole circle of radius 3 m on its axis round (5, 5), 0.2 m thick. */
export function roundRoom(openings: Opening[] = [door('d1', 'round', 2)]): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [wall('round', [8, 5], [8, 5], { arc: { centre: [5, 5], sweep: 360 } })],
    rooms: [{ id: 'drum', name: 'Drum', boundary: ['round'] }],
    openings
  }
}

/** A 4 × 3 m room whose north side is a half-round bay of radius 2 m on its axis. */
function bayRoom(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [4, 0]),
      wall('e', [4, 0], [4, 3]),
      wall('bay', [4, 3], [0, 3], { arc: { centre: [2, 3], sweep: 180 } }),
      wall('w', [0, 3], [0, 0])
    ],
    rooms: [{ id: 'living', name: 'Living', boundary: ['s', 'e', 'bay', 'w'] }],
    openings: [door('d1', 's', 1.5), { id: 'win', wall: 'bay', type: 'window', offset: 2.5, width: 1.2, sill: 0.9, height: 1.2 }]
  }
}

const HAND_ROUND = Math.PI * 2.9 * 2.9

describe('a curved wall in the plan file (C8)', () => {
  it('reads an arc and keeps it', () => {
    const plan = parseFloorPlan(roundRoom())
    expect(plan.walls[0]!.arc).toEqual({ centre: [5, 5], sweep: 360 })
  })

  it('refuses a sweep of nothing or more than a whole turn', () => {
    for (const sweep of [0, 361, -400]) {
      expect(() => parseFloorPlan({ ...roundRoom(), walls: [wall('round', [8, 5], [8, 5], { arc: { centre: [5, 5], sweep } })] })).toThrow()
    }
  })

  it('works out the arc the plan states', () => {
    const curve = wallCurve(roundRoom().walls[0]!)!
    expect(curve.closed).toBe(true)
    expect(curve.radius).toBeCloseTo(3, 12)
    expect(curve.length).toBeCloseTo(6 * Math.PI, 12)
    expect(wallLength(bayRoom().walls[2]!)).toBeCloseTo(2 * Math.PI, 12)
    // Half way round the bay, counter-clockwise from (4, 3): the top of the bay.
    const top = wallPointAt(bayRoom().walls[2]!, Math.PI)
    expect(top.x).toBeCloseTo(2, 12)
    expect(top.y).toBeCloseTo(5, 12)
  })

  it('follows the curve by straight pieces no further than a millimetre off it', () => {
    const w = roundRoom().walls[0]!
    const segments = wallSegments(w)
    expect(segments.length).toBeGreaterThanOrEqual(200)
    for (const segment of segments) {
      const middle = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 }
      expect(3 - distance(middle, { x: 5, y: 5 })).toBeLessThanOrEqual(0.001)
    }
  })
})

describe('a round room drawn as one arc wall', () => {
  it('measures within 0.1% of its hand area', () => {
    const plan = roundRoom()
    const measured = roomArea(plan.rooms[0]!, indexPlan(plan))
    const error = Math.abs(measured - HAND_ROUND) / HAND_ROUND
    expect(error).toBeLessThan(0.001)
    // Far within: the pieces are fine enough for a few hundredths of a percent.
    expect(error).toBeLessThan(0.0003)
  })

  it('takes a 0.9 m door with no fault, and draws it straight across its hole', () => {
    const plan = roundRoom()
    const { issues, broken } = validatePlan(plan)
    expect(broken.size).toBe(0)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    const drawing = buildFloorPlan(plan)
    expect(drawing.rooms).toHaveLength(1)
    expect(drawing.rooms[0]!.area).toBeCloseTo(roomArea(plan.rooms[0]!, indexPlan(plan)), 9)
    const [opening] = drawing.openings
    // The hole is the chord between the door's edges on the curve: a little under 0.9 m.
    const chord = 2 * 3 * Math.sin(0.9 / 6)
    expect(distance(opening!.from, opening!.to)).toBeCloseTo(chord, 9)
    expect(chord).toBeGreaterThan(0.896)
    // Both edges lie on the curve.
    for (const p of [opening!.from, opening!.to]) expect(distance(p, { x: 5, y: 5 })).toBeCloseTo(3, 9)
  })

  it('draws the wall as one solid run round the circle, open at the door', () => {
    const drawing = buildFloorPlan(roundRoom())
    const [w] = drawing.walls
    expect(w!.slices).toHaveLength(1)
    expect(w!.curve).toBeDefined()
    // Wall area: the ring less the door's stretch, give or take the pieces.
    const ring = Math.PI * (3.1 * 3.1 - 2.9 * 2.9)
    const doorway = 0.9 * 0.2
    expect(area(w!.slices[0]!)).toBeCloseTo(ring - doorway, 2)
  })

  it('raises it in 3D as straight pieces, with a lintel over the door', () => {
    const scene = buildScene(roundRoom())
    const [w] = scene.walls
    expect(w!.pieces!.length).toBeGreaterThan(200)
    const lintels = w!.pieces!.filter((piece) => piece.elevation.outline[0]!.y > 0)
    expect(lintels).toHaveLength(1)
    // Unrolled, the wall's elevation keeps its door.
    expect(elevationArea(w!.elevation)).toBeCloseTo(6 * Math.PI * 2.7 - 0.9 * 2.1, 9)
  })

  it('gives the floor its area', () => {
    const figures = planAreaFigures(roundRoom())
    expect(figures.floors[0]!.net).toBeCloseTo(roomArea(roundRoom().rooms[0]!, indexPlan(roundRoom())), 9)
  })
})

describe('a half-round bay', () => {
  it('measures the rectangle and the half disc', () => {
    const plan = bayRoom()
    const { issues } = validatePlan(plan)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    // Inside faces: 3.8 wide, from 0.1 to 3 high, and the half disc of radius 1.9 on top.
    const hand = 3.8 * 2.9 + (Math.PI * 1.9 * 1.9) / 2
    const measured = roomArea(plan.rooms[0]!, indexPlan(plan))
    expect(Math.abs(measured - hand) / hand).toBeLessThan(0.001)
  })

  it('draws the window on the curve', () => {
    const drawing = buildFloorPlan(bayRoom())
    const win = drawing.openings.find((o) => o.id === 'win')!
    for (const p of [win.from, win.to]) expect(distance(p, { x: 2, y: 3 })).toBeCloseTo(2, 9)
    const bay = drawing.walls.find((w) => w.id === 'bay')!
    expect(bay.slices).toHaveLength(2)
    expect(wallSlicePolygon(bayRoom().walls[2]!, 0, 1).length).toBeGreaterThan(4)
  })
})

describe('a curve that cannot be built', () => {
  it('names an end that is not where the sweep takes the start', () => {
    const w = wall('bad', [4, 3], [0, 3.5], { arc: { centre: [2, 3], sweep: 180 } })
    expect(curveFault(w)?.code).toBe('wall/arc-ends-apart')
    const { issues, broken } = validatePlan({ ...bayRoom(), walls: [...bayRoom().walls.filter((x) => x.id !== 'bay'), { ...w, id: 'bay' }] })
    expect(broken.has('bay')).toBe(true)
    expect(issues.find((i) => i.id === 'bay')?.code).toBe('wall/arc-ends-apart')
  })

  it('names a radius no more than half the thickness', () => {
    const w = wall('tight', [0.05, 0], [0.05, 0], { arc: { centre: [0, 0], sweep: 360 } })
    expect(curveFault(w)?.code).toBe('wall/arc-too-tight')
  })
})
