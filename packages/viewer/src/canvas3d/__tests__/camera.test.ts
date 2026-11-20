import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { floorElevations, planBounds } from '@ongrid/floorplan/geometry'
import { OPENING_CAMERA, cameraPosition, openingCamera } from '../camera'
import { buildingFrame } from '../building'

const box: FloorPlan = {
  version: '1.0',
  units: 'meters',
  walls: [
    { id: 's', start: [0, 0], end: [8, 0], thickness: 0.2, height: 2.7 },
    { id: 'e', start: [8, 0], end: [8, 5], thickness: 0.2, height: 2.7 },
    { id: 'n', start: [8, 5], end: [0, 5], thickness: 0.2, height: 2.7 },
    { id: 'w', start: [0, 5], end: [0, 0], thickness: 0.2, height: 2.7 }
  ],
  rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'] }],
  openings: []
} as unknown as FloorPlan

describe('the opening camera record', () => {
  it('opens from the south-east, about 29.5 degrees down, through a 45 degree lens', () => {
    expect(OPENING_CAMERA.bearing).toBe(135)
    expect(OPENING_CAMERA.tilt).toBeCloseTo(29.5, 1)
    expect(OPENING_CAMERA.lens).toBe(45)
    // React Three Fiber's own defaults, which the app had before they were written down.
    expect([OPENING_CAMERA.near, OPENING_CAMERA.far]).toEqual([0.1, 1000])
  })

  it('reads its bearing and tilt from the offset the view has always used', () => {
    const [east, up, south] = OPENING_CAMERA.offset
    expect([east, up, south, OPENING_CAMERA.reach]).toEqual([1, 0.8, 1, 1.4])
    const radians = (OPENING_CAMERA.tilt * Math.PI) / 180
    expect(Math.tan(radians)).toBeCloseTo(up / Math.hypot(east, south), 12)
  })

  it('cannot be changed by whoever holds it', () => {
    expect(Object.isFrozen(OPENING_CAMERA)).toBe(true)
    expect(Object.isFrozen(OPENING_CAMERA.offset)).toBe(true)
  })

  it('places the camera where the view always opened, to the last digit', () => {
    const frame = buildingFrame(box, floorElevations(box), null)
    const { min, max, width, height } = planBounds(box)
    const distance = Math.max(width, height, 1) * 1.4
    const centre = [(min.x + max.x) / 2, 0, -(min.y + max.y) / 2] as const
    expect(frame.position).toEqual([centre[0] + distance, distance * 0.8, centre[2] + distance])
    expect(cameraPosition(OPENING_CAMERA, frame.target, frame.span)).toEqual(frame.position)
  })

  it('gives the app canvas its position, lens and range', () => {
    const frame = buildingFrame(box, floorElevations(box), null)
    expect(openingCamera(frame)).toEqual({ position: frame.position, fov: 45, near: 0.1, far: 1000 })
  })
})
