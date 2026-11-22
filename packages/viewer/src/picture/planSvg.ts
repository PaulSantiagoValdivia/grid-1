/**
 * A plan as a picture: one floor, drawn whole, as an SVG file.
 *
 * No browser, no running app and no stylesheet: the colours, line widths and font are written
 * on each element. The elements are the ones the app's 2D view draws for the same plan, size
 * and look (`planScene`), byte for byte; the file only adds its own `<svg>` root and a sheet
 * of paper behind them.
 *
 * Pure: no DOM, no React. For PNG, see `drawPlan` in the `ongrid` package.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Bounds, Dimension, PlanDrawing } from '@ongrid/floorplan/geometry'
import {
  boundsWithDimensions,
  buildDimensions,
  buildFloorPlan,
  planForFloor,
  resolveFloor,
  validateFloorDoorSweeps
} from '@ongrid/floorplan/geometry'
import type { DoorHanding } from '../canvas2d/doorHanding'
import type { LabelStyle } from '../canvas2d/labelPlacement'
import { doorHandingOf } from '../canvas2d/doorHanding'
import type { Viewport } from '../canvas2d/viewport'
import { fitTo, viewBoxOf } from '../canvas2d/viewport'
import type { PlanLook } from './look'
import { DARK_LOOK, LIGHT_LOOK } from './look'
import { planScene } from './scene'
import type { SvgNode } from './svgNode'
import { el, toSvg } from './svgNode'

export interface PictureOptions {
  /** Which floor to draw. Unset, or a floor the plan does not have, means its lowest floor. */
  readonly floor?: string | null
  /** Width in pixels. 1200 by default. */
  readonly width?: number
  /**
   * Height in pixels. By default it follows the floor's shape, between 0.4 and 2.5 times the
   * width, so the plan fills the picture.
   */
  readonly height?: number
  /** `light` (the default), `dark`, or colours of your own. */
  readonly look?: 'light' | 'dark' | PlanLook
  /** The overall and room dimensions. On by default. */
  readonly showDimensions?: boolean
  /** How the room tags read: capitals, room numbers, how the area is rounded. Plain by default. */
  readonly labels?: LabelStyle
  /**
   * The part of the floor to frame, in plan metres (VEW-6: a crop or a zoom onto one room). The
   * whole floor and its dimensions when left out. Labels and lines keep their size in pixels.
   */
  readonly frame?: Bounds
}

/** A picture before it is written out. */
export interface Picture {
  /** Size in pixels. */
  readonly width: number
  readonly height: number
  /** What part of the plan it shows, in plan metres with y down. */
  readonly view: Viewport
  readonly look: PlanLook
  /** How many rooms it draws, for the picture's description. */
  readonly rooms: number
  /** The plan's elements: exactly what the app's 2D view draws inside its `<svg>`. */
  readonly nodes: readonly SvgNode[]
}

export const DEFAULT_WIDTH = 1200
const MIN_SHAPE = 0.4
const MAX_SHAPE = 2.5

/** Which way each door of the plan opens, by opening id. */
export function handingsOf(plan: FloorPlan): Map<string, DoorHanding> {
  return new Map(plan.openings.map((opening) => [opening.id, doorHandingOf(opening)]))
}

/**
 * Doors whose swing runs into something (a wall, or another door), with what they say and
 * what they hit. The warnings that only say a value is missing are left out: that door has no
 * symbol, so there is nothing to point at.
 *
 * Only for the floor shown (QAR-7): `slice` is its `planForFloor` and `drawing` the
 * `buildFloorPlan(slice)` the view draws, so nothing is built twice and no other floor is checked.
 */
export function doorWarningsOf(
  slice: FloorPlan,
  drawing: PlanDrawing
): Map<string, { messages: string[]; hits: Set<string> }> {
  const byDoor = new Map<string, { messages: string[]; hits: Set<string> }>()
  for (const issue of validateFloorDoorSweeps(slice, drawing, doorHandingOf)) {
    if (issue.hits.length === 0) continue
    const entry = byDoor.get(issue.id) ?? { messages: [], hits: new Set<string>() }
    if (!entry.messages.includes(issue.message)) entry.messages.push(issue.message)
    issue.hits.forEach((id) => entry.hits.add(id))
    byDoor.set(issue.id, entry)
  }
  return byDoor
}

