import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import type { CameraRecord, Point3 } from '../camera'
import { pickInModel, pictureRay } from '../pick'

const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'fixtures', 'two-bed-flat.json'), 'utf8')))

/** A camera record with only what a pick reads set: where it stands and which way it looks. */
function looking(position: Point3, direction: Point3, up: Point3 = [0, 0, 1]): CameraRecord {
  return { position, direction, up, fieldOfView: 90, aspectRatio: 1, cut: null } as unknown as CameraRecord
}

describe('the ray through a point of a 3D picture (VEW-4)', () => {
  it('goes through the middle along the camera, and through an edge at half the field of view', () => {
    const camera = looking([0, 0, 0], [0, 1, 0])
    expect(pictureRay(camera, 0.5, 0.5).direction.map((n) => Number(n.toFixed(6)))).toEqual([0, 1, 0])
    const right = pictureRay(camera, 1, 0.5).direction
    expect(right[0]).toBeCloseTo(Math.SQRT1_2, 6)
    expect(right[1]).toBeCloseTo(Math.SQRT1_2, 6)
    const top = pictureRay(camera, 0.5, 0).direction
    expect(top[2]).toBeCloseTo(Math.SQRT1_2, 6)
  })
})

describe('what a click on a 3D picture shows (VEW-4)', () => {
  it('is the room whose floor is under a camera looking straight down', () => {
    expect(pickInModel(flat(), looking([2, 2, 20], [0, 0, -1], [0, 1, 0]), 0.5, 0.5)).toMatchObject({ id: 'living', kind: 'room', floor: 'ground', at: [2, 2, 0] })
  })

  it('is the window where the ray meets its hole, and the wall beside it', () => {
    const plan = flat()
    // win-living-south: 1.2 to 3.0 m along ext-south, its sill at 0.6 m and 1.5 m tall.
    expect(pickInModel(plan, looking([2.1, -5, 1.2], [0, 1, 0]), 0.5, 0.5)).toMatchObject({ id: 'win-living-south', kind: 'window' })
    expect(pickInModel(plan, looking([4, -5, 1.2], [0, 1, 0]), 0.5, 0.5)).toMatchObject({ id: 'ext-south', kind: 'wall' })
  })

  it('is nothing for a ray that meets no part of the model', () => {
    expect(pickInModel(flat(), looking([2, 2, 20], [0, 0, 1], [0, 1, 0]), 0.5, 0.5)).toBeNull()
  })
})
