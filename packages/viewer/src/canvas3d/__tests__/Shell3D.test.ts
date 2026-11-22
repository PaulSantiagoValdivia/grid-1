import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { SLAB_THICKNESS, buildScene, planForFloor, type SceneSolid } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { shellGeometries } from '../Shell3D'

/**
 * LVL-4: a storey's slab and roof are drawn from its shell, as the core works it out: the slab
 * under its floor level, open over a stair; the roof on its walls, over the part with nothing above.
 */

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
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return volume
}

const roof: SceneSolid = {
  pieces: [
    {
      outline: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
      holes: [[{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }]]
    }
  ],
  bottom: 2.7,
  top: 2.7 + SLAB_THICKNESS
}

describe('shellGeometries', () => {
  it('lies between its heights, faces outward and is open through its holes', () => {
    const [geometry] = shellGeometries(roof)
    expect(range(vertices(geometry!).map(([, y]) => y))).toEqual([expect.closeTo(2.7, 5), expect.closeTo(2.95, 5)])
    expect(signedVolume(geometry!)).toBeCloseTo((24 - 1) * SLAB_THICKNESS, 5)
  })

  it('draws nothing for a solid with no height', () => {
    expect(shellGeometries({ ...roof, top: roof.bottom })).toEqual([])
  })

  it('draws the slab and the roof the core gives a two-floor house: the lower floor roofed where nothing is above', () => {
    const plan = parseFloorPlan({
      floors: [{ id: 'g', name: 'Ground', level: 0 }, { id: 'f', name: 'First', level: 1 }],
      walls: [
        { id: 'g1', start: [0, 0], end: [8, 0], floor: 'g' }, { id: 'g2', start: [8, 0], end: [8, 4], floor: 'g' },
        { id: 'g3', start: [8, 4], end: [0, 4], floor: 'g' }, { id: 'g4', start: [0, 4], end: [0, 0], floor: 'g' },
        { id: 'f1', start: [0, 0], end: [4, 0], floor: 'f' }, { id: 'f2', start: [4, 0], end: [4, 4], floor: 'f' },
        { id: 'f3', start: [4, 4], end: [0, 4], floor: 'f' }, { id: 'f4', start: [0, 4], end: [0, 0], floor: 'f' }
      ],
      rooms: []
    })
    const ground = buildScene(planForFloor(plan, 'g')).shell!
    const volume = (solid: SceneSolid): number => shellGeometries(solid).reduce((sum, g) => sum + signedVolume(g), 0)
    // 8.2 × 4.2 m outside; the first floor covers 4.2 × 4.2 of it.
    expect(volume(ground.slab[0]!)).toBeCloseTo(8.2 * 4.2 * SLAB_THICKNESS, 4)
    expect(volume(ground.roof!)).toBeCloseTo((8.2 - 4.2) * 4.2 * SLAB_THICKNESS, 4)
    expect(ground.roof!.bottom).toBeCloseTo(2.7, 9)
  })
})
