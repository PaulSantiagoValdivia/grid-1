import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { buildScene } from '@ongrid/floorplan/geometry'
import { floorSlabGeometry } from '../Slab3D'
import { DIVIDER_DASH, DIVIDER_LIFT, dividerGeometry } from '../Divider3D'
import { openPlan } from '../../picture/__tests__/openPlan'

/**
 * ARE-2: in 3D a dividing line is a dashed line lying on the floor, over the slabs of the
 * rooms either side, which meet on it. Nothing is raised for it.
 */
const round = (v: number): number => Math.round(v * 1e6) / 1e6 + 0
const buffer = (geometry: THREE.BufferGeometry, name: string): number[] => Array.from(geometry.getAttribute(name).array, round)

describe('a dividing line in the 3D view', () => {
  const scene = buildScene(openPlan())

  it('is a dashed line on the floor, with the floor under it on both sides', () => {
    const [divider] = scene.dividers
    const geometry = dividerGeometry(divider!)
    expect({
      walls: scene.walls.map((w) => w.id),
      slabs: scene.slabs.map((s) => ({ room: s.roomId, polygon: s.polygon.map((p) => [round(p.x), round(p.y)]) })),
      line: { position: buffer(geometry, 'position'), lineDistance: buffer(geometry, 'lineDistance') },
      dash: DIVIDER_DASH
    }).toMatchSnapshot()
  })

  it('lies just above the slab tops, so the floor does not hide it', () => {
    const line = dividerGeometry(scene.dividers[0]!)
    const top = Math.max(
      ...scene.slabs.map((slab) => {
        const slabGeometry = floorSlabGeometry(slab)
        slabGeometry.computeBoundingBox()
        return slabGeometry.boundingBox!.max.y
      })
    )
    line.computeBoundingBox()
    expect(top).toBeCloseTo(0, 9)
    expect(line.boundingBox!.min.y).toBeCloseTo(DIVIDER_LIFT, 6)
    expect(line.boundingBox!.min.y).toBeGreaterThan(top)
  })
})
