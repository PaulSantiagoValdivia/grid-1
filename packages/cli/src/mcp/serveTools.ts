/**
 * The tools of `grid serve` that read or write files. Today that is `grid_export`.
 *
 * They run the command's own code (`command/export.ts`), so every path an agent passes goes
 * through the same resolver as the command's: inside the project folder or refused, with a
 * message naming the path and the folder. The project folder is fixed when the server starts.
 *
 * Answers hold Grid's own words. A path or name that came from the agent or from the plan is
 * quoted; nothing from inside the plan file is put in an answer unquoted.
 */
import { EXPORT_FORMATS, isExportFormat } from '@ongrid/floorplan/export'
import { checkExportRequest, ExportWriteFailed, exportIntoProject } from '../command/export'
import { UsageError } from '../command/options'
import { PlanRefused } from '../command/plan'
import { PATH_MAX, PathRefused, quoted, type Project } from '../fs/projectFiles'
import type { ServerTool } from './protocol'

export const EXPORT_TOOL_NAME = 'grid_export'
const FLOOR_ID_MAX = 64
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

const EXPORT_TOOL = {
  name: EXPORT_TOOL_NAME,
  description:
    'Use this when the person wants the plan as a file to open in another program: dxf for '
    + 'AutoCAD and other 2D CAD programs, ifc for BIM programs such as Revit, glb or obj for 3D. '
    + 'It writes the file into the exports folder beside the plan, replacing an earlier copy of '
    + 'the same export, and answers with the path it wrote. It never changes the plan. The plan '
    + 'must be a file inside the project folder: any other path is refused.',
  inputSchema: {
    type: 'object',
    properties: {
      plan: {
        type: 'string',
        maxLength: PATH_MAX,
        description: 'The plan file, as a path inside the project folder, for example "floor-plan.json".',
      },
      format: { type: 'string', enum: [...EXPORT_FORMATS], description: 'The file format.' },
      floor: {
        type: 'string',
        maxLength: FLOOR_ID_MAX,
        description: 'dxf, obj and glb only: a floor id from the plan\'s "floors", for example "first". The lowest floor when left out.',
      },
    },
    required: ['plan', 'format'],
    additionalProperties: false,
  },
  annotations: { title: 'Export the plan', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

function refusal(text: string): { text: string; isError: true } {
  return { text, isError: true }
}

/** The command's messages name its options; a tool names its arguments. */
function asArguments(message: string): string {
  return message.replace(/--(format|floor)\b/g, '$1')
}

function exportTool(project: Project | PathRefused): ServerTool {
  return {
    definition: EXPORT_TOOL,
    call(raw) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return refusal('Pass the arguments as an object: plan and format, and floor if you want one floor.')
      }
      const args = raw as Record<string, unknown>
      const unknown = Object.keys(args).filter((key) => !['plan', 'format', 'floor'].includes(key))
      if (unknown.length > 0) return refusal(`${EXPORT_TOOL_NAME} takes plan, format and floor, not ${unknown.map(quoted).join(', ')}.`)
      const { plan, format, floor } = args
      if (typeof plan !== 'string' || plan === '') return refusal('Pass plan: the plan file, as a path inside the project folder.')
      if (plan.length > PATH_MAX) return refusal(`plan is longer than ${PATH_MAX} characters.`)
      if (typeof format !== 'string' || !isExportFormat(format)) return refusal(`Pass format: one of ${EXPORT_FORMATS.join(', ')}.`)
      if (floor !== undefined && (typeof floor !== 'string' || floor === '' || floor.length > FLOOR_ID_MAX || CONTROL.test(floor))) {
        return refusal(`floor must be a floor id from the plan, one line of at most ${FLOOR_ID_MAX} characters.`)
      }
      if (project instanceof PathRefused) {
        return refusal(`${project.message} For the tool server, start grid serve with --project <folder>.`)
      }
      try {
        checkExportRequest({ format, floor })
        const done = exportIntoProject(project, plan, format, { floor })
        const lines = [`Wrote ${quoted(project.relative(done.written))} in the project folder.`]
        if (done.note) lines.push(done.note)
        const leftOut = done.loaded.broken.size
        if (leftOut > 0) lines.push(`Left out ${leftOut} part${leftOut === 1 ? '' : 's'} that can't be drawn: grid check says which and why.`)
        return { text: lines.join('\n') }
      } catch (error) {
        if (error instanceof PathRefused || error instanceof PlanRefused || error instanceof ExportWriteFailed) {
          return refusal(error.message)
        }
        if (error instanceof UsageError) return refusal(asArguments(error.message))
        throw error
      }
    },
  }
}

/**
 * The file tools for a project folder, or for the reason there is none: then every call
 * answers with that reason, and the preview tool still works.
 */
export function projectTools(project: Project | PathRefused): ServerTool[] {
  return [exportTool(project)]
}
