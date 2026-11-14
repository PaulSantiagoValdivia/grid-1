import type { FloorPlan } from '../../plan'
import type { Vec3 } from '../../scene3d'

/**
 * A strict GLB reader for the tests, written from the glTF 2.0 spec and sharing
 * nothing with the writer. A check made with the exporter's own helpers would be
 * circular: it would agree with a mistake the exporter makes.
 */

const MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a // "JSON"
const CHUNK_BIN = 0x004e4942 // "BIN\0"

/** The parts of a glTF document the tests read; everything else stays unknown. */
export interface GltfJson {
  asset: { version: string; generator?: string }
  scene?: number
  scenes?: { nodes?: number[] }[]
  nodes?: { name?: string; mesh?: number }[]
  meshes?: {
    primitives: { attributes: Record<string, number>; indices?: number; material?: number }[]
  }[]
  materials?: {
    pbrMetallicRoughness?: {
      baseColorFactor?: number[]
      metallicFactor?: number
      roughnessFactor?: number
    }
    doubleSided?: boolean
  }[]
  accessors?: {
    bufferView: number
    byteOffset?: number
    componentType: number
    count: number
    type: string
    min?: number[]
    max?: number[]
  }[]
  bufferViews?: {
    buffer: number
    byteOffset?: number
    byteLength: number
    byteStride?: number
    target?: number
  }[]
  buffers?: { byteLength: number; uri?: string }[]
}

export interface Glb {
  /** The parsed JSON document. */
  readonly json: GltfJson
  /** The binary chunk, or null when the file has none. */
  readonly bin: Uint8Array | null
  readonly length: number
  readonly chunkLengths: readonly number[]
}

export function parseGlb(bytes: Uint8Array): Glb {
  if (bytes.byteLength < 20) throw new Error('shorter than a header and a chunk')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== MAGIC) throw new Error('bad magic')
  if (view.getUint32(4, true) !== 2) throw new Error('not version 2')
  const length = view.getUint32(8, true)
  if (length !== bytes.byteLength) throw new Error(`header length ${length} != ${bytes.byteLength}`)

  const chunks: { type: number; start: number; length: number }[] = []
  for (let at = 12; at < length; ) {
    const size = view.getUint32(at, true)
    const type = view.getUint32(at + 4, true)
    if (size % 4 !== 0) throw new Error(`chunk length ${size} is not a multiple of 4`)
    if (at + 8 + size > length) throw new Error('chunk runs past the end of the file')
    chunks.push({ type, start: at + 8, length: size })
    at += 8 + size
  }

  const first = chunks[0]
  if (!first || first.type !== CHUNK_JSON) throw new Error('first chunk is not JSON')
  if (chunks.length > 2) throw new Error('more than two chunks')
  const second = chunks[1]
  if (second && second.type !== CHUNK_BIN) throw new Error('second chunk is not BIN')

  const jsonBytes = bytes.subarray(first.start, first.start + first.length)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes)
  const trimmed = text.replace(/ +$/, '')
  // The padding is spaces and nothing else: a NUL here is a zero-padded JSON chunk.
  if (trimmed.length < text.length - 3) throw new Error('more than 3 bytes of JSON padding')
  const json = JSON.parse(trimmed)

  let bin: Uint8Array | null = null
  if (second) {
    bin = bytes.subarray(second.start, second.start + second.length)
    const declared = json.buffers?.[0]?.byteLength
    if (typeof declared !== 'number') throw new Error('binary chunk but no buffer')
    if (declared > bin.byteLength || bin.byteLength - declared > 3) {
      throw new Error(`buffer ${declared} bytes in a ${bin.byteLength}-byte chunk`)
    }
    for (let i = declared; i < bin.byteLength; i++) {
      if (bin[i] !== 0) throw new Error('binary padding is not zero')
    }
  } else if (json.buffers) {
    throw new Error('a buffer is declared but there is no binary chunk')
  }

  return { json, bin, length, chunkLengths: chunks.map((c) => c.length) }
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

/** Reads accessor `index` as rows of numbers, honouring offsets and alignment. */
export function readAccessor(glb: Glb, index: number): number[][] {
  const accessor = glb.json.accessors![index]!
  const bufferView = glb.json.bufferViews![accessor.bufferView]!
  if (!glb.bin) throw new Error('no binary chunk')
  const size = accessor.componentType === 5126 || accessor.componentType === 5125 ? 4 : 2
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  if (start % size !== 0) throw new Error(`accessor ${index} is not aligned to ${size}`)
  if ((bufferView.byteOffset ?? 0) % 4 !== 0) throw new Error(`view of accessor ${index} unaligned`)
  const width = COMPONENTS[accessor.type]!
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength)
  const rows: number[][] = []
  for (let i = 0; i < accessor.count; i++) {
    const row: number[] = []
    for (let k = 0; k < width; k++) {
      const at = start + (i * width + k) * size
      if (accessor.componentType === 5126) row.push(view.getFloat32(at, true))
      else if (accessor.componentType === 5125) row.push(view.getUint32(at, true))
      else if (accessor.componentType === 5123) row.push(view.getUint16(at, true))
      else throw new Error(`component type ${accessor.componentType}`)
    }
    rows.push(row)
  }
  return rows
}

export interface ReadMesh {
  readonly name: string
  readonly points: readonly Vec3[]
  readonly triangles: readonly (readonly [number, number, number])[]
}

/** Every node's mesh, read back from the buffer: positions and triangles. */
export function readMeshes(glb: Glb): ReadMesh[] {
  const nodes: number[] = glb.json.scenes?.[glb.json.scene ?? 0]?.nodes ?? []
  return nodes.map((nodeIndex) => {
    const node = glb.json.nodes![nodeIndex]!
    const primitive = glb.json.meshes![node.mesh!]!.primitives[0]!
    const points = readAccessor(glb, primitive.attributes.POSITION).map(
      ([x, y, z]) => ({ x: x!, y: y!, z: z! }) as Vec3
    )
    const flat = readAccessor(glb, primitive.indices!).map((row) => row[0]!)
    const triangles: [number, number, number][] = []
    for (let i = 0; i < flat.length; i += 3) triangles.push([flat[i]!, flat[i + 1]!, flat[i + 2]!])
    return { name: node.name!, points, triangles }
  })
}

// ---------------------------------------------------------------------------
// Fixtures shared by the GLB tests
// ---------------------------------------------------------------------------

/** A 4×3 room with a door whose sill is 0, a window, and a full-height opening. */
export function samplePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w2', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w3', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
      { id: 'o2', wall: 'w3', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'o3', wall: 'w2', type: 'door', offset: 1, width: 1, sill: 0, height: 2.5 }
    ]
  }
}

/** The same plan turned about the origin, so no wall lies on an axis. */
export function rotated(plan: FloorPlan, angle: number): FloorPlan {
  const turn = ([x, y]: readonly [number, number]): [number, number] => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle)
  ]
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, start: turn(w.start), end: turn(w.end) }))
  }
}

export const emptyPlan = (): FloorPlan => ({
  version: '1',
  units: 'm',
  walls: [],
  rooms: [],
  openings: []
})
