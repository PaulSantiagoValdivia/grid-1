import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { indexPlan, openingsOf } from '../plan'
import { signedArea } from '../vec2'
import { wallAxis, wallParts, wallPolygon, wallSlicePolygon } from '../wall'
import { roomPolygon } from '../room'
import { buildFloorPlan, planBounds } from '../floorplan'
import { planFloors, planForFloor } from '../floors'
import { buildScene, elevationArea, wallBasis, wallElevation } from '../scene3d'

const plan: FloorPlan = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/floor-plan.json'), 'utf8')
)
const index = indexPlan(plan)
const wallOf = (id: string): Wall => index.wallsById.get(id)!

const straight: Wall = {
  id: 'w',
  start: [0, 0],
  end: [8, 0],
  thickness: 0.25,
  height: 2.7,
  kind: 'exterior'
}

describe('wall geometry', () => {
  it('keeps the same thickness on a diagonal wall', () => {
    const polygon = wallPolygon({ ...straight, end: [3, 4] })
    const side = Math.hypot(polygon[0]!.x - polygon[3]!.x, polygon[0]!.y - polygon[3]!.y)
    expect(side).toBeCloseTo(0.25)
  })

  it('clips a run along the axis', () => {
    const xs = wallSlicePolygon(straight, 2, 5)
      .map((p) => p.x)
      .sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(2)
    expect(xs[3]).toBeCloseTo(5)
  })

  it('reports the axis length', () => {
    expect(wallAxis(straight).length).toBeCloseTo(8)
  })
})

describe('splitting into parts — how openings are cut without CSG', () => {
  const door: Opening = {
    id: 'o',
    wall: 'w',
    type: 'door',
    offset: 1.5,
    width: 0.9,
    height: 2.1,
    sill: 0
  }

  it('a door leaves two solid runs and a lintel', () => {
    const parts = wallParts(straight, [door])
    expect(parts.map((p) => p.kind)).toEqual(['solid', 'lintel', 'solid'])

    // C2 · offset 1.5 is the near edge, so the door spans 1.5 to 2.4.
    const [left, lintel, right] = parts
    expect(left!.to).toBeCloseTo(1.5)
    expect(right!.from).toBeCloseTo(2.4)
    expect(lintel!.zFrom).toBeCloseTo(2.1)
    expect(lintel!.zTo).toBeCloseTo(2.7)
  })

  it('a window also leaves the sill below', () => {
    const window: Opening = { ...door, id: 'win', type: 'window', height: 1.2, sill: 0.9 }
    const parts = wallParts(straight, [window])
    expect(parts.map((p) => p.kind)).toEqual(['solid', 'sill', 'lintel', 'solid'])
    expect(parts.find((p) => p.kind === 'sill')!.zTo).toBeCloseTo(0.9)
  })

  it('a full-height door leaves no lintel', () => {
    const parts = wallParts(straight, [{ ...door, height: 2.7 }])
    expect(parts.map((p) => p.kind)).toEqual(['solid', 'solid'])
  })

  it('a virtual wall has no substance', () => {
    expect(wallParts({ ...straight, thickness: 0, height: 0, virtual: true })).toEqual([])
  })

  it('the parts cover the wall with no gaps or overlaps', () => {
    const covered = wallParts(straight, [door])
      .filter((p) => p.kind === 'solid')
      .reduce((sum, p) => sum + (p.to - p.from), 0)
    expect(covered).toBeCloseTo(8 - 0.9)
  })
})

describe('rooms', () => {
  it('resolves a wall shared by three rooms along different stretches', () => {
    // w5 borders the whole bedroom and also splits dining from kitchen. Since
    // lines are intersected rather than endpoints, it never has to be split.
    const dining = roomPolygon(plan.rooms.find((r) => r.id === 'r1')!, index)
    const bedroom = roomPolygon(plan.rooms.find((r) => r.id === 'r3')!, index)
    expect(Math.max(...dining.map((p) => p.x))).toBeCloseTo(4.925)
    expect(Math.min(...bedroom.map((p) => p.x))).toBeCloseTo(5.075)
  })

  it('closes an open room with the virtual wall', () => {
    const kitchen = roomPolygon(plan.rooms.find((r) => r.id === 'r2')!, index)
    expect(kitchen).toHaveLength(4)
    // The side facing the dining room sits right on v1's axis: no thickness.
    expect(Math.min(...kitchen.map((p) => p.y))).toBeCloseTo(2.5)
  })
})

describe('the drawing', () => {
  const drawing = buildFloorPlan(plan)

  it('takes the openings out of the walls', () => {
    expect(drawing.walls.find((w) => w.id === 'w1')!.slices).toHaveLength(2)
  })

  it('marks the virtual wall without giving it solid runs', () => {
    const v1 = drawing.walls.find((w) => w.id === 'v1')!
    expect(v1.virtual).toBe(true)
    expect(v1.slices).toEqual([])
  })

  it('gives an envelope covering the whole house', () => {
    expect(drawing.bounds.width).toBeCloseTo(8.25)
    expect(drawing.bounds.height).toBeCloseTo(5.25)
  })
})

