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
import { DEFAULT_LANGUAGE, joined, name, num, say, sayValue, labelOfUse, type Language, type MessageKey, type Said, type Values } from '@ongrid/floorplan/messages'
import { ROOM_USES, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { findingReadFor, readForSentence } from '@ongrid/rules'
import { FRAME_MARGIN, fitTo } from '@ongrid/viewer/src/canvas2d/viewport'
import { pictureView, undecidedDoorsOf, type PictureOptions } from '@ongrid/viewer/src/picture'
import { TEXT_PX } from '@ongrid/viewer/src/picture/look'
import { checkOnFloor, checkPlan, floorIssues, placeText } from '../command/check'
import { inLanguage } from '../command/words'
import type { LoadedPlan } from '../command/plan'
import { describeText } from '../describe/card'
import { planFacts } from '../describe/facts'
import { AREA_RULES, planAreas, type FloorAreas } from '../quantities/areas'
import { factsText, openingSchedule, roomSchedule, shownNumber } from '../quantities/schedule'
import { surveyPlan } from '../quantities/survey'
import { sqFt } from '../quantities/units'

export type SheetLayout = 'client' | 'check'
export const SHEET_LAYOUTS: readonly SheetLayout[] = ['client', 'check']
/** The drawing box on a floor page, in PDF points: what the frames are fitted to. */
export const PLAN_BOX = { width: 700, height: 640 } as const

/** A sheet is drawn in the technical look (SHT-1): black on white, lines in millimetres on paper. */
export const SHEET_LOOK = 'technical' as const

/** Millimetres in a PDF point. */
const POINT_MM = 25.4 / 72

/** On a floor page whose plan has doors drawn as undecided: the key to their mark. */
export const UNDECIDED_NOTE = say('en', 'sheet.undecided')

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
 *
 * The picture is drawn in `SHEET_LOOK` at the box's own scale on the paper (`paperScale`, N in
 * 1:N, for a box `PLAN_BOX.width` points wide), so its lines have their width in millimetres on
 * the printed sheet.
 */