/** What a door's warning mark says: all its messages, in one line. */
export function warningMessages(
  warnings: ReadonlyMap<string, { readonly messages: readonly string[] }>
): Map<string, string> {
  return new Map([...warnings].map(([id, { messages }]) => [id, messages.join(' ')]))
}

/** What a plan view frames: the drawing and its dimensions, which sit outside the walls. */
export function framingOf(drawing: PlanDrawing, dimensions: readonly Dimension[]): Bounds {
  return boundsWithDimensions(drawing, dimensions)
}

function lookOf(look: PictureOptions['look']): PlanLook {
  if (look === undefined || look === 'light') return LIGHT_LOOK
  if (look === 'dark') return DARK_LOOK
  return look
}

function pixels(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`The picture's ${name} must be a whole number of pixels, at least 1: got ${value}`)
  }
  return value
}

/** The size of the picture: as asked, or a width with a height that follows the plan. */
function sizeOf(framed: Bounds, options: PictureOptions): { width: number; height: number } {
  const width = pixels('width', options.width ?? DEFAULT_WIDTH)
  if (options.height !== undefined) return { width, height: pixels('height', options.height) }
  const shape = framed.width > 0 && framed.height > 0 ? framed.height / framed.width : 0.75
  const clamped = Math.min(Math.max(shape, MIN_SHAPE), MAX_SHAPE)
  return { width, height: Math.max(1, Math.round(width * clamped)) }
}

function framePicture(plan: FloorPlan, options: PictureOptions) {
  const slice = planForFloor(plan, resolveFloor(plan, options.floor))
  const drawing = buildFloorPlan(slice)
  const dimensions = options.showDimensions === false ? [] : buildDimensions(drawing)
  const framed = options.frame ?? framingOf(drawing, dimensions)
  const { width, height } = sizeOf(framed, options)
  return { slice, drawing, dimensions, width, height, view: fitTo(framed, width / height) }
}

/**
 * The size of the picture `planPicture` makes with these options, and the part of the plan it
 * shows, without drawing it: no labels are placed, so it is quick on a large plan.
 */
export function pictureView(plan: FloorPlan, options: PictureOptions = {}): Pick<Picture, 'width' | 'height' | 'view'> {
  const { width, height, view } = framePicture(plan, options)
  return { width, height, view }
}

/** Lays out one floor of a plan as a picture, framed the way the 2D view frames it. */
export function planPicture(plan: FloorPlan, options: PictureOptions = {}): Picture {
  const { slice, drawing, dimensions, width, height, view } = framePicture(plan, options)
  const look = lookOf(options.look)
  const nodes = planScene({
    drawing,
    handings: handingsOf(slice),
    doorWarnings: warningMessages(doorWarningsOf(slice, drawing)),
    dimensions,
    metersPerPixel: view.width / width,
    look,
    labels: options.labels
  })
  return { width, height, view, look, rooms: drawing.rooms.length, nodes }
}

/**
 * The picture as an SVG file. `scale` multiplies its size in pixels and nothing else: the
 * drawing is the same, only finer.
 */
export function pictureToSvg(picture: Picture, scale = 1): string {
  const { view, look } = picture
  const paper = el('rect', {
    'data-part': 'paper',
    x: view.x,
    y: view.y,
    width: view.width,
    height: view.height,
    fill: look.paper
  })
  const root = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: Math.round(picture.width * scale),
      height: Math.round(picture.height * scale),
      viewBox: viewBoxOf(view),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': `Floor plan with ${picture.rooms} rooms`
    },
    [paper, ...picture.nodes]
  )
  return `${toSvg(root)}\n`
}

/**
 * One floor of a plan as an SVG file, with its colours, line widths and font written in.
 *
 * ```ts
 * const svg = planToSvg(plan, { floor: 'ground', width: 1600 })
 * ```
 */
export function planToSvg(plan: FloorPlan, options: PictureOptions = {}): string {
  return pictureToSvg(planPicture(plan, options))
}
