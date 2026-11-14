import fs from 'fs'
import { randomUUID } from 'crypto'
import { basename, dirname, join } from 'path'

/** Atomic per file: readers see either the old contents or the fully flushed replacement. */
export function atomicWriteFile(path: string, data: string | Uint8Array): void {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  let fd: number | undefined = fs.openSync(temporary, 'wx', 0o600)
  try {
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(temporary, path)
  } catch (error) {
    try {
      if (fd !== undefined) fs.closeSync(fd)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
    throw error
  }
}

export function atomicWriteJson(path: string, data: unknown): void {
  atomicWriteFile(path, JSON.stringify(data, null, 2))
}
