/**
 * `grid export <plan> --format dxf|ifc|glb|obj`: the plan as a file for another program,
 * through the core's exporters.
 *
 * Written into the `exports/` folder beside the plan, as the app's "Open in" does, or to
 * `--out`. DXF, OBJ and GLB hold one floor; IFC holds the whole building.
 */
import { basename, dirname, extname } from 'path'
import { EXPORT_FORMATS, exportPlan, isExportFormat, type ExportFormat, type PlanExport } from '@ongrid/floorplan/export'
import { floorOption, type LoadedPlan } from './plan'
import { UsageError, type OptionSpecs } from './options'

export const EXPORT_OPTIONS: OptionSpecs = {
  '--format': { takesValue: true, help: `The file format: ${EXPORT_FORMATS.join(', ')}.` },
  '--floor': { takesValue: true, help: 'DXF, OBJ and GLB: the floor to export (a floor id from the plan). The lowest floor when left out.' },
  '--out': { takesValue: true, help: 'The file to write, ending in the format\'s extension. exports/ beside the plan when left out.' },
}

export interface ExportRequest {
  readonly format?: string
  readonly floor?: string
  readonly out?: string
}

/** Checks the options against each other, before the plan is read. */
export function checkExportRequest(request: ExportRequest): ExportFormat {
  const formats = EXPORT_FORMATS.join(', ')
  if (request.format === undefined) throw new UsageError(`export needs --format: one of ${formats}.`)
  if (!isExportFormat(request.format)) {
    throw new UsageError(`--format ${JSON.stringify(request.format)} is not one Grid writes: use one of ${formats}.`)
  }
  const format = request.format
  if (format === 'ifc' && request.floor !== undefined) {
    throw new UsageError('--floor does not apply to IFC, which holds every floor: leave --floor out.')
  }
  if (request.out !== undefined && extname(request.out).toLowerCase() !== `.${format}`) {
    throw new UsageError(`--out ${JSON.stringify(request.out)} does not end in .${format}: name a .${format} file.`)
  }
  return format
}

/** The plan's name for its export file: the plan file's name without `.json`. */
export function projectNameOf(planFile: string): string {
  const name = basename(planFile)
  return name.toLowerCase().endsWith('.json') ? name.slice(0, -5) : name
}

export function exportFile(loaded: LoadedPlan, planFile: string, format: ExportFormat, request: ExportRequest): PlanExport {
  const floorId = floorOption(loaded.plan, request.floor)
  const name = projectNameOf(planFile)
  return exportPlan(loaded.plan, format, { projectId: name, projectName: name, floorId, now: new Date() })
}

/** The folder that holds the plan: where `exports/` goes. */
export function projectFolderOf(planFile: string): string {
  return dirname(planFile)
}
