/**
 * glTF export — the open 3D format SketchUp, Blender and the web read,
 * written as a binary GLB.
 *
 * Input is a `Scene3D`, the same as the OBJ exporter: exactly what Canvas3D
 * draws, with the doors and windows already cut out of the wall elevations and
 * the broken geometry already dropped, so the file cannot disagree with what the
 * user saw. The triangles come from the same mesh builder as OBJ's.
 *
 * glTF is metres and Y up. The model is Z up (C4), so each point is written as
 * `(x, y, z) → (x, z, -y)`: a rotation, not a mirror, so faces keep facing
 * outward and nothing needs re-winding.
 *
 * GLB, not `.gltf`: one binary file with no base64 and no second file, which is
 * the form SketchUp documents. The result is bytes because a file is bytes; the
 * caller decides where they go.
 */

import type { Scene3D } from '../scene3d'
import { floorMesh, makeNamer, wallMesh } from './mesh'
import type { Mesh } from './mesh'
import { leftOutLines, leftOutSummary, type LeftOutPart } from './leftOut'

const MAGIC = 0x46546c67 // "glTF"
const VERSION = 2
const CHUNK_JSON = 0x4e4f534a // "JSON"
const CHUNK_BIN = 0x004e4942 // "BIN\0"

// glTF component and buffer-view target codes.
const FLOAT = 5126
const UNSIGNED_INT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963

const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8

/** A constant, so the same scene always gives the same bytes. */
const GENERATOR = 'Grid'

/**
 * One plain grey for everything. It is not styling: a primitive with no material
 * gets glTF's default, which is fully metallic and renders dark in several
 * viewers. Not double-sided on purpose, so a winding mistake shows as a missing
 * face instead of being hidden.
 */
const MATERIAL = {
  pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 1 }
}

/** Rounds up to a multiple of 4, which GLB chunks and glTF views need. */
const pad4 = (n: number): number => (n + 3) & ~3

/**
 * Wraps a glTF document and an optional binary buffer in the GLB container:
 * a header, a JSON chunk padded with spaces, and a binary chunk padded with
 * zeros. The total length is written after both paddings are known.
 */
function encodeGlb(document: object, binary: Uint8Array | null): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document))
  const jsonLength = pad4(json.byteLength)
  const binLength = binary ? pad4(binary.byteLength) : 0

  const total =
    HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    jsonLength +
    (binary ? CHUNK_HEADER_BYTES + binLength : 0)

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, MAGIC, true)
  view.setUint32(4, VERSION, true)
  view.setUint32(8, total, true)

  let at = HEADER_BYTES
  view.setUint32(at, jsonLength, true)
  view.setUint32(at + 4, CHUNK_JSON, true)
  out.set(json, at + CHUNK_HEADER_BYTES)
  out.fill(0x20, at + CHUNK_HEADER_BYTES + json.byteLength, at + CHUNK_HEADER_BYTES + jsonLength)
  at += CHUNK_HEADER_BYTES + jsonLength

  if (binary) {
    view.setUint32(at, binLength, true)
    view.setUint32(at + 4, CHUNK_BIN, true)
    out.set(binary, at + CHUNK_HEADER_BYTES)
  }

  return out
}

interface Part {
  readonly name: string
  readonly mesh: Mesh
}

/** Everything the scene could build, walls first and then slabs, as OBJ lists them. */
function partsOf(scene: Scene3D): Part[] {
  const nameOf = makeNamer()
  const parts: Part[] = []
  for (const wall of scene.walls) {
    const mesh = wallMesh(wall)
    if (mesh) parts.push({ name: nameOf('wall', wall.id), mesh })
  }
  for (const slab of scene.slabs) {
    const mesh = floorMesh(slab)
    if (mesh) parts.push({ name: nameOf('floor', slab.roomId), mesh })
  }
  return parts
}

export interface GlbOptions {
  /** HND-6: the parts of the plan this file leaves out, written into `asset.extras`. */
  readonly leftOut?: readonly LeftOutPart[]
}

/**
 * The asset block. HND-6: when the file leaves parts of the plan out, `asset.extras.gridLeftOut`
 * says so: a note in words, the count, and each part. `extras` is glTF's place for data of an
 * application's own, which every reader keeps and none acts on. JSON escapes the ids.
 */
function assetOf(leftOut: readonly LeftOutPart[]): object {
  const asset = { version: '2.0', generator: GENERATOR }
  if (leftOut.length === 0) return asset
  const note = [leftOutSummary(leftOut), ...leftOutLines(leftOut)]
  return { ...asset, extras: { gridLeftOut: { count: leftOut.length, note, parts: leftOut } } }
}

/**
 * The scene as a GLB file.
 *
 * Pure and total: it never throws, never reads the clock or the filesystem, and
 * gives the same bytes for the same scene. Whatever the scene could not build is
 * already absent from it, so a broken plan exports the part that is sound — the
 * same graceful degradation the canvases apply.
 */
export function toGlb(scene: Scene3D, options: GlbOptions = {}): Uint8Array {
  const parts = partsOf(scene)
  const asset = assetOf(options.leftOut ?? [])
  if (parts.length === 0) return encodeGlb({ asset, scene: 0, scenes: [{}] }, null)

  // Per mesh: its positions, then its indices. Both are 4 bytes a component, so
  // every view and accessor stays 4-byte aligned with no padding in between.
  const size = parts.reduce((sum, p) => sum + p.mesh.points.length * 12 + p.mesh.faces.length * 12, 0)
  const binary = new Uint8Array(size)
  const view = new DataView(binary.buffer)

  const accessors: object[] = []
  const bufferViews: object[] = []
  const meshes: object[] = []
  const nodes: object[] = []
  let at = 0

  for (const [index, { name, mesh }] of parts.entries()) {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    const positionStart = at
    for (const p of mesh.points) {
      // Z up to Y up: (x, y, z) → (x, z, -y). A rotation, so winding is kept.
      // `0 - y` and not `-y`: the latter turns y = 0 into -0, which JSON prints
      // as 0 and the stored data would not match.
      const coords = [p.x, p.z, 0 - p.y]
      for (const [k, value] of coords.entries()) {
        // The bounds describe what is stored, which is the 32-bit value.
        const stored = Math.fround(value)
        view.setFloat32(at, stored, true)
        at += 4
        lo[k] = Math.min(lo[k]!, stored)
        hi[k] = Math.max(hi[k]!, stored)
      }
    }
    const indexStart = at
    for (const face of mesh.faces) {
      for (const i of face) {
        view.setUint32(at, i, true)
        at += 4
      }
    }

    bufferViews.push(
      { buffer: 0, byteOffset: positionStart, byteLength: indexStart - positionStart, target: ARRAY_BUFFER },
      { buffer: 0, byteOffset: indexStart, byteLength: at - indexStart, target: ELEMENT_ARRAY_BUFFER }
    )
    accessors.push(
      {
        bufferView: index * 2,
        componentType: FLOAT,
        count: mesh.points.length,
        type: 'VEC3',
        min: lo,
        max: hi
      },
      {
        bufferView: index * 2 + 1,
        componentType: UNSIGNED_INT,
        count: mesh.faces.length * 3,
        type: 'SCALAR'
      }
    )
    meshes.push({
      name,
      primitives: [{ attributes: { POSITION: index * 2 }, indices: index * 2 + 1, material: 0 }]
    })
    nodes.push({ name, mesh: index })
  }

  const document = {
    asset,
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [MATERIAL],
    accessors,
    bufferViews,
    buffers: [{ byteLength: size }]
  }
  return encodeGlb(document, binary)
}
