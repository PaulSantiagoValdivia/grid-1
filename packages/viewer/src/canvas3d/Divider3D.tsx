import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SceneDivider } from '@ongrid/floorplan/geometry'
import { toThree } from './convert'

/**
 * A dividing line (a virtual wall) in 3D: a dashed line lying on the floor, over the slabs
 * of the rooms either side, which meet on it. It has no substance, so nothing is raised.
 */

/** How far above the slab tops (at 0) the line lies, so the floor does not hide it. */
export const DIVIDER_LIFT = 0.005

/** Dashes and gaps in metres, as the DXF draws a dividing line. */
export const DIVIDER_DASH = { dashSize: 0.2, gapSize: 0.1 } as const

/**
 * The line's two ends in Three's frame, with the distance along the line at each, which a
 * dashed material needs to place its dashes.
 */
export function dividerGeometry(divider: SceneDivider): THREE.BufferGeometry {
  const from = toThree({ x: divider.from.x, y: divider.from.y, z: DIVIDER_LIFT })
  const to = toThree({ x: divider.to.x, y: divider.to.y, z: DIVIDER_LIFT })
  if (divider.path !== undefined && divider.path.length > 2) return pathGeometry(divider.path)
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to])
  geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, from.distanceTo(to)], 1))
  return geometry
}

/** CNT-18: a curved line, piece by piece, each piece a segment, its dashes running on round the curve. */
function pathGeometry(path: NonNullable<SceneDivider['path']>): THREE.BufferGeometry {
  const points = path.map((p) => toThree({ x: p.x, y: p.y, z: DIVIDER_LIFT }))
  const pairs: THREE.Vector3[] = []
  const distances: number[] = []
  let along = 0
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!]
    pairs.push(a, b)
    distances.push(along, along + a.distanceTo(b))
    along += a.distanceTo(b)
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(pairs)
  geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute(distances, 1))
  return geometry
}

export function Divider3D({ divider, color }: { divider: SceneDivider; color: string }): JSX.Element {
  const geometry = useMemo(() => dividerGeometry(divider), [divider])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Never hit by the pointer: a line's pick area is a metre wide, and it would steal the
  // hover from the storey and the room under it.
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineDashedMaterial color={color} dashSize={DIVIDER_DASH.dashSize} gapSize={DIVIDER_DASH.gapSize} />
    </lineSegments>
  )
}
