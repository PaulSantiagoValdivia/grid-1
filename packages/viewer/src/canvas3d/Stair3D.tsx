import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SceneStair, SceneStairBlock } from '@ongrid/floorplan/geometry'
import { MODEL_TO_THREE } from './convert'

/**
 * A stair the plan states (LVL-3), in the storey it rises from: every tread and landing a solid
 * block from the stair's foot up to the riser it tops, as the core lays it out (`stairBlocks`).
 * The 3D view draws the blocks and works out nothing of its own.
 *
 * Heights are local to the storey's group, whose y is its floor level.
 */

/** One block extruded from its bottom to its top, in Three's frame. */
export function stairBlockGeometry(block: SceneStairBlock): THREE.BufferGeometry {
  // The outline is counter-clockwise and the axis conversion keeps orientation, so the
  // extrusion's faces point outward on their own.
  const shape = new THREE.Shape(block.outline.map((p) => new THREE.Vector2(p.x, p.y)))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: block.top - block.bottom, bevelEnabled: false, steps: 1 })
  geometry.translate(0, 0, block.bottom)
  geometry.applyMatrix4(MODEL_TO_THREE)
  return geometry
}

export function Stair3D({ stair, color, castShadow = false, glow = 0 }: {
  stair: SceneStair
  color: string
  castShadow?: boolean
  glow?: number
}): JSX.Element {
  const geometries = useMemo(() => stair.blocks.filter((b) => b.top > b.bottom).map(stairBlockGeometry), [stair])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  return (
    <group name={`stair:${stair.id}`}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} receiveShadow castShadow={castShadow}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
