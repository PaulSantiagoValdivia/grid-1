/**
 * Turns a saved plan into the bytes of an export file. The caller names a format and a
 * floor, and gets the file's bytes back.
 *
 * DXF, OBJ and GLB are what the 2D and 3D views draw, one floor at a time, so they export the
 * floor the user is looking at. IFC is the whole building, one storey per floor.
 *
 * Every format writes the plan's parts in id order (QAR-5), so the same building gives the
 * same bytes whatever order its file lists them in.
 */
import type { FloorPlan } from '../types/floorplan'
import { buildFloorPlan, buildScene, inIdOrder, planFloors, planForFloor, resolveFloor, toDxf, toGlb, toIfc, toObj } from '../geometry'

export type ExportFormat = 'dxf' | 'ifc' | 'obj' | 'glb'

export const EXPORT_FORMATS: readonly ExportFormat[] = ['dxf', 'ifc', 'obj', 'glb']

// Dialog filter names stay in plain language; the extension names the tool's own format.
const FILTER_NAMES: Record<ExportFormat, string> = {
  dxf: 'AutoCAD drawing (DXF)',
  ifc: 'BIM model (IFC)',
  obj: '3D model (OBJ)',
  glb: '3D model (GLB)',
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value)
}

export interface PlanExportOptions {
  /** The IFC's project identity when the plan stores none (`FloorPlan.projectId` wins). */
  readonly projectId: string
  readonly projectName: string
  /** The floor shown in the views; a missing or stale id falls back to the lowest floor. */
  readonly floorId?: string | null
  readonly now: Date
}

export interface PlanExport {
  readonly data: string | Uint8Array
  readonly fileName: string
  readonly filter: { name: string; extensions: string[] }
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** `my-house.dxf`, or `my-house-first.dxf` when a multi-floor plan exports one floor. */
export function exportFileName(projectName: string, format: ExportFormat, floorName: string | null): string {
  const base = slug(projectName) || 'floor-plan'
  const floor = floorName === null ? '' : slug(floorName)
  return `${floor ? `${base}-${floor}` : base}.${format}`
}

export function exportPlan(plan: FloorPlan, format: ExportFormat, options: PlanExportOptions): PlanExport {
  const filter = { name: FILTER_NAMES[format], extensions: [format] }
  if (format === 'ifc') {
    const data = toIfc(plan, { projectId: options.projectId, projectName: options.projectName, timestamp: options.now })
    return { data, fileName: exportFileName(options.projectName, format, null), filter }
  }

  const floorId = resolveFloor(plan, options.floorId)
  const storey = planForFloor(inIdOrder(plan), floorId)
  const data = format === 'dxf' ? toDxf(buildFloorPlan(storey))
    : format === 'obj' ? toObj(buildScene(storey))
    : toGlb(buildScene(storey))
  const floors = planFloors(plan)
  const floor = floors.find((f) => f.id === floorId)
  const floorName = floors.length > 1 ? (floor?.name || floorId) : null
  return { data, fileName: exportFileName(options.projectName, format, floorName), filter }
}
