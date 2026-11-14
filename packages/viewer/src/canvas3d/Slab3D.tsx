import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SLAB_THICKNESS, type SceneSlab } from '@ongrid/core/geometry'
import { MODEL_TO_THREE } from './convert'

/**
 * A room's slab: the same polygon the 2D plan draws as a room, extruded
 * `SLAB_THICKNESS` (C3: the inner faces, the same footprint IFC writes).
 *
 * "Slab", not "floor", because a floor plan's `floor` is a storey (C5) — this
 * is the surface under one room, and a storey is drawn as a set of them.
 *
 * Heights are local to the storey's group, whose y is its floor level, so a
 * storey changing height never rebuilds its slabs.
 */

/** The room's polygon extruded from `from` up to `from + SLAB_THICKNESS`, in Three's frame. */
function slabBetween(slab: SceneSlab, from: number): THREE.BufferGeometry {
  // The polygon is counter-clockwise and the axis conversion keeps orientation,
  // so the extrusion's faces point outward on their own.
  const shape = new THREE.Shape(slab.polygon.map((p) => new THREE.Vector2(p.x, p.y)))
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: SLAB_THICKNESS,
    bevelEnabled: false,
    steps: 1
  })
  geometry.translate(0, 0, from)
  geometry.applyMatrix4(MODEL_TO_THREE)
  return geometry
}

/** A storey's floor slab: its top at the floor level, going down under the room. */
export function floorSlabGeometry(slab: SceneSlab): THREE.BufferGeometry {
  return slabBetween(slab, -SLAB_THICKNESS)
}

/** The roof over a room of the top storey, lying on its walls (`clearHeight` up). */
export function roofGeometry(slab: SceneSlab, clearHeight: number): THREE.BufferGeometry {
  return slabBetween(slab, clearHeight)
}

export function Slab3D({
  slab,
  color,
  meshRef,
  roofAt,
  castShadow = false,
  glow = 0
}: {
  slab: SceneSlab
  color: string
  /** For a live build, which fades the slab in. */
  meshRef?: (mesh: THREE.Mesh | null) => void
  /** Draw the roof at this local height instead of the floor slab. */
  roofAt?: number
  /** Upper storeys' slabs shade the storeys below. */
  castShadow?: boolean
  /** How much the slab glows in its own colour (a muted storey in light theme, `mutedGlow`). */
  glow?: number
}): JSX.Element {
  const geometry = useMemo(
    () => (roofAt === undefined ? floorSlabGeometry(slab) : roofGeometry(slab, roofAt)),
    [slab, roofAt]
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow={castShadow}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={1} />
    </mesh>
  )
}
