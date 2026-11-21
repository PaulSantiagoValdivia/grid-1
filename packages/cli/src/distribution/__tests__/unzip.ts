import { crc32, inflateRawSync } from 'zlib'
import { expect } from 'vitest'

/** A reader for what `zip` writes, written apart from it: the local headers, inflated and checked. */
export function unzip(bytes: Uint8Array): Map<string, { data: Buffer; mode: number }> {
  const buffer = Buffer.from(bytes)
  const entries = new Map<string, { data: Buffer; mode: number }>()
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buffer.readUInt16LE(end + 10)
  let central = buffer.readUInt32LE(end + 16)
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(central)).toBe(0x02014b50)
    const method = buffer.readUInt16LE(central + 10)
    const crc = buffer.readUInt32LE(central + 16)
    const size = buffer.readUInt32LE(central + 20)
    const nameLength = buffer.readUInt16LE(central + 28)
    const extraLength = buffer.readUInt16LE(central + 30)
    const commentLength = buffer.readUInt16LE(central + 32)
    const mode = buffer.readUInt32LE(central + 38) >>> 16
    const local = buffer.readUInt32LE(central + 42)
    const name = buffer.toString('utf8', central + 46, central + 46 + nameLength)
    expect(buffer.readUInt32LE(local)).toBe(0x04034b50)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const stored = buffer.subarray(start, start + size)
    const data = method === 8 ? inflateRawSync(stored) : Buffer.from(stored)
    expect(crc32(data)).toBe(crc)
    entries.set(name, { data, mode })
    central += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
