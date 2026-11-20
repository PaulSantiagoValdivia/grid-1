/**
 * `grid draw <plan>`: one floor as an SVG picture, or as a PNG with `--png`, through `drawPlan`.
 * Written to `--out`, or to standard output when no file is named.
 */
import { drawPlan } from '../draw/drawPlan'
import { floorOption, type LoadedPlan } from './plan'
import { UsageError, type OptionSpecs } from './options'

export const DRAW_OPTIONS: OptionSpecs = {
  '--png': { takesValue: false, help: 'Draw a PNG instead of an SVG.' },
  '--out': { takesValue: true, help: 'The file to write, ending in .svg (or .png with --png). Standard output when left out.' },
  '--floor': { takesValue: true, help: 'The floor to draw (a floor id from the plan). The lowest floor when left out.' },
  '--scale': { takesValue: true, help: 'PNG only: pixels per picture pixel, above 0 and up to 8. 1 when left out.' },
}

export const MAX_SCALE = 8

export interface DrawRequest {
  readonly png: boolean
  readonly out?: string
  readonly floor?: string
  readonly scale?: string
}

/** Checks the options against each other, before the plan is read. */
export function checkDrawRequest(request: DrawRequest): { scale: number } {
  const extension = request.png ? '.png' : '.svg'
  if (request.out !== undefined && !request.out.toLowerCase().endsWith(extension)) {
    const hint = request.png ? 'name a .png file' : request.out.toLowerCase().endsWith('.png') ? 'add --png, or name a .svg file' : 'name a .svg file'
    throw new UsageError(`--out ${JSON.stringify(request.out)} does not end in ${extension}: ${hint}.`)
  }
  if (request.scale === undefined) return { scale: 1 }
  if (!request.png) throw new UsageError('--scale only applies to a PNG: add --png, or leave --scale out.')
  const scale = Number(request.scale)
  if (!/^\d*\.?\d+$/.test(request.scale) || !(scale > 0) || scale > MAX_SCALE) {
    throw new UsageError(`--scale takes a number above 0 and up to ${MAX_SCALE}: got ${JSON.stringify(request.scale)}.`)
  }
  return { scale }
}

export async function drawFile(loaded: LoadedPlan, request: DrawRequest, scale: number): Promise<string | Uint8Array> {
  const floor = floorOption(loaded.plan, request.floor)
  return request.png
    ? drawPlan(loaded.plan, { format: 'png', floor, scale })
    : drawPlan(loaded.plan, { format: 'svg', floor })
}