describe('elevations and hole winding', () => {
  it('places the window with its sill', () => {
    const elevation = wallElevation(wallOf('w3'), openingsOf(index, 'w3'))!
    const hole = elevation.holes[0]!
    const us = hole.map((p) => p.x).sort((a, b) => a - b)
    const vs = hole.map((p) => p.y).sort((a, b) => a - b)
    expect(us[0]).toBeCloseTo(1.4)
    expect(us[3]).toBeCloseTo(2.6)
    expect(vs[0]).toBeCloseTo(0.9)
    expect(vs[3]).toBeCloseTo(2.1)
  })

  it('winds the outline and the holes in opposite directions', () => {
    // The classic mistake with this technique: same winding and the hole does
    // not open.
    const elevation = wallElevation(wallOf('w3'), openingsOf(index, 'w3'))!
    expect(signedArea(elevation.outline)).toBeGreaterThan(0)
    for (const hole of elevation.holes) expect(signedArea(hole)).toBeLessThan(0)
  })

  it('conserves volume: the wall minus the opening', () => {
    const elevation = wallElevation(wallOf('w3'), openingsOf(index, 'w3'))!
    // Wall 8 × 2.7 = 21.6 m². Window 1.2 × 1.2 = 1.44 m².
    expect(elevationArea(elevation)).toBeCloseTo(21.6 - 1.44, 5)
  })

  it('builds a right-handed basis: along × up = across', () => {
    // Otherwise the extrusion comes out mirrored and the wall faces look in.
    for (const wall of plan.walls) {
      if (wall.virtual) continue
      const { along, up, across } = wallBasis(wall)
      expect(along.y * up.z - along.z * up.y).toBeCloseTo(across.x)
      expect(along.z * up.x - along.x * up.z).toBeCloseTo(across.y)
      expect(along.x * up.y - along.y * up.x).toBeCloseTo(across.z)
    }
  })
})

describe('the 3D scene', () => {
  const scene = buildScene(plan)

  it('raises the five real walls and skips the virtual one', () => {
    expect(scene.walls).toHaveLength(5)
    expect(scene.walls.map((w) => w.id)).not.toContain('v1')
  })

  it('lays one slab per room and spreads the three openings', () => {
    expect(scene.slabs).toHaveLength(3)
    expect(scene.walls.reduce((sum, w) => sum + w.elevation.holes.length, 0)).toBe(3)
  })

  it('agrees with the plan view — same data, two views', () => {
    expect(scene.issues).toEqual([])
    expect(scene.slabs).toHaveLength(buildFloorPlan(plan).rooms.length)
  })
})

/**
 * The envelope across every floor.
 *
 * The 3D camera frames and orbits around this rather than the active floor's
 * bounds: a per-floor centre would slide the orbit pivot off the model every
 * time the user changed storey.
 */
describe('planBounds', () => {
  it('contains the bounds of every floor taken on its own', () => {
    const twoFloors: FloorPlan = {
      ...plan,
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'First floor', level: 1 }
      ],
      walls: [
        ...plan.walls.map((wall) => ({ ...wall, floor: 'ground' })),
        {
          id: 'up1',
          start: [10, 10] as [number, number],
          end: [14, 10] as [number, number],
          thickness: 0.2,
          height: 2.7,
          kind: 'exterior' as const,
          floor: 'first'
        }
      ]
    }
    const whole = planBounds(twoFloors)

    for (const floor of planFloors(twoFloors)) {
      const scene = buildScene(planForFloor(twoFloors, floor.id))
      if (scene.walls.length === 0) continue
      expect(whole.min.x).toBeLessThanOrEqual(scene.bounds.min.x)
      expect(whole.min.y).toBeLessThanOrEqual(scene.bounds.min.y)
      expect(whole.max.x).toBeGreaterThanOrEqual(scene.bounds.max.x)
      expect(whole.max.y).toBeGreaterThanOrEqual(scene.bounds.max.y)
    }

    // Wider than either storey alone, since the upper one sits away from the lower.
    expect(whole.max.x).toBeGreaterThanOrEqual(14)
  })

  it('never throws on a zero-length wall', () => {
    // wallAxis would throw here; planBounds reads the raw tuples on purpose.
    const degenerate: FloorPlan = {
      ...plan,
      walls: [{ ...plan.walls[0]!, start: [2, 2], end: [2, 2] }]
    }

    expect(() => planBounds(degenerate)).not.toThrow()
    expect(planBounds(degenerate).width).toBe(0)
  })

  it('gives empty bounds for a plan with no walls', () => {
    expect(planBounds({ ...plan, walls: [] })).toEqual({
      min: { x: 0, y: 0 },
      max: { x: 0, y: 0 },
      width: 0,
      height: 0
    })
  })

  it('ignores which floor a wall is on', () => {
    const spread: FloorPlan = {
      ...plan,
      walls: plan.walls.map((wall, i) => ({ ...wall, floor: i % 2 === 0 ? 'ground' : 'first' }))
    }

    expect(planBounds(spread)).toEqual(planBounds(plan))
  })
})
