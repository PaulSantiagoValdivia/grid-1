import type { CameraRecord } from '@ongrid/floorplan/geometry'
import type { BuildingFrame } from './building'

/**
 * The camera the 3D view opens with, and the one a still is taken with. One record, so the
 * picture an agent checks and the view a person opens are the same picture.
 *
 * Pure: no Three, no React, no DOM.
 */
export interface ViewCamera {
  /**
   * Where the camera stands from the pivot, in Three's axes (east, up, south), for each metre
   * of `reach`. These are the numbers the view has always used: the bearing and tilt below are
   * read from them, so the opening view keeps its exact place.
   */
  readonly offset: readonly [east: number, up: number, south: number]
  /** How far `offset` is taken, per metre of the building's span. */
  readonly reach: number
  /** Compass bearing from the pivot to the camera, in degrees clockwise from north. 135 is south-east. */
  readonly bearing: number
  /** How far the camera looks down at the pivot, in degrees below the horizontal. */
  readonly tilt: number
  /** The lens: the vertical field of view, in degrees. */
  readonly lens: number
  /** The nearest and farthest the camera sees, in metres. */
  readonly near: number
  readonly far: number
}

const DEGREES = 180 / Math.PI

function viewCamera(fields: Omit<ViewCamera, 'bearing' | 'tilt'>): ViewCamera {
  const [east, up, south] = fields.offset
  // Three's z points south, so north is -z.
  const bearing = (((Math.atan2(east, -south) * DEGREES) % 360) + 360) % 360
  const tilt = Math.atan2(up, Math.hypot(east, south)) * DEGREES
  return Object.freeze({ ...fields, offset: Object.freeze([...fields.offset]) as ViewCamera['offset'], bearing, tilt })
}

/**
 * The opening view: from the south-east, about 29.5 degrees down, through a 45 degree lens,
 * at 1.4 times the building's span along each of east and south. `near` and `far` are
 * React Three Fiber's own defaults, written down so a still uses them too.
 */
export const OPENING_CAMERA: ViewCamera = viewCamera({
  offset: [1, 0.8, 1],
  reach: 1.4,
  lens: 45,
  near: 0.1,
  far: 1000
})

type Vec3 = [number, number, number]

/** The camera's place for a pivot and a span, by `camera`'s rule. */
export function cameraPosition(camera: ViewCamera, target: readonly [number, number, number], span: number): Vec3 {
  const distance = span * camera.reach
  const [east, up, south] = camera.offset
  return [target[0] + distance * east, target[1] + distance * up, target[2] + distance * south]
}

/** The perspective camera's settings for a framing: what the app's canvas is given, and a still. */
export interface OpeningCameraProps {
  readonly position: Vec3
  readonly fov: number
  readonly near: number
  readonly far: number
}

/**
 * The settings the app's canvas opens its camera with, for `frame`. The orbit controls then
 * point it at `frame.target`; a still does the same.
 */
export function openingCamera(frame: Pick<BuildingFrame, 'position'>, camera: ViewCamera = OPENING_CAMERA): OpeningCameraProps {
  return { position: frame.position, fov: camera.lens, near: camera.near, far: camera.far }
}

/**
 * VEW-3: a camera record (`cameraRecord` in the geometry core) as the perspective camera's
 * settings, in Three's axes (C4: plan `(x, y, z)` is Three's `(x, z, -y)`). The app's 3D view
 * opens at it and a still is taken with it, so a named view is the same picture in both.
 * `target` is what the orbit controls turn round. `up` is the record's; the camera is pointed
 * at `target` with Three's own up, which turns it the same way, with no roll.
 */
export interface RecordCameraProps extends OpeningCameraProps {
  readonly target: Vec3
  readonly up: Vec3
}

/** Near enough for an eye in a small room, as the eye view has always used. */
const RECORD_NEAR = 0.05

const three = (p: readonly [number, number, number]): Vec3 => [p[0], p[2], -p[1] + 0]

export function recordCamera(record: CameraRecord): RecordCameraProps {
  return {
    position: three(record.position),
    target: three(record.target.point),
    up: three(record.up),
    fov: record.fieldOfView,
    near: RECORD_NEAR,
    far: OPENING_CAMERA.far
  }
}