export function planPictureOptions(picture: Extract<SheetPicture, { kind: 'plan' }>, language: Language = DEFAULT_LANGUAGE): { options: PictureOptions; grow: number } {
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
    options: {
      floor: picture.floor,
      frame,
      width,
      height: steps * SHAPE.height,
      look: SHEET_LOOK,
      paperScale: (shown.width * 1000) / (PLAN_BOX.width * POINT_MM),
      ...(picture.ids ? { labels: { ids: true } } : {}),
      // MSG-11: the drawing's words in the sheet's language; English leaves the plan's own.
      ...(language === DEFAULT_LANGUAGE ? {} : { language }),
    },
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
/** MSG-11: `language` is the one the sheet's own words, and its drawings', are written in. */
export interface Sheet { readonly layout: SheetLayout; readonly name: string; readonly pages: readonly SheetPage[]; readonly language?: Language }
export interface SheetOptions {
  readonly name: string
  readonly date: Date
  /** MSG-11: the language of the sheet's own words, with its decimal mark. English when left out. */
  readonly language?: Language
}

/**
 * MSG-11: the sheet's words in one language. `say` a key; `n` a figure as Grid rounds it, with
 * the language's decimal mark. Names from the plan go in as they are: the sheet prints them
 * unquoted, as the person wrote them.
 */
interface Words {
  readonly language: Language
  readonly say: (key: MessageKey, values?: Values) => string
  readonly n: (figure: string) => string
  /** A sentence Grid made elsewhere: its English as given, else said from its key and values. */
  readonly said: (message: string, said: Said | undefined) => string
  /** A room use's own word in the language; a word that is not a use, as written. */
  readonly use: (use: string) => string
}

function wordsIn(language: Language): Words {
  const english = language === DEFAULT_LANGUAGE
  return {
    language,
    say: (key, values) => say(language, key, values),
    n: (figure) => sayValue(language, num(figure)),
    said: (message, said) => (english || said === undefined ? message : sayValue(language, said)),
    use: (use) => (english || !(ROOM_USES as readonly string[]).includes(use) ? use : labelOfUse(language, use as RoomUse)),
  }
}

const ENGLISH = wordsIn(DEFAULT_LANGUAGE)

type Body = Omit<SheetPage, 'footer'>

/** What a client sheet always says it does not show. Grid's own words. */
export const CLIENT_LIMITS = say('en', 'sheet.limits')
/** The same, for a plan that states its stairs (LVL-3): they are drawn. */
export const CLIENT_LIMITS_WITH_STAIRS = say('en', 'sheet.limits.stairs')
/** When some floor with rooms is joined to no other by a stair (LVL-3). */
export const STAIR_LIMIT = say('en', 'sheet.stairLimit')
/** On a client floor page that leaves out a part Grid cannot draw (the check sheet lists it). */
export const LEFT_OUT_LIMIT = say('en', 'sheet.leftOutLimit')

function dateText(date: Date, w: Words): string {
  const months = w.say('sheet.months').split(' ')
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
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

function undecidedNote(loaded: LoadedPlan, floor: string, w: Words): string[] {
  return undecidedDoorsOf(loaded.plan, floor).length > 0 ? [w.say('sheet.undecided')] : []
}

function areaTable(floor: FloorAreas, withUse: boolean, w: Words): SheetTable {
  // CNT-8: a zone's floor is its room's, so the table has one row per room, and the column adds
  // up to the net. The plan draws each zone with its name and area.
  const places = floor.rooms.filter((r) => r.zoneOf === undefined)
  // SHT-11: a stair room over the stair below is counted there, so it is in no part of the sum.
  const counted = places.filter((r) => r.countedWith === undefined)
  const shown = sumText(counted.map((r) => r.net ?? 0), floor.net, 1)
  const parts = new Map(counted.map((room, i) => [room, shown.parts[i]!] as const))
  return {
    heading: w.say('sheet.rooms'),
    // MSG-2: a room that could not be measured has no area, never 0.
    rows: places.map((room) => {
      const part = parts.get(room)
      return {
        name: room.name,
        detail: withUse && room.use !== null ? w.use(room.use) : null,
        area: room.net === null ? w.say('sheet.notMeasured') : part === undefined ? w.say('sheet.countedBelow') : w.n(part),
      }
    }),
    total: { name: w.say('sheet.netArea'), detail: null, area: w.n(shown.total) },
    note: AREA_RULES.net,
  }
}

/** Floor to floor, from the levels the 3D view stacks; one floor gives its clear height. */
function heightFigure(loaded: LoadedPlan, w: Words): SheetFigure | null {
  const storeys = [...floorElevations(loaded.plan).floors.values()]
  const levels = [...new Set(storeys.map((s) => s.floorLevel))].sort((a, b) => a - b)
  if (levels.length < 2) {
    const only = storeys[0]
    return only ? { value: `${w.n(metresText(only.clearHeight))} m`, label: w.say('sheet.figure.clearHeight') } : null
  }
  const steps = levels.slice(1).map((level, i) => level - levels[i]!)
  const low = Math.min(...steps)
  const high = Math.max(...steps)
  const value = metresText(low) === metresText(high) ? `${w.n(metresText(low))} m` : `${w.n(metresText(low))}–${w.n(metresText(high))} m`
  return { value, label: w.say('sheet.figure.floorToFloor') }
}

/** An area figure, or "not known" when the plan gives none (the reason goes in the notes). */
function areaFigure(value: number | null, label: string, w: Words): SheetFigure {
  return { value: value === null ? w.say('sheet.notKnown') : `${w.n(areaText(value, 1))} m²`, label }
}

function clientBodies(loaded: LoadedPlan, words: SheetWords | null, name: string, w: Words): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const facts = planFacts(loaded.plan)
  const bedrooms = loaded.plan.rooms.filter((room) => room.use === 'bedroom').length
  const title = words?.name ?? name
  const figures: SheetFigure[] = [areaFigure(areas.grossInternal, w.say('sheet.figure.grossInternal'), w)]
  figures.push({ value: String(floors.length), label: w.say(floors.length === 1 ? 'sheet.figure.floors.one' : 'sheet.figure.floors.many') })
  figures.push({ value: String(bedrooms), label: w.say(bedrooms === 1 ? 'sheet.figure.bedrooms.one' : 'sheet.figure.bedrooms.many') })
  const height = heightFigure(loaded, w)
  if (height) figures.push(height)

  const shown = w.say(facts.connections.stairs.length > 0 ? 'sheet.limits.stairs' : 'sheet.limits')
  const limits = facts.connections.unjoined.length > 0 ? [shown, w.say('sheet.stairLimit')] : [shown]
  const cover: Body = {
    kind: 'cover', floor: null, topLine: title, title, subtitle: words?.headline ?? null,
    paragraphs: words?.intro ?? [], figures, table: null, picture: { kind: 'model' },
    notes: areas.grossInternal === null && areas.grossWhy !== null ? [areas.grossWhy] : [],
  }
  // Never an id here: floors that share a name are told apart by their place in the plan.
  const named = (name: string) => floors.filter((f) => f.name === name).length
  const pages = floors.map((floor, i): Body => {
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const leftOut = floorIssues(loaded, floor.id).some((issue) => loaded.broken.has(issue.id))
    const floorTitle = named(floor.name) > 1 ? w.say('sheet.floorNumbered', { floor: floor.name, number: i + 1 }) : floor.name
    return {
      kind: 'floor', floor: floor.id, topLine: `${title} / ${floorTitle}`, title: floorTitle, subtitle: null,
      paragraphs: words?.floors?.[floor.id] ?? [], figures: [],
      table: floorAreas ? areaTable(floorAreas, false, w) : null,
      picture: floorPicture(loaded, frames, floor.id, false),
      notes: [...limits, ...(leftOut ? [w.say('sheet.leftOutLimit')] : []), ...undecidedNote(loaded, floor.id, w)],
    }
  })
  return [cover, ...pages]
}

const ENTITY_KEYS: Readonly<Record<string, MessageKey>> = {
  wall: 'sheet.entity.wall', room: 'sheet.entity.room', opening: 'sheet.entity.opening', plan: 'sheet.entity.plan',
  floor: 'sheet.entity.floor', item: 'sheet.entity.item', stair: 'sheet.entity.stair',
}

function issueLine(issue: { severity: string; entity: string; id: string; message: string; said?: Said }, w: Words = ENGLISH): string {
  const entityKey = ENTITY_KEYS[issue.entity]
  return w.say(issue.severity === 'error' ? 'sheet.issue.error' : 'sheet.issue.warning', {
    entity: entityKey === undefined ? issue.entity : w.say(entityKey),
    id: name(issue.id),
    message: w.said(issue.message, issue.said),
  })
}

/** A finding, by the ids of the rooms and openings it names, as a drawing problem is by its own. */
export function findingLine(finding: Parameters<typeof findingReadFor>[0] & { rooms: readonly string[]; openings: readonly string[]; message: string; said?: Said }, w: Words = ENGLISH): string {
  const ids = (kind: 'room' | 'opening', list: readonly string[]): string[] =>
    list.length === 0 ? [] : [w.say(`sheet.finding.${kind}.${list.length === 1 ? 'one' : 'many'}`, { ids: joined(list.map(name), 'join.comma') })]
  const named = [...ids('room', finding.rooms), ...ids('opening', finding.openings)]
  // COD-2: a finding that used a figure says which kind of building the figure was read for.
  const kinds = findingReadFor(finding)
  const own = w.said(finding.message, finding.said)
  const message = kinds.length === 0 ? own : `${own}. ${readForSentence(kinds)}`
  return named.length === 0 ? w.say('sheet.finding', { message }) : w.say('sheet.finding.named', { named: named.join(w.say('join.comma')), message })
}

function noticeLine(notice: { message: string; said?: Said }, w: Words = ENGLISH): string {
  return w.say('sheet.notChecked', { message: w.said(notice.message, notice.said) })
}

function checkBodies(loaded: LoadedPlan, name: string, w: Words): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const whole = checkPlan(loaded, {})
  const figures: SheetFigure[] = [
    { value: String(whole.report.findings.length), label: w.say('sheet.figure.findings') },
    { value: String(whole.issues.length), label: w.say('sheet.figure.problems') },
    areaFigure(areas.net, w.say('sheet.figure.net'), w),
    areaFigure(areas.grossInternal, w.say('sheet.figure.grossInternal'), w),
    areaFigure(areas.grossExternal, w.say('sheet.figure.grossExternal'), w),
  ]
  const checkSet = w.say('sheet.checkSet')
  const why = w.say('sheet.nothingFound')
  const summary: Body = {
    kind: 'summary', floor: null, topLine: `${name} / ${checkSet}`, title: checkSet, subtitle: null,
    paragraphs: [describeText(planFacts(loaded.plan), 'line', 'person', { language: w.language, options: {} }).trim()],
    figures, table: null, picture: null,
    notes: [
      // COD-3: the place the figures were for, or that none was stated and no figure applied.
      inLanguage(w.language, undefined, () => placeText(whole.report, 'sheet')),
      ...(whole.report.findings.length === 0 ? [w.say('sheet.findings.none', { why })] : []),
      AREA_RULES.net, AREA_RULES.grossInternal, AREA_RULES.grossExternal,
      ...(areas.grossWhy === null ? [] : [areas.grossWhy]),
      // What belongs to no floor is said once, here; each floor page says the rest.
      ...whole.issues.filter((i) => i.entity === 'plan').map((i) => issueLine(i, w)),
      ...whole.report.notChecked.filter((n) => n.floor === '').map((n) => noticeLine(n, w)),
      ...whole.report.limits,
    ],
  }
  const pages = floors.map((floor): Body => {
    const result = checkOnFloor(loaded, whole, floor.id)
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const shown = [
      ...(result.report.findings.length === 0 ? [w.say('sheet.floorFindings.none', { why })] : []),
      ...result.report.findings.map((f) => findingLine(f, w)),
      ...result.issues.filter((i) => i.entity !== 'plan').map((i) => issueLine(i, w)),
      ...result.report.notChecked.filter((n) => n.floor !== '').map((n) => noticeLine(n, w)),
      ...undecidedNote(loaded, floor.id, w),
    ]
    // The floor's id, as each room's label carries the room's.
    const floorTitle = `${floor.name} [${floor.id}]`
    return {
      kind: 'floor', floor: floor.id, topLine: `${name} / ${floorTitle}`, title: floorTitle, subtitle: null,
      paragraphs: [], figures: [],
      table: floorAreas ? areaTable(floorAreas, true, w) : null,
      picture: floorPicture(loaded, frames, floor.id, true),
      notes: shown,
    }
  })
  return [summary, ...pages, ...scheduleBodies(loaded, name, w)]
}

