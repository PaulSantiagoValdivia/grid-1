/**
 * VEW-7: what is on each page of a sheet. Pure: no file, no canvas. `pdf.ts` lays it out.
 *
 * Every figure comes from code that already exists, never from here: areas from `planAreas`,
 * heights from `floorElevations`, stairs from `planFacts`, findings from `checkPlan`. The
 * pictures are named, not drawn: a floor and its frame, or the model.
 */
import { floorElevations, planFloors, type Bounds } from '@ongrid/floorplan/geometry'
import { areaText, metresText, sumText } from '@ongrid/floorplan/geometry/rounding'
import type { SheetWords } from '@ongrid/floorplan/types/sheet'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { FRAME_MARGIN, fitTo } from '@ongrid/viewer/src/canvas2d/viewport'
import { pictureView, type PictureOptions } from '@ongrid/viewer/src/picture'
import { TEXT_PX } from '@ongrid/viewer/src/picture/look'
import { checkOnFloor, checkPlan, floorIssues, NOTHING_FOUND } from '../command/check'
import type { LoadedPlan } from '../command/plan'
import { describeText } from '../describe/card'
import { planFacts } from '../describe/facts'
import { quoted } from '../fs/projectFiles'
import { AREA_RULES, GROSS_NOT_KNOWN, planAreas, type FloorAreas } from '../quantities/areas'
import { surveyPlan } from '../quantities/survey'

export type SheetLayout = 'client' | 'check'
export const SHEET_LAYOUTS: readonly SheetLayout[] = ['client', 'check']
/** The drawing box on a floor page, in PDF points: what the frames are fitted to. */
export const PLAN_BOX = { width: 700, height: 640 } as const

/** The smallest a room name is printed, in points: below it a name on A3 can't be read. */
export const MIN_LABEL_PT = 5

/** `PLAN_BOX`'s shape in the fewest whole pixels. */
const SHAPE = (() => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(PLAN_BOX.width, PLAN_BOX.height)
  return { width: PLAN_BOX.width / g, height: PLAN_BOX.height / g }
})()

/**
 * How `pdf.ts` draws a floor page's picture: what it asks `drawPlan` for, and how many times
 * the box's size the picture is drawn at, centred on the box and cut to it.
 *
 * Labels are sized in pixels, so the picture has as many pixels as make one pixel measure what
 * it does in `grid draw`'s picture of the floor (`metresPerPixel`): each label is as large
 * against the rooms as there, and goes where `grid draw` puts it. Drawn at the box's own size,
 * labels were up to a few times larger and pushed into other rooms. Where `grid draw`'s zoom
 * would print a name under `MIN_LABEL_PT`, the zoom is the one that prints it at that size, and
 * the labels may go elsewhere than in `grid draw`; it also bounds the picture's width (at most
 * 1,820 pixels and one step). Pixels come whole and the
 * box keeps its shape, so the picture shows a little more than the frame (at most one step of
 * `SHAPE`) at the frame's scale; what is beyond the frame is cut, as it always was.
 */
export function planPictureOptions(picture: Extract<SheetPicture, { kind: 'plan' }>): { options: PictureOptions; grow: number } {
  const shown = fitTo(picture.frame, PLAN_BOX.width / PLAN_BOX.height)
  const steps = Math.max(1, Math.ceil(shown.width / picture.metresPerPixel / SHAPE.width))
  const width = steps * SHAPE.width
  const grow = (width * picture.metresPerPixel) / shown.width
  const { min, max } = picture.frame
  const cx = (min.x + max.x) / 2
  const cy = (min.y + max.y) / 2
  const w = picture.frame.width * grow
  const h = picture.frame.height * grow
  const frame: Bounds = { min: { x: cx - w / 2, y: cy - h / 2 }, max: { x: cx + w / 2, y: cy + h / 2 }, width: w, height: h }
  return {
    options: { floor: picture.floor, frame, width, height: steps * SHAPE.height, ...(picture.ids ? { labels: { ids: true } } : {}) },
    grow,
  }
}

