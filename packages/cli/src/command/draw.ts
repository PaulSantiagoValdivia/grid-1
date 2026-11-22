/**
 * `grid draw <plan>`: one floor as an SVG picture, or as a PNG with `--png`, through `drawPlan`,
 * in the technical look, as a file to hand on, unless `--look` names another (SHT-1), with what went wrong marked on it by the numbers
 * `grid check` gives, and listed under it (MSG-8), and the plan's title, notes, key and sketch
 * (SHT-7); `--hide`, `--colour` and `--key` choose what it shows.
 * With `--3d`, the 3D model as the app opens it, as a PNG, through `drawStill`; with `--view`, a
 * view saved with the plan (VEW-3), through its camera record. With `--section`, a section along a
 * line through every floor, through `drawSection` (LVL-9); `--marks` adds the marks for the plan's
 * other drawings to a floor plan.
 * Written to `--out`, or to standard output when no file is named.
 */
import { DISPLAY_UNITS, displayFor } from '../quantities/units'
import { LOOK_NAMES, type LookName } from '@ongrid/viewer/src/picture/look'
import { inspectPlan } from '@ongrid/rules'
import { cameraRecord, findView, viewSetting } from '@ongrid/floorplan/geometry'
import { drawPlan } from '../draw/drawPlan'
import { planPicture } from '@ongrid/viewer/src/picture'
import { drawShowOf } from './drawShow'
import { floorOption, type LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'
import type { SectionLine } from '@ongrid/floorplan/geometry/section'
import type { DrawingMarksAsked } from '@ongrid/floorplan/geometry/drawingMarks'
import { marksAsked, readMarks, readSectionOption, towardOf } from './section'

export const DRAW_OPTIONS: OptionSpecs = {
  '--png': { takesValue: false, help: 'Draw a PNG instead of an SVG.' },
  '--3d': { takesValue: false, help: 'Draw the 3D model as the app opens it, as a PNG of 1200 by 800 pixels.' },
  '--view': { takesValue: true, help: 'Draw a view saved with the plan (grid_save_view), by name: the 3D model through its camera, as a PNG of 1200 by 800 pixels.' },
  '--out': { takesValue: true, help: 'The file to write, inside the project, ending in .svg (or .png with --png or --3d). Standard output when left out.' },
  '--floor': { takesValue: true, help: 'The floor to draw (a floor id from the plan). The lowest floor when left out. With --3d, that floor as a cutaway; the whole building when left out.' },
  '--look': { takesValue: true, help: 'How the plan is drawn: technical (the default: black on white, lines in millimetres on paper), working (as on screen) or dark. Not with --3d.' },
  '--hide': { takesValue: true, help: 'Parts to leave off, joined by commas: title, key, notes, sketch, dimensions, areas, swings, warnings, above (the dashed outline of the floor above). Not with --3d.' },
  '--colour': { takesValue: true, help: 'use: fill each room by its use, with the uses in the key. Not with --3d.' },
  '--key': { takesValue: false, help: 'Add a key under the drawing, even where the plan asks for none. Not with --3d.' },
  '--ids': { takesValue: false, help: 'The check view: draw the id of every room, door and window, as the plan file holds them. Not with --3d.' },
  '--scale': { takesValue: true, help: 'PNG only: pixels per picture pixel, above 0 and up to 8 (up to 4 with --3d). 1 when left out.' },
  '--units': { takesValue: true, help: 'How areas and dimensions are written: m, cm, mm or ft-in. The plan\'s own display, or m, when left out. Not with --3d.' },
  '--decimal': { takesValue: true, help: 'The decimal mark: point or comma. The plan\'s own display, or point, when left out.' },
  '--section': { takesValue: true, help: 'Draw a section instead of a floor plan: the line to cut along, x1,y1:x2,y2 in metres, through every floor, with its levels and room heights, and what it takes that the plan does not state hatched and listed. Not with --3d.' },
  '--toward': { takesValue: true, help: 'With --section: the side of the line the section looks toward, walking from its first point to its second: left (the default) or right.' },
  '--marks': { takesValue: true, help: 'Marks to add to a floor plan, joined by commas: levels (each room\'s floor level), elevations (where each side of the building is seen from), section (the line of --section and the way it looks, on the plan, instead of drawing the section). Not with --3d.' },
  ...PROJECT_OPTION,
}

export const MAX_SCALE = 8
/** A 3D still is drawn pixel by pixel in memory: 4 makes it 4800 by 3200. */
export const MAX_SCALE_3D = 4

export interface DrawRequest {
  readonly png: boolean
  /** The 3D model instead of a floor plan. */
  readonly threeD?: boolean
  /** VEW-3: a saved view's name: the 3D model through its camera. */
  readonly view?: string
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
  /** SHT-7: the parts to leave off, as given: words joined by commas. */
  readonly hide?: string
  /** SHT-7: how rooms are filled, as given. */
  readonly colour?: string
  /** SHT-7: add a key the plan does not ask for. */
  readonly key?: boolean
  /** LVL-9: the line to cut a section along, as given (`x1,y1:x2,y2`). */
  readonly section?: string
  /** LVL-9: the side the section looks toward, as given. */
  readonly toward?: string
  /** LVL-9: the marks to add to a floor plan, as given: words joined by commas. */
  readonly marks?: string
}

/** LVL-9: what `--section`, `--toward` and `--marks` ask for, read. */
export interface SectionAsked {
  /** The section to draw, when the picture is a section. */
  readonly section: SectionLine | null
  /** The marks on a floor plan, when any are asked for. */
  readonly marks: DrawingMarksAsked | null
}

/** What a drawn file is: a picture file's text or bytes, and the doors drawn as undecided. */
export interface DrawnFile {
  readonly file: string | Uint8Array
  readonly undecidedDoors: readonly string[]
  /** LVL-9: what a section took that the plan does not state, for standard error, when the file is one. */
  readonly sectionNote?: string | null
}

/** The look `grid draw` uses when none is named: a file to hand on. */
export const DRAW_LOOK: LookName = 'technical'

/**
 * LVL-9: reads `--section`, `--toward` and `--marks`, and refuses, by name, an option that means
 * nothing with them: a section cuts every floor and has no plan labels, keys or ids.
 */
export function sectionAsked(request: DrawRequest): SectionAsked {
  if (request.toward !== undefined && request.section === undefined) throw new UsageError('--toward says which way a section looks: add --section, or leave --toward out.')
  const words = request.marks === undefined ? null : readMarks(request.marks.split(',').map((w) => w.trim()).filter((w) => w.length > 0))
  for (const [given, flag] of [[request.section, '--section'], [request.marks, '--marks']] as const) {
    if (request.view !== undefined && given !== undefined) throw new UsageError(`${flag} is for a drawing, not a saved view of the 3D model: leave ${flag} or --view out.`)
    if (request.threeD && given !== undefined) throw new UsageError(`${flag} is for a drawing, not the 3D model: leave ${flag} or --3d out.`)
  }
  if (words?.has('section') && request.section === undefined) throw new UsageError('--marks section draws the line of a section on the plan: add --section with the line, or leave section out of --marks.')
  const line = request.section === undefined ? null : readSectionOption(request.section, towardOf(request.toward))
  if (line !== null && !words?.has('section')) {
    if (words !== null) throw new UsageError('--marks marks a floor plan, and --section draws a section: add section to --marks to draw the plan with the section\'s line on it, or leave --marks out.')
    for (const [given, flag] of [[request.floor, '--floor'], [request.hide, '--hide'], [request.colour, '--colour'], [request.key || undefined, '--key'], [request.ids || undefined, '--ids'], [request.units, '--units'], [request.decimal, '--decimal']] as const) {
      if (given !== undefined) throw new UsageError(`${flag} is for a floor plan; a section cuts every floor and writes its levels in metres: leave ${flag} or --section out.`)
    }
    return { section: line, marks: null }
  }
  return { section: null, marks: words === null ? null : marksAsked(words, line) }
}

/** Checks the options against each other, before the plan is read. */
export function checkDrawRequest(request: DrawRequest): { scale: number; look: LookName } {
  if (request.view !== undefined && request.floor !== undefined) throw new UsageError('--view draws the floors its camera was saved with: leave --floor or --view out.')
  // A still is always a PNG, so --png would say nothing.
  if (request.threeD && request.png) throw new UsageError('--png does nothing with --3d, which always draws a PNG: leave --png out.')
  if (request.threeD && request.ids) throw new UsageError('--ids draws the ids on a floor plan, not on the 3D model: leave --ids or --3d out.')
  if (request.threeD && request.look !== undefined) throw new UsageError('--look is for a floor plan, not the 3D model: leave --look or --3d out.')
  if (request.threeD && (request.units !== undefined || request.decimal !== undefined)) throw new UsageError('--units and --decimal write the labels of a floor plan, not the 3D model: leave them or --3d out.')
  if (request.units !== undefined && !(DISPLAY_UNITS as readonly string[]).includes(request.units)) throw new UsageError(`--units takes one of ${DISPLAY_UNITS.join(', ')}.`)
  if (request.decimal !== undefined && request.decimal !== 'point' && request.decimal !== 'comma') throw new UsageError('--decimal takes point or comma.')
  for (const [given, flag] of [[request.hide, '--hide'], [request.colour, '--colour'], [request.key || undefined, '--key']] as const) {
    if (request.threeD && given !== undefined) throw new UsageError(`${flag} is for a floor plan, not the 3D model: leave ${flag} or --3d out.`)
  }
  drawShowOf(request)
  sectionAsked(request)
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
  const asked = sectionAsked(request)
  if (asked.section !== null) {
    // Loaded only for a section.
    const { drawSection } = await import('../draw/drawSection')
    const drawn = await drawSection(loaded.plan, asked.section, request.png ? { format: 'png', look, scale } : { format: 'svg', look })
    return { file: drawn.file, undecidedDoors: [], sectionNote: drawn.note }
  }
  const floor = floorOption(loaded.plan, request.floor)
  if (request.view !== undefined) {
    const saved = findView(loaded.plan.views, request.view)
    if (saved === null) {
      const names = (loaded.plan.views ?? []).slice(0, 20).map((v) => JSON.stringify(v.name))
      throw new UsageError(`--view names no view saved with this plan. ${names.length === 0 ? 'It has no saved views.' : `Its views: ${names.join(', ')}.`}`)
    }
    const { drawStill } = await import('../draw/drawStill')
    return { file: await drawStill(loaded.plan, { camera: cameraRecord(loaded.plan, viewSetting(saved)), scale }), undecidedDoors: [] }
  }
  if (request.threeD) {
    // Loaded only for a still: it brings Three and React with it.
    const { drawStill } = await import('../draw/drawStill')
    return { file: await drawStill(loaded.plan, { focus: floor ?? null, scale }), undecidedDoors: [] }
  }
  const display = request.units === undefined && request.decimal === undefined ? undefined : displayFor(request.units, request.decimal, loaded.plan)
  const labels = { ...(request.ids || display ? { labels: { ...(request.ids ? { ids: true } : {}), ...(display ? { display } : {}) } } : {}), ...drawShowOf(request), ...(asked.marks === null ? {} : { marks: asked.marks }) }
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

