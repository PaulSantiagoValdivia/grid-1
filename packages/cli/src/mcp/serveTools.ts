/**
 * The tools of `grid serve`, in the order `tools/list` gives them: the tools that read the
 * plan first, ordered by the requests they answer most often (lab entry Y-2), then the preview,
 * the export, and last the tools that change the plan.
 *
 * Every path an agent passes goes through the project's resolver (`fs/projectFiles.ts`):
 * inside the project folder or refused, with a message naming the path and the folder. The
 * project folder is fixed when the server starts.
 */
import { CanvasMissing } from '../draw/canvas'
import type { PathRefused, Project } from '../fs/projectFiles'
import { FontsMissing } from '../sheet/fonts'
import type { ServerTool, ToolAnswer } from './protocol'
import { READ_TOOLS } from './readTools'
import { readArgs, toolDefinition, ToolRefusal, type GridTool, type ToolContext } from './toolkit'
import { WRITE_TOOLS } from './writeTools'
import { EDIT_TOOLS } from './editTools'

export { EXPORT_TOOL_NAME, PREVIEW_TOOL_NAME } from './writeTools'

/** Every tool, in its fixed order. */
export const GRID_TOOLS: readonly GridTool[] = [
  ...READ_TOOLS,
  ...WRITE_TOOLS.filter((tool) => tool.hint === 'read'),
  ...WRITE_TOOLS.filter((tool) => tool.hint === 'write-file'),
  ...WRITE_TOOLS.filter((tool) => tool.hint === 'change-plan'),
  ...EDIT_TOOLS,
]

async function answer(tool: GridTool, raw: unknown, context: ToolContext): Promise<ToolAnswer> {
  try {
    const result = await tool.run(readArgs(tool, raw), context)
    return { text: result.text, data: result.data, ...(result.image ? { image: result.image } : {}) }
  } catch (error) {
    if (error instanceof ToolRefusal || error instanceof CanvasMissing || error instanceof FontsMissing) return { text: error.message, isError: true }
    throw error
  }
}

export function serverTool(tool: GridTool, context: ToolContext): ServerTool {
  const definition = toolDefinition(tool)
  return { definition, call: (raw) => answer(tool, raw, context) }
}

/**
 * The tools for a project folder, or for the reason there is none: then every call that needs
 * a file answers with that reason.
 */
export function projectTools(project: Project | PathRefused): ServerTool[] {
  const context: ToolContext = { project }
  return GRID_TOOLS.map((tool) => serverTool(tool, context))
}
