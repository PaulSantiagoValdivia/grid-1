/**
 * CNT-14 (done when 3): the 3D files show each door's and window's glass, frame and leaves, the
 * leaves hung from the face of the wall the door opens toward, and the IFC types them by kind.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from '../../plan'
import { buildScene } from '../../scene3d'
import { toObj } from '../obj'
import { toGlb } from '../gltf'
import { toIfc } from '../ifc'
import { toDxf } from '../dxf'
import { buildFloorPlan } from '../../floorplan'
import { parseGlb, readMeshes } from './glb-reader'
import { en, entity, ofType, parseDoc, ref, refs, str } from './step-reader'

/** One 6 m wall along +x, 0.3 m thick, with a door opening north (to its left face) and a window. */
function plan(door: Partial<Opening> = {}, window: Partial<Opening> = {}): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [{ id: 'w', start: [0, 0], end: [6, 0], thickness: 0.3, height: 2.7, kind: 'exterior' }],
    rooms: [],
    openings: [
      { id: 'd', wall: 'w', type: 'door', offset: 0.5, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', ...door },
      { id: 'win', wall: 'w', type: 'window', offset: 3, width: 1.2, sill: 0.9, height: 1.2, ...window }
    ]
  } as FloorPlan
}

describe('OBJ and GLB', () => {
  it('hold each door\'s frame and leaf and each window\'s frame and glass, as objects of their own', () => {
    const obj = toObj(buildScene(plan()))
    const objects = obj.split('\n').filter((line) => line.startsWith('o ')).map((line) => line.slice(2))
    expect(objects).toEqual(['wall_w', 'frame_d', 'leaf_d', 'frame_win', 'glass_win'])
  })

  it('hangs the door\'s leaf from the face of the wall it opens toward, in the GLB as in the scene', () => {
    for (const [swing, face] of [['left', 0.15], ['right', -0.15]] as const) {
      const meshes = readMeshes(parseGlb(toGlb(buildScene(plan({ swing })))))
      const leaf = meshes.find((m) => m.name === 'leaf_d')!
      // glTF is Y up: plan y is -z.
      const ys = leaf.points.map((p) => -p.z)
      expect(swing === 'left' ? Math.max(...ys) : Math.min(...ys)).toBeCloseTo(face, 6)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.04, 6)
    }
  })

  it('draws the glass in a material of its own, seen through, and keeps one material when there is no glass', () => {
    const glb = parseGlb(toGlb(buildScene(plan())))
    const materials = glb.json.materials as { name?: string; alphaMode?: string }[]
    expect(materials).toHaveLength(2)
    expect(materials[1]).toMatchObject({ name: 'glass', alphaMode: 'BLEND' })
    const glass = (glb.json.meshes as { name?: string; primitives: { material?: number }[] }[]).find((m) => m.name === 'glass_win')!
    expect(glass.primitives[0]!.material).toBe(1)
    const noWindow = { ...plan(), openings: [plan().openings[0]!] }
    expect(parseGlb(toGlb(buildScene(noWindow))).json.materials).toHaveLength(1)
  })

  it('gives a pair two leaves, a sliding door two leaves in the wall, and a fixed window glass with no sash', () => {
    const leaves = (door: Partial<Opening>): number => buildScene(plan(door)).openings[0]!.parts.filter((p) => p.part === 'leaf').length
    expect(leaves({ width: 1.6, kind: 'double' })).toBe(2)
    expect(leaves({ width: 2.4, kind: 'sliding' })).toBe(2)
    const fixed = buildScene(plan({}, { kind: 'fixed' })).openings[1]!
    expect(fixed.parts.map((p) => p.part)).toEqual(['frame', 'frame', 'frame', 'frame', 'glass'])
  })
})

describe('IFC', () => {
  const doc = (p: FloorPlan) => parseDoc(toIfc(p, { projectId: 'kinds', projectName: 'Kinds', timestamp: new Date('2026-11-22T00:00:00Z') }))

  it('fills a window with its frame and glass, the glass styled as glass', () => {
    const d = doc(plan())
    const window = ofType(d, 'IFCWINDOW')[0]!
    const shape = entity(d, ref(window.args[6]))
    const body = entity(d, refs(shape.args[2])[0]!)
    const solids = refs(body.args[3])
    // Its frame (two jambs, a head, a sill), a sash's four members and its glass.
    expect(solids).toHaveLength(9)
    const styled = ofType(d, 'IFCSTYLEDITEM').map((s) => ref(s.args[0]))
    expect(styled).toEqual([solids[8]])
    expect(str(ofType(d, 'IFCSURFACESTYLE')[0]!.args[0])).toBe('Glass')
  })

  it('types a door by its kind, size and handing, tagged as the estimate keys it (lab AC-13)', () => {
    const d = doc(plan({ width: 2.2, kind: 'sliding', hinge: undefined, swing: undefined }, { kind: 'fixed' }))
    const door = ofType(d, 'IFCDOORSTYLE')[0]!
    expect(str(door.args[2])).toBe('Door 2.2 x 2.1 m, sliding, two leaves')
    expect(str(door.args[7])).toBe('door:sliding:2.2x2.1')
    expect(en(door.args[8])).toBe('DOUBLE_DOOR_SLIDING')
    const window = ofType(d, 'IFCWINDOWSTYLE')[0]!
    expect([str(window.args[2]), str(window.args[7]), en(window.args[9])]).toEqual(['Window 1.2 x 1.2 m, fixed', 'window:fixed:1.2x1.2', 'SINGLE_PANEL'])
    const roller = ofType(doc(plan({ width: 3, kind: 'roller' })), 'IFCDOORSTYLE')[0]!
    expect([str(roller.args[2]), en(roller.args[8])]).toEqual(['Door 3 x 2.1 m, roller, rolling up', 'ROLLINGUP'])
    // A door that states no kind is typed as before.
    expect(str(ofType(doc(plan()), 'IFCDOORSTYLE')[0]!.args[7])).toBe('door:0.9x2.1')
  })
})

describe('DXF', () => {
  it('writes a kind\'s symbol, and what lies above the cut on a dashed layer of its own; a plan with no kind as before', () => {
    const before = toDxf(buildFloorPlan(plan()))
    expect(before).not.toContain('GRID-OPENINGS-ABOVE')
    const garage = toDxf(buildFloorPlan(plan({ width: 2.4, kind: 'garage', hinge: undefined })))
    expect(garage).toContain('GRID-OPENINGS-ABOVE')
    // No swing arc for a garage door.
    expect(garage.split('\n').filter((line) => line.trim() === 'ARC')).toHaveLength(0)
  })
})
