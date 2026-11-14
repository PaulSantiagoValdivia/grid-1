import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { buildFloorPlan } from '../floorplan'
import { planFloors, planForFloor } from '../floors'
import { buildScene } from '../scene3d'
import { roomArea, wallExposure } from '../room'
import { openingSpan, wallPolygon } from '../wall'
import { validatePlan } from '../validate'

/**
 * The five conventions the team closed, one test each. If someone changes one
 * by accident, it shows up here and not in the render — which matters, because
 * none of these mistakes make anything fail. They just draw the wrong house.
 */

const plan: FloorPlan = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/floor-plan.json'), 'utf8')
)
const index = indexPlan(plan)

describe('C1 · walls are drawn about their center axis', () => {
  it('splits the thickness evenly on both sides', () => {
    // w3 has its axis at y = 5 and is 0.25 thick.
    const ys = wallPolygon(index.wallsById.get('w3')!).map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(4.875)
    expect(Math.max(...ys)).toBeCloseTo(5.125)
  })
})

describe('C2 · offset is the near edge of the opening', () => {
  it('the opening runs from offset to offset + width', () => {
    const o2 = plan.openings.find((o) => o.id === 'o2')!
    const span = openingSpan(o2)
    expect(span.from).toBeCloseTo(o2.offset)
    expect(span.to).toBeCloseTo(o2.offset + o2.width)
  })

  it('validation requires it to fit along the wall', () => {
    const broken: FloorPlan = JSON.parse(JSON.stringify(plan))
    broken.openings.find((o) => o.id === 'o2')!.offset = 7.5
    expect(validatePlan(broken).issues.map((i) => i.code)).toContain('opening/out-of-wall')
  })
})

describe('C3 · room area is measured on the inner faces', () => {
  it('uses usable area, not the wall axes', () => {
    const dining = plan.rooms.find((r) => r.id === 'r1')!
    // 4.80 × 2.375 between faces. Measured on the axes it would be 5 × 2.5 =
    // 12.5, which includes half a wall on each side.
    expect(roomArea(dining, index)).toBeCloseTo(11.4, 2)
    expect(roomArea(dining, index)).toBeLessThan(12.5)
  })

  it('returns vertices counter-clockwise', () => {
    for (const room of buildFloorPlan(plan).rooms) {
      let signed = 0
      const polygon = room.polygon
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!
        const b = polygon[(i + 1) % polygon.length]!
        signed += a.x * b.y - b.x * a.y
      }
      expect(signed).toBeGreaterThan(0)
    }
  })
})

describe('C4 · the origin is where the 3D rises from', () => {
  it('the sample plan is anchored at the origin', () => {
    expect(validatePlan(plan, index).issues).toEqual([])
    expect(buildScene(plan).bounds.min).toEqual({ x: 0, y: 0 })
  })

  it('every wall starts at floor level', () => {
    for (const wall of buildScene(plan).walls) {
      expect(wall.basis.origin.z).toBe(0)
      expect(wall.elevation.outline.some((p) => p.y === 0)).toBe(true)
    }
  })

  it('warns when the plan drifts far from the origin, without refusing to draw', () => {
    const far: FloorPlan = JSON.parse(JSON.stringify(plan))
    for (const wall of far.walls) {
      wall.start = [wall.start[0] + 3000, wall.start[1]]
      wall.end = [wall.end[0] + 3000, wall.end[1]]
    }

    const warning = validatePlan(far).issues.find((i) => i.code === 'plan/far-from-origin')!
    expect(warning.severity).toBe('warning')
    expect(buildScene(far).walls).toHaveLength(5)
  })
})

describe('wall kind is not inferred from thickness', () => {
  it('derives it from having rooms on both sides of the axis', () => {
    const exposure = Object.fromEntries(
      plan.walls.filter((w) => !w.virtual).map((w) => [w.id, wallExposure(index, w.id)])
    )

    expect(exposure).toEqual({
      w1: 'exterior',
      w2: 'exterior',
      w3: 'exterior',
      w4: 'exterior',
      w5: 'interior'
    })
  })

  it('a perimeter wall bordering two rooms is still exterior', () => {
    // w1 names both the dining room and the bedroom in their boundaries, but
    // both fall on the same side — the street is on the other. Counting rooms
    // would call it interior, and that would be wrong.
    expect(index.roomsByWall.get('w1')).toHaveLength(2)
    expect(wallExposure(index, 'w1')).toBe('exterior')
  })

  it('does not get confused by thickness', () => {
    const swapped: FloorPlan = JSON.parse(JSON.stringify(plan))
    swapped.walls.find((w) => w.id === 'w5')!.thickness = 0.4
    swapped.walls.find((w) => w.id === 'w2')!.thickness = 0.1
    const other = indexPlan(swapped)

    expect(wallExposure(other, 'w5')).toBe('interior')
    expect(wallExposure(other, 'w2')).toBe('exterior')
  })
})

describe('C5 · every floor rises from z = 0', () => {
  /** The sample house, with a second storey standing on the same footprint. */
  function stacked(): FloorPlan {
    const copy: FloorPlan = JSON.parse(JSON.stringify(plan))
    return {
      ...copy,
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'First floor', level: 1 }
      ],
      walls: [
        ...copy.walls.map((wall) => ({ ...wall, floor: 'ground' })),
        ...copy.walls
          .filter((wall) => !wall.virtual)
          .map((wall) => ({ ...wall, id: `up-${wall.id}`, floor: 'first' }))
      ],
      rooms: copy.rooms.map((room) => ({ ...room, floor: 'ground' }))
    }
  }

  const zRange = (floorId: string): { low: number; high: number } => {
    const scene = buildScene(planForFloor(stacked(), floorId))
    const vs = scene.walls.flatMap((wall) => wall.elevation.outline.map((p) => p.y))
    return { low: Math.min(...vs), high: Math.max(...vs) }
  }

  it('anchors every wall of every floor at floor level', () => {
    for (const floor of planFloors(stacked())) {
      const scene = buildScene(planForFloor(stacked(), floor.id))
      expect(scene.walls.length).toBeGreaterThan(0)

      for (const wall of scene.walls) {
        expect(wall.basis.origin.z).toBe(0)
        expect(wall.elevation.outline.some((p) => p.y === 0)).toBe(true)
      }
    }
  })

  it('gives both floors the same vertical range — storeys are not stacked', () => {
    // If this ever fails, stacking has leaked into the geometry: the one-floor-
    // at-a-time decision is gone and C4's z = 0 anchor no longer holds.
    expect(zRange('first')).toEqual(zRange('ground'))
  })

  it('keeps both floors on the same origin and footprint', () => {
    const ground = buildScene(planForFloor(stacked(), 'ground'))
    const first = buildScene(planForFloor(stacked(), 'first'))

    // Same coordinates, so the upper storey lines up over the lower one rather
    // than being shifted aside to separate them.
    expect(first.bounds.min).toEqual(ground.bounds.min)
  })

  it('leaves the single-floor sample plan reading as one ground floor', () => {
    expect(planFloors(plan).map((f) => f.id)).toEqual(['ground'])
    expect(buildFloorPlan(planForFloor(plan, 'ground')).walls).toHaveLength(
      buildFloorPlan(plan).walls.length
    )
  })
})
