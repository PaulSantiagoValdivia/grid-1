/**
 * Placement of a reference image — a photo or a scanned drawing sitting behind
 * the plan to trace over.
 *
 * The rules live here, away from React, so they can be tested on their own:
 * where the image lands when it is dropped, and how it behaves when scaled.
 */

import type { Bounds } from './floorplan'

/** Placement in plan coordinates (meters), from the bottom-left corner. */
export interface ImagePlacement {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Fraction of the plan the image covers when first dropped. */
export const INITIAL_COVERAGE = 0.9
export const MIN_IMAGE_WIDTH = 0.5
export const MAX_IMAGE_WIDTH = 500

/**
 * Where a freshly dropped image lands: centered over the plan, as large as it
 * fits, with the file's own aspect ratio preserved.
 */
export function fitImageToBounds(
  pixels: { width: number; height: number },
  bounds: Bounds
): ImagePlacement {
  const planWidth = Math.max(bounds.width, 1)
  const planHeight = Math.max(bounds.height, 1)
  const ratio = pixels.height / pixels.width

  let width = planWidth * INITIAL_COVERAGE
  let height = width * ratio
  if (height > planHeight * INITIAL_COVERAGE) {
    height = planHeight * INITIAL_COVERAGE
    width = height / ratio
  }

  return {
    x: bounds.min.x + (planWidth - width) / 2,
    y: bounds.min.y + (planHeight - height) / 2,
    width,
    height
  }
}

/**
 * Scales the image about its own center.
 *
 * About the center and not the corner: anchored at a corner, the image walks
 * across the plan while being resized and the alignment work is lost.
 */
export function scaleImageAboutCenter(
  placement: ImagePlacement,
  factor: number
): ImagePlacement {
  const width = clamp(placement.width * factor, MIN_IMAGE_WIDTH, MAX_IMAGE_WIDTH)
  const applied = width / placement.width
  const height = placement.height * applied

  return {
    x: placement.x + (placement.width - width) / 2,
    y: placement.y + (placement.height - height) / 2,
    width,
    height
  }
}

export function centerOf(placement: ImagePlacement): { x: number; y: number } {
  return { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