export interface SheetFigure { readonly value: string; readonly label: string }
export interface SheetRow { readonly name: string; readonly detail: string | null; readonly area: string }
/**
 * `pdf.ts` may split a long table across pages: a part has no `total` until the part that holds
 * it, and no `note` until the part that holds that.
 */
export interface SheetTable { readonly heading: string; readonly rows: readonly SheetRow[]; readonly total: SheetRow | null; readonly note: string | null }
export type SheetPicture =
  /**
   * `frame` is what the box shows, in plan metres. `metresPerPixel` is what one pixel measures
   * in `grid draw`'s picture of the floor, or more where that would print names under
   * `MIN_LABEL_PT`: the zoom its labels are placed at (`planPictureOptions`).
   */
  | { readonly kind: 'plan'; readonly floor: string; readonly frame: Bounds; readonly metresPerPixel: number; readonly ids: boolean }
  | { readonly kind: 'model' }
export interface SheetPage {
  readonly kind: 'cover' | 'floor' | 'summary'
  /** The floor a floor page, or its continuation, is about; null on the cover and the summary. */
  readonly floor: string | null
  readonly topLine: string
  readonly title: string | null
  readonly subtitle: string | null
  readonly paragraphs: readonly string[]
  readonly figures: readonly SheetFigure[]
  readonly table: SheetTable | null
  readonly picture: SheetPicture | null
  readonly notes: readonly string[]
  readonly footer: { readonly label: string; readonly page: number; readonly pages: number; readonly date: string }
}
export interface Sheet { readonly layout: SheetLayout; readonly name: string; readonly pages: readonly SheetPage[] }
export interface SheetOptions { readonly name: string; readonly date: Date }

type Body = Omit<SheetPage, 'footer'>

/** What a client sheet always says it does not show. Grid's own words. */
export const CLIENT_LIMITS = 'Drawn from the plan alone. Furniture, stairs, structure, services and landscape are not shown.'
export const STAIR_LIMIT = 'Grid cannot show what a stair joins, so the way between floors is not checked.'
/** On a client floor page that leaves out a part Grid cannot draw (the check sheet lists it). */
export const LEFT_OUT_LIMIT = 'Some parts of the plan on this floor could not be drawn, and are not shown.'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function dateText(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * Each floor's frame, in plan metres with Y up, as `planPicture` takes it in `frame` (before
 * its margin). Every frame is sized so that `fitTo` grows it to the largest default view of
 * any floor, centred on that floor's own: drawn into boxes of one size, every floor page has
 * the same scale and nothing is cut off.
 */
export function floorFrames(loaded: LoadedPlan): ReadonlyMap<string, Bounds> {
  const views = planFloors(loaded.plan).map((floor) => ({
    floor: floor.id,
    view: pictureView(loaded.plan, { floor: floor.id, width: PLAN_BOX.width, height: PLAN_BOX.height }).view,
  }))
  const grow = 1 + 2 * FRAME_MARGIN
  const width = Math.max(...views.map((v) => v.view.width)) / grow
  const height = Math.max(...views.map((v) => v.view.height)) / grow
  return new Map(views.map(({ floor, view }) => {
    const cx = view.x + view.width / 2
    const cy = -(view.y + view.height / 2)
    const frame: Bounds = { min: { x: cx - width / 2, y: cy - height / 2 }, max: { x: cx + width / 2, y: cy + height / 2 }, width, height }
    return [floor, frame]
  }))
}

