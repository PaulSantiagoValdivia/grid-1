/**
 * HND-10 (C31): where a trace image lies on the plan. A scan, photo or sketch is traced over:
 * the plan states the floor it lies under, the point its top-left corner lies on (`at`), its turn
 * (`rotation`) and its scale, stated in metres per pixel (`scale`) or set from two points on it
 * and the length between them on the building (`calibration`). This works out the scale, the
 * corners on the plan and the one transform the picture is drawn with; reading the file and
 * drawing it are the command's and the viewer's.
 *
 * Pixels run from the picture's top-left corner, x to the right and y down, as every image's do.
 * The plan's y runs up (C4), so pixel (u, v) lies at `at + turn(rotation)(u·s, -v·s)`.
 */
import type { FloorPlan, ReferenceImage } from '../types/floorplan'
import { planFloors, resolveFloor } from './floors'
import { limit } from './tolerances'
import type { Vec2 } from './vec2'

/** Where a trace image's scale came from: its two points and their length, its stated scale, or neither. */
export type TraceScaleFrom = 'calibration' | 'scale' | 'none'

export interface TraceScale {
  /** Metres on the building per pixel of the picture. */
  readonly metresPerPixel: number
  readonly from: TraceScaleFrom
  /** For a calibration: how many pixels apart its two points are. */
  readonly pixels?: number
  /** For a calibration: the length between them on the building, in metres. */
  readonly length?: number
}

/** A trace image's scale: from its calibration, else its stated scale, else `traceUnscaled`. */
export function traceScale(image: Pick<ReferenceImage, 'scale' | 'calibration'>): TraceScale {
  const calibration = image.calibration
  if (calibration !== undefined) {
    const pixels = Math.hypot(calibration.to[0] - calibration.from[0], calibration.to[1] - calibration.from[1])
    if (pixels > 0) return { metresPerPixel: calibration.length / pixels, from: 'calibration', pixels, length: calibration.length }
  }
  if (image.scale !== undefined && image.scale > 0) return { metresPerPixel: image.scale, from: 'scale' }
  return { metresPerPixel: limit('traceUnscaled'), from: 'none' }
}

/** The floor a trace image lies under: the one it names, else the lowest, which a picture draws when none is asked for; and whether the plan has it. */
export function traceFloor(plan: FloorPlan): { readonly floor: string; readonly known: boolean } {
  const named = plan.referenceImage?.floor
  if (named === undefined) return { floor: resolveFloor(plan, null), known: true }
  return { floor: named, known: planFloors(plan).some((floor) => floor.id === named) }
}

export interface TracePlacement {
  readonly floor: string
  /** The point of the plan the picture's top-left corner lies on. */
  readonly at: Vec2
  /** Its turn about that corner, in degrees counter-clockwise. */
  readonly rotation: number
  readonly scale: TraceScale
  /** The picture's size in its own pixels. */
  readonly pixels: { readonly width: number; readonly height: number }
  /** Its corners on the plan: top-left, top-right, bottom-right, bottom-left. */
  readonly corners: readonly [Vec2, Vec2, Vec2, Vec2]
  /**
   * From the picture's pixels to the drawing's own frame (plan metres with y down, as the 2D
   * view draws), as SVG's `matrix(a b c d e f)`: x' = a·u + c·v + e, y' = b·u + d·v + f.
   */
  readonly matrix: readonly [number, number, number, number, number, number]
}

/** Where pixel (u, v) of the trace image lies on the plan. */
export function tracePixelToPlan(placement: Pick<TracePlacement, 'at' | 'rotation' | 'scale'>, pixel: Vec2): Vec2 {
  const s = placement.scale.metresPerPixel
  const turn = (placement.rotation * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const dx = pixel.x * s
  const dy = -pixel.y * s
  return { x: placement.at.x + cos * dx - sin * dy, y: placement.at.y + sin * dx + cos * dy }
}

/**
 * Where the plan's trace image lies, for a picture `pixels` in size. Null when the plan names no
 * trace image, or the size has no pixels.
 */
export function tracePlacement(plan: FloorPlan, pixels: { readonly width: number; readonly height: number }): TracePlacement | null {
  const image = plan.referenceImage
  if (image === undefined || !(pixels.width > 0) || !(pixels.height > 0)) return null
  const at = { x: image.at?.[0] ?? 0, y: image.at?.[1] ?? 0 }
  const rotation = image.rotation ?? 0
  const scale = traceScale(image)
  const place = { at, rotation, scale }
  const corners = [
    tracePixelToPlan(place, { x: 0, y: 0 }),
    tracePixelToPlan(place, { x: pixels.width, y: 0 }),
    tracePixelToPlan(place, { x: pixels.width, y: pixels.height }),
    tracePixelToPlan(place, { x: 0, y: pixels.height }),
  ] as const
  const s = scale.metresPerPixel
  const turn = (rotation * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  // The plan's point negated in y, as the 2D view draws (`toScreen`).
  const matrix = [s * cos, -s * sin, s * sin, s * cos, at.x, -at.y] as const
  return { floor: traceFloor(plan).floor, at, rotation, scale, pixels: { width: pixels.width, height: pixels.height }, corners, matrix }
}
