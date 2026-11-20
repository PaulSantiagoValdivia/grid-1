import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../types/floorplan'
import { DXF_LAYERS, buildFloorPlan, planForFloor, toDxf } from '../../geometry'
import { parseGlb, readMeshes, samplePlan } from '../../geometry/export/__tests__/glb-reader'
import { EXPORT_FORMATS, exportFileName, exportPlan, isExportFormat } from '../planExport'

const NOW = new Date('2026-11-09T12:00:00.000Z')
const ids = { projectId: 'project-1', projectName: 'My House', now: NOW }
const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))

/** Two storeys: the sample room on the ground, one wall upstairs. */
function twoFloors(): FloorPlan {
  const plan = samplePlan() as FloorPlan
  return {
    ...plan,
    floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
    walls: [
      ...plan.walls,
      { id: 'up1', start: [0, 0], end: [3, 0], thickness: 0.2, height: 2.5, kind: 'exterior', floor: 'first' },
    ],
  }
}

/** Object names in an OBJ document, in order. */
const objObjects = (obj: string): string[] => obj.split('\n').filter((l) => l.startsWith('o ')).map((l) => l.slice(2))

describe('exportPlan', () => {
  it('accepts exactly the four formats', () => {
    expect([...EXPORT_FORMATS]).toEqual(['dxf', 'ifc', 'obj', 'glb'])
    for (const format of EXPORT_FORMATS) expect(isExportFormat(format)).toBe(true)
    for (const bad of ['DXF', 'pdf', '', null, undefined, 1]) expect(isExportFormat(bad)).toBe(false)
  })

  it('writes a DXF drawing of the plan with its wall, room and opening layers', () => {
    // DXF is group-code/value line pairs (CRLF); read it as pairs rather than as text.
    const lines = text(exportPlan(samplePlan() as FloorPlan, 'dxf', ids).data).split('\r\n').map((l) => l.trim())
    const pairs = Array.from({ length: Math.floor(lines.length / 2) }, (_, i) => [lines[2 * i], lines[2 * i + 1]])
    expect(pairs[0]).toEqual(['0', 'SECTION'])
    expect(pairs.at(-1)).toEqual(['0', 'EOF'])
    const usedLayers = new Set(pairs.filter(([code]) => code === '8').map(([, value]) => value))
    for (const layer of [DXF_LAYERS.wallExterior, DXF_LAYERS.rooms, DXF_LAYERS.openings]) expect(usedLayers).toContain(layer)
  })

  it('writes an OBJ with one object per wall and room', () => {
    const obj = text(exportPlan(samplePlan() as FloorPlan, 'obj', ids).data)
    expect(objObjects(obj)).toEqual(['wall_w1', 'wall_w2', 'wall_w3', 'wall_w4', 'floor_r1'])
    const vertices = obj.split('\n').filter((l) => l.startsWith('v ')).length
    for (const face of obj.split('\n').filter((l) => l.startsWith('f '))) {
      for (const index of face.slice(2).split(' ').map(Number)) {
        expect(index).toBeGreaterThanOrEqual(1)
        expect(index).toBeLessThanOrEqual(vertices)
      }
    }
  })

  it('writes a GLB that an independent reader parses into the same meshes', () => {
    const { data } = exportPlan(samplePlan() as FloorPlan, 'glb', ids)
    expect(data).toBeInstanceOf(Uint8Array)
    const names = readMeshes(parseGlb(data as Uint8Array)).map((m) => m.name)
    expect(names).toEqual(['wall_w1', 'wall_w2', 'wall_w3', 'wall_w4', 'floor_r1'])
  })

  it('writes an IFC of the whole building, seeded with the project identity and time', () => {
    const plan = twoFloors()
    const ifc = text(exportPlan(plan, 'ifc', ids).data)
    expect(ifc.startsWith('ISO-10303-21;')).toBe(true)
    expect(ifc).toContain("FILE_SCHEMA(('IFC2X3'))")
    expect(ifc.match(/=IFCBUILDINGSTOREY\(/g)).toHaveLength(2)
    expect(ifc.match(/=IFCWALLSTANDARDCASE\(|=IFCWALL\(/g)).toHaveLength(5)
    expect(ifc).toContain('My House')
    expect(ifc).toContain('2026-11-09T12:00:00')
    // Same project and time give the same bytes; another project gives other GUIDs.
    expect(text(exportPlan(plan, 'ifc', ids).data)).toBe(ifc)
    expect(text(exportPlan(plan, 'ifc', { ...ids, projectId: 'project-2' }).data)).not.toBe(ifc)
  })

  it('exports one floor for the 2D and 3D formats, the one the user is looking at', () => {
    const plan = twoFloors()
    expect(objObjects(text(exportPlan(plan, 'obj', { ...ids, floorId: 'first' }).data))).toEqual(['wall_up1'])
    const ground = readMeshes(parseGlb(exportPlan(plan, 'glb', { ...ids, floorId: 'ground' }).data as Uint8Array))
    expect(ground.map((m) => m.name)).not.toContain('wall_up1')
    const firstDxf = text(exportPlan(plan, 'dxf', { ...ids, floorId: 'first' }).data)
    expect(firstDxf).toBe(toDxf(buildFloorPlan(planForFloor(plan, 'first'))))
    expect(firstDxf).not.toBe(text(exportPlan(plan, 'dxf', { ...ids, floorId: 'ground' }).data))
  })

  it('falls back to the lowest floor when the requested one no longer exists', () => {
    const plan = twoFloors()
    const stale = exportPlan(plan, 'obj', { ...ids, floorId: 'deleted' })
    expect(text(stale.data)).toBe(text(exportPlan(plan, 'obj', { ...ids, floorId: 'ground' }).data))
    expect(stale.fileName).toBe('my-house-ground.obj')
  })

  it('names the save dialog filter in plain language', () => {
    expect(exportPlan(samplePlan() as FloorPlan, 'dxf', ids).filter).toEqual({ name: 'AutoCAD drawing (DXF)', extensions: ['dxf'] })
    expect(exportPlan(samplePlan() as FloorPlan, 'glb', ids).filter.extensions).toEqual(['glb'])
  })
})

describe('exportFileName', () => {
  it('uses the project name, and the floor only when the plan has several', () => {
    expect(exportFileName('My House', 'dxf', null)).toBe('my-house.dxf')
    expect(exportFileName('My House', 'obj', 'First Floor')).toBe('my-house-first-floor.obj')
    expect(exportFileName('  ', 'glb', null)).toBe('floor-plan.glb')
    expect(exportFileName('Casa \u00d1and\u00fa / 2\u00ba', 'ifc', null)).toBe('casa-nandu-2o.ifc')
  })

  it('omits the floor suffix for a single-floor plan', () => {
    expect(exportPlan(samplePlan() as FloorPlan, 'obj', ids).fileName).toBe('my-house.obj')
    expect(exportPlan(twoFloors(), 'ifc', ids).fileName).toBe('my-house.ifc')
    expect(exportPlan(twoFloors(), 'dxf', { ...ids, floorId: 'first' }).fileName).toBe('my-house-first.dxf')
  })
})

/**
 * Known failures from the lab (entry Z-4), as expected failures. Each states the right
 * behaviour and fails today; when its fix lands, vitest reports it, and `it.fails` becomes
 * `it`. Each title starts with its lab entry ID.
 */
describe('known failures (expected to fail until fixed)', () => {
  it.fails('EX-4 floors named "Level 1" and "level-1" get different file names', () => {
    expect(exportFileName('house', 'dxf', 'Level 1')).not.toBe(exportFileName('house', 'dxf', 'level-1'))
  })

  // "House in Tokyo" written in Japanese, and "house" in Russian: today both become floor-plan.dxf.
  it.fails('EX-4 a project named in a non-Latin script keeps a name of its own', () => {
    expect(exportFileName('\u6771\u4eac\u306e\u5bb6', 'dxf', null)).not.toBe(exportFileName('\u0414\u043e\u043c', 'dxf', null))
  })
})
