/**
 * CNT-16 (lab EL-6): columns export as columns in every format, and the structural grid is in the
 * drawing's files: the IFC holds IfcColumn and no stub wall, the DXF a layer of their own, the OBJ
 * and the GLB a solid each.
 */
import { describe, expect, it } from 'vitest'
import { exportPlan } from '../../../export/planExport'
import { parseFloorPlan } from '../../../types/floorplan'
import { warehouse } from '../../../test-support/columns'
import { parseDoc, str, num, ref, items, type Entity } from './step-reader'
import { modelEntities, valueOf } from './dxf-reader'
import { parseGlb, readMeshes } from './glb-reader'

const options = { projectId: 'p', projectName: 'Warehouse', now: new Date('2026-11-22T12:00:00Z') }

const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))

describe('the warehouse with eight columns (EL-6)', () => {
  it('holds 8 IfcColumn in its IFC, each with its base quantities, and no stub wall', () => {
    const doc = parseDoc(text(exportPlan(warehouse(), 'ifc', options).data))
    const columns = doc.order.filter((e) => e.type === 'IFCCOLUMN')
    expect(columns.map((e) => str(e.args[7]))).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'])
    expect(columns.every((e) => str(e.args[4]) === 'square')).toBe(true)
    // The four walls of the shed, and no wall for a column.
    expect(doc.order.filter((e) => e.type === 'IFCWALLSTANDARDCASE').map((e) => str(e.args[2]))).toEqual(['w1', 'w2', 'w3', 'w4'])
    // Each is swept 6 m from a 0.4 m square.
    const solids = doc.order.filter((e) => e.type === 'IFCEXTRUDEDAREASOLID').filter((e) => doc.entities.get(ref(e.args[0]))!.type === 'IFCRECTANGLEPROFILEDEF')
    const columnSolids = solids.filter((e) => {
      const profile = doc.entities.get(ref(e.args[0]))!
      return num(profile.args[3]) === 0.4 && num(profile.args[4]) === 0.4
    })
    expect(columnSolids.map((e) => num(e.args[3]))).toEqual(Array(8).fill(6))
    // In the storey, in a containment of their own.
    const contained = doc.order.filter((e) => e.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE').find((e) => items(e.args[4]).some((v) => columns.some((c) => c.id === (v as { v: number }).v)))!
    expect(items(contained.args[4]).length).toBe(8)
    const quantities = doc.order.filter((e) => e.type === 'IFCELEMENTQUANTITY' && str(e.args[2]) === 'Qto_ColumnBaseQuantities')
    expect(quantities.length).toBe(8)
    const volume = (set: Entity): number => num(items(set.args[5]).map((v) => doc.entities.get((v as { v: number }).v)!).find((q) => q.type === 'IFCQUANTITYVOLUME')!.args[3])
    expect(volume(quantities[0]!)).toBeCloseTo(0.4 * 0.4 * 6, 9)
  })

  it('writes a round column as a circle profile', () => {
    const plan = parseFloorPlan({ ...warehouse(), columns: [{ id: 'c1', shape: 'round', width: 0.5, at: [10, 10] }] })
    const doc = parseDoc(text(exportPlan(plan, 'ifc', options).data))
    const circles = doc.order.filter((e) => e.type === 'IFCCIRCLEPROFILEDEF')
    expect(circles.map((e) => num(e.args[3]))).toEqual([0.25])
    expect(doc.order.filter((e) => e.type === 'IFCCOLUMN').length).toBe(1)
  })

  it('puts the columns on a layer of their own in the DXF, and the grid on its own with its names', () => {
    const dxf = text(exportPlan(warehouse(), 'dxf', options).data)
    const onColumns = modelEntities(dxf).filter((e) => valueOf(e, 8) === 'GRID-COLUMNS')
    expect(onColumns.filter((e) => e.type === 'LWPOLYLINE').length).toBe(8)
    expect(onColumns.filter((e) => e.type === 'HATCH').length).toBe(8)
    const grid = modelEntities(dxf).filter((e) => valueOf(e, 8) === 'GRID-STRUCTURAL-GRID')
    expect(grid.filter((e) => e.type === 'LINE').length).toBe(8)
    expect(grid.filter((e) => e.type === 'CIRCLE').length).toBe(16)
    expect(grid.filter((e) => e.type === 'TEXT').map((e) => valueOf(e, 1)).sort()).toEqual(['1', '1', '2', '2', '3', '3', '4', '4', '5', '5', 'A', 'A', 'B', 'B', 'C', 'C'])
    // The spacing, with the other dimensions.
    expect(modelEntities(dxf, 'DIMENSION').length).toBeGreaterThanOrEqual(8)
  })

  it('makes each column a solid of its own in the OBJ and the GLB', () => {
    const obj = text(exportPlan(warehouse(), 'obj', options).data)
    expect(obj.split('\n').filter((line) => line.startsWith('o column_'))).toEqual(['o column_c1', 'o column_c2', 'o column_c3', 'o column_c4', 'o column_c5', 'o column_c6', 'o column_c7', 'o column_c8'])
    const glb = parseGlb(exportPlan(warehouse(), 'glb', options).data as Uint8Array)
    const meshes = readMeshes(glb).filter((m) => m.name.startsWith('column_'))
    expect(meshes.length).toBe(8)
    // glTF's y is up.
    expect(Math.max(...meshes[0]!.points.map((p) => p.y))).toBeCloseTo(6, 6)
  })

  it('writes the same files as before for a plan with no columns', () => {
    const plain = parseFloorPlan({ ...warehouse(), columns: undefined, grids: undefined })
    const ifc = text(exportPlan(plain, 'ifc', options).data)
    expect(ifc).not.toContain('IFCCOLUMN')
    expect(text(exportPlan(plain, 'dxf', options).data)).not.toContain('GRID-COLUMNS')
  })
})
