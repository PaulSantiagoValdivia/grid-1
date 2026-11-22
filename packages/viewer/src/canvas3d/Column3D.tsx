import { useEffect, useMemo } from 'react'
import type { SceneColumn } from '@ongrid/floorplan/geometry'
import { stairBlockGeometry } from './Stair3D'

/**
 * A column the plan states (CNT-16), in the storey it stands on: its footprint, solid from its
 * foot to its top, raised once, whole, as the core gives it (`buildScene`). The 3D view works out
 * nothing of its own. Heights are local to the storey's group, whose y is its floor level.
 */
export function Column3D({ column, color, castShadow = false, glow = 0 }: {
  column: SceneColumn
  color: string
  castShadow?: boolean
  glow?: number
}): JSX.Element {
  const geometry = useMemo(() => stairBlockGeometry(column), [column])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name={`column:${column.id}`} geometry={geometry} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={0.85} metalness={0} />
    </mesh>
  )
}
