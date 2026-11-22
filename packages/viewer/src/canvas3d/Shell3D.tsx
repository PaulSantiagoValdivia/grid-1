import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SceneShell, SceneSolid } from '@ongrid/floorplan/geometry'
import { MODEL_TO_THREE } from './convert'

/**
 * What closes a storey (LVL-4): the slab it stands on, from its outline and open over its stairs,
 * lifts and voids, and the roof over every part of it with nothing above, with its parapet, as the
 * core works them out (`sceneShell`). The 3D view draws them and works out nothing of its own.
 *
 * Heights are local to the storey's group, whose y is its floor level. A sloped roof's pieces (LVL-6)
 * come raised onto their planes, and are drawn so.
 */

/** Each piece of a solid extruded from its bottom to its top, in Three's frame, open through its holes. */
export function shellGeometries(solid: SceneSolid): THREE.BufferGeometry[] {
  if (!(solid.top > solid.bottom)) return []
  return solid.pieces
    .filter((piece) => piece.outline.length >= 3)
    .map((piece) => {
      // The outline is counter-clockwise and each hole clockwise, and the axis conversion keeps
      // orientation, so the extrusion's faces point outward on their own.
      const shape = new THREE.Shape(piece.outline.map((p) => new THREE.Vector2(p.x, p.y)))
      for (const hole of piece.holes) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))))
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: solid.top - solid.bottom, bevelEnabled: false, steps: 1 })
      geometry.translate(0, 0, solid.bottom)
      // LVL-6: a piece of a sloped roof is raised, point by point, onto its plane.
      const rise = piece.rise
      if (rise !== undefined) {
        const position = geometry.getAttribute('position')
        for (let i = 0; i < position.count; i++) {
          const x = position.getX(i)
          const y = position.getY(i)
          position.setZ(i, position.getZ(i) + rise.z0 + rise.gx * x + rise.gy * y)
        }
        position.needsUpdate = true
        geometry.computeVertexNormals()
      }
      geometry.applyMatrix4(MODEL_TO_THREE)
      return geometry
    })
}

export function Shell3D({
  shell,
  roof,
  color,
  castShadow = false,
  glow = 0
}: {
  shell: SceneShell
  /** Whether the roof and its parapet are drawn: only when the whole building is shown. */
  roof: boolean
  color: string
  castShadow?: boolean
  glow?: number
}): JSX.Element {
  const slab = useMemo(() => shell.slab.flatMap(shellGeometries), [shell])
  const top = useMemo(
    () => (roof ? [...(shell.roof ? shellGeometries(shell.roof) : []), ...(shell.parapet ? shellGeometries(shell.parapet) : [])] : []),
    [shell, roof]
  )
  useEffect(() => () => slab.forEach((g) => g.dispose()), [slab])
  useEffect(() => () => top.forEach((g) => g.dispose()), [top])
  return (
    <group name={`shell:${shell.floor}`}>
      {slab.map((geometry, i) => (
        <mesh key={`slab:${i}`} geometry={geometry} receiveShadow castShadow={castShadow}>
          {/* Behind the rooms' own floors where they lie on it, so a highlighted room shows. */}
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={1} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
      ))}
      {top.map((geometry, i) => (
        <mesh key={`roof:${i}`} geometry={geometry} receiveShadow castShadow={castShadow}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
