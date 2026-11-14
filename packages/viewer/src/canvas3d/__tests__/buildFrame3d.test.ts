import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { BuildStep, FloorPlan } from '@ongrid/core/geometry'
import type { InFlight } from '../../preview/playback'
import { ease } from '../../preview/progress'
import { applyFrame, openingOutline, pulseHeight, REST, slabOpacity, wallPose } from '../buildFrame3d'

/**
 * Task 4.4: how the 3D view plays a frame. The mapping from a frame to each
 * part's pose is pure; `applyFrame` writes it onto real Three objects, which
 * is what the render loop does every animation frame. (A full R3F render
 * needs WebGL, which the test environment doesn't have.)
 */

const wallA = (over: Partial<FloorPlan['walls'][number]> = {}): FloorPlan['walls'][number] => ({
  id: 'w1',
  start: [0, 0],
  end: [4, 0],
  thickness: 0.2,
  height: 2.7,
  kind: 'exterior',
  ...over
})

const fly = (kind: BuildStep['kind'], id: string, t: number): InFlight => ({
  step: { kind, id, group: 1 },
  t
})

describe('wallPose', () => {
  it('rests when the wall is not in flight', () => {
    expect(wallPose([], wallA(), wallA())).toEqual(REST)
  })

  it('grows a new wall from the ground without moving its footprint', () => {
    const pose = wallPose([fly('wall', 'w1', 0.5)], wallA(), undefined)
    expect(pose.scaleY).toBeCloseTo(ease(0.5))
    expect(pose.offset).toEqual({ x: 0, y: 0 })
    // Never exactly flat: a zero scale breaks the mesh's normals.
    expect(wallPose([fly('wall', 'w1', 0)], wallA(), undefined).scaleY).toBeGreaterThan(0)
  })

  it('raises a wall from its old height', () => {
    const before = wallA({ height: 2.7 })
    const after = wallA({ height: 3 })
    expect(wallPose([fly('raise', 'w1', 0)], after, before).scaleY).toBeCloseTo(0.9)
    expect(wallPose([fly('raise', 'w1', 1)], after, before).scaleY).toBeCloseTo(1)
  })

  it('slides a moved wall from where it was', () => {
    const before = wallA({ start: [0, 0], end: [4, 0] })
    const after = wallA({ start: [1, 2], end: [5, 2] })
    expect(wallPose([fly('move', 'w1', 0)], after, before).offset).toEqual({ x: -1, y: -2 })
    const done = wallPose([fly('move', 'w1', 1)], after, before).offset
    expect(done.x).toBeCloseTo(0)
    expect(done.y).toBeCloseTo(0)
  })
})

describe('slabOpacity', () => {
  it('fades a slab in during its room step and is solid otherwise', () => {
    expect(slabOpacity([fly('room', 'r1', 0.5)], 'r1')).toBeCloseTo(ease(0.5))
    expect(slabOpacity([], 'r1')).toBe(1)
  })
})

describe('openingOutline', () => {
  const opening = {
    id: 'o1',
    wall: 'w1',
    type: 'window' as const,
    offset: 1,
    width: 1.2,
    height: 1.2,
    sill: 0.9
  }

  it('outlines the hole on both faces of the wall', () => {
    const loops = openingOutline(opening, wallA())
    expect(loops).toHaveLength(2)
    for (const loop of loops) {
      const xs = loop.map((p) => p.x)
      const zs = loop.map((p) => p.z)
      expect(Math.min(...xs)).toBeCloseTo(1)
      expect(Math.max(...xs)).toBeCloseTo(2.2)
      expect(Math.min(...zs)).toBeCloseTo(0.9)
      expect(Math.max(...zs)).toBeCloseTo(2.1)
    }
    // One loop each side of the axis, just outside the faces.
    const sides = loops.map((loop) => Math.sign(loop[0].y))
    expect(new Set(sides)).toEqual(new Set([1, -1]))
    for (const loop of loops) expect(Math.abs(loop[0].y)).toBeGreaterThan(0.1)
  })
})

