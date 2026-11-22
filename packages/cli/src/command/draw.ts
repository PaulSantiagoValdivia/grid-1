/**
 * `grid draw <plan>`: one floor as an SVG picture, or as a PNG with `--png`, through `drawPlan`,
 * in the technical look, as a file to hand on, unless `--look` names another (SHT-1), with what went wrong marked on it by the numbers
 * `grid check` gives, and listed under it (MSG-8).
 * With `--3d`, the 3D model as the app opens it, as a PNG, through `drawStill`.
 * Written to `--out`, or to standard output when no file is named.
 */
import { DISPLAY_UNITS, displayFor } from '../quantities/units'
import { LOOK_NAMES, type LookName } from '@ongrid/viewer/src/picture/look'
import { inspectPlan } from '@ongrid/rules'
import { drawPlan } from '../draw/drawPlan'
import { planPicture } from '@ongrid/viewer/src/picture'
import { floorOption, type LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

export const DRAW_OPTIONS: OptionSpecs = {
  '--png': { takesValue: false, help: 'Draw a PNG instead of an SVG.' },
  '--3d': { takesValue: false, help: 'Draw the 3D model as the app opens it, as a PNG of 1200 by 800 pixels.' },
  '--out': { takesValue: true, help: 'The file to write, inside the project, ending in .svg (or .png with --png or --3d). Standard output when left out.' },
  '--floor': { takesValue: true, help: 'The floor to draw (a floor id from the plan). The lowest floor when left out. With --3d, that floor as a cutaway; the whole building when left out.' },
  '--look': { takesValue: true, help: 'How the plan is drawn: technical (the default: black on white, lines in millimetres on paper), working (as on screen) or dark. Not with --3d.' },
  '--ids': { takesValue: false, help: 'The check view: draw the id of every room, door and window, as the plan file holds them. Not with --3d.' },
  '--scale': { takesValue: true, help: 'PNG only: pixels per picture pixel, above 0 and up to 8 (up to 4 with --3d). 1 when left out.' },
  '--units': { takesValue: true, help: 'How areas and dimensions are written: m, cm, mm or ft-in. The plan\'s own display, or m, when left out. Not with --3d.' },
  '--decimal': { takesValue: true, help: 'The decimal mark: point or comma. The plan\'s own display, or point, when left out.' },
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
  /** The check view: every room, door and window carries its id (VEW-2). */
  readonly ids?: boolean
  /** The look's name, as given. */
  readonly look?: string
  /** WRT-7: the display's unit and decimal mark, as given. */
  readonly units?: string
  readonly decimal?: string
}

/** What a drawn file is: a picture file's text or bytes, and the doors drawn as undecided. */
export interface DrawnFile {
  readonly file: string | Uint8Array
  readonly undecidedDoors: readonly string[]
}

/** The look `grid draw` uses when none is named: a file to hand on. */
export const DRAW_LOOK: LookName = 'technical'

/** Checks the options against each other, before the plan is read. */
export function checkDrawRequest(request: DrawRequest): { scale: number; look: LookName } {
  // A still is always a PNG, so --png would say nothing.
  if (request.threeD && request.png) throw new UsageError('--png does nothing with --3d, which always draws a PNG: leave --png out.')
  if (request.threeD && request.ids) throw new UsageError('--ids draws the ids on a floor plan, not on the 3D model: leave --ids or --3d out.')
  if (request.threeD && request.look !== undefined) throw new UsageError('--look is for a floor plan, not the 3D model: leave --look or --3d out.')
  if (request.threeD && (request.units !== undefined || request.decimal !== undefined)) throw new UsageError('--units and --decimal write the labels of a floor plan, not the 3D model: leave them or --3d out.')
  if (request.units !== undefined && !(DISPLAY_UNITS as readonly string[]).includes(request.units)) throw new UsageError(`--units takes one of ${DISPLAY_UNITS.join(', ')}.`)
  if (request.decimal !== undefined && request.decimal !== 'point' && request.decimal !== 'comma') throw new UsageError('--decimal takes point or comma.')
  const look = (request.look ?? DRAW_LOOK) as LookName
  if (!(LOOK_NAMES as readonly string[]).includes(look)) {
    throw new UsageError(`--look ${JSON.stringify(request.look)} is not a look Grid draws: use one of ${LOOK_NAMES.join(', ')}.`)
  }
  const png = request.png || request.threeD === true
  const extension = png ? '.png' : '.svg'
  if (request.out !== undefined && !request.out.toLowerCase().endsWith(extension)) {
    const hint = png ? 'name a .png file' : request.out.toLowerCase().endsWith('.png') ? 'add --png, or name a .svg file' : 'name a .svg file'
    throw new UsageError(`--out ${JSON.stringify(request.out)} does not end in ${extension}: ${hint}.`)
  }
  if (request.scale === undefined) return { scale: 1, look }
  if (!png) throw new UsageError('--scale only applies to a PNG: add --png or --3d, or leave --scale out.')
  const max = request.threeD ? MAX_SCALE_3D : MAX_SCALE
  const scale = Number(request.scale)
  if (!/^\d*\.?\d+$/.test(request.scale) || !(scale > 0) || scale > max) {
    throw new UsageError(`--scale takes a number above 0 and up to ${max}${request.threeD ? ' with --3d' : ''}: got ${JSON.stringify(request.scale)}.`)
  }
  return { scale, look }
}

export async function drawFile(loaded: LoadedPlan, request: DrawRequest, scale: number, look: LookName = DRAW_LOOK): Promise<DrawnFile> {
  const floor = floorOption(loaded.plan, request.floor)
  if (request.threeD) {
    // Loaded only for a still: it brings Three and React with it.
    const { drawStill } = await import('../draw/drawStill')
    return { file: await drawStill(loaded.plan, { focus: floor ?? null, scale }), undecidedDoors: [] }
  }
  const display = request.units === undefined && request.decimal === undefined ? undefined : displayFor(request.units, request.decimal, loaded.plan)
  const labels = request.ids || display ? { labels: { ...(request.ids ? { ids: true } : {}), ...(display ? { display } : {}) } } : {}
  // What went wrong, numbered as `grid check` numbers it, marked on the drawing (MSG-8).
  const faults = inspectPlan(loaded.plan).lines
  const undecidedDoors = planPicture(loaded.plan, { floor, look, ...labels }).undecidedDoors
  const file = request.png
    ? await drawPlan(loaded.plan, { format: 'png', floor, scale, look, faults, ...labels })
    : await drawPlan(loaded.plan, { format: 'svg', floor, look, faults, ...labels })
  return { file, undecidedDoors }
}

/** The line `grid draw` prints on standard error for doors drawn as undecided, or `null`. */
export function undecidedNote(ids: readonly string[]): string | null {
  if (ids.length === 0) return null
  const list = ids.map((id) => JSON.stringify(id)).join(', ')
  return `Drew ${ids.length === 1 ? 'a door' : `${ids.length} doors`} with no stated swing as undecided, a dashed line and "?": ${list}. Set each one's hinge and swing in the plan.\n`
}
