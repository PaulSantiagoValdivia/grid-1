/**
 * Grid's tool server on its own. An agent's host starts it as an MCP server over stdio:
 * it reads JSON-RPC lines on stdin and answers on stdout. `grid serve` runs the same loop.
 *
 * The project folder is the folder it is started in. See `serve.ts` for what the loop may and
 * may not do, and `serveTools.ts` for the tools that touch files.
 */
import { openProject, PathRefused, type Project } from '../fs/projectFiles'
import { startToolServer } from './serve'
import { projectTools } from './serveTools'

function project(): Project | PathRefused {
  try {
    return openProject(undefined, process.cwd(), 'project')
  } catch (error) {
    if (error instanceof PathRefused) return error
    throw error
  }
}

startToolServer(projectTools(project()))