/**
 * ARE-12: the room schedule and the door and window schedule, as tables on the check set, from
 * the same rows as `grid_schedule` (of=rooms, of=openings). The totals cover all floors, and each
 * floor's total names its floor.
 */
function scheduleBodies(loaded: LoadedPlan, name: string, w: Words): Body[] {
  const survey = surveyPlan(loaded.plan)
  const rooms = roomSchedule(survey)
  const openings = openingSchedule(survey)
  const several = rooms.floors.length > 1
  const roomRows: SheetRow[] = rooms.rows.map((r) => ({
    // CNT-9: a stated room number wins over Grid's, and the room's own facts close the detail.
    name: `${shownNumber(r)}. ${r.name}`,
    detail: [
      r.use === null ? w.say('sheet.useNotSaid') : w.use(r.use),
      r.height === null ? w.say('sheet.heightNotKnown') : w.say('sheet.high', { height: num(metresText(r.height)) }),
      ...(several ? [r.floorName] : []),
      ...(Object.keys(r.properties).length > 0 ? [factsText(r.properties)] : []),
    ].join(w.say('join.comma')),
    area: r.area === null ? w.say('sheet.notMeasured') : w.n(areaText(r.area, 1)),
  }))
  for (const t of rooms.floors) if (several) roomRows.push({ name: w.say('sheet.total.floor', { floor: String(t.floorName) }), detail: w.say('sheet.roomCount', { count: t.rooms }), area: w.n(areaText(t.area, 1)) })
  const total = rooms.total
  const roomTable: SheetTable = {
    heading: w.say('sheet.roomSchedule.heading'),
    rows: roomRows,
    total: { name: w.say(several ? 'sheet.total.all' : 'sheet.total'), detail: w.say('sheet.total.rooms', { count: total.rooms, sqft: Math.round(sqFt(total.area)) }), area: w.n(areaText(total.area, 1)) },
    note: rooms.rules[0]!,
  }
  const openingRows: SheetRow[] = openings.rows.map((r) => ({
    name: `${r.number}. ${w.say(`sheet.type.${r.type}`)} ${r.id}`,
    detail: `${w.n(metresText(r.width))} × ${w.n(metresText(r.height))} m${r.type === 'window' ? `, ${w.say('sheet.sill', { sill: num(metresText(r.sill)) })}` : ''}, ${r.between[0]} – ${r.between[1]}${several ? `, ${r.floorName}` : ''}${Object.keys(r.properties).length > 0 ? `, ${factsText(r.properties)}` : ''}`,
    area: '1',
  }))
  const c = openings.counts
  const openingTable: SheetTable = {
    heading: w.say('sheet.openingSchedule.heading'),
    rows: openingRows,
    total: { name: w.say('sheet.inAll'), detail: w.say('sheet.openingCounts', { doors: c.door, windows: c.window, openings: c.opening }), area: String(c.door + c.window + c.opening) },
    note: openings.rule,
  }
  const body = (title: string, table: SheetTable): Body => ({
    kind: 'summary', floor: null, topLine: `${name} / ${title}`, title, subtitle: null,
    paragraphs: [], figures: [], table, picture: null, notes: [],
  })
  return [body(w.say('sheet.roomSchedule'), roomTable), body(w.say('sheet.openingSchedule'), openingTable)]
}

export function sheetPages(loaded: LoadedPlan, words: SheetWords | null, layout: SheetLayout, options: SheetOptions): Sheet {
  // A check sheet takes nothing from sheet.json, not even its name.
  const name = layout === 'client' ? words?.name ?? options.name : options.name
  const w = wordsIn(options.language ?? DEFAULT_LANGUAGE)
  const bodies = layout === 'client' ? clientBodies(loaded, words, options.name, w) : checkBodies(loaded, options.name, w)
  const date = dateText(options.date, w)
  const label = w.say('label')
  const pages = bodies.map((body, i): SheetPage => ({
    ...body,
    footer: { label, page: i + 1, pages: bodies.length, date },
  }))
  return { layout, name, pages, language: w.language }
}
