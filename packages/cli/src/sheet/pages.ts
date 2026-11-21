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
import { FRAME_MARGIN } from '@ongrid/viewer/src/canvas2d/viewport'
import { planPicture } from '@ongrid/viewer/src/picture'
import { checkPlan, floorIssues } from '../command/check'
import type { LoadedPlan } from '../command/plan'
import { describeText } from '../describe/card'
import { planFacts } from '../describe/facts'
import { quoted } from '../fs/projectFiles'
import { AREA_RULES, planAreas, type FloorAreas } from '../quantities/areas'
import { surveyPlan } from '../quantities/survey'

export type SheetLayout = 'client' | 'check'
export const SHEET_LAYOUTS: readonly SheetLayout[] = ['client', 'check']
/** The drawing box on a floor page, in PDF points: what the frames are fitted to. */
export const PLAN_BOX = { width: 700, height: 640 } as const

export interface SheetFigure { readonly value: string; readonly label: string }
export interface SheetRow { readonly name: string; readonly detail: string | null; readonly area: string }
/**
 * `pdf.ts` may split a long table across pages: a part has no `total` until the part that holds
 * it, and no `note` until the part that holds that.
 */
export interface SheetTable { readonly heading: string; readonly rows: readonly SheetRow[]; readonly total: SheetRow | null; readonly note: string | null }
export type SheetPicture =
  | { readonly kind: 'plan'; readonly floor: string; readonly frame: Bounds; readonly ids: boolean }
  | { readonly kind: 'model' }
export interface SheetPage {
  readonly kind: 'cover' | 'floor' | 'summary'
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
    view: planPicture(loaded.plan, { floor: floor.id, width: PLAN_BOX.width, height: PLAN_BOX.height }).view,
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

function clientBodies(loaded: LoadedPlan, words: SheetWords | null, name: string): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const facts = planFacts(loaded.plan)
  const bedrooms = loaded.plan.rooms.filter((room) => room.use === 'bedroom').length
  const title = words?.name ?? name
  const figures: SheetFigure[] = []
  if (areas.grossInternal !== null) figures.push({ value: `${areaText(areas.grossInternal, 1)} m²`, label: 'gross internal area' })
  figures.push({ value: String(floors.length), label: 'floors' })
  figures.push({ value: String(bedrooms), label: 'bedrooms' })
  const height = heightFigure(loaded)
  if (height) figures.push(height)

  const limits = facts.stairRooms > 0 ? [CLIENT_LIMITS, STAIR_LIMIT] : [CLIENT_LIMITS]
  const cover: Body = {
    kind: 'cover', topLine: title, title, subtitle: words?.headline ?? null,
    paragraphs: words?.intro ?? [], figures, table: null, picture: { kind: 'model' }, notes: [],
  }
  const pages = floors.map((floor): Body => {
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const leftOut = floorIssues(loaded, floor.id).some((issue) => loaded.broken.has(issue.id))
    return {
      kind: 'floor', topLine: `${title} / ${floor.name}`, title: floor.name, subtitle: null,
      paragraphs: words?.floors?.[floor.id] ?? [], figures: [],
      table: floorAreas ? areaTable(floorAreas, false) : null,
      picture: { kind: 'plan', floor: floor.id, frame: frames.get(floor.id)!, ids: false },
      notes: leftOut ? [...limits, LEFT_OUT_LIMIT] : limits,
    }
  })
  return [cover, ...pages]
}

function issueLine(issue: { severity: string; entity: string; id: string; message: string }): string {
  return `${issue.severity === 'error' ? 'Left out' : 'Worth a look'}, ${issue.entity} ${quoted(issue.id)}: ${issue.message}`
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
    { value: `${areaText(areas.net, 1)} m²`, label: 'net area' },
  ]
  if (areas.grossInternal !== null) figures.push({ value: `${areaText(areas.grossInternal, 1)} m²`, label: 'gross internal area' })
  if (areas.grossExternal !== null) figures.push({ value: `${areaText(areas.grossExternal, 1)} m²`, label: 'gross external area' })
  const summary: Body = {
    kind: 'summary', topLine: `${name} / Check set`, title: 'Check set', subtitle: null,
    paragraphs: [describeText(planFacts(loaded.plan), 'line', 'person').trim()],
    figures, table: null, picture: null,
    notes: [
      AREA_RULES.net, AREA_RULES.grossInternal, AREA_RULES.grossExternal,
      // What belongs to no floor is said once, here; each floor page says the rest.
      ...whole.issues.filter((i) => i.entity === 'plan').map(issueLine),
      ...whole.report.notChecked.filter((n) => n.floor === '').map(noticeLine),
      ...whole.report.limits,
    ],
  }
  const pages = floors.map((floor): Body => {
    const result = checkPlan(loaded, { floor: floor.id })
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const shown = [
      ...result.report.findings.map((finding) => finding.message),
      ...result.issues.filter((i) => i.entity !== 'plan').map(issueLine),
      ...result.report.notChecked.filter((n) => n.floor !== '').map(noticeLine),
    ]
    return {
      kind: 'floor', topLine: `${name} / ${floor.name}`, title: floor.name, subtitle: null,
      paragraphs: [], figures: [],
      table: floorAreas ? areaTable(floorAreas, true) : null,
      picture: { kind: 'plan', floor: floor.id, frame: frames.get(floor.id)!, ids: true },
      notes: shown.length === 0
        ? ['These checks found nothing on this floor. That is not a statement that it meets any rule.']
        : shown,
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