/** A floor page's picture, with the zoom of `grid draw`'s picture of that floor. */
function floorPicture(loaded: LoadedPlan, frames: ReadonlyMap<string, Bounds>, floor: string, ids: boolean): SheetPicture {
  const frame = frames.get(floor)!
  const drawn = pictureView(loaded.plan, { floor })
  // The zoom at which a room name is MIN_LABEL_PT on paper: pixels of a name, times metres per
  // pixel, times points per metre of the box. `grid draw`'s zoom stands unless it is smaller.
  const shown = fitTo(frame, PLAN_BOX.width / PLAN_BOX.height)
  const readable = (MIN_LABEL_PT * shown.width) / (TEXT_PX.roomName * PLAN_BOX.width)
  return { kind: 'plan', floor, frame, metresPerPixel: Math.max(drawn.view.width / drawn.width, readable), ids }
}

function areaTable(floor: FloorAreas, withUse: boolean): SheetTable {
  const shown = sumText(floor.rooms.map((r) => r.net), floor.net, 1)
  return {
    heading: 'Rooms / m²',
    rows: floor.rooms.map((room, i) => ({ name: room.name, detail: withUse ? room.use : null, area: shown.parts[i]! })),
    total: { name: 'Net area', detail: null, area: shown.total },
    note: AREA_RULES.net,
  }
}

/** Floor to floor, from the levels the 3D view stacks; one floor gives its clear height. */
function heightFigure(loaded: LoadedPlan): SheetFigure | null {
  const storeys = [...floorElevations(loaded.plan).floors.values()]
  const levels = [...new Set(storeys.map((s) => s.floorLevel))].sort((a, b) => a - b)
  if (levels.length < 2) {
    const only = storeys[0]
    return only ? { value: `${metresText(only.clearHeight)} m`, label: 'clear height' } : null
  }
  const steps = levels.slice(1).map((level, i) => level - levels[i]!)
  const low = Math.min(...steps)
  const high = Math.max(...steps)
  const value = metresText(low) === metresText(high) ? `${metresText(low)} m` : `${metresText(low)}–${metresText(high)} m`
  return { value, label: 'floor to floor' }
}

/** An area figure, or "not known" when the plan gives none (the reason goes in the notes). */
function areaFigure(value: number | null, label: string): SheetFigure {
  return { value: value === null ? 'not known' : `${areaText(value, 1)} m²`, label }
}

function clientBodies(loaded: LoadedPlan, words: SheetWords | null, name: string): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const facts = planFacts(loaded.plan)
  const bedrooms = loaded.plan.rooms.filter((room) => room.use === 'bedroom').length
  const title = words?.name ?? name
  const figures: SheetFigure[] = [areaFigure(areas.grossInternal, 'gross internal area')]
  figures.push({ value: String(floors.length), label: floors.length === 1 ? 'floor' : 'floors' })
  figures.push({ value: String(bedrooms), label: bedrooms === 1 ? 'bedroom' : 'bedrooms' })
  const height = heightFigure(loaded)
  if (height) figures.push(height)

  const limits = facts.stairRooms > 0 ? [CLIENT_LIMITS, STAIR_LIMIT] : [CLIENT_LIMITS]
  const cover: Body = {
    kind: 'cover', floor: null, topLine: title, title, subtitle: words?.headline ?? null,
    paragraphs: words?.intro ?? [], figures, table: null, picture: { kind: 'model' },
    notes: areas.grossInternal === null ? [GROSS_NOT_KNOWN] : [],
  }
  // Never an id here: floors that share a name are told apart by their place in the plan.
  const named = (name: string) => floors.filter((f) => f.name === name).length
  const pages = floors.map((floor, i): Body => {
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const leftOut = floorIssues(loaded, floor.id).some((issue) => loaded.broken.has(issue.id))
    const floorTitle = named(floor.name) > 1 ? `${floor.name}, floor ${i + 1}` : floor.name
    return {
      kind: 'floor', floor: floor.id, topLine: `${title} / ${floorTitle}`, title: floorTitle, subtitle: null,
      paragraphs: words?.floors?.[floor.id] ?? [], figures: [],
      table: floorAreas ? areaTable(floorAreas, false) : null,
      picture: floorPicture(loaded, frames, floor.id, false),
      notes: leftOut ? [...limits, LEFT_OUT_LIMIT] : limits,
    }
  })
  return [cover, ...pages]
}

