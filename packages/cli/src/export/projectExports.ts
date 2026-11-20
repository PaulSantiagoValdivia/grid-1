/**
 * Writes an export into the `exports/` folder beside the plan, where "Open in" keeps the copy
 * it hands to a CAD program. The folder is ignored by version history: exports are derived
 * files, and opening one in AutoCAD must not turn into a version.
 *
 * Every path goes through the project's resolver (`fs/projectFiles.ts`), so nothing lands
 * outside the project folder.
 */
import path from 'path'
import { pathProblem, type Project } from '../fs/projectFiles'

export const EXPORTS_DIR = 'exports'

const IGNORE_LINES = new Set(['exports', 'exports/', '/exports', '/exports/'])

function ensureIgnored(project: Project, folder: string): void {
  const file = path.join(folder, '.gitignore')
  // A linked .gitignore, symbolic or hard, could be a file anywhere. The export still goes
  // ahead; only the ignore line is left out.
  if (project.isLinked(file)) return
  const text = project.readTextIfThere(file) ?? ''
  if (text.split(/\r?\n/).some((line) => IGNORE_LINES.has(line.trim()))) return
  const separator = text === '' || text.endsWith('\n') ? '' : '\n'
  project.appendText(file, `${separator}${EXPORTS_DIR}/\n`)
}

/**
 * Writes `fileName` into `exports/` in `folder`, a folder of the project, replacing any
 * earlier copy with the same name. Returns the real path written.
 */
export function writeProjectExport(project: Project, folder: string, fileName: string, data: string | Uint8Array): string {
  if (!fileName || path.basename(fileName) !== fileName || fileName.startsWith('.') || pathProblem(fileName) !== null) {
    throw new Error(`Not a plain file name: ${JSON.stringify(fileName)}`)
  }
  const real = project.resolve(folder)
  const dir = project.makeFolder(path.join(real, EXPORTS_DIR))
  // Even a link that stays inside the project is refused: exports go in the plan's own folder.
  if (path.relative(real, dir) !== EXPORTS_DIR) {
    throw new Error(`the exports folder is a link to ${JSON.stringify(project.relative(dir))}: exports go into a plain exports folder beside the plan`)
  }
  ensureIgnored(project, real)
  return project.writeFile(path.join(dir, fileName), data)
}
