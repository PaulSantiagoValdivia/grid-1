import fs from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'

/**
 * Grid's one atomic file writer (QAR-6): the rules store and the `grid` command's project
 * resolver both write through it. Readers see either the old contents or the fully flushed
 * replacement. It opens a new file with O_EXCL beside the target, readable by its owner only,
 * flushes it, then renames it over the target. The caller decides which path may be written.
 */
export function atomicWriteFile(target: string, data: string | Uint8Array): void {
  // A short name of its own, so a long file name still fits once the temporary name is added.
  const temporary = path.join(path.dirname(target), `.grid-${randomBytes(6).toString('hex')}.tmp`)
  let fd: number | undefined = fs.openSync(temporary, 'wx', 0o600)
  try {
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(temporary, target)
  } catch (error) {
    try {
      if (fd !== undefined) fs.closeSync(fd)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
    throw error
  }
}

export function atomicWriteJson(target: string, data: unknown): void {
  atomicWriteFile(target, JSON.stringify(data, null, 2))
}
