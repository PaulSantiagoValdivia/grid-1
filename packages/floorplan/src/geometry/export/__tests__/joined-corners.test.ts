import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Pair, Polygon } from 'polygon-clipping'
import { parseFloorPlan, type FloorPlan } from '../../../types/floorplan'
import { buildFloorPlan } from '../../floorplan'
import { buildScene } from '../../scene3d'
import { ringArea, union } from '../../polygons'
import { DXF_LAYERS, toDxf } from '../dxf'
import { toGlb } from '../gltf'
import { toObj } from '../obj'
import { parseGlb, readMeshes } from './glb-reader'
import { worldShapes } from './dxf-reader'

/**
 * SHT-2: the exports carry the joined corners too (lab DR-1). Each file is read back here and
 * its walls seen from above; the outside of the bench's two-bedroom flat must be its whole
 * 9.5 × 7.9 m box, 75.05 m². Before, the lab measured 74.96 m² in the OBJ file: a 0.15 m square
 * missing at each of the four corners. The IFC file is read in `ifc.test.ts`.
 */
const flat = (): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../../fixtures/two-bed-flat.json'), 'utf8')))

/** The outside edge of a set of flat shapes seen from above, which must be one piece. */
function outsideArea(shapes: Polygon[]): number {
  const footprint = union(shapes.filter((s) => ringArea(s[0]!) > 1e-12))
  expect(footprint).toHaveLength(1)
  return ringArea(footprint[0]![0]!)
}

describe('SHT-2 the exports draw the flat 75.05 m² outside (DR-1: 74.96)', () => {
  it('OBJ: the wall solids, seen from above', () => {
    const shapes: Polygon[] = []
    const points: Pair[] = []
    let walls = false
    for (const line of toObj(buildScene(flat())).split('\n')) {
      const [kind, ...rest] = line.split(' ')
      if (kind === 'o') walls = rest[0]!.startsWith('wall_')
      if (kind === 'v') points.push([Number(rest[0]), Number(rest[1])])
      if (kind === 'f' && walls) shapes.push([rest.map((i) => points[Number(i) - 1]!)])
    }
    expect(outsideArea(shapes)).toBeCloseTo(75.05, 6)
  })

  it('GLB: the wall meshes, seen from above (Y up, so the plan is x and −z)', () => {
    const shapes: Polygon[] = []
    for (const mesh of readMeshes(parseGlb(toGlb(buildScene(flat()))))) {
      if (!mesh.name.startsWith('wall_')) continue
      for (const t of mesh.triangles) shapes.push([t.map((i): Pair => [mesh.points[i]!.x, -mesh.points[i]!.z])])
    }
    expect(outsideArea(shapes)).toBeCloseTo(75.05, 5)
  })

  it('DXF: the wall outlines with the openings across them', () => {
    // HND-1: each wall's closed outlines, as light polylines.
    const walls = worldShapes(toDxf(buildFloorPlan(flat())))
      .filter((s) => s.type === 'LWPOLYLINE' && (s.layer === DXF_LAYERS.wallExterior || s.layer === DXF_LAYERS.wallInterior))
      .map((s): Polygon => [s.points.map((p): Pair => [p.x, p.y])])
    const drawing = buildFloorPlan(flat())
    for (const o of drawing.openings) {
      const h = o.thickness / 2
      walls.push([
        [
          [o.from.x + o.normal.x * h, o.from.y + o.normal.y * h],
          [o.to.x + o.normal.x * h, o.to.y + o.normal.y * h],
          [o.to.x - o.normal.x * h, o.to.y - o.normal.y * h],
          [o.from.x - o.normal.x * h, o.from.y - o.normal.y * h]
        ]
      ])
    }
    expect(outsideArea(walls)).toBeCloseTo(75.05, 6)
  })
})
