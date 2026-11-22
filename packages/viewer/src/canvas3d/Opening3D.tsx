import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { OpeningPartKind, SceneOpening } from '@ongrid/floorplan/geometry'
import { stairBlockGeometry } from './Stair3D'

/**
 * A door or window in 3D (CNT-14): its frame, its leaves and its glass, as the core lays them
 * out (`sceneOpening`): every box square to the wall, the leaves closed and hung from the face
 * of the wall the door opens toward. The view draws the boxes and works out nothing of its own.
 *
 * Heights are local to the storey's group, whose y is its floor level.
 */

/** How much of what lies behind shows through the glass, as an opacity. */
const GLASS_OPACITY = 0.35

export interface OpeningColors {
  readonly frame: string
  readonly leaf: string
  readonly glass: string
}

export function Opening3D({ opening, colors, glow = 0 }: { opening: SceneOpening; colors: OpeningColors; glow?: number }): JSX.Element {
  const parts = useMemo(
    () => opening.parts.filter((p) => p.top > p.bottom).map((p) => ({ part: p.part, geometry: stairBlockGeometry(p) })),
    [opening]
  )
  useEffect(() => () => parts.forEach(({ geometry }) => geometry.dispose()), [parts])
  const color = (part: OpeningPartKind): string => (part === 'frame' ? colors.frame : part === 'leaf' ? colors.leaf : colors.glass)
  return (
    <group name={`${opening.type}:${opening.id}`}>
      {parts.map(({ part, geometry }, i) =>
        part === 'glass' ? (
          <mesh key={i} name={part} geometry={geometry}>
            <meshStandardMaterial color={color(part)} transparent opacity={GLASS_OPACITY} depthWrite={false} roughness={0.1} metalness={0} side={THREE.DoubleSide} />
          </mesh>
        ) : (
          <mesh key={i} name={part} geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial color={color(part)} emissive={color(part)} emissiveIntensity={glow} roughness={0.8} metalness={0} />
          </mesh>
        )
      )}
    </group>
  )
}
