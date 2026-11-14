/**
 * Writes an export into `<project>/exports/`, where "Open in" keeps the copy it hands to a CAD
 * program. The folder is ignored by version history: exports are derived files, and opening
 * one in AutoCAD must not turn into a version.
 */
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs'
import { basename, join, relative } from 'path'
import { atomicWriteFile } from '../fs/atomicWrite'

export const EXPORTS_DIR = 'exports'

const IGNORE_LINES = new Set(['exports', 'exports/', '/exports', '/exports/'])

function ensureIgnored(projectPath: string): void {
  const file = join(projectPath, '.gitignore')
  // A linked .gitignore could point outside the project, where Grid must never write. The
  // export still goes ahead; only the ignore line is left out.
  try {
    if (lstatSync(file).isSymbolicLink()) return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (text.split(/\r?\n/).some((line) => IGNORE_LINES.has(line.trim()))) return
  const separator = text === '' || text.endsWith('\n') ? '' : '\n'
  writeFileSync(file, `${text}${separator}${EXPORTS_DIR}/\n`, 'utf8')
}

/** Replaces any earlier copy with the same name. Returns the file's path. */
export function writeProjectExport(projectPath: string, fileName: string, data: string | Uint8Array): string {
  if (!fileName || basename(fileName) !== fileName || fileName.startsWith('.')) {
    throw new Error(`Not a plain file name: ${fileName}`)
  }
  const dir = join(projectPath, EXPORTS_DIR)
  mkdirSync(dir, { recursive: true })
  // A linked `exports` folder could point anywhere; only the project's own folder will do.
  if (relative(realpathSync.native(projectPath), realpathSync.native(dir)) !== EXPORTS_DIR) {
    throw new Error('The exports folder points outside the project')
  }
  ensureIgnored(projectPath)
  const target = join(dir, fileName)
  atomicWriteFile(target, data)
  return target
}
