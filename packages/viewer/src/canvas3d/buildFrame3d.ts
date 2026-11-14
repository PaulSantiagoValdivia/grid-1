/**
 * How the 3D view draws a build frame.
 *
 * The meshes themselves change only once per step (the plan after `k` steps,
 * through the revision cache). Per animation frame this only moves cheap
 * properties on the objects already there: a wall's `scale.y` as it grows from
 * the ground, an offset while it slides, an opacity while a slab fades in or a
 * removed part fades out. That runs inside the render loop, with no React
 * render.
 */

import * as THREE from 'three'
import type { FloorPlan, Opening, Vec3 } from '@ongrid/core/geometry'
import { pointAlong, wallAxis } from '@ongrid/core/geometry'
import type { InFlight } from '../preview/playback'
import { progressOf, removalProgress } from '../preview/progress'

type Wall = FloorPlan['walls'][number]

export interface Pose {
  /** Height as a share of the wall's own, grown from the ground. */
  readonly scaleY: number
  /** How far the wall still is from its place, in plan meters. */
  readonly offset: { readonly x: number; readonly y: number }
}

export const REST: Pose = { scaleY: 1, offset: { x: 0, y: 0 } }

/** A zero scale leaves the mesh without usable normals; this is invisible anyway. */
const MIN_SCALE = 0.001

/** How far outside the wall faces the hole outline floats, in meters. */
const OUTLINE_GAP = 0.01

const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Where a wall is in its step: `before` is its version in the previous plan. */
export function wallPose(inFlight: readonly InFlight[], wall: Wall, before: Wall | undefined): Pose {
  const tracing = progressOf(inFlight, 'wall', wall.id)
  if (tracing !== null) return { scaleY: Math.max(tracing, MIN_SCALE), offset: REST.offset }

  const heightFrom = (t: number) =>
    before && before.height !== wall.height ? mix(before.height / wall.height, 1, t) : 1

  const raising = progressOf(inFlight, 'raise', wall.id)
  if (raising !== null) return { scaleY: heightFrom(raising), offset: REST.offset }

  const sliding = progressOf(inFlight, 'move', wall.id)
  if (sliding !== null && before) {
    return {
      scaleY: heightFrom(sliding),
      offset: {
        x: (1 - sliding) * (before.start[0] - wall.start[0]),
        y: (1 - sliding) * (before.start[1] - wall.start[1])
      }
    }
  }

  return REST
}

/** A room's slab fades in during its step. */
export function slabOpacity(inFlight: readonly InFlight[], roomId: string): number {
  return progressOf(inFlight, 'room', roomId) ?? 1
}

/**
 * The hole an opening cuts, outlined just outside both faces of its wall, in
 * model coordinates (z up). Highlighted while the opening's step plays.
 */
export function openingOutline(opening: Opening, wall: Wall): Vec3[][] {
  const axis = wallAxis(wall)
  const a = pointAlong(axis, opening.offset)
  const b = pointAlong(axis, opening.offset + opening.width)
  const bottom = opening.sill
  const top = opening.sill + opening.height
  const reach = wall.thickness / 2 + OUTLINE_GAP

  return [reach, -reach].map((side) => {
    const nx = axis.normal.x * side
    const ny = axis.normal.y * side
    return [
      { x: a.x + nx, y: a.y + ny, z: bottom },
      { x: b.x + nx, y: b.y + ny, z: bottom },
      { x: b.x + nx, y: b.y + ny, z: top },
      { x: a.x + nx, y: a.y + ny, z: top }
    ]
  })
}

/** The objects a frame moves, by part id. */
export interface BuildObjects {
  readonly walls: ReadonlyMap<string, THREE.Object3D>
  readonly slabs: ReadonlyMap<string, THREE.Object3D>
  /** Removed parts, built from the previous plan. */
  readonly leaving: ReadonlyMap<string, THREE.Object3D>
  /** Hole outlines, by opening id. */
  readonly highlights: ReadonlyMap<string, THREE.Object3D>
}

function setOpacity(object: THREE.Object3D, opacity: number): void {
  const material = (object as THREE.Mesh).material as THREE.Material | undefined
  if (!material) return
  const transparent = opacity < 1
  if (material.transparent !== transparent) {
    material.transparent = transparent
    material.needsUpdate = true
  }
  material.opacity = opacity
}

/**
 * Writes a frame onto the scene. Every object gets set, in flight or not, so
 * one call with nothing in flight puts the whole scene back at rest.
 */
export function applyFrame(
  objects: BuildObjects,
  inFlight: readonly InFlight[],
  plan: FloorPlan,
  prev: FloorPlan
): void {
  for (const [id, object] of objects.walls) {
    const wall = plan.walls.find((w) => w.id === id)
    const pose = wall ? wallPose(inFlight, wall, prev.walls.find((w) => w.id === id)) : REST
    object.scale.y = pose.scaleY
    // Three is (x, height, -y): convention C4.
    object.position.set(pose.offset.x, 0, -pose.offset.y)
  }

  for (const [id, object] of objects.slabs) setOpacity(object, slabOpacity(inFlight, id))

  const removal = removalProgress(inFlight)
  for (const [id, object] of objects.leaving) {
    const leaving = removal !== null && inFlight.some((f) => f.step.kind === 'remove' && f.step.id === id)
    object.visible = leaving
    if (leaving) setOpacity(object, 1 - (removal ?? 0))
  }

  for (const [id, object] of objects.highlights) {
    const cutting = progressOf(inFlight, 'opening', id)
    object.visible = cutting !== null
    if (cutting !== null) setOpacity(object, 1 - cutting)
  }
}

/** How high above the ground the pulse floats when it marks no wall, in meters. */
const PULSE_GROUND = 0.15

/**
 * How high the pulse sits: on top of the wall whose end it marks, otherwise
 * just above the ground (a room's label point, an opening's centre).
 */
export function pulseHeight(plan: FloorPlan, at: { x: number; y: number }): number {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const wall = plan.walls.find((w) => near(w.end[0], at.x) && near(w.end[1], at.y))
  return wall ? wall.height : PULSE_GROUND
}
