/**
 * A zip writer, for the bundle Claude's desktop app installs (`.mcpb`, a zip with its manifest
 * at the top). Pure: it takes the files' bytes and gives the archive's, so `pack.mjs` reads and
 * writes the files and nothing here touches the disk.
 *
 * Deflated with Node's zlib, no zip64 (a bundle stays far below 4 GB), file names in UTF-8,
 * Unix modes kept so the server file stays runnable. The same files give the same bytes: they
 * go in by path, all dated 1 January 1980, the first day a zip can hold.
 */
import { deflateRawSync } from 'zlib'

export interface ZipEntry {
  /** Where the file goes in the archive: a relative path with forward slashes. */
  readonly path: string
  readonly data: Uint8Array
  readonly executable?: boolean
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function checkedPath(path: string): string {
  const parts = path.split('/')
  if (path === '' || path.includes('\\') || path.startsWith('/') || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`A zip entry needs a relative path inside the archive, with forward slashes: ${JSON.stringify(path)}.`)
  }
  return path
}

/** 1 January 1980, 00:00, in the DOS form a zip header holds. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1
const DOS_TIME = 0
const UTF8_NAMES = 1 << 11
const DEFLATE = 8
const STORE = 0

export function zip(entries: readonly ZipEntry[]): Uint8Array {
  const sorted = [...entries].map((entry) => ({ ...entry, path: checkedPath(entry.path) })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of sorted) {
    const name = Buffer.from(entry.path, 'utf8')
    const deflated = deflateRawSync(entry.data, { level: 9 })
    const method = deflated.length < entry.data.length ? DEFLATE : STORE
    const stored = method === DEFLATE ? deflated : Buffer.from(entry.data)
    const crc = crc32(entry.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_NAMES, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(stored.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    // Made by version 2.0 on Unix (3), so the mode in the external attributes counts.
    central.writeUInt16LE((3 << 8) | 20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8_NAMES, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(stored.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(((entry.executable ? 0o100755 : 0o100644) << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)

    locals.push(local, name, stored)
    centrals.push(central, name)
    offset += local.length + name.length + stored.length
  }

  const centralSize = centrals.reduce((size, part) => size + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(sorted.length, 8)
  end.writeUInt16LE(sorted.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]))
}