describe('applyFrame on real Three objects', () => {
  const plan: FloorPlan = {
    version: '1',
    units: 'm',
    walls: [wallA(), wallA({ id: 'w2', start: [4, 0], end: [4, 3] })],
    rooms: [],
    openings: []
  }

  function scene() {
    const mesh = () =>
      new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial())
    return {
      walls: new Map([
        ['w1', mesh()],
        ['w2', mesh()]
      ]),
      slabs: new Map([['r1', mesh()]]),
      leaving: new Map([['gone', mesh()]]),
      highlights: new Map([
        ['o1', new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())]
      ])
    }
  }

  const opacityOf = (object: THREE.Object3D) =>
    ((object as THREE.Mesh).material as THREE.Material).opacity

  it('gives a wall in flight a partial height and leaves the others whole', () => {
    const objects = scene()
    applyFrame(objects, [fly('wall', 'w1', 0.4)], plan, plan)
    expect(objects.walls.get('w1')!.scale.y).toBeLessThan(1)
    expect(objects.walls.get('w2')!.scale.y).toBe(1)
  })

  it('offsets a sliding wall in Three coordinates (x, height, -y)', () => {
    const objects = scene()
    const prev: FloorPlan = { ...plan, walls: [wallA({ start: [0, -1], end: [4, -1] }), plan.walls[1]] }
    applyFrame(objects, [fly('move', 'w1', 0)], plan, prev)
    const position = objects.walls.get('w1')!.position
    expect(position.x).toBeCloseTo(0)
    expect(position.y).toBeCloseTo(0)
    expect(position.z).toBeCloseTo(1)
  })

  it('fades slabs in and removed parts out, and shows the hole being cut', () => {
    const objects = scene()
    applyFrame(
      objects,
      [fly('remove', 'gone', 0.5), fly('room', 'r1', 0.5), fly('opening', 'o1', 0.25)],
      plan,
      plan
    )
    expect(opacityOf(objects.slabs.get('r1')!)).toBeLessThan(1)
    expect(((objects.slabs.get('r1') as THREE.Mesh).material as THREE.Material).transparent).toBe(true)
    expect(objects.leaving.get('gone')!.visible).toBe(true)
    expect(opacityOf(objects.leaving.get('gone')!)).toBeLessThan(1)
    expect(objects.highlights.get('o1')!.visible).toBe(true)
  })

  it('puts everything back at rest once nothing is in flight', () => {
    const objects = scene()
    applyFrame(objects, [fly('wall', 'w1', 0.3), fly('room', 'r1', 0.3), fly('remove', 'gone', 0.3)], plan, plan)
    applyFrame(objects, [], plan, plan)

    const w1 = objects.walls.get('w1')!
    expect(w1.scale.y).toBe(1)
    expect(w1.position.length()).toBe(0)
    expect(opacityOf(objects.slabs.get('r1')!)).toBe(1)
    expect(((objects.slabs.get('r1') as THREE.Mesh).material as THREE.Material).transparent).toBe(false)
    expect(objects.leaving.get('gone')!.visible).toBe(false)
    expect(objects.highlights.get('o1')!.visible).toBe(false)
  })
})

describe('pulseHeight', () => {
  it('sits on top of the wall whose end the pulse marks', () => {
    const plan: FloorPlan = {
      version: '1',
      units: 'm',
      walls: [wallA({ height: 3.1 })],
      rooms: [],
      openings: []
    }
    expect(pulseHeight(plan, { x: 4, y: 0 })).toBeCloseTo(3.1)
  })

  it('sits just above the ground anywhere else (a room, an opening)', () => {
    const plan: FloorPlan = { version: '1', units: 'm', walls: [wallA()], rooms: [], openings: [] }
    expect(pulseHeight(plan, { x: 2, y: 2 })).toBeLessThan(0.5)
    expect(pulseHeight(plan, { x: 2, y: 2 })).toBeGreaterThan(0)
  })
})
