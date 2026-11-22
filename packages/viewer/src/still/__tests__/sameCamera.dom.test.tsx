// @vitest-environment jsdom
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Vector3 } from 'three'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { cameraRecord, floorElevations, type CameraRecord } from '@ongrid/floorplan/geometry'

/**
 * The still and the app's opening view use one camera record. WebGL does not run here, so the
 * app's canvas is replaced by a stand-in that keeps what Canvas3D hands it: the camera it
 * opens with and the orbit controls' pivot. The still's camera must match both.
 */

const seen: { camera?: { position: number[]; fov: number; near: number; far: number }; children?: ReactNode } = {}

vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: (props: { camera: typeof seen.camera; children: ReactNode }) => {
    seen.camera = props.camera
    seen.children = props.children
    return null
  }
}))

const { OrbitControls } = await import('../../canvas3d/OrbitControls')
const { Canvas3D } = await import('../../canvas3d/Canvas3D')
const { buildingFrame } = await import('../../canvas3d/building')
const { OPENING_CAMERA, openingCamera, recordCamera, stillScene, LIGHT_COLORS_3D } = await import('..')

afterEach(cleanup)

const flat = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../cli/fixtures/two-bed-flat.json'), 'utf8')
) as FloorPlan

/** The same flat with a storey on top: the pivot is no longer at the ground. */
function twoStoreys(plan: FloorPlan): FloorPlan {
  const up = <T extends { id: string }>(x: T): T => ({ ...x, id: `${x.id}-1`, floor: 'first' })
  return {
    ...plan,
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls: [...plan.walls, ...plan.walls.map(up)],
    rooms: [...plan.rooms, ...plan.rooms.map((r) => ({ ...up(r), boundary: r.boundary.map((b) => `${b}-1`) }))],
    openings: [...plan.openings, ...plan.openings.map((o) => ({ ...o, id: `${o.id}-1`, wall: `${o.wall}-1` }))]
  } as FloorPlan
}

function orbitTarget(children: ReactNode): number[] {
  const controls = Children.toArray(children).find(
    (child): child is ReactElement<{ target: number[] }> => isValidElement(child) && child.type === OrbitControls
  )
  if (!controls) throw new Error('Canvas3D has no orbit controls')
  return controls.props.target
}

describe('the still and the app open with the same camera', () => {
  it.each([
    ['the two-bed flat', flat, null],
    ['two storeys, whole', twoStoreys(flat), null],
    ['two storeys, the ground floor as a cutaway', twoStoreys(flat), 'ground']
  ] as const)('%s', (_name, plan, focus) => {
    render(<Canvas3D floorPlan={plan} focus={focus} />)
    const app = seen.camera!
    const pivot = orbitTarget(seen.children)

    // The still mounts and unmounts its own root, synchronously and outside any act():
    // React need not warn about it.
    const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const act = flags.IS_REACT_ACT_ENVIRONMENT
    flags.IS_REACT_ACT_ENVIRONMENT = false
    const still = stillScene(plan, { focus, colors: LIGHT_COLORS_3D, width: 1200, height: 800 })
    try {
      // Both come from the one record.
      const frame = buildingFrame(plan, floorElevations(plan), focus)
      expect(app).toEqual(openingCamera(frame))
      expect(app.fov).toBe(OPENING_CAMERA.lens)

      // The still's camera is the app's, number for number.
      expect(still.camera.position.toArray()).toEqual(app.position)
      expect([still.camera.fov, still.camera.near, still.camera.far]).toEqual([app.fov, app.near, app.far])
      expect(still.frame.target).toEqual(pivot)

      // And it looks where the orbit controls point the app's.
      const looking = still.camera.getWorldDirection(new Vector3())
      const toPivot = new Vector3(...(pivot as [number, number, number])).sub(still.camera.position).normalize()
      expect(looking.distanceTo(toPivot)).toBeLessThan(1e-9)
    } finally {
      still.close()
      flags.IS_REACT_ACT_ENVIRONMENT = act
    }
  })
})

describe('the still and the app open at the same camera record (VEW-3)', () => {
  const read = (plan: FloorPlan): FloorPlan => parseFloorPlan(plan)
  const records: [string, FloorPlan, CameraRecord][] = [
    ['the flat from the south-west, looking down', read(flat), cameraRecord(read(flat), { target: { room: 'lounge', point: [7, 5, 1.3] }, bearing: 220, tilt: 25, distance: 12, focalLength: 35, cut: null })],
    ['two storeys, the ground floor cut away, looking up', read(twoStoreys(flat)), cameraRecord(read(twoStoreys(flat)), { target: { room: null, point: [4, 3, 2] }, bearing: 10, tilt: -5, distance: 9, focalLength: 18, cut: 'ground' })]
  ]
  it.each(records)('%s', (_name, plan, record) => {
    render(<Canvas3D floorPlan={plan} focus={record.cut} camera={record} />)
    const app = seen.camera!
    const pivot = orbitTarget(seen.children)
    const set = recordCamera(record)
    // Plan (x, y, z) is Three's (x, z, -y).
    expect(set.position).toEqual([record.position[0], record.position[2], -record.position[1]])
    expect(set.target).toEqual([record.target.point[0], record.target.point[2], -record.target.point[1]])
    expect(app).toEqual({ position: set.position, fov: record.fieldOfView, near: set.near, far: set.far })
    expect(pivot).toEqual(set.target)

    const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const act = flags.IS_REACT_ACT_ENVIRONMENT
    flags.IS_REACT_ACT_ENVIRONMENT = false
    const still = stillScene(plan, { focus: record.cut, colors: LIGHT_COLORS_3D, width: 1200, height: 800, camera: record })
    try {
      expect(still.camera.position.toArray()).toEqual(app.position)
      expect([still.camera.fov, still.camera.near, still.camera.far]).toEqual([app.fov, app.near, app.far])
      // It looks along the record's direction, at the app's pivot.
      const looking = still.camera.getWorldDirection(new Vector3())
      const direction = new Vector3(record.direction[0], record.direction[2], -record.direction[1])
      expect(looking.distanceTo(direction)).toBeLessThan(1e-5)
      const toPivot = new Vector3(...(pivot as [number, number, number])).sub(still.camera.position).normalize()
      expect(looking.distanceTo(toPivot)).toBeLessThan(1e-9)
      // And its up is the record's: no roll.
      const up = new Vector3(0, 1, 0).applyQuaternion(still.camera.quaternion)
      expect(up.distanceTo(new Vector3(record.up[0], record.up[2], -record.up[1]))).toBeLessThan(1e-5)
    } finally {
      still.close()
      flags.IS_REACT_ACT_ENVIRONMENT = act
    }
  })
})
