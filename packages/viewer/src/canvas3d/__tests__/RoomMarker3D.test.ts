import { describe, expect, it } from 'vitest'
import type { SceneSlab } from '@ongrid/floorplan/geometry'
import { markerGeometry } from '../RoomMarker3D'

const slab: SceneSlab = {
  roomId: 'bedroom',
  name: 'Back bedroom',
  polygon: [
    { x: 0, y: 4 },
    { x: 5, y: 4 },
    { x: 5, y: 8 },
    { x: 0, y: 8 }
  ]
}

const vertices = (geometry: ReturnType<typeof markerGeometry>) => {
  const position = geometry.getAttribute('position')
  return Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)])
}

describe('markerGeometry', () => {
  it('lays the room flat just above the walls, so the camera sees it over them', () => {
    for (const [, y] of vertices(markerGeometry(slab, 2.7))) expect(y).toBeCloseTo(2.72)
  })

  it('covers the room where the slab is, mapped like every other mesh (x, height, -y)', () => {
    const v = vertices(markerGeometry(slab, 2.7))
    const xs = v.map(([x]) => x)
    const zs = v.map(([, , z]) => z)
    expect(Math.min(...xs)).toBeCloseTo(0)
    expect(Math.max(...xs)).toBeCloseTo(5)
    expect(Math.min(...zs)).toBeCloseTo(-8)
    expect(Math.max(...zs)).toBeCloseTo(-4)
  })

  it('faces up (no mirror): the normal of every triangle points to +y', () => {
    const v = vertices(markerGeometry(slab, 2.7))
    const index = markerGeometry(slab, 2.7).getIndex()
    const ids = index ? Array.from(index.array) : v.map((_, i) => i)
    for (let i = 0; i < ids.length; i += 3) {
      const [a, b, c] = [v[ids[i]!]!, v[ids[i + 1]!]!, v[ids[i + 2]!]!]
      const u = [b[0]! - a[0]!, b[2]! - a[2]!]
      const w = [c[0]! - a[0]!, c[2]! - a[2]!]
      // y of (b - a) × (c - a), with both vectors flat in xz.
      expect(u[1]! * w[0]! - u[0]! * w[1]!).toBeGreaterThan(0)
    }
  })
})