function issueLine(issue: { severity: string; entity: string; id: string; message: string }): string {
  return `${issue.severity === 'error' ? 'Left out' : 'Worth a look'}, ${issue.entity} ${quoted(issue.id)}: ${issue.message}`
}

/** A finding, by the ids of the rooms and openings it names, as a drawing problem is by its own. */
export function findingLine(finding: { rooms: readonly string[]; openings: readonly string[]; message: string }): string {
  const ids = (one: string, list: readonly string[]): string[] =>
    list.length === 0 ? [] : [`${list.length === 1 ? one : `${one}s`} ${list.map(quoted).join(', ')}`]
  const named = [...ids('room', finding.rooms), ...ids('opening', finding.openings)]
  return named.length === 0 ? `Finding: ${finding.message}` : `Finding, ${named.join(', ')}: ${finding.message}`
}

function noticeLine(notice: { message: string }): string {
  return `Not checked: ${notice.message}`
}

function checkBodies(loaded: LoadedPlan, name: string): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const whole = checkPlan(loaded, {})
  const figures: SheetFigure[] = [
    { value: String(whole.report.findings.length), label: 'findings' },
    { value: String(whole.issues.length), label: 'problems in the drawing' },
    areaFigure(areas.net, 'net area'),
    areaFigure(areas.grossInternal, 'gross internal area'),
    areaFigure(areas.grossExternal, 'gross external area'),
  ]
  const summary: Body = {
    kind: 'summary', floor: null, topLine: `${name} / Check set`, title: 'Check set', subtitle: null,
    paragraphs: [describeText(planFacts(loaded.plan), 'line', 'person').trim()],
    figures, table: null, picture: null,
    notes: [
      ...(whole.report.findings.length === 0 ? [`Findings: none. ${NOTHING_FOUND}`] : []),
      AREA_RULES.net, AREA_RULES.grossInternal, AREA_RULES.grossExternal,
      ...(areas.grossInternal === null ? [GROSS_NOT_KNOWN] : []),
      // What belongs to no floor is said once, here; each floor page says the rest.
      ...whole.issues.filter((i) => i.entity === 'plan').map(issueLine),
      ...whole.report.notChecked.filter((n) => n.floor === '').map(noticeLine),
      ...whole.report.limits,
    ],
  }
  const pages = floors.map((floor): Body => {
    const result = checkOnFloor(loaded, whole, floor.id)
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const shown = [
      ...(result.report.findings.length === 0 ? [`Findings on this floor: none. ${NOTHING_FOUND}`] : []),
      ...result.report.findings.map(findingLine),
      ...result.issues.filter((i) => i.entity !== 'plan').map(issueLine),
      ...result.report.notChecked.filter((n) => n.floor !== '').map(noticeLine),
    ]
    // The floor's id, as each room's label carries the room's.
    const floorTitle = `${floor.name} [${floor.id}]`
    return {
      kind: 'floor', floor: floor.id, topLine: `${name} / ${floorTitle}`, title: floorTitle, subtitle: null,
      paragraphs: [], figures: [],
      table: floorAreas ? areaTable(floorAreas, true) : null,
      picture: floorPicture(loaded, frames, floor.id, true),
      notes: shown,
    }
  })
  return [summary, ...pages]
}

export function sheetPages(loaded: LoadedPlan, words: SheetWords | null, layout: SheetLayout, options: SheetOptions): Sheet {
  // A check sheet takes nothing from sheet.json, not even its name.
  const name = layout === 'client' ? words?.name ?? options.name : options.name
  const bodies = layout === 'client' ? clientBodies(loaded, words, options.name) : checkBodies(loaded, options.name)
  const date = dateText(options.date)
  const pages = bodies.map((body, i): SheetPage => ({
    ...body,
    footer: { label: GENERAL_GUIDANCE_LABEL, page: i + 1, pages: bodies.length, date },
  }))
  return { layout, name, pages }
}
