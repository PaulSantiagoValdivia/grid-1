import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SceneSlab } from '@ongrid/core/geometry'
import { MODEL_TO_THREE } from './convert'

/** How far above the tallest wall the marker floats, so it never fights the wall tops. */
const ABOVE_WALLS_M = 0.02

/**
 * The room's own slab polygon, laid flat just above the walls. From the 3D camera the
 * walls hide most of a room's floor, so a tinted slab alone barely shows; a lid at
 * wall height always does.
 */
export function markerGeometry(slab: SceneSlab, wallHeight: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape(slab.polygon.map((p) => new THREE.Vector2(p.x, p.y)))
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.applyMatrix4(MODEL_TO_THREE)
  geometry.translate(0, wallHeight + ABOVE_WALLS_M, 0)
  return geometry
}

/** Shows the room a plan note points at: a see-through lid with a solid edge. */
export function RoomMarker3D({
  slab,
  wallHeight,
  color
}: {
  slab: SceneSlab
  wallHeight: number
  color: string
}): JSX.Element {
  const geometry = useMemo(() => markerGeometry(slab, wallHeight), [slab, wallHeight])
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry])
  useEffect(
    () => () => {
      geometry.dispose()
      edges.dispose()
    },
    [geometry, edges]
  )

  return (
    <group renderOrder={10}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} />
      </lineSegments>
    </group>
  )
}
