/**
 * The canvas viewport: which part of the plan is being looked at.
 *
 * It works in "plan screen coordinates": the model's own units (meters) but
 * with Y growing downwards, which is how SVG works. The flip happens here and
 * nowhere else.
 */

import type { Bounds, Vec2 } from '@ongrid/floorplan/geometry'

/** From the model (Y up) to SVG (Y down). */
export function toScreen(p: Vec2): Vec2 {
  return { x: p.x, y: -p.y }
}

export function pathOf(points: readonly Vec2[]): string {
  if (points.length === 0) return ''
  return `M${points.map((p) => `${p.x.toFixed(4)},${(-p.y).toFixed(4)}`).join('L')}Z`
}

/**
 * A room's outline and its holes (ARE-6) as one path. The holes wind the other way round from
 * the outline, so they stay open under either fill rule. A room with no holes is its outline.
 */
export function roomPathOf(room: { readonly polygon: readonly Vec2[]; readonly holes?: readonly (readonly Vec2[])[] }): string {
  return pathOf(room.polygon) + (room.holes ?? []).map(pathOf).join('')
}

export interface Viewport {
  /** Top-left corner, in plan screen coordinates. */
  readonly x: number
  readonly y: number
  /** Width and height of what is visible, in meters. */
  readonly width: number
  readonly height: number
}

export function viewBoxOf(view: Viewport): string {
  return `${view.x} ${view.y} ${view.width} ${view.height}`
}

/** Zoom limits, as visible width in meters. */
const MIN_SPAN = 0.5
const MAX_SPAN = 400

/**
 * Frames the whole plan with a margin, honouring the container's aspect ratio
 * so nothing gets stretched.
 */
/** How much room a framed view leaves round the plan on each side, as a share of its size. */
export const FRAME_MARGIN = 0.08

export function fitTo(bounds: Bounds, aspect: number, margin = FRAME_MARGIN): Viewport {
  const width = Math.max(bounds.width, 0.001)
  const height = Math.max(bounds.height, 0.001)

  // The plan has Y up; on screen its top becomes the minimum.
  const top = -bounds.max.y

  let spanX = width * (1 + margin * 2)
  let spanY = height * (1 + margin * 2)

  if (spanX / spanY < aspect) spanX = spanY * aspect
  else spanY = spanX / aspect

  return {
    x: bounds.min.x - (spanX - width) / 2,
    y: top - (spanY - height) / 2,
    width: spanX,
    height: spanY
  }
}

/**
 * A viewport two canvases can share: the centre of the view in plan
 * coordinates (Y up, like the model) and how many meters wide it is.
 *
 * It has no height on purpose. The height is the width over the canvas's own
 * aspect ratio, so two canvases of different shapes given one value show the same
 * centre and the same width; sharing a whole `Viewport` would make each correct
 * the height and report back something other than what it was given.
 */
export interface SharedViewport {
  readonly center: Vec2
  readonly width: number
}

/** What a canvas with this aspect ratio (width over height) shows for a shared viewport. */
export function viewportFrom(shared: SharedViewport, aspect: number): Viewport {
  const height = shared.width / aspect
  return {
    x: shared.center.x - shared.width / 2,
    // The plan has Y up and the screen Y down, so the flip happens here.
    y: 0 - shared.center.y - height / 2,
    width: shared.width,
    height
  }
}

/** The shared form of what a canvas is showing. */
export function sharedFrom(view: Viewport): SharedViewport {
  return {
    center: { x: view.x + view.width / 2, y: 0 - (view.y + view.height / 2) },
    width: view.width
  }
}

/**
 * The shared viewport that frames some bounds in a canvas of this aspect ratio:
 * `fitTo`, in the shared form, so a caller can compute the first one. It does not
 * clamp to the zoom limits, because a plan wider than the maximum span still has
 * to fit.
 */
export function viewportFitting(bounds: Bounds, aspect: number, margin = 0.08): SharedViewport {
  return sharedFrom(fitTo(bounds, aspect, margin))
}

/** The plan point under a cursor position inside the element. */
export function unproject(
  view: Viewport,
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): Vec2 {
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.width,
    y: view.y + ((clientY - rect.top) / rect.height) * view.height
  }
}

/**
 * Zooms in or out keeping the point under the cursor still. That is what makes
 * zooming feel natural instead of jumping to the center.
 */
export function zoomAt(view: Viewport, anchor: Vec2, factor: number): Viewport {
  const width = clamp(view.width * factor, MIN_SPAN, MAX_SPAN)
  const scale = width / view.width
  const height = view.height * scale

  return {
    x: anchor.x - (anchor.x - view.x) * scale,
    y: anchor.y - (anchor.y - view.y) * scale,
    width,
    height
  }
}

export function pan(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, x: view.x - dx, y: view.y - dy }
}

/** Keeps the aspect ratio right when the container is resized. */
export function reframe(view: Viewport, aspect: number): Viewport {
  const height = view.width / aspect
  return { ...view, y: view.y + (view.height - height) / 2, height }
}

/** Whether the view shows all of `bounds` (plan coordinates, Y up). */
export function contains(view: Viewport, bounds: Bounds): boolean {
  return (
    view.x <= bounds.min.x &&
    view.x + view.width >= bounds.max.x &&
    view.y <= -bounds.max.y &&
    view.y + view.height >= -bounds.min.y
  )
}

/**
 * The smallest zoom-out of `view` that also shows `bounds`, with a margin, at
 * the container's aspect ratio. It only ever grows the view: whatever was in
 * sight stays in sight.
 */
export function cover(view: Viewport, bounds: Bounds, aspect: number, margin = 0.08): Viewport {
  const padX = Math.max(bounds.width, 0.001) * margin
  const padY = Math.max(bounds.height, 0.001) * margin
  const x0 = Math.min(view.x, bounds.min.x - padX)
  const x1 = Math.max(view.x + view.width, bounds.max.x + padX)
  const y0 = Math.min(view.y, -bounds.max.y - padY)
  const y1 = Math.max(view.y + view.height, -bounds.min.y + padY)

  let width = x1 - x0
  let height = y1 - y0
  if (width / height < aspect) width = height * aspect
  else height = width / aspect

  return {
    x: (x0 + x1) / 2 - width / 2,
    y: (y0 + y1) / 2 - height / 2,
    width,
    height
  }
}

/** The view `t` of the way from `a` to `b`. */
export function lerpView(a: Viewport, b: Viewport, t: number): Viewport {
  const mix = (p: number, q: number) => p + (q - p) * t
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    width: mix(a.width, b.width),
    height: mix(a.height, b.height)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
