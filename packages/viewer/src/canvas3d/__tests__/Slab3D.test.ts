import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { SLAB_THICKNESS, type SceneSlab } from '@ongrid/floorplan/geometry'
import { floorSlabGeometry, roofGeometry } from '../Slab3D'

/**
 * Slabs have thickness:
 * a storey's floor slab goes down from its floor level, and the roof
 * goes up from the top storey's walls. Heights are local to the storey's group.
 */

const slab: SceneSlab = {
  roomId: 'kitchen',
  name: 'Kitchen',
  polygon: [
    { x: 1, y: 2 },
    { x: 6, y: 2 },
    { x: 6, y: 5 },
    { x: 1, y: 5 }
  ]
}

/** Geometry buffers are float32, so heights compare to about 5 decimals. */
function vertices(geometry: THREE.BufferGeometry): Array<[number, number, number]> {
  const position = geometry.getAttribute('position')
  return Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)])
}

const range = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)]

/** Positive when every face points outward: a mirrored mesh would come out negative. */
function signedVolume(geometry: THREE.BufferGeometry): number {
  const v = vertices(geometry)
  const index = geometry.getIndex()
  const ids = index ? Array.from(index.array) : v.map((_, i) => i)
  let volume = 0
  for (let i = 0; i < ids.length; i += 3) {
    const [a, b, c] = [v[ids[i]!]!, v[ids[i + 1]!]!, v[ids[i + 2]!]!]
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6
  }
  return volume
}

describe('floorSlabGeometry', () => {
  it('goes from the floor level down 0.25 m', () => {
    const [low, high] = range(vertices(floorSlabGeometry(slab)).map(([, y]) => y))
    expect(high).toBeCloseTo(0, 5)
    expect(low).toBeCloseTo(-SLAB_THICKNESS, 5)
  })

  it('covers the room’s polygon, mapped (x, height, -y)', () => {
    const v = vertices(floorSlabGeometry(slab))
    expect(range(v.map(([x]) => x))).toEqual([1, 6])
    expect(range(v.map(([, , z]) => z))).toEqual([-5, -2])
  })

  it('faces outward, so it is not mirrored', () => {
    const volume = signedVolume(floorSlabGeometry(slab))
    expect(volume).toBeCloseTo(5 * 3 * SLAB_THICKNESS, 6)
  })
})

describe('roofGeometry', () => {
  it('lies on the walls and goes up 0.25 m', () => {
    const [low, high] = range(vertices(roofGeometry(slab, 2.8)).map(([, y]) => y))
    expect(low).toBeCloseTo(2.8, 5)
    expect(high).toBeCloseTo(2.8 + SLAB_THICKNESS, 5)
  })

  it('covers the same polygon as the floor slab, and faces outward', () => {
    const v = vertices(roofGeometry(slab, 2.8))
    expect(range(v.map(([x]) => x))).toEqual([1, 6])
    expect(range(v.map(([, , z]) => z))).toEqual([-5, -2])
    expect(signedVolume(roofGeometry(slab, 2.8))).toBeCloseTo(5 * 3 * SLAB_THICKNESS, 6)
  })
})
