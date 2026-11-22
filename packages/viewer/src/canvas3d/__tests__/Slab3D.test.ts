import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { SLAB_THICKNESS, type SceneSlab } from '@ongrid/floorplan/geometry'
import { floorSlabGeometry } from '../Slab3D'

/**
 * Slabs have thickness: a room's floor slab goes down from its floor level. Heights are local
 * to the storey's group. The roof is the storey's shell's, from its outline (LVL-4, `Shell3D`).
 */

const slab: SceneSlab = {
  roomId: 'kitchen',
  name: 'Kitchen',
  polygon: [
    { x: 1, y: 2 },
    { x: 6, y: 2 },
    { x: 6, y: 5 },
    { x: 1, y: 5 }
  ],
  holes: []
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
  it('stands a raised room on a solid block from under the storey\'s floor up to its offset (LVL-7)', () => {
    const [low, high] = range(vertices(floorSlabGeometry({ ...slab, offset: 0.6 })).map(([, y]) => y))
    expect(high).toBeCloseTo(0.6, 5)
    expect(low).toBeCloseTo(-SLAB_THICKNESS, 5)
    expect(signedVolume(floorSlabGeometry({ ...slab, offset: 0.6 }))).toBeCloseTo(15 * (0.6 + SLAB_THICKNESS), 4)
  })

  it('lowers a sunken room\'s slab by its offset, as thick as any other (LVL-7)', () => {
    const [low, high] = range(vertices(floorSlabGeometry({ ...slab, offset: -0.18 })).map(([, y]) => y))
    expect(high).toBeCloseTo(-0.18, 5)
    expect(low).toBeCloseTo(-0.18 - SLAB_THICKNESS, 5)
  })

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
