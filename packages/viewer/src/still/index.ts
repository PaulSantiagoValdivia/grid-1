/**
 * 3D stills of a plan without a browser or the app.
 *
 * `planStill(plan, options)` mounts the app's own 3D scene (`BuildingScene`) in plain Node,
 * takes it with the app's opening camera (`OPENING_CAMERA`), and draws it in software. It
 * returns RGBA pixels; for a PNG, see `drawStill` in the `ongrid` package.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { GROUND_GRID } from '../canvas3d/BuildingScene'
import type { PlanColors3D } from '../canvas3d/usePlanColors'
import { DARK_COLORS_3D, LIGHT_COLORS_3D } from './look3d'
import { rasterise, type RasterImage } from './rasterise'
import { stillScene } from './stillScene'

export { OPENING_CAMERA, openingCamera, type ViewCamera } from '../canvas3d/camera'
export { LIGHT_COLORS_3D, DARK_COLORS_3D } from './look3d'
export { stillScene, type StillScene, type StillSceneOptions } from './stillScene'
export { rasterise, type RasterImage, type RasteriseOptions, type GroundGrid } from './rasterise'

export const DEFAULT_STILL_WIDTH = 1200
export const DEFAULT_STILL_HEIGHT = 800

export interface StillOptions {
  /** A storey to show as a cutaway, as the app's floor focus does. The whole building by default. */
  readonly focus?: string | null
  /** In pixels: 1200 by 800 by default. */
  readonly width?: number
  readonly height?: number
  readonly look?: 'light' | 'dark' | PlanColors3D
  /**
   * Samples per pixel along each side, to smooth edges. 2 by default, and 1 for a still of
   * more than `SMOOTHED_PIXELS`, which would otherwise take a great deal of memory.
   */
  readonly supersample?: number
}

/** The most pixels a still may have: 4800 by 3200 is within it. */
export const MAX_STILL_PIXELS = 16_000_000
/** The most pixels a still is smoothed by default. */
export const SMOOTHED_PIXELS = 4_000_000

/** A still of the 3D model of `plan`, as the app opens it. */
export function planStill(plan: FloorPlan, options: StillOptions = {}): RasterImage {
  const width = options.width ?? DEFAULT_STILL_WIDTH
  const height = options.height ?? DEFAULT_STILL_HEIGHT
  for (const [name, side] of [
    ['width', width],
    ['height', height]
  ] as const) {
    if (!Number.isInteger(side) || side < 1) {
      throw new RangeError(`A still's ${name} is a whole number of pixels, at least 1: got ${side}`)
    }
  }
  if (width * height > MAX_STILL_PIXELS) {
    throw new RangeError(`A still of ${width} by ${height} pixels is larger than ${MAX_STILL_PIXELS} pixels`)
  }
  const colors =
    options.look === 'dark' ? DARK_COLORS_3D : options.look === undefined || options.look === 'light' ? LIGHT_COLORS_3D : options.look

  const still = stillScene(plan, { focus: options.focus ?? null, colors, width, height })
  try {
    const [cx, , cz] = still.frame.target
    return rasterise(still.scene, still.camera, {
      width,
      height,
      supersample: options.supersample ?? (width * height > SMOOTHED_PIXELS ? 1 : 2),
      ground: {
        ...GROUND_GRID,
        center: [cx, cz],
        cellColor: colors.grid,
        sectionColor: colors.gridSection
      }
    })
  } finally {
    still.close()
  }
}
