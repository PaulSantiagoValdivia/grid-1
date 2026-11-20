/**
 * `grid draw <plan>`: one floor as an SVG picture, or as a PNG with `--png`, through `drawPlan`.
 * With `--3d`, the 3D model as the app opens it, as a PNG, through `drawStill`.
 * Written to `--out`, or to standard output when no file is named.
 */
import { drawPlan } from '../draw/drawPlan'
import { floorOption, type LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

export const DRAW_OPTIONS: OptionSpecs = {
  '--png': { takesValue: false, help: 'Draw a PNG instead of an SVG.' },
  '--3d': { takesValue: false, help: 'Draw the 3D model as the app opens it, as a PNG of 1200 by 800 pixels.' },
  '--out': { takesValue: true, help: 'The file to write, inside the project, ending in .svg (or .png with --png or --3d). Standard output when left out.' },
  '--floor': { takesValue: true, help: 'The floor to draw (a floor id from the plan). The lowest floor when left out. With --3d, that floor as a cutaway; the whole building when left out.' },
  '--scale': { takesValue: true, help: 'PNG only: pixels per picture pixel, above 0 and up to 8 (up to 4 with --3d). 1 when left out.' },
  ...PROJECT_OPTION,
}

export const MAX_SCALE = 8
/** A 3D still is drawn pixel by pixel in memory: 4 makes it 4800 by 3200. */
export const MAX_SCALE_3D = 4

export interface DrawRequest {
  readonly png: boolean
  /** The 3D model instead of a floor plan. */
  readonly threeD?: boolean
  readonly out?: string
  readonly floor?: string
  readonly scale?: string
}

/** Checks the options against each other, before the plan is read. */
export function checkDrawRequest(request: DrawRequest): { scale: number } {
  // A still is always a PNG, so --png would say nothing.
  if (request.threeD && request.png) throw new UsageError('--png does nothing with --3d, which always draws a PNG: leave --png out.')
  const png = request.png || request.threeD === true
  const extension = png ? '.png' : '.svg'
  if (request.out !== undefined && !request.out.toLowerCase().endsWith(extension)) {
    const hint = png ? 'name a .png file' : request.out.toLowerCase().endsWith('.png') ? 'add --png, or name a .svg file' : 'name a .svg file'
    throw new UsageError(`--out ${JSON.stringify(request.out)} does not end in ${extension}: ${hint}.`)
  }
  if (request.scale === undefined) return { scale: 1 }
  if (!png) throw new UsageError('--scale only applies to a PNG: add --png or --3d, or leave --scale out.')
  const max = request.threeD ? MAX_SCALE_3D : MAX_SCALE
  const scale = Number(request.scale)
  if (!/^\d*\.?\d+$/.test(request.scale) || !(scale > 0) || scale > max) {
    throw new UsageError(`--scale takes a number above 0 and up to ${max}${request.threeD ? ' with --3d' : ''}: got ${JSON.stringify(request.scale)}.`)
  }
  return { scale }
}

export async function drawFile(loaded: LoadedPlan, request: DrawRequest, scale: number): Promise<string | Uint8Array> {
  const floor = floorOption(loaded.plan, request.floor)
  if (request.threeD) {
    // Loaded only for a still: it brings Three and React with it.
    const { drawStill } = await import('../draw/drawStill')
    return drawStill(loaded.plan, { focus: floor ?? null, scale })
  }
  return request.png
    ? drawPlan(loaded.plan, { format: 'png', floor, scale })
    : drawPlan(loaded.plan, { format: 'svg', floor })
}
