/**
 * VEW-4: the part of the model a point on a 3D picture shows, for a click on the preview's 3D
 * picture. The picture is taken through one camera record (VEW-3), so the point is a ray from the
 * camera's position: through the walls as the model stands them (each a box along its centre
 * line, its thickness across and its height up from its floor's level), the doors and windows in
 * them, and each room's floor. The nearest thing the ray meets is the one picked.
 *
 * It is the model as the 3D view stands it, simplified: no slab thickness, roof, stair or fixture
 * is met, and a door or window is met where its hole is in its wall. Pure: no Three, no DOM.
 */
import { modelFloorLevels, shownFloors, type CameraRecord, type Point3 } from './camera'
import { floorOf } from './floors'
import { pointInPolygon } from './innerPoint'
import { roomShapes } from './items'
import { indexPlan, type FloorPlan } from './plan'
import { tolerance } from './tolerances'
import { wallAxis } from './wall'

export type ModelPickKind = 'room' | 'wall' | 'door' | 'window' | 'opening'

export interface ModelPick {
  readonly id: string
  readonly kind: ModelPickKind
  readonly floor: string
  /** Where the ray met it, in plan metres (z up from the ground floor's floor level). */
  readonly at: Point3
}

type V3 = readonly [number, number, number]

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

/**
 * The ray through a point of the picture, from the camera: `x` and `y` from the picture's
 * top-left corner, each from 0 to 1 across its width and down its height.
 */
export function pictureRay(camera: Pick<CameraRecord, 'position' | 'direction' | 'up' | 'fieldOfView' | 'aspectRatio'>, x: number, y: number): { origin: V3; direction: V3 } {
  const forward = unit(camera.direction)
  const right = unit(cross(forward, camera.up))
  const up = cross(right, forward)
  const half = Math.tan((camera.fieldOfView * Math.PI) / 360)
  const across = (x * 2 - 1) * half * camera.aspectRatio
  const down = (1 - y * 2) * half
  return { origin: camera.position, direction: unit(add(add(forward, right, across), up, down)) }
}

/** Narrows `span`, the part of the ray inside every slab so far, to the part between two values along one axis; false when nothing is left. */
function slab(start: number, step: number, low: number, high: number, span: [number, number]): boolean {
  if (Math.abs(step) < tolerance('noLength')) return start >= low && start <= high
  let a = (low - start) / step
  let b = (high - start) / step
  if (a > b) [a, b] = [b, a]
  span[0] = Math.max(span[0], a)
  span[1] = Math.min(span[1], b)
  return span[0] <= span[1]
}

/** The part of the model a point on a 3D picture shows, or null when the ray meets nothing. */
export function pickInModel(plan: FloorPlan, camera: CameraRecord, x: number, y: number): ModelPick | null {
  const { origin, direction } = pictureRay(camera, x, y)
  const levels = modelFloorLevels(plan)
  const shown = new Set(shownFloors(plan, camera.cut))
  let best: { s: number; pick: Omit<ModelPick, 'at'> } | null = null
  const offer = (s: number, pick: Omit<ModelPick, 'at'>): void => {
    if (s > 0 && (best === null || s < best.s)) best = { s, pick }
  }

  for (const wall of plan.walls) {
    const floor = floorOf(wall)
    const level = levels.get(floor)
    if (wall.virtual === true || level === undefined || !shown.has(floor) || wall.thickness <= 0 || wall.height <= 0) continue
    if (Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) < tolerance('noLength')) continue
    const axis = wallAxis(wall)
    const ox = origin[0] - axis.start.x
    const oy = origin[1] - axis.start.y
    const u0 = ox * axis.dir.x + oy * axis.dir.y
    const du = direction[0] * axis.dir.x + direction[1] * axis.dir.y
    const v0 = ox * axis.normal.x + oy * axis.normal.y
    const dv = direction[0] * axis.normal.x + direction[1] * axis.normal.y
    const span: [number, number] = [0, Infinity]
    if (!slab(u0, du, 0, axis.length, span) || !slab(v0, dv, -wall.thickness / 2, wall.thickness / 2, span) || !slab(origin[2], direction[2], level.base, level.base + wall.height, span)) continue
    const s = span[0]
    const along = u0 + du * s
    const up = origin[2] + direction[2] * s - level.base
    const hole = plan.openings.find((o) => o.wall === wall.id && along >= o.offset && along <= o.offset + o.width && up >= o.sill && up <= o.sill + o.height)
    if (hole !== undefined) offer(s, { id: hole.id, kind: hole.type === 'door' ? 'door' : hole.type === 'window' ? 'window' : 'opening', floor })
    else offer(s, { id: wall.id, kind: 'wall', floor })
  }

  if (Math.abs(direction[2]) >= tolerance('noLength')) {
    for (const { room, shape } of roomShapes(indexPlan(plan))) {
      const floor = floorOf(room)
      const level = levels.get(floor)
      if (level === undefined || !shown.has(floor)) continue
      const s = (level.base - origin[2]) / direction[2]
      const at = add(origin, direction, s)
      if (pointInPolygon({ x: at[0], y: at[1] }, shape.polygon, shape.holes)) offer(s, { id: room.id, kind: 'room', floor })
    }
  }

  const found = best as { s: number; pick: Omit<ModelPick, 'at'> } | null
  if (found === null) return null
  const at = add(origin, direction, found.s)
  const round = (n: number): number => Math.round(n * 1000) / 1000
  return { ...found.pick, at: [round(at[0]), round(at[1]), round(at[2])] }
}
