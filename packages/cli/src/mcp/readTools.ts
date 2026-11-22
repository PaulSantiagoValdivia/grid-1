/**
 * The tools of `grid serve` that read the plan and change nothing in it, in the order of the
 * requests they answer most often (lab entry Y-2): comparing options, areas, the builder's
 * take-off and schedule, measuring, the named views, reading the plan in room terms, and the
 * check.
 *
 * Every answer is short text in Grid's own words, with the same facts as data under the tool's
 * output schema. Names and ids that come from the plan file are quoted.
 */
import { MEASURES, floorOf, itemFootprint, limit, planFloors, tolerance, wrapDegrees, type FloorPlan, type HeadroomBand, type PlanFix } from '@ongrid/floorplan/geometry'
import { PATH_MAX } from '../fs/projectFiles'
import { GENERAL_GUIDANCE_LABEL, buildingKindsText, figureUsedText, inspectPlan, type ResultLine } from '@ongrid/rules'
import { causeText, checkPlan, countsText, coverageSummary, KIND_WORDS, placeText, type PlaceWords, NOTHING_CHECKED, NOTHING_FOUND, nothingCheckedText, partsText, problemsText, restText, SEEN_HEADING_NOTE, seenBeforeText, seenByText, seenCount, thingText, usedFigures, withSeen, type CheckResult } from '../command/check'
import { readSeen, type SeenState } from '../seen/marks'
import { describePlan, describeRooms } from '../command/describe'
import { drawShowOf } from '../command/drawShow'
import { UsageError } from '../command/options'
import type { LoadedPlan } from '../command/plan'
import { cropFrame, partBounds, type PartBounds } from '../draw/partBoxes'
import { DESCRIBE_AUDIENCES, DESCRIBE_LENGTHS } from '../describe/card'
import { LOOKS, SIDES, namedLook, type LookName, type Side } from '../draw/viewNames'
import { AREA_RULES, planAreas, type AreaSureness } from '../quantities/areas'
import { stateText } from '../quantities/state'
import { comparePlans, optionRow, type Comparison, type OptionRow } from '../quantities/compare'
import {
  distanceBetween,
  EMPTY_ROOM_RULE,
  FACES_RULE,
  fitInRoom,
  HEIGHT_RULE,
  itemThing,
  measureRoom,
  openingThing,
  pointThing,
  roomHeight,
  roomThing,
  routeBetween,
  wallLengths,
  wallThing,
  type RoomHeight,
  type Thing,
} from '../quantities/measure'
import { factsText, openingSchedule, openingScheduleCsv, planSchedule, roomSchedule, roomScheduleCsv, shownNumber } from '../quantities/schedule'
import { fixtureCountText, FIXTURE_RULES, planFixtures } from '../quantities/fixtures'
import { FACING_RULE, facingAnswer, northWords } from '../quantities/facing'
import { figureOf, roomIndicators, USE_RULE, wideRoute, wideRouteLines } from '../quantities/use'
import { surveyPlan, sideNames, type Survey, type SurveyRoom } from '../quantities/survey'
import { planEstimate, WHOLE_BUILDING_KEY, type Estimate, type EstimateLine, type QuantityUnit } from '../quantities/estimate'
import { estimateCsv, priceEstimate, rateCard, RATE_UNITS, RATES_FILE, RatesRefused, readRates, type PricedLine, type Pricing, type Rates } from '../quantities/rates'
import { planTakeoff, TAKEOFF_RULES } from '../quantities/takeoff'
import {
  askPlan,
  checkSums,
  factInfos,
  fieldName,
  fieldOf,
  GRID_FIELDS,
  groupParts,
  PART_KINDS,
  QUERY_RULE,
  QueryRefused,
  select,
  shown,
  unitOf,
  valueWords,
  type Asked,
  type Field,
  type PartKind,
  type Value,
} from '../quantities/query'
import { areaText, csv, DISPLAY_UNITS, displayFor, lengthText, sqFt } from '../quantities/units'
import type { Display } from '@ongrid/floorplan/types/units'
import { PLACE_TEXT_MAX } from '@ongrid/floorplan/types/places'
import { GROUP_COLOURS, HIGHLIGHT_COLOUR } from '@ongrid/viewer/src/picture/look'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import {
  asRefusal,
  BOOLEAN,
  FLOOR_ARG,
  floorArg,
  listSchema,
  m,
  NULLABLE_NUMBER,
  NULLABLE_STRING,
  NUMBER,
  objectSchema,
  openingArg,
  PLAN_ARG,
  readPlan,
  roomArg,
  STRING,
  thingArg,
  ToolRefusal,
  wallArg,
  type Answer,
  type ArgSpec,
  type GridTool,
  type ToolContext,
} from './toolkit'

const q = (text: string): string => JSON.stringify(text)

/** CNT-12: what `fit` keeps clear of in a room with fixtures. */
const FIT_CLEAR_RULE = 'What is fitted keeps clear of the room\'s fixtures: each takes the floor its footprint covers.'

const UNITS_ARG: ArgSpec = {
  type: 'string',
  enum: DISPLAY_UNITS,
  description: 'How figures are written: m (metres), cm, mm, or ft-in (feet and inches, square feet beside square metres; ft is the same). The plan\'s own display, or m, when left out. Grid measures in metres either way.',
  examples: ['m', 'ft-in', 'mm'],
}

const DECIMAL_ARG: ArgSpec = {
  type: 'string',
  enum: ['point', 'comma'],
  description: 'The decimal mark figures are written with: point (2.40) or comma (2,40). The plan\'s own display, or point, when left out.',
  examples: ['comma'],
}

const FORMAT_ARG: ArgSpec = {
  type: 'string',
  enum: ['text', 'csv'],
  description: 'text for the answer in words, csv for the table as comma-separated values to paste into a spreadsheet. text when left out.',
  examples: ['text', 'csv'],
}

function load(context: ToolContext, plan: unknown, floor?: unknown): { survey: Survey; floor: string | undefined; file: string } {
  const { loaded, file } = readPlan(context, plan)
  return { survey: surveyPlan(loaded.plan), floor: floorArg(loaded.plan, floor), file }
}

/** WRT-6 (lab AE-4, AE-13): where an area's walls came from and how sure it is, after the figure. */
const SOURCE_WORDS = { scanned: 'from a scan', measured: 'measured', given: 'as given', assumed: 'assumed' } as const
function surenessText(sure: AreaSureness | undefined, units: Display): string {
  if (sure === undefined) return ''
  const word = SOURCE_WORDS[sure.source]
  if (sure.plusMinus === null || sure.percent === null) return `, ${word}: how sure is not stated (a wall states no tolerance)`
  return `, ${word}, about ± ${sure.percent.toFixed(1)}% (± ${areaText(sure.plusMinus, units)})`
}

function percent(share: number | null): string {
  return share === null ? 'not known' : `${(share * 100).toFixed(1)}%`
}

// ---------------------------------------------------------------------------------------------
// grid_compare

function optionLine(row: OptionRow, units: Display): string {
  const uses = Object.entries(row.byUse).sort((a, b) => b[1] - a[1]).map(([use, value]) => `${use} ${value.toFixed(2)}`).join(', ')
  const gross = row.grossInternal === null ? 'gross not known' : `gross internal ${areaText(row.grossInternal, units)}, gross external ${areaText(row.grossExternal!, units)}`
  return `${row.label}: net ${areaText(row.net, units)}, ${gross}; circulation ${row.circulation.toFixed(2)} m² (${percent(row.circulationShare)} of gross internal); net to gross ${percent(row.netToGross)}; ${row.rooms} rooms, ${row.bedrooms} bedrooms. By use, m²: ${uses || 'no uses said'}.`
}

/** At most `max` items, then how many more there are in the data. */
function some<T>(items: readonly T[], show: (item: T) => string, max = 6): string {
  const shown = items.slice(0, max).map(show).join('; ')
  return items.length > max ? `${shown}; and ${items.length - max} more in the data` : shown
}

function comparisonLines(c: Comparison): string[] {
  const lines = [c.verdict]
  if (c.likeness !== null) return lines
  const rooms = c.rooms.filter((r) => r.before === null || r.after === null || Math.abs(r.before - r.after) >= 0.01)
  if (rooms.length > 0) {
    lines.push(`  Rooms by name, net m²: ${some(rooms, (r) => `${q(r.name)} ${r.before === null ? 'none' : r.before.toFixed(2)} → ${r.after === null ? 'none' : r.after.toFixed(2)}`, 10)}.`)
  }
  const unchanged = c.rooms.length - rooms.length
  if (unchanged > 0) lines.push(`  ${unchanged} room${unchanged === 1 ? '' : 's'} keep their name and size.`)
  for (const [label, walls] of [['Walls out', c.wallsOut], ['Walls new', c.wallsNew]] as const) {
    if (walls.length === 0) continue
    lines.push(`  ${label}: ${some(walls, (w) => `${q(w.id)} ${w.kind} ${m(w.length)} m long, ${m(w.height)} m high (${m(w.faceArea / 2)} m² a side)${w.between.length > 1 ? ` between ${w.between.map(q).join(' and ')}` : w.between.length === 1 ? ` beside ${q(w.between[0]!)}` : ''}`)}.`)
  }
  if (c.wallsChanged.length > 0) {
    lines.push(`  Walls moved or another length: ${some(c.wallsChanged, (w) => `${q(w.id)} ${m(w.lengthBefore)} → ${m(w.lengthAfter)} m long${w.moved >= 0.005 ? `, moved ${m(w.moved)} m` : ''}`)}.`)
  }
  for (const [label, openings] of [['Openings out', c.openingsOut], ['Openings new', c.openingsNew]] as const) {
    if (openings.length === 0) continue
    lines.push(`  ${label}: ${some(openings, (o) => `${o.type} ${q(o.id)} ${m(o.width)} × ${m(o.height)} m, ${q(o.between[0])} ↔ ${q(o.between[1])}`)}.`)
  }
  if (c.openingsChanged.length > 0) lines.push(`  Openings changed: ${some(c.openingsChanged, (o) => `${o.type} ${q(o.id)}: ${o.changes.join(', ')}`)}.`)
  return lines
}

const compareTool: GridTool = {
  name: 'grid_compare',
  title: 'Compare plans or options',
  hint: 'read',
  description:
    'Use this when the person asks how two or more plans differ, which option is bigger, to see options side by side, or what a change did: "compare A, B and C", "what differs between A and B", "how much bigger than now", "what comes out and what is new". '
    + 'It gives one table of the options (net, gross internal and gross external areas, circulation, net to gross, area by use) and, for each later plan against the first, what differs by room name, walls out and new with their lengths and face areas, and openings out, new or changed. '
    + 'A plan that is the first one moved, mirrored or turned is said to be so, not listed as moved walls. With picture true it also returns one sheet of the plans side by side at the same scale. '
    + 'Do not use for the areas of one plan (grid_areas) or a picture of one plan (grid_view). Units are metres.',
  args: {
    plans: {
      type: 'array',
      required: true,
      description: 'The plan files to compare, 2 to 6 paths inside the project folder; the first is what the others are compared with.',
      examples: [['option-a.json', 'option-b.json', 'option-c.json'], ['now.json', 'plan.json']],
      items: { maxLength: 4096 },
      minItems: 2,
      maxItems: 6,
    },
    labels: {
      type: 'array',
      description: 'A short name for each plan, in the same order, as the person calls them. A, B, C… when left out.',
      examples: [['Option A', 'Option B', 'Option C'], ['Now', 'Extended']],
      items: { maxLength: 40 },
      minItems: 2,
      maxItems: 6,
    },
    floor: { ...FLOOR_ARG, description: 'For the picture only: the floor to draw from each plan. Each plan\'s lowest floor when left out.' },
    picture: { type: 'boolean', description: 'true to return one sheet with the plans side by side at one scale. false when left out.', examples: [true, false] },
  },
  outputSchema: objectSchema({
    options: listSchema(objectSchema({ label: STRING, net: NUMBER, grossInternal: NULLABLE_NUMBER, grossExternal: NULLABLE_NUMBER, circulation: NUMBER, circulationShare: NULLABLE_NUMBER, netToGross: NULLABLE_NUMBER, rooms: NUMBER, bedrooms: NUMBER, byUse: { type: 'object' } })),
    comparisons: listSchema(objectSchema({ before: STRING, after: STRING, likeness: { type: ['string', 'null'] }, verdict: STRING, rooms: { type: 'array' }, wallsOut: { type: 'array' }, wallsNew: { type: 'array' }, wallsChanged: { type: 'array' }, openingsOut: { type: 'array' }, openingsNew: { type: 'array' }, openingsChanged: { type: 'array' } })),
    rules: listSchema(STRING),
  }),
  async run(args, context) {
    const files = args['plans'] as string[]
    const labels = (args['labels'] as string[] | undefined) ?? files.map((_, i) => String.fromCharCode(65 + i))
    if (labels.length !== files.length) throw new ToolRefusal(`labels needs one name for each of the ${files.length} plans.`)
    const surveys = files.map((file) => load(context, file).survey)
    const options = surveys.map((survey, i) => optionRow(labels[i]!, survey))
    const comparisons = surveys.slice(1).map((survey, i) => ({ before: labels[0]!, after: labels[i + 1]!, ...comparePlans(surveys[0]!, survey, [labels[0]!, labels[i + 1]!]) }))
    const lines = ['Options:', ...options.map((row) => `  ${optionLine(row, displayFor(undefined, undefined, surveys[0]!.plan))}`), '', ...comparisons.flatMap(comparisonLines), '', ...Object.values(AREA_RULES)]
    let image
    if (args['picture'] === true) {
      const floor = args['floor']
      surveys.forEach((survey) => floorArg(survey.plan, floor))
      const { sheetView } = await import('../draw/views')
      const sheet = await sheetView(surveys.map((survey, i) => ({ plan: survey.plan, title: labels[i]!, ...(floor ? { floor: floor as string } : {}) })), 'working')
      image = { data: sheet.png, mimeType: 'image/png' as const }
      lines.push(`The sheet: ${labels.join(', ')} side by side, all at 1 m = ${sheet.pxPerMetre.toFixed(1)} px. Look at it before you describe it.`)
    }
    return {
      text: lines.join('\n'),
      data: { options, comparisons, rules: Object.values(AREA_RULES) },
      ...(image ? { image } : {}),
    }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_areas

const areasTool: GridTool = {
  name: 'grid_areas',
  title: 'Floor areas',
  hint: 'read',
  description:
    'Use this when the person asks how big the plan or a room is, for the total floor area, a gross internal or gross external area, square feet, circulation or net to gross, or an area table for a spreadsheet. '
    + 'It lists every room with its inside size and net area, the totals by floor and by use, and the gross areas, each with a sentence saying what it measures, what it does not take off and what the plan cannot say. '
    + 'Pass country for the gross measure the reader there usually means (the inside face of the outer walls in the UK and most of Europe, the outside face for US homes), or gross to ask for one or both. '
    + 'Rooms named in outside_rooms (a balcony, a terrace) are listed apart; a room Grid could not draw is named and left out of every figure. Do not use for wall lengths, plaster or skirting (grid_takeoff), or to compare plans (grid_compare). Units are metres unless units is ft.',
  args: {
    plan: PLAN_ARG,
    floor: FLOOR_ARG,
    outside_rooms: {
      type: 'array',
      description: 'Room ids to list apart and leave out of the net and gross internal areas, such as a balcony.',
      examples: [['balcony'], ['terrace', 'porch']],
      items: { id: true },
      minItems: 1,
      maxItems: 50,
    },
    country: { type: 'string', maxLength: 2, description: 'Where it will be built, as a two-letter country code: the gross measure usual there is given first. Both when left out or when Grid has none for that place.', examples: ['GB', 'US'] },
    gross: { type: 'string', enum: ['internal', 'external', 'both'], description: 'The gross measure to give: internal (to the inside face of the outer walls), external (to the outside face) or both. The usual one for country when left out.', examples: ['both', 'external'] },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    format: FORMAT_ARG,
  },
  outputSchema: objectSchema({
    floors: listSchema(objectSchema({ floor: STRING, net: NUMBER, grossInternal: NULLABLE_NUMBER, grossExternal: NULLABLE_NUMBER, circulation: NUMBER, rooms: { type: 'array' }, leftOut: { type: 'array' }, byUse: { type: 'object' } }, ['floor', 'net', 'rooms', 'leftOut'])),
    net: NUMBER,
    grossInternal: NULLABLE_NUMBER,
    grossExternal: NULLABLE_NUMBER,
    byUse: { type: 'object' },
    circulationShare: NULLABLE_NUMBER,
    netToGross: NULLABLE_NUMBER,
    leftOut: { type: 'array' },
    gross: objectSchema({ measures: listSchema(STRING), chosen: STRING, why: STRING }, ['measures', 'chosen', 'why']),
    // LVL-6: the floor by headroom band over the floors that state their roof, else null.
    headroom: { type: ['array', 'null'] },
    measures: listSchema(objectSchema({ measure: STRING, name: STRING, measures: STRING, notTakenOff: STRING, cannotSay: STRING })),
    rules: listSchema(STRING),
    notes: listSchema(STRING),
    // MSG-2: each total's state (proven, not-proven, not-looked-at) and the rooms it left out.
    states: { type: 'object' },
    // WRT-6: where the marked walls came from and the net total's give or take; null with no wall marks.
    sureness: { type: ['object', 'null'], properties: { source: STRING, plusMinus: NULLABLE_NUMBER, percent: NULLABLE_NUMBER } },
  }),
  run(args, context) {
    const { survey, floor } = load(context, args['plan'], args['floor'])
    const outside = (args['outside_rooms'] as string[] | undefined) ?? []
    for (const id of outside) roomArg(survey.plan, id, 'outside_rooms item')
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const country = args['country'] as string | undefined
    if (country !== undefined && !/^[A-Za-z]{2}$/.test(country)) throw new ToolRefusal(`country takes a two-letter country code, such as GB or US: got ${q(country)}.`)
    const asked = args['gross'] as 'internal' | 'external' | 'both' | undefined
    const gross = asked === undefined ? undefined : asked === 'both' ? 'both' : asked === 'internal' ? 'grossInternal' : 'grossExternal'
    const areas = planAreas(survey, {
      outside: new Set(outside),
      ...(floor === undefined ? {} : { floors: [floor] }),
      ...(country === undefined ? {} : { country }),
      ...(gross === undefined ? {} : { gross }),
    })
    const data = {
      floors: areas.floors,
      net: areas.net,
      grossInternal: areas.grossInternal,
      grossExternal: areas.grossExternal,
      byUse: areas.byUse,
      circulationShare: areas.circulationShare,
      netToGross: areas.netToGross,
      leftOut: areas.leftOut,
      gross: { measures: areas.reader.gross, chosen: areas.reader.chosen, why: areas.reader.why },
      headroom: areas.headroom,
      measures: areas.measures,
      rules: areas.rules,
      notes: areas.notes,
      states: areas.states,
      sureness: areas.sureness ?? null,
    }
    if (args['format'] === 'csv') {
      const rows = areas.floors.flatMap((f) => f.rooms.map((r) => [f.floor, r.id, r.name, r.use, r.size?.[0] ?? null, r.size?.[1] ?? null, r.net, r.net === null ? null : sqFt(r.net), r.zoneOf !== undefined ? 'zone' : r.outside ? 'outside' : r.countedWith ? 'with the stair below' : 'inside', r.state]))
      rows.push(['all', '', 'Net total', '', null, null, areas.net, sqFt(areas.net), '', areas.states.net.state])
      if (areas.grossInternal !== null) rows.push(['all', '', 'Gross internal', '', null, null, areas.grossInternal, sqFt(areas.grossInternal), '', areas.states.grossInternal.state])
      if (areas.grossExternal !== null) rows.push(['all', '', 'Gross external', '', null, null, areas.grossExternal, sqFt(areas.grossExternal), '', areas.states.grossExternal.state])
      return { text: csv(['floor', 'room id', 'name', 'use', 'across m', 'up m', 'net m2', 'net sq ft', 'counted', 'state'], rows), data }
    }
    const lines: string[] = []
    const several = survey.facts.floors.length > 1
    for (const f of areas.floors) {
      if (several) lines.push(`Floor ${q(f.floor)}:`)
      for (const r of f.rooms) {
        const size = r.size ? `${lengthText(r.size[0], units)} × ${lengthText(r.size[1], units)}, ` : ''
        // MSG-2: a room that could not be measured has no area, and one in doubt says so.
        const free = r.free === undefined ? '' : `, free floor ${areaText(r.free, units)} (fixtures stand on ${areaText(r.fixtures!, units)})`
        const measured = r.net === null ? 'not measured: it could not be drawn' : `${size}${areaText(r.net, units)}${free}${r.state === 'not-proven' ? `, not proven: the drawing questions its outline (${r.doubts.join(', ')})` : ''}`
        // CNT-8: a zone's floor is in its room's, so it is not counted again.
        const zone = r.zoneOf === undefined ? '' : `, a zone of ${q(f.rooms.find((room) => room.id === r.zoneOf)?.name ?? r.zoneOf)}: in its area, not counted again`
        // SHT-11: a stair room over the stair below is counted once, with it.
        const below = r.countedWith ? `, counted once with ${q(r.countedWith.room)} on floor ${q(r.countedWith.floor)}, the stair it rises from` : ''
        // LVL-6: under a roof the floor states, the room's floor by headroom band.
        const headroom = r.headroom === undefined ? '' : `; ${bandsText(r.headroom.bands, units)}, headroom ${lengthText(r.headroom.lowest, units)} to ${lengthText(r.headroom.highest, units)}`
        lines.push(`  ${q(r.name)}${r.use ? ` (${r.use})` : ''}: ${measured}${r.net === null ? '' : surenessText(r.sureness, units)}${r.outside ? ', outside: not counted' : ''}${zone}${below}${headroom}`)
      }
    }
    if (several) {
      for (const f of areas.floors) {
        const gross = areas.reader.gross.map((m) => `${m === 'grossInternal' ? 'gross internal' : 'gross external'} ${f[m] === null ? 'not known' : areaText(f[m]!, units)}`)
        lines.push(`Floor ${q(f.floor)}: net ${areaText(f.net, units)}${surenessText(f.sureness, units)}, ${gross.join(', ')}.`)
      }
    }
    const uses = Object.entries(areas.byUse)
    if (uses.length > 1) lines.push(`Net by use: ${uses.map(([use, area]) => `${use} ${areaText(area, units)}`).join(', ')}.`)
    // Each figure with the rule it follows, in Grid's words: never a bare number (AR-16).
    lines.push(`Net: ${areaText(areas.net, units)}${surenessText(areas.sureness, units)}${stateText(areas.states.net, several)}. ${AREA_RULES.net}`)
    for (const m of areas.reader.gross) {
      const value = m === 'grossInternal' ? areas.grossInternal : areas.grossExternal
      const state = value === null ? '' : stateText(areas.states[m], several)
      lines.push(`${m === 'grossInternal' ? 'Gross internal' : 'Gross external'}: ${value === null ? 'not known' : areaText(value, units)}${state}. ${AREA_RULES[m]}`)
    }
    if (areas.headroom !== null) lines.push(`Area by headroom: ${bandsText(areas.headroom, units)}. ${MEASURES.headroom.measures}`)
    lines.push(`Assumed: ${areas.reader.why} Grid's own rule, not checked against any local standard.`)
    if (areas.grossInternal !== null && areas.reader.gross.includes('grossInternal')) {
      lines.push(`Circulation: ${areas.circulation.toFixed(2)} m², ${percent(areas.circulationShare)} of gross internal. Net to gross: ${percent(areas.netToGross)}.`)
    }
    const outsideArea = areas.floors.reduce((sum, f) => sum + f.outsideRooms, 0)
    if (outsideArea > 0) lines.push(`Outside, listed apart: ${areaText(outsideArea, units)}.`)
    for (const rule of areas.measures) {
      if (rule.measure === 'net' || rule.measure === 'headroom' || areas.reader.gross.includes(rule.measure)) lines.push(`${rule.name}: ${rule.notTakenOff} ${rule.cannotSay}`)
    }
    // Any rule beyond the measures', such as free floor where fixtures stand (CNT-12).
    const measureRules: readonly string[] = [...Object.values(AREA_RULES), MEASURES.headroom.measures]
    lines.push(...areas.rules.filter((rule) => !measureRules.includes(rule)), ...areas.notes)
    return { text: lines.join('\n'), data }
  },
}

/** LVL-6: a stated roof's shape, pitch, area on its slope and rooflights, after its area on plan. */
function sloped(roof: { readonly shape: string | null; readonly pitch: number; readonly slopeArea: number; readonly rooflights: number }, units: Display): string {
  if (roof.shape === null) return ''
  const slope = roof.pitch > 0 ? `, pitched ${roof.pitch.toFixed(1)}°, ${areaText(roof.slopeArea, units)} on its slope` : ''
  const lights = roof.rooflights === 0 ? '' : `, ${roof.rooflights === 1 ? 'one rooflight' : `${roof.rooflights} rooflights`}`
  return `, on plan; a ${roof.shape} roof${slope}${lights}`
}

/** LVL-6: floor by headroom band, as `at least 1.50 m 18.42 m², at least 2.20 m 12.28 m²`. */
function bandsText(bands: readonly HeadroomBand[], units: Display): string {
  return bands.map((b) => `at least ${lengthText(b.height, units)} ${areaText(b.area, units)}`).join(', ')
}

// ---------------------------------------------------------------------------------------------
// grid_takeoff

/** ARE-13: a quantity as the bill writes it. */
function quantityText(quantity: number, unit: QuantityUnit, units: Display): string {
  if (unit === 'nr') return `${Math.round(quantity)} nr`
  return unit === 'm2' ? areaText(quantity, units) : lengthText(quantity, units)
}

const money = (amount: number, currency: string): string =>
  `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

const UNIT_SHOWN: Readonly<Record<QuantityUnit, string>> = { m2: 'm²', m: 'm', nr: 'nr' }

/** ARE-13: the bill of quantities, priced from the person's rates or as a rate card. */
function estimateAnswer(estimate: Estimate, pricing: Pricing | null, units: Display, asCsv: boolean): Answer {
  const rules = [...new Set(estimate.lines.map((line) => line.rule))]
  const data: Record<string, unknown> = {
    label: GENERAL_GUIDANCE_LABEL,
    lines: pricing?.lines ?? estimate.lines,
    notes: estimate.notes,
    rules,
    ...(pricing === null
      ? { rateCard: rateCard(estimate) }
      : {
          cost: {
            file: pricing.file,
            label: pricing.label,
            currency: pricing.currency,
            total: pricing.total,
            complete: pricing.complete,
            missing: pricing.missing,
            wrongUnit: pricing.wrongUnit,
            unused: pricing.unused,
            wholeBuilding: pricing.wholeBuilding,
          },
          orders: pricing.orders,
          orderProblems: pricing.orderProblems,
        }),
  }
  if (asCsv) return { text: estimateCsv(estimate, pricing), data }
  const lines: string[] = [
    `Quantities for a first estimate, from the drawing only. ${GENERAL_GUIDANCE_LABEL}.`,
    pricing === null
      ? 'Rate card: no rates given, so no cost. Each line with its key and unit, ready to fill:'
      : `Priced from ${q(pricing.file)}${pricing.label ? ` (${q(pricing.label)})` : ''}, in ${q(pricing.currency)}: the person's rates, not a price list.`,
  ]
  const shown: readonly (EstimateLine & Partial<PricedLine>)[] = pricing?.lines ?? estimate.lines
  shown.forEach((line, i) => {
    let cost = ''
    if (pricing !== null) {
      if (line.state === 'priced' || line.state === 'alternative') {
        const waste = line.given!.waste === 0 ? '' : ` + ${+(line.given!.waste * 100).toFixed(2)}% waste`
        cost = `${waste} × ${money(line.rate!, pricing.currency)}/${UNIT_SHOWN[line.unit]} = ${money(line.amount!, pricing.currency)}${line.state === 'alternative' ? ', an alternative to the total' : ''}`
      } else if (line.state === 'wrong unit') {
        cost = `, not priced: the rate ${q(line.rateKey!)} is per ${line.given!.unit}`
      } else {
        cost = line.key === WHOLE_BUILDING_KEY ? '' : line.rateKey === null || line.rateKey === undefined ? ', no rate' : `, no rate: ${q(line.rateKey)} is not filled in`
      }
    }
    const assumed = line.assumed ? ', assumed' : ''
    lines.push(`  ${line.key}: ${line.what}, ${quantityText(line.quantity, line.unit, units)}${pricing === null ? `${assumed}; rate per ${line.unit}` : `${cost}${assumed}`}`)
    // Each line's rule follows it, once for a run of lines that share one (AC-14).
    if (shown[i + 1]?.rule !== line.rule) lines.push(`    Rule: ${line.rule}`)
  })
  if (pricing === null) {
    lines.push(
      `To price it, save the rate card as ${RATES_FILE} beside the plan, or pass the file as rates: {"currency": "EUR", "label": "where the rates come from", "rates": {"<key>": {"rate": 40, "unit": "m2"}}}. `
        + 'A shorter key covers longer ones: "wall:exterior" prices every outside wall, "door" every door, "floor" every floor finish. '
        + `Units: ${RATE_UNITS.join(', ')}; a rate per ft2 or ft is turned into one per m² or m. The data's rateCard is the file, ready to fill.`,
    )
  } else {
    const gaps: string[] = []
    if (pricing.missing.length > 0) gaps.push(`${pricing.missing.length} ${pricing.missing.length === 1 ? 'line has' : 'lines have'} no rate (${pricing.missing.join(', ')})`)
    if (pricing.wrongUnit.length > 0) {
      gaps.push(`${pricing.wrongUnit.length} ${pricing.wrongUnit.length === 1 ? 'line has its rate' : 'lines have their rate'} in the wrong unit (${pricing.wrongUnit.map((w) => `${w.key}: ${q(w.rateKey)} is per ${w.rateUnit}, the line is in ${w.unit}`).join('; ')})`)
    }
    lines.push(`Total of the priced lines: ${money(pricing.total, pricing.currency)}.${gaps.length === 0 ? ' Every line is priced.' : ` Not the whole cost: ${gaps.join(', and ')}.`}`)
    if (pricing.wholeBuilding !== null) lines.push(`The whole building at the ${WHOLE_BUILDING_KEY} rate: ${money(pricing.wholeBuilding, pricing.currency)}, an alternative to the total, never added to it.`)
    if (pricing.unused.length > 0) lines.push(`Rates that price no line of this plan: ${pricing.unused.map(q).join(', ')}.`)
    if (pricing.orders.length > 0) {
      lines.push('Orders, from the rates file:')
      for (const order of pricing.orders) {
        lines.push(`  ${q(order.name)}: ${order.packs} ${order.pack} (${order.needed.toFixed(2)} ${UNIT_SHOWN[order.unit]} needed)${order.assumed ? ', assumed: it rests on an assumed line' : ''}`)
        lines.push(`    Rule: ${order.rule}`)
      }
    }
    lines.push(...pricing.orderProblems)
  }
  lines.push(...estimate.notes)
  return { text: lines.join('\n'), data }
}

const takeoffTool: GridTool = {
  name: 'grid_takeoff',
  title: 'Quantities for pricing',
  hint: 'read',
  description:
    'Use this when a builder or the person asks for quantities to price work: metres of wall (outside walls, inner walls, partitions), plaster or paint area per room less openings, ceiling areas, skirting lengths, slab and roof areas, or these as a spreadsheet. '
    + 'With for=estimate, or when the person asks what the plan will cost, how much flooring, paint or plasterboard it takes, or for a bill of quantities, it gives the figures a first estimate needs instead: floor finishes and wall faces by room use, ceilings, skirting, reveals, walls by kind and thickness, the outside face, doors and windows by size, the slab, upper floors and the roof (assumed: the plan holds none), and the gross internal area, each line with a key, its rule and an assumed mark. '
    + `A cost comes only from the person's own rates file (rates, or ${RATES_FILE} beside the plan), which must name its currency; with none, the answer is a rate card to fill in and holds no money. Lines with no rate and rates in the wrong unit are listed apart. Grid has no prices. `
    + 'Every figure is worked out from the plan\'s walls and openings by a rule stated in the answer. '
    + 'It also gives each floor\'s slab and the roof over every part with nothing above, worked out from the outlines and marked assumed. '
    + 'Do not use for floor areas alone (grid_areas) or a list of doors and windows (grid_schedule). The plan holds no finishes. Units are metres.',
  args: {
    plan: PLAN_ARG,
    floor: FLOOR_ARG,
    rooms: { type: 'array', description: 'Only these rooms, by id. Every room when left out. Not with for=estimate.', examples: [['kitchen', 'bath']], items: { id: true }, minItems: 1, maxItems: 200 },
    for: { type: 'string', enum: ['estimate'], description: 'estimate for the bill of quantities of a first estimate, priced from the person\'s rates or as a rate card. The take-off by room when left out.', examples: ['estimate'] },
    rates: {
      type: 'string',
      maxLength: PATH_MAX,
      description: `The person's rates file, as a path inside the project folder: JSON with a currency and a rate per line key. ${RATES_FILE} beside the plan when left out, if there is one. Only with for=estimate.`,
      examples: [RATES_FILE, 'costs/rates-2027.json'],
    },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    format: FORMAT_ARG,
  },
  outputSchema: objectSchema({
    walls: listSchema(objectSchema({ kind: STRING, count: NUMBER, gross: NUMBER, net: NUMBER })),
    rooms: listSchema(objectSchema({ id: STRING, name: STRING, floor: STRING, floorArea: NUMBER, ceiling: NUMBER, perimeter: NUMBER, skirting: NUMBER, wallFace: NUMBER, openingsOff: NUMBER, height: NULLABLE_NUMBER, ceilingHeight: NULLABLE_NUMBER, lowered: listSchema(objectSchema({ name: STRING, height: NUMBER, area: NUMBER })) })),
    totals: objectSchema({ floorArea: NUMBER, ceiling: NUMBER, skirting: NUMBER, wallFace: NUMBER }),
    envelope: objectSchema({
      floors: listSchema(objectSchema({
        floor: STRING,
        floorName: STRING,
        outline: NULLABLE_NUMBER,
        slab: { type: ['object', 'null'] },
        roof: { type: ['object', 'null'] },
        state: STRING,
        assumed: listSchema(STRING),
        why: NULLABLE_STRING,
      })),
      slabs: NULLABLE_NUMBER,
      roof: NULLABLE_NUMBER,
      state: STRING,
    }),
    rules: listSchema(STRING),
    // ARE-13, with for=estimate: the lines, and the cost from the person's rates or the rate card.
    label: STRING,
    lines: listSchema(objectSchema({ key: STRING, what: STRING, quantity: NUMBER, unit: STRING, rule: STRING, assumed: BOOLEAN }, ['key', 'what', 'quantity', 'unit', 'rule', 'assumed'])),
    notes: listSchema(STRING),
    rateCard: objectSchema({ label: STRING, currency: STRING, rates: { type: 'object' } }),
    cost: objectSchema({ file: STRING, label: NULLABLE_STRING, currency: STRING, total: NUMBER, complete: BOOLEAN, missing: listSchema(STRING), wrongUnit: { type: 'array' }, unused: listSchema(STRING), wholeBuilding: NULLABLE_NUMBER }),
    orders: { type: 'array' },
    orderProblems: listSchema(STRING),
  }, ['rules']),
  run(args, context) {
    if (args['for'] === 'estimate') {
      if (args['rooms'] !== undefined) throw new ToolRefusal('for=estimate takes no rooms: its walls, outside face, slab and roof belong to no one room. Pass floor for one floor.')
      const { project, file, loaded } = readPlan(context, args['plan'])
      const survey = surveyPlan(loaded.plan)
      const floor = floorArg(loaded.plan, args['floor'])
      let rates: Rates | null
      try {
        rates = readRates(project, file, args['rates'] as string | undefined)
      } catch (error) {
        if (error instanceof RatesRefused) throw new ToolRefusal(error.message)
        throw asRefusal(error)
      }
      const estimate = planEstimate(survey, floor === undefined ? {} : { floors: [floor] })
      const units = displayFor(args['units'], args['decimal'], loaded.plan)
      return estimateAnswer(estimate, rates === null ? null : priceEstimate(estimate, rates), units, args['format'] === 'csv')
    }
    if (args['rates'] !== undefined) throw new ToolRefusal('rates goes with for=estimate: the take-off by room holds no cost.')
    const { survey, floor } = load(context, args['plan'], args['floor'])
    const rooms = args['rooms'] as string[] | undefined
    for (const id of rooms ?? []) roomArg(survey.plan, id, 'rooms item')
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const t = planTakeoff(survey, floor === undefined ? undefined : [floor], rooms)
    const data = { walls: t.walls, rooms: t.rooms, totals: t.totals, envelope: t.envelope, rules: t.rules }
    const several = survey.facts.floors.length > 1
    if (args['format'] === 'csv') {
      const rows = [
        ...t.walls.map((w) => ['wall', `${w.kind} walls (${w.count})`, null, null, null, null, w.gross, w.net, null]),
        ...t.rooms.map((r) => ['room', r.name, r.floorArea, r.ceiling, r.skirting, r.wallFace, r.perimeter, null, null]),
        ['total', 'all rooms', t.totals.floorArea, t.totals.ceiling, t.totals.skirting, t.totals.wallFace, null, null, null],
        // LVL-4: worked out from the outlines, never stated by the plan (AC-6).
        ...t.envelope.floors.flatMap((f) => [
          ...(f.slab ? [['slab', `${f.slab.kind === 'base' ? 'lowest floor slab' : 'floor slab'}, ${f.floorName}`, f.slab.area, null, null, null, null, null, 'assumed']] : []),
          ...(f.roof ? [['roof', `roof over ${f.floorName}, where nothing is above`, f.roof.area, null, null, null, null, null, 'assumed']] : []),
        ]),
        ...(t.envelope.roof === null ? [] : [['total', 'roof, all floors', t.envelope.roof, null, null, null, null, null, 'assumed']]),
      ]
      return { text: csv(['row', 'what', 'floor m2', 'ceiling m2', 'skirting m', 'wall face m2', 'length or perimeter m', 'net length m', 'state'], rows), data }
    }
    const envelopeLines = t.envelope.floors.flatMap((f) => {
      const on = several ? ` (${q(f.floorName)})` : ''
      if (f.slab === null && f.roof === null) return [`  ${q(f.floorName)}: no slab or roof: ${f.why ?? 'none'}.`]
      const openings = f.slab === null || f.slab.openings.length === 0 ? '' : `, open over ${f.slab.openings.map((o) => `${o.kind === 'void' ? 'a void' : o.kind === 'lift' ? 'a lift shaft' : 'a stair'} (${areaText(o.area, units)})`).join(', ')}`
      return [
        ...(f.slab ? [`  ${f.slab.kind === 'base' ? 'Lowest floor slab' : 'Floor slab'}${on}: ${areaText(f.slab.area, units)}${openings}; assumed.`] : []),
        ...(f.roof ? [`  Roof over${on || ' the floor'}, where nothing is above: ${areaText(f.roof.area, units)}${f.roof.parapet === null ? '' : `, parapet ${lengthText(f.roof.parapet, units)} high`}${sloped(f.roof, units)}; assumed.`] : []),
      ]
    })
    const assumed = [...new Set(t.envelope.floors.flatMap((f) => f.assumed))]
    const lines = [
      `Walls: ${t.walls.map((w) => `${w.kind} ${lengthText(w.gross, units)} (${w.count} wall${w.count === 1 ? '' : 's'}; ${lengthText(w.net, units)} less openings)`).join('; ')}.`,
      'By room: floor and ceiling, skirting, wall face to plaster.',
      ...t.rooms.map((r) => `  ${q(r.name)}: floor ${areaText(r.floorArea, units)}, ceiling ${areaText(r.ceiling, units)}, skirting ${lengthText(r.skirting, units)}, wall face ${areaText(r.wallFace, units)} (${r.openingsOff.toFixed(2)} m² of openings off, walls ${r.height === null ? 'none' : `${r.height.toFixed(2)} m`} high)`),
      `Totals: floor ${areaText(t.totals.floorArea, units)}, ceiling ${areaText(t.totals.ceiling, units)}, skirting ${lengthText(t.totals.skirting, units)}, wall face ${areaText(t.totals.wallFace, units)}.`,
      'Slabs and roof, worked out from the outlines (assumed: the plan states no slab or roof):',
      ...envelopeLines,
      ...(t.envelope.roof === null ? [] : [`Roof in all: ${areaText(t.envelope.roof, units)}, assumed.`]),
      ...(assumed.length === 0 ? [] : [`Assumed: ${assumed.join('; ')}.`]),
      ...Object.values(TAKEOFF_RULES),
      'For a first estimate (finishes, reveals, walls by thickness, doors and windows by size, slab, roof) and a cost from the person\'s rates, ask with for=estimate.',
    ]
    return { text: lines.join('\n'), data }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_schedule

/** ARE-12: the room schedule or the opening schedule, from one set of rows, as text or CSV. */
function listSchedule(survey: Survey, of: 'rooms' | 'openings', floor: string | undefined, units: Display, asCsv: boolean): Answer {
  const floors = floor === undefined ? undefined : [floor]
  const several = survey.facts.floors.length > 1
  if (of === 'rooms') {
    const s = roomSchedule(survey, floors === undefined ? {} : { floors })
    const data = { rows: s.rows, floors: s.floors, total: s.total, rules: s.rules }
    if (asCsv) return { text: roomScheduleCsv(s), data }
    // CNT-9: a stated room number wins over Grid's, and the room's own facts follow its figures.
    const own = (properties: Readonly<Record<string, string | number | boolean>>): string => (Object.keys(properties).length === 0 ? '' : `; ${factsText(properties)}`)
    const lines = s.rows.map((r) => `${r.roomNumber === null ? r.number : q(shownNumber(r))}. ${q(r.name)}${r.use ? ` (${r.use})` : ''}, ${q(r.floorName)}: ${r.area === null ? 'not measured: it could not be drawn' : areaText(r.area, units)}, ${r.height === null ? 'height not known' : `${lengthText(r.height, units)} high`}${r.state === 'not-proven' ? ', not proven' : ''}${own(r.properties)}`)
    for (const t of s.floors) lines.push(`${q(t.floorName!)}: ${t.rooms} rooms, ${areaText(t.area, units)}${stateText(t.state, several)}.`)
    lines.push(`All floors: ${s.total.rooms} rooms, ${areaText(s.total.area, units)}${stateText(s.total.state, several)}.`, ...s.rules)
    return { text: lines.join('\n'), data }
  }
  const s = openingSchedule(survey, floors === undefined ? {} : { floors })
  const data = { rows: s.rows, counts: s.counts, rule: s.rule }
  if (asCsv) return { text: openingScheduleCsv(s), data }
  const lines = s.rows.map((r) => `${r.number}. ${r.type} ${q(r.id)}, ${q(r.floorName)}: ${lengthText(r.width, units)} wide × ${lengthText(r.height, units)} high${r.type === 'window' ? `, sill ${lengthText(r.sill, units, 'height')}` : ''}, ${r.between[0]} ↔ ${r.between[1]}${Object.keys(r.properties).length === 0 ? '' : `; ${factsText(r.properties)}`}`)
  if (lines.length === 0) lines.push('The plan has no openings.')
  lines.push(`In all, each counted once: ${s.counts.door} doors, ${s.counts.window} windows, ${s.counts.opening} doorless openings.`, s.rule)
  return { text: lines.join('\n'), data }
}

const scheduleTool: GridTool = {
  name: 'grid_schedule',
  title: 'Door and window schedule',
  hint: 'read',
  description:
    'Use this when the person asks for the doors and windows by size, how many of each, a door schedule or window schedule, which doors are narrower than a width, or how many toilets, basins, showers, baths or kitchen runs there are and where. '
    + 'It groups every door, window and doorless opening by type and size, each listed once with the two rooms it joins. Sizes are the hole in the wall: the plan holds no frame or leaf, so a clear width is not known. '
    + 'With of=rooms it gives the room schedule instead: every room numbered in one order whatever the file\'s order, with its name, use, net area, height and floor, and the totals for each floor and for all floors; with of=openings, every door, window and doorless opening once, numbered, with its size and the rooms on its two sides. Both as text or CSV. '
    + 'Do not use for wall or plaster quantities (grid_takeoff). Units are metres.',
  args: {
    plan: PLAN_ARG,
    floor: FLOOR_ARG,
    of: { type: 'string', enum: ['rooms', 'openings'], description: 'rooms for the room schedule, openings for one row per door, window and opening. Grouped by type and size when left out.', examples: ['rooms', 'openings'] },
    types: { type: 'array', description: 'Only these kinds: door, window, opening, or fixture for the toilets, basins, showers, baths and kitchen runs. All of them when left out.', examples: [['door'], ['door', 'opening'], ['fixture']], items: { enum: ['door', 'window', 'opening', 'fixture'] }, minItems: 1, maxItems: 4 },
    narrower_than: { type: 'number', length: true, description: 'Only openings narrower than this many metres, for example 0.8.', examples: [0.8, 0.9], minimum: 0.1, maximum: 10 },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    format: FORMAT_ARG,
  },
  outputSchema: objectSchema({
    rows: listSchema(objectSchema({ type: STRING, width: NUMBER, height: NUMBER, sill: NUMBER, count: NUMBER, items: { type: 'array' } })),
    counts: objectSchema({ door: NUMBER, window: NUMBER, opening: NUMBER }),
    rule: STRING,
    fixtures: listSchema(objectSchema({ id: STRING, kind: STRING, label: STRING, floor: STRING, room: { type: ['string', 'null'] }, size: { type: 'array' }, height: NUMBER })),
    fixtureCounts: { type: 'object' },
    // ARE-12, with of=rooms or of=openings: the schedule's rows, and for rooms each floor's total and all floors'.
    floors: { type: 'array' },
    total: { type: 'object' },
    rules: listSchema(STRING),
  }, ['rows']),
  run(args, context) {
    const { survey, floor } = load(context, args['plan'], args['floor'])
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const of = args['of'] as 'rooms' | 'openings' | undefined
    if (of !== undefined) {
      const stray = ['types', 'narrower_than'].filter((name) => args[name] !== undefined)
      if (stray.length > 0) throw new ToolRefusal(`of=${of} takes no ${stray.join(' or ')}.`)
      return listSchedule(survey, of, floor, units, args['format'] === 'csv')
    }
    const types = args['types'] as ('door' | 'window' | 'opening' | 'fixture')[] | undefined
    const openingTypes = types?.filter((t): t is 'door' | 'window' | 'opening' => t !== 'fixture')
    const s = planSchedule(survey, {
      ...(floor === undefined ? {} : { floors: [floor] }),
      ...(openingTypes === undefined ? {} : { types: openingTypes }),
      ...(args['narrower_than'] === undefined ? {} : { narrowerThan: args['narrower_than'] as number }),
    })
    // CNT-12: the fixtures by kind, with the room each stands in. A width says nothing of them.
    const withFixtures = (types === undefined || types.includes('fixture')) && args['narrower_than'] === undefined
    const f = withFixtures ? planFixtures(survey.plan, floor === undefined ? undefined : [floor]) : null
    const name = (id: string): string => (survey.facts.rooms.has(id) ? q(survey.facts.rooms.get(id)!.name) : id)
    const fixtureData = f === null || f.rows.length === 0 ? {} : { fixtures: f.rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, floor: r.floor, room: r.room, size: r.size, height: r.height })), fixtureCounts: f.counts }
    const data = { rows: s.rows, counts: s.counts, rule: s.rule, ...fixtureData }
    if (args['format'] === 'csv') {
      const rows = s.rows.flatMap((row) => row.items.map((item) => [row.type, item.id, row.width, row.height, row.sill, item.floor, name(item.between[0]).replace(/"/g, ''), name(item.between[1]).replace(/"/g, '')]))
      for (const r of f?.rows ?? []) rows.push([r.kind, r.id, r.size[0], r.height, '', r.floor, r.room === null ? 'no room' : name(r.room).replace(/"/g, ''), ''])
      return { text: csv(['type', 'id', 'width m', 'height m', 'sill m', 'floor', 'side 1', 'side 2'], rows), data }
    }
    const lines = types?.length === 1 && types[0] === 'fixture' ? [] : s.rows.map((row) => `${row.count} × ${row.type} ${lengthText(row.width, units)} wide × ${lengthText(row.height, units)} high${row.type === 'window' ? `, sill ${lengthText(row.sill, units, 'height')}` : ''}: ${row.items.map((item) => `${q(item.id)} (${name(item.between[0])} ↔ ${name(item.between[1])})`).join(', ')}`)
    const onlyFixtures = types !== undefined && types.every((t) => t === 'fixture')
    if (lines.length === 0 && !onlyFixtures) lines.push(args['narrower_than'] !== undefined ? `Nothing of that kind is narrower than ${m(args['narrower_than'] as number)} m.` : 'The plan has no openings of that kind.')
    if (!onlyFixtures) lines.push(`In all: ${s.counts.door} doors, ${s.counts.window} windows, ${s.counts.opening} doorless openings.`, s.rule)
    if (f !== null && (f.rows.length > 0 || onlyFixtures)) {
      lines.push(`Fixtures: ${fixtureCountText(f.counts)}.`)
      for (const r of f.rows) {
        lines.push(`  ${r.label} ${q(r.id)} (${r.kind}), ${r.room === null ? 'in no room' : `in ${name(r.room)}`}: ${lengthText(r.size[0], units)} wide × ${lengthText(r.size[1], units)} deep × ${lengthText(r.height, units)} high`)
      }
      if (f.leftOut.length > 0) lines.push(`Left out, as grid_check says: ${f.leftOut.map(q).join(', ')}.`)
      lines.push(FIXTURE_RULES.count)
    }
    return { text: lines.join('\n'), data }
  },
}

// ---------------------------------------------------------------------------------------------
// CNT-9: grid_fields, grid_find and grid_count, asking across the parts by any field

/** A question's own refusal, as a tool's. */
function asked<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof QueryRefused) throw new ToolRefusal(error.message)
    throw error
  }
}

const KIND_ARG: ArgSpec = {
  type: 'array',
  description: 'Only these kinds of part: wall, door, window, opening (doorless), room, floor. Every kind when left out.',
  examples: [['door'], ['room'], ['door', 'window']],
  items: { enum: PART_KINDS },
  minItems: 1,
  maxItems: PART_KINDS.length,
}

const WHERE_ARG: ArgSpec = {
  type: 'array',
  description: 'Conditions every part must meet, one each: a field or fact, then a test. Tests: "is missing", "is set", = and != (text in any capitals, yes or no), <, <=, > and >= (numbers; a length may give its unit, as 900 mm), and "contains". A part with no value meets only "is missing". Every part when left out.',
  examples: [['fire rating is missing'], ['department = Sales', 'area >= 20'], ['width < 900 mm']],
  items: { maxLength: 200 },
  minItems: 1,
  maxItems: 20,
}

const ROOM_IN_ARG: ArgSpec = {
  type: 'string',
  id: true,
  description: 'Only what belongs to this room, by id: the room itself, the walls beside it and the doors, windows and openings into it.',
  examples: ['kitchen', 'office-2'],
}

/** The kinds a call asked for, or every kind. */
const kindsOf = (args: Record<string, unknown>): readonly PartKind[] | undefined => args['kind'] as PartKind[] | undefined

function partsWord(kinds: readonly PartKind[] | undefined, n: number): string {
  const plural: Record<PartKind, string> = { wall: 'walls', door: 'doors', window: 'windows', opening: 'doorless openings', room: 'rooms', floor: 'floors' }
  const one: Record<PartKind, string> = { wall: 'wall', door: 'door', window: 'window', opening: 'doorless opening', room: 'room', floor: 'floor' }
  if (kinds !== undefined && kinds.length === 1) return `${n} ${n === 1 ? one[kinds[0]!] : plural[kinds[0]!]}`
  return `${n} part${n === 1 ? '' : 's'}`
}

/** A value in an answer's words: text quoted, a measure with its unit. */
function valueText(field: Field, value: Value): string {
  if (value === null || (Array.isArray(value) && value.length === 0)) return 'not stated'
  if (typeof value === 'string') return q(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value !== 'number') return (value as readonly string[]).map(q).join(', ')
  const unit = unitOf(field)
  return unit === 'm' ? `${value.toFixed(3)} m` : unit === 'm²' ? `${value.toFixed(2)} m²` : String(shown(value))
}

/** What grid_view takes to show these parts, picked out, on the floor that holds most of them. */
function viewOf(asked: Asked, ids: readonly string[], extra: Record<string, unknown> = {}): { view: Record<string, unknown>; floors: string[] } {
  const floorOf = new Map(asked.parts.map((p) => [p.id, p.floor] as const))
  const count = new Map<string, number>()
  for (const id of ids) count.set(floorOf.get(id) ?? 'ground', (count.get(floorOf.get(id) ?? 'ground') ?? 0) + 1)
  const floors = [...count.keys()]
  const most = floors.sort((a, b) => count.get(b)! - count.get(a)!)[0]
  return { view: { kind: 'plan', ...(most === undefined ? {} : { floor: most }), ...extra }, floors: [...count.keys()] }
}

const fieldsTool: GridTool = {
  name: 'grid_fields',
  title: 'What can be asked of the plan',
  hint: 'read',
  description:
    'Use this when you are about to find, count or sum parts of the plan and need the names to ask by: which fields Grid works out for each kind of part (area, width, height, the rooms beside a wall), with their units, and which facts of the person\'s own the parts carry (a fire rating, a department, a head count), with how many parts carry each and their values. '
    + 'Call it once before grid_find or grid_count on a plan you have not asked of yet. Do not use for the answer itself (grid_find, grid_count), for areas (grid_areas) or for a door schedule (grid_schedule). Units are metres and square metres.',
  args: {
    plan: PLAN_ARG,
    kind: KIND_ARG,
  },
  outputSchema: objectSchema({
    kinds: listSchema(objectSchema({ kind: STRING, count: NUMBER })),
    fields: listSchema(objectSchema({ name: STRING, type: STRING, unit: { type: ['string', 'null'] }, kinds: listSchema(STRING), from: STRING, about: STRING })),
    facts: listSchema(objectSchema({ name: STRING, type: STRING, unit: { type: ['string', 'null'] }, kinds: listSchema(STRING), from: STRING, count: NUMBER, values: listSchema(STRING), shadowed: { type: 'boolean' } }, ['name', 'type', 'kinds', 'count', 'values'])),
    rule: STRING,
  }),
  run(args, context) {
    const { survey } = load(context, args['plan'])
    const ask = askPlan(survey)
    const kinds = kindsOf(args)
    const counts = PART_KINDS.filter((k) => kinds === undefined || kinds.includes(k)).map((kind) => ({ kind, count: ask.parts.filter((p) => p.kind === kind).length }))
    const fields = GRID_FIELDS.filter((f) => kinds === undefined || f.kinds.some((k) => kinds.includes(k)))
    const facts = factInfos(ask, kinds)
    const lines = [
      `Parts: ${counts.map((c) => `${c.count} ${c.kind}${c.count === 1 ? '' : 's'}`).join(', ')}.`,
      `Fields Grid states or works out: ${fields.map((f) => `${f.name}${f.unit === null ? '' : ` (${f.unit})`} for ${f.kinds.length === PART_KINDS.length ? 'every part' : f.kinds.join(', ')}`).join('; ')}.`,
      facts.length === 0
        ? 'No part carries a fact of the person\'s own.'
        : `Facts of the person's own: ${facts.map((f) => `${q(f.name)} (${f.type}, on ${f.count} ${f.kinds.join(' and ')} part${f.count === 1 ? '' : 's'}${f.values.length > 0 ? `; ${f.values.map(q).join(', ')}` : ''}${f.shadowed ? `; ask it as ${q(`properties.${f.name}`)}` : ''})`).join('; ')}.`,
      'Ask with grid_find (which parts, with only the fields you name) or grid_count (how many, and sums, by a field), naming fields and facts as listed here.',
      QUERY_RULE,
    ]
    return { text: lines.join('\n'), data: { kinds: counts, fields, facts, rule: QUERY_RULE } }
  },
}

const findTool: GridTool = {
  name: 'grid_find',
  title: 'Find parts by their fields and facts',
  hint: 'read',
  description:
    'Use this when the person asks which parts of the plan have, lack or match something: "which doors have no fire rating", "rooms of the Sales department", "windows lower than 900 mm", "walls rated EI 60 on the first floor". '
    + 'It returns the ids of the walls, doors, windows, openings, rooms or floors that meet every condition, with only the fields you name, and a view argument to pass to grid_view so they are shown picked out. Facts of the person\'s own are as the plan gives them: Grid checks nothing against them. '
    + 'Call grid_fields first for the names. Do not use for how many or how much by group (grid_count), for areas (grid_areas) or for a door schedule (grid_schedule). Lengths are metres, areas square metres.',
  args: {
    plan: PLAN_ARG,
    kind: KIND_ARG,
    floor: FLOOR_ARG,
    room: ROOM_IN_ARG,
    where: WHERE_ARG,
    fields: { type: 'array', description: 'The fields and facts to give for each part found, by name, as grid_fields lists them. Only the ids when left out.', examples: [['fire rating'], ['name', 'area', 'department']], items: { maxLength: 120 }, minItems: 1, maxItems: 30 },
    limit: { type: 'number', description: 'The most parts to list; count still counts them all. 500 when left out.', examples: [100, 500], minimum: 1, maximum: 5000 },
  },
  outputSchema: objectSchema({
    count: NUMBER,
    ids: listSchema(STRING),
    rows: listSchema({ type: 'object' }),
    fields: listSchema(STRING),
    more: NUMBER,
    floors: listSchema(STRING),
    view: { type: 'object' },
    rule: STRING,
  }),
  run(args, context) {
    const { survey } = load(context, args['plan'], args['floor'])
    if (args['room'] !== undefined) roomArg(survey.plan, args['room'])
    return asked(() => {
      const ask = askPlan(survey)
      const kinds = kindsOf(args)
      const fields = ((args['fields'] as string[] | undefined) ?? []).map((name, i) => fieldOf(ask, name, `fields item ${i + 1}`))
      const found = select(ask, {
        ...(kinds === undefined ? {} : { kinds }),
        ...(args['floor'] === undefined ? {} : { floor: args['floor'] as string }),
        ...(args['room'] === undefined ? {} : { room: args['room'] as string }),
        ...(args['where'] === undefined ? {} : { where: args['where'] as string[] }),
      })
      const limit = Math.floor((args['limit'] as number | undefined) ?? 500)
      const listed = found.slice(0, limit)
      const rows = listed.map((part) => ({ id: part.id, ...Object.fromEntries(fields.map((field) => [fieldName(field), shown(ask.value(part, field))])) }))
      const ids = listed.map((p) => p.id)
      const { view, floors } = viewOf(ask, ids, { highlight: ids.slice(0, 2000) })
      const shownLines = listed.slice(0, 30).map((part) => `  ${part.kind} ${q(part.id)}${fields.length === 0 ? '' : `: ${fields.map((field) => `${q(fieldName(field))} ${valueText(field, ask.value(part, field))}`).join(', ')}`}`)
      const lines = [
        found.length === 0 ? `No part meets ${args['where'] === undefined ? 'the question' : 'every condition'}.` : `Found ${partsWord(kinds, found.length)}${found.length > limit ? `, the first ${limit} listed` : ''}:`,
        ...shownLines,
        ...(listed.length > 30 ? [`  … and ${listed.length - 30} more in the data.`] : []),
        ...(found.length === 0 ? [] : [`To see them picked out, pass view to grid_view${floors.length > 1 ? `: they are on ${floors.length} floors, so draw each floor in turn` : ''}.`]),
        QUERY_RULE,
      ]
      return { text: lines.join('\n'), data: { count: found.length, ids, rows, fields: fields.map(fieldName), more: Math.max(0, found.length - limit), floors, view, rule: QUERY_RULE } }
    })
  },
}

const countTool: GridTool = {
  name: 'grid_count',
  title: 'Count and sum parts by group',
  hint: 'read',
  description:
    'Use this when the person asks how many or how much, grouped by a field or a fact of their own: "area per department", "how many doors of each fire rating", "head count by floor", "total window width on each floor". '
    + 'It groups the parts that meet every condition by the field named in by, and gives each group its count, the sum of each field named in sum, and its ids, with a view argument to pass to grid_view so each group is shown in its own colour. Facts of the person\'s own are as the plan gives them: Grid checks nothing against them. '
    + 'Call grid_fields first for the names. Do not use for the list of parts itself (grid_find), for the plan\'s areas by use (grid_areas) or for a door schedule (grid_schedule). Areas are square metres, lengths metres.',
  args: {
    plan: PLAN_ARG,
    kind: KIND_ARG,
    floor: FLOOR_ARG,
    room: ROOM_IN_ARG,
    where: WHERE_ARG,
    by: { type: 'string', maxLength: 120, description: 'The field or fact to group by, by name, as grid_fields lists it: one group per value, and one for the parts that state none. One group of all of them when left out.', examples: ['department', 'fire rating', 'floor'] },
    sum: { type: 'array', description: 'Fields or facts of numbers to add up in each group, by name: area, width, head count.', examples: [['area'], ['area', 'head count']], items: { maxLength: 120 }, minItems: 1, maxItems: 10 },
  },
  outputSchema: objectSchema({
    by: { type: ['string', 'null'] },
    groups: listSchema(objectSchema({ value: {}, count: NUMBER, sums: { type: 'object' }, missing: { type: 'object' }, ids: listSchema(STRING) })),
    total: objectSchema({ count: NUMBER, sums: { type: 'object' }, missing: { type: 'object' } }),
    units: { type: 'object' },
    view: { type: 'object' },
    rule: STRING,
  }),
  run(args, context) {
    const { survey } = load(context, args['plan'], args['floor'])
    if (args['room'] !== undefined) roomArg(survey.plan, args['room'])
    return asked(() => {
      const ask = askPlan(survey)
      const kinds = kindsOf(args)
      const by = args['by'] === undefined ? null : fieldOf(ask, args['by'] as string, 'by')
      const sums = ((args['sum'] as string[] | undefined) ?? []).map((name, i) => fieldOf(ask, name, `sum item ${i + 1}`))
      checkSums(ask, sums)
      const picked = select(ask, {
        ...(kinds === undefined ? {} : { kinds }),
        ...(args['floor'] === undefined ? {} : { floor: args['floor'] as string }),
        ...(args['room'] === undefined ? {} : { room: args['room'] as string }),
        ...(args['where'] === undefined ? {} : { where: args['where'] as string[] }),
      })
      // CNT-8: a zone's floor and facts are its room's to count, so a zone is counted in no group.
      const found = picked.filter((part) => part.zoneOf === undefined)
      const zones = picked.filter((part) => part.zoneOf !== undefined)
      const groups = groupParts(ask, found, by, sums)
      const [total] = groupParts(ask, found, null, sums)
      const units = Object.fromEntries(sums.map((field) => [fieldName(field), unitOf(field)]))
      const sumText = (group: { sums: Readonly<Record<string, number>>; missing: Readonly<Record<string, number>> }): string =>
        sums.map((field) => {
          const name = fieldName(field)
          const missing = group.missing[name] ?? 0
          return `${q(name)} ${valueText(field, group.sums[name] ?? 0)}${missing > 0 ? ` (${missing} with none)` : ''}`
        }).join(', ')
      const lines = by === null
        ? []
        : [`By ${q(fieldName(by))}:`, ...groups.slice(0, 40).map((g) => `  ${g.value === null ? 'not stated' : valueText(by, g.value)}: ${partsWord(kinds, g.count)}${sums.length === 0 ? '' : `, ${sumText(g)}`}`), ...(groups.length > 40 ? [`  … and ${groups.length - 40} more groups in the data.`] : [])]
      lines.push(`In all: ${partsWord(kinds, found.length)}${sums.length === 0 || total === undefined ? '' : `, ${sumText(total)}`}.`)
      if (zones.length > 0) lines.push(`Not counted: ${zones.length === 1 ? 'a zone' : `${zones.length} zones`} of a room, counted with the room: ${zones.slice(0, 20).map((p) => q(p.id)).join(', ')}${zones.length > 20 ? ', …' : ''}. grid_find lists ${zones.length === 1 ? 'it' : 'them'}.`)
      const { view, floors } = viewOf(ask, found.map((p) => p.id), by === null ? { highlight: found.slice(0, 2000).map((p) => p.id) } : { colour: fieldName(by) })
      if (found.length > 0) lines.push(`To see ${by === null ? 'them picked out' : 'each group in its own colour'}, pass view to grid_view${floors.length > 1 ? `: they are on ${floors.length} floors, so draw each floor in turn` : ''}.`)
      lines.push(QUERY_RULE)
      return {
        text: lines.join('\n'),
        data: {
          by: by === null ? null : fieldName(by),
          groups,
          total: total === undefined ? { count: 0, sums: Object.fromEntries(sums.map((f) => [fieldName(f), 0])), missing: {} } : { count: total.count, sums: total.sums, missing: total.missing },
          units,
          view,
          rule: QUERY_RULE,
        },
      }
    })
  },
}

// ---------------------------------------------------------------------------------------------
// grid_measure

/** A room's height in words (ARE-10), with where it comes from. */
function heightText(height: RoomHeight, L: (v: number) => string): string {
  const { value, walls } = height
  if (height.from === 'roof' && height.roof !== undefined) return `Height ${L(height.roof.lowest)} to ${L(height.roof.highest)}, under the roof its floor states; the plan states none for the room.`
  if (value === null || walls === null) {
    return value === null ? 'Height not known: the plan states none for the room and no solid wall bounds it.' : `Height ${L(value)}, as the plan states for the room. No solid wall bounds it.`
  }
  const span = walls.high - walls.low < tolerance('joint') ? L(walls.low) : `${L(walls.low)} to ${L(walls.high)}`
  if (height.from === 'room') return `Height ${L(value)}, as the plan states for the room. Its walls stand ${span}.`
  if (height.from === 'walls') return `Height ${L(value)}, the height of its walls; the plan states none for the room.`
  return `Height ${L(value)}, the lowest of its walls: ${walls.lowest.map(q).join(', ')}, the others up to ${L(walls.high)}. The plan states none for the room.`
}

/** A thing named in a measure between two, made ready to measure, with how to name it in the answer. */
function thingOf(survey: Survey, named: ReturnType<typeof thingArg>): { thing: Thing; label: string } {
  const { plan } = survey
  if (named.kind === 'room') {
    const room = survey.byId.get(named.id)
    if (!room || room.polygon.length < 3) throw new ToolRefusal(`Room ${q(named.id)} has no outline Grid can measure; grid_check says why.`)
    return { thing: roomThing(room), label: `room ${q(room.facts.name)}` }
  }
  if (named.kind === 'wall') return { thing: wallThing(plan.walls.find((w) => w.id === named.id)!), label: `wall ${q(named.id)}` }
  if (named.kind === 'item') {
    const item = (plan.items ?? []).find((i) => i.id === named.id)!
    const fixture = planFixtures(plan).rows.find((row) => row.id === item.id)
    if (!fixture) throw new ToolRefusal(`Item ${q(item.id)} is left out of the drawing, so Grid cannot measure it; grid_check says why.`)
    return { thing: itemThing(item), label: `${fixture.label} ${q(item.id)}` }
  }
  const opening = plan.openings.find((o) => o.id === named.id)!
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (!wall) throw new ToolRefusal(`The wall of ${opening.type} ${q(opening.id)} is not in the plan; grid_check says so.`)
  return { thing: openingThing(opening, wall), label: `${opening.type} ${q(opening.id)}` }
}

const measureTool: GridTool = {
  name: 'grid_measure',
  title: 'Measure rooms, walls, distances and ways through',
  hint: 'read',
  description:
    'Use this when the person asks will something fit, how wide, long or high a room is, how long a wall is, how far a door is from a corner or one wall from another, can a wheelchair turn, is the way wide enough, which doors or rooms are narrower than their own figure, or how to get from one room to another. '
    + 'what=room gives a room\'s inside sizes, side by side, its height and the widest circle it holds; what=between gives the clear distance from one wall, door, window, opening, fixture or room (from) to another (to) or to a point (x, y), between their faces as a tape measures it, so a door\'s distance from the inside corner is between the door and the wall at the corner, and the gap between two fixtures is between their edges; what=wall gives a wall\'s length on its centre line and the length of its face in each room; what=fit says whether a box (width × depth) or a circle (diameter) fits and where; what=route gives the way from room to room (or to "outside") with every door on it and the narrowest one, and with width (a body or a trolley, such as 0.7 for a wheelchair) whether that gets through, measuring each doorway\'s clear width and the way through each room clear of its fixtures, and another way when the shortest is too narrow; what=use gives a room\'s use indicators: the turning circle its free floor holds, each doorway\'s clear width, the way through between its doorways, the floor in front of and beside each fixture, and any window a fixture stands in front of, each set against the person\'s figure (width, diameter, clearance) or Grid\'s own indicator, and said to be one; what=narrow lists the doors and openings narrower than under, and the rooms whose widest circle is less than under; what=facing says which way each room, outside wall and window faces by the north the plan states, so "which rooms face east" or "is the kitchen south-facing" (a plan that states no north is answered with north as the top of the drawing, and says so). '
    + 'It measures the room between wall faces: what=fit, what=use and what=route with width keep clear of the room\'s fixtures, the other measures take none off, the plan holds no furniture or door leaves, and the answer says so. It checks no rule: a figure the person gives is their own. Do not use for floor areas (grid_areas) or for what a building code asks (grid_check). Units are metres.',
  args: {
    plan: PLAN_ARG,
    what: { type: 'string', required: true, enum: ['room', 'between', 'wall', 'fit', 'route', 'narrow', 'facing', 'use'], description: 'What to measure: room, between, wall, fit, route, narrow, facing or use.', examples: ['between', 'fit', 'route', 'use'] },
    room: { type: 'string', id: true, description: 'For room, fit, use and route: the room id, where the route starts. For facing: one room only, every room when left out.', examples: ['kitchen', 'hall'] },
    from: { type: 'string', id: true, description: 'For between: the id of a wall, door, window, opening, fixture or room to measure from.', examples: ['front-door', 'w-west'] },
    to: { type: 'string', id: true, description: 'For between: the id of the wall, door, window, opening, fixture or room to measure to. For route: the room id where it ends, or "outside" for the nearest way out.', examples: ['w-west', 'bed1', 'outside'] },
    x: { type: 'number', length: true, description: 'For between, instead of to: a point\'s x on the drawing in metres, such as an inside corner. The plan names no points.', examples: [0.15], minimum: -limit('largest'), maximum: limit('largest') },
    y: { type: 'number', length: true, description: 'For between, with x: the point\'s y on the drawing in metres.', examples: [0.15], minimum: -limit('largest'), maximum: limit('largest') },
    wall: { type: 'string', id: true, description: 'For wall: the wall id.', examples: ['w-south'] },
    width: { type: 'number', length: true, description: 'For fit: the box\'s width in metres; a table of 1.8 × 0.9 m with 0.75 m round it for chairs is 3.3. For route and use: the width of the body or trolley that must get through, such as 0.7 for a wheelchair; for use, Grid\'s own indicator when left out.', examples: [3.3, 0.7], minimum: 0.05, maximum: 100 },
    depth: { type: 'number', length: true, description: 'For fit: the box\'s depth in metres. It is tried both ways round.', examples: [2.4, 0.6], minimum: 0.05, maximum: 100 },
    diameter: { type: 'number', length: true, description: 'For fit: a circle instead of a box, such as 1.5 for a wheelchair turning circle. For use: the turning circle to set the room against; Grid\'s own indicator when left out.', examples: [1.5], minimum: 0.05, maximum: 100 },
    clearance: { type: 'number', length: true, description: 'For use: the clear floor wanted in front of and beside each fixture, in metres, such as 0.7 beside a bath; Grid\'s own indicator when left out.', examples: [0.7], minimum: 0.05, maximum: 100 },
    under: { type: 'number', length: true, description: 'For narrow: the person\'s figure in metres, such as 0.8 for a door or 1.5 for a turning circle.', examples: [0.8, 1.5], minimum: 0.05, maximum: 100 },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
  },
  outputSchema: objectSchema({ what: STRING, answer: { type: 'object' }, rule: STRING }),
  run(args, context) {
    const { survey } = load(context, args['plan'])
    const what = args['what'] as 'room' | 'between' | 'wall' | 'fit' | 'route' | 'narrow' | 'facing' | 'use'
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const L = (v: number): string => lengthText(v, units)
    const allowed: Record<string, readonly string[]> = {
      room: ['room'],
      between: ['from', 'to', 'x', 'y'],
      wall: ['wall'],
      fit: ['room', 'width', 'depth', 'diameter'],
      route: ['room', 'to', 'width'],
      narrow: ['under'],
      facing: ['room'],
      use: ['room', 'width', 'diameter', 'clearance'],
    }
    const stray = ['room', 'from', 'to', 'x', 'y', 'wall', 'width', 'depth', 'diameter', 'under', 'clearance'].filter((key) => args[key] !== undefined && !allowed[what]!.includes(key))
    if (stray.length > 0) throw new ToolRefusal(`what=${what} takes ${allowed[what]!.join(', ')}, not ${stray.join(', ')}.`)
    const roomOf = (): ReturnType<Survey['byId']['get']> & object => {
      if (args['room'] === undefined) throw new ToolRefusal(`what=${what} needs room: a room id.`)
      const id = roomArg(survey.plan, args['room'])
      const room = survey.byId.get(id)
      if (!room || room.polygon.length < 3) throw new ToolRefusal('That room has no outline Grid can measure; grid_check says why.')
      return room
    }
    // CNT-8: a zone is part of its room, and the room is the place: the use indicators and the
    // ways through the plan measure the room as a whole, and say so.
    const wholeOf = (room: SurveyRoom): { room: SurveyRoom; said: string | null } => {
      const of = room.facts.zoneOf === undefined ? undefined : survey.byId.get(room.facts.zoneOf)
      if (of === undefined || of.polygon.length < 3) return { room, said: null }
      return { room: of, said: `${q(room.facts.name)} is a zone of ${q(of.facts.name)}: measured as part of it, the room as a whole.` }
    }
    if (what === 'room') {
      const room = roomOf()
      const r = measureRoom(room)
      const size = r.rectangle ? `${L(r.across)} × ${L(r.up)}` : `${L(r.across)} across by ${L(r.up)} up the drawing at most`
      const sides = r.sides.map((s) => `${s.facing} ${L(s.length)}`).join(', ')
      const height = roomHeight(survey.plan, r.id)
      return {
        text: `${q(r.name)}: ${size}, ${areaText(r.area, units)}, perimeter ${L(r.perimeter)}. Sides, going round: ${sides}. The widest circle it holds is ${L(r.widestCircle)} across.\n${heightText(height, L)}\n${EMPTY_ROOM_RULE}\n${HEIGHT_RULE}`,
        data: { what, answer: { ...r, height }, rule: `${EMPTY_ROOM_RULE} ${HEIGHT_RULE}` },
      }
    }
    if (what === 'use') {
      // CNT-13: the room's use indicators, each set against the person's figure or Grid's own.
      const asked = roomOf()
      const { room, said } = wholeOf(asked)
      const found = roomIndicators(survey, room, { width: args['width'], diameter: args['diameter'], clearance: args['clearance'] }, L)
      return {
        text: [...(said === null ? [] : [said]), ...found.lines, USE_RULE].join('\n'),
        data: { what, answer: { room: room.facts.id, ...(said === null ? {} : { zone: asked.facts.id }), indicators: found.indicators }, rule: USE_RULE },
      }
    }
    if (what === 'facing') {
      // CNT-3: which way the rooms, their outside walls and their windows face.
      const id = args['room'] === undefined ? undefined : roomArg(survey.plan, args['room'])
      const facing = facingAnswer(survey.plan, id)
      return { text: [...facing.lines, FACING_RULE].join('\n'), data: { what, answer: facing.data, rule: FACING_RULE } }
    }
    if (what === 'between') {
      if (args['from'] === undefined) throw new ToolRefusal('what=between needs from: the id of a wall, door, window, opening, fixture or room.')
      const hasPoint = args['x'] !== undefined || args['y'] !== undefined
      if (hasPoint === (args['to'] !== undefined)) throw new ToolRefusal('what=between takes to, or x and y for a point, after from.')
      if (hasPoint && (args['x'] === undefined || args['y'] === undefined)) throw new ToolRefusal('A point needs both x and y.')
      const first = thingOf(survey, thingArg(survey.plan, args['from'], 'from'))
      const second = hasPoint
        ? { thing: pointThing({ x: args['x'] as number, y: args['y'] as number }), label: `the point (${m(args['x'] as number)}, ${m(args['y'] as number)})` }
        : thingOf(survey, thingArg(survey.plan, args['to'], 'to'))
      if (second.thing.floor !== null && first.thing.floor !== second.thing.floor) {
        throw new ToolRefusal('Both things of a measure must be on the same floor: the plan says nothing of the height between floors.')
      }
      const found = distanceBetween(first.thing, second.thing)
      const said = found.distance === 0
        ? `${first.label} and ${second.label} touch or overlap: 0 m between them.`
        : `From ${first.label} to ${second.label}: ${L(found.distance)} clear, ${found.toward} on the drawing, from (${m(found.at[0].x)}, ${m(found.at[0].y)}) to (${m(found.at[1].x)}, ${m(found.at[1].y)}).`
      return {
        text: `${said.charAt(0).toUpperCase()}${said.slice(1)}\n${FACES_RULE}\n${EMPTY_ROOM_RULE}`,
        data: {
          what,
          answer: {
            from: { kind: first.thing.kind, id: first.thing.id },
            to: { kind: second.thing.kind, id: second.thing.id },
            floor: first.thing.floor,
            distance: found.distance,
            at: found.at,
            toward: found.toward,
          },
          rule: `${FACES_RULE} ${EMPTY_ROOM_RULE}`,
        },
      }
    }
    if (what === 'wall') {
      if (args['wall'] === undefined) throw new ToolRefusal('what=wall needs wall: a wall id.')
      const wall = survey.plan.walls.find((w) => w.id === wallArg(survey.plan, args['wall']))!
      const w = wallLengths(survey, wall)
      const kind = w.virtual ? 'dividing line' : `${L(w.thickness)} thick, ${L(w.height)} high`
      const faces = w.faces.length === 0 ? 'No room\'s outline runs along it.' : `Along its face in each room: ${w.faces.map((f) => `${q(f.name)} ${L(f.length)}`).join(', ')}.`
      return {
        text: `Wall ${q(w.id)}: ${L(w.length)} on its centre line, ${kind}. ${faces}\n${FACES_RULE}`,
        data: { what, answer: w, rule: FACES_RULE },
      }
    }
    if (what === 'fit') {
      const room = roomOf()
      const hasBox = args['width'] !== undefined || args['depth'] !== undefined
      if (hasBox === (args['diameter'] !== undefined)) throw new ToolRefusal('what=fit takes width and depth for a box, or diameter for a circle.')
      if (hasBox && (args['width'] === undefined || args['depth'] === undefined)) throw new ToolRefusal('A box needs both width and depth.')
      // CNT-12: the room's fixtures take their floor, so what is fitted keeps clear of them.
      const fixtures = planFixtures(survey.plan).rows.filter((row) => row.room === room.facts.id)
      const footprints = fixtures.map((row) => itemFootprint({ id: row.id, kind: row.kind, at: [row.at[0], row.at[1]], size: [row.size[0], row.size[1]], height: row.height, turn: row.turn }))
      const fit = fitInRoom(room, hasBox ? { width: args['width'] as number, depth: args['depth'] as number } : { diameter: args['diameter'] as number }, footprints)
      const where = fit.at ? `, for example centred at (${m(fit.at.x)}, ${m(fit.at.y)})${fit.turned ? ', turned a quarter' : ''}` : ''
      const clear = fixtures.length === 0 ? '' : `, clear of its ${fixtures.length === 1 ? 'fixture' : `${fixtures.length} fixtures`} (${fixtures.map((f) => `${f.label} ${q(f.id)}`).join(', ')})`
      const rule = fixtures.length === 0 ? EMPTY_ROOM_RULE : `${FIT_CLEAR_RULE} ${EMPTY_ROOM_RULE}`
      return {
        text: `${fit.what} ${fit.fits ? 'fits' : 'does not fit'} in ${q(room.facts.name)}${clear}${where}. The widest circle ${fixtures.length === 0 ? 'the room holds' : 'its free floor holds'} is ${L(fit.widestCircle)} across.\n${rule}`,
        data: { what, answer: { room: room.facts.id, ...fit, ...(fixtures.length === 0 ? {} : { clearOf: fixtures.map((f) => f.id) }) }, rule },
      }
    }
    if (what === 'route') {
      const asked = roomOf()
      if (args['to'] === undefined) throw new ToolRefusal('what=route needs to: a room id, or "outside".')
      const askedTo = args['to'] === 'outside' ? 'outside' : roomArg(survey.plan, args['to'], 'to')
      if (askedTo !== 'outside' && survey.byId.get(askedTo)?.facts.floor !== asked.facts.floor) throw new ToolRefusal('Both rooms of a route must be on the same floor: the plan says nothing of what joins floors.')
      // CNT-8: a zone is no place of its own: the way starts or ends in its room.
      const start = wholeOf(asked)
      const goal = askedTo === 'outside' ? undefined : survey.byId.get(askedTo)
      const end = goal === undefined ? null : wholeOf(goal)
      const room = start.room
      const to = askedTo === 'outside' ? 'outside' : (end?.room.facts.id ?? askedTo)
      const said = [start.said, end === null ? null : end.said].filter((line): line is string => line !== null)
      const zones = { ...(start.said === null ? {} : { fromZone: asked.facts.id }), ...(end === null || end.said === null ? {} : { toZone: askedTo }) }
      if (args['width'] !== undefined) {
        // CNT-13: a body or a trolley this wide, clear of the fixtures, room by room and doorway by doorway.
        const wide = wideRoute(survey, room.facts.id, to, args['width'] as number)
        if (wide === null) {
          return { text: [...said, `There is no way from ${q(room.facts.name)} to ${to === 'outside' ? 'the outside' : q(survey.byId.get(to)!.facts.name)} through the plan's doors and openings.`, USE_RULE].join('\n'), data: { what, answer: { found: false, ...zones }, rule: USE_RULE } }
        }
        const figure = figureOf(args['width'], 'usePassageWidth')
        return {
          text: [...said, ...wideRouteLines(survey, wide, figure, L), USE_RULE].join('\n'),
          data: { what, answer: { found: true, code: 'use/passage-width', figure, ...wide, ...zones }, rule: USE_RULE },
        }
      }
      const route = routeBetween(survey, room.facts.id, to)
      if (route === null) {
        return { text: [...said, `There is no way from ${q(room.facts.name)} to ${to === 'outside' ? 'the outside' : q(survey.byId.get(to)!.facts.name)} through the plan's doors and openings.`, EMPTY_ROOM_RULE].join('\n'), data: { what, answer: { found: false, ...zones }, rule: EMPTY_ROOM_RULE } }
      }
      const name = (id: string): string => (id === 'outside' ? 'outside' : q(survey.byId.get(id)?.facts.name ?? id))
      const steps = route.steps.map((s) => `${s.type} ${q(s.via)}${s.width === null ? '' : ` ${L(s.width)}`} into ${name(s.into)}`).join(', then ')
      const widths = route.rooms.map((id) => {
        const r = survey.byId.get(id)!
        return `${name(id)} ${L(measureRoom(r).widestCircle)}`
      }).join(', ')
      const lines = [
        ...said,
        `From ${name(route.from)} to ${name(route.to)}: ${steps}.`,
        route.narrowestPassage ? `Narrowest door or opening on the way: ${q(route.narrowestPassage.via)}, ${L(route.narrowestPassage.width)}.` : 'No door or opening on the way, only open sides.',
        `Widest circle in each room on the way: ${widths}.`,
        EMPTY_ROOM_RULE,
      ]
      return { text: lines.join('\n'), data: { what, answer: { found: true, ...route, ...zones }, rule: EMPTY_ROOM_RULE } }
    }
    if (args['under'] === undefined) throw new ToolRefusal('what=narrow needs under: the person\'s figure in metres.')
    const under = args['under'] as number
    const schedule = planSchedule(survey, { types: ['door', 'opening'], narrowerThan: under })
    const name = (id: string): string => (survey.facts.rooms.has(id) ? q(survey.facts.rooms.get(id)!.name) : id)
    const doors = schedule.rows.flatMap((row) => row.items.map((item) => ({ id: item.id, type: row.type, width: row.width, between: item.between })))
    const rooms = survey.rooms.filter((r) => r.polygon.length >= 3).map((r) => measureRoom(r)).filter((r) => r.widestCircle < under - tolerance('noLength'))
    const lines = [
      doors.length === 0 ? `No door or opening is narrower than ${L(under)}.` : `Narrower than ${L(under)}: ${doors.map((d) => `${d.type} ${q(d.id)} ${L(d.width)} (${name(d.between[0])} ↔ ${name(d.between[1])})`).join('; ')}.`,
      rooms.length === 0 ? `Every room holds a circle ${L(under)} across.` : `Rooms whose widest circle is under ${L(under)}: ${rooms.map((r) => `${q(r.name)} ${L(r.widestCircle)}`).join(', ')}.`,
      'These are the person\'s own figures, not a rule from any code or standard. Door sizes are the hole in the wall; the clear width past a door leaf is less.',
      EMPTY_ROOM_RULE,
    ]
    return { text: lines.join('\n'), data: { what, answer: { under, openings: doors, rooms: rooms.map((r) => ({ id: r.id, name: r.name, widestCircle: r.widestCircle })) }, rule: EMPTY_ROOM_RULE } }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_view

const COMPASS_HEADING: Record<string, number> = { north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315 }

/** The part a crop names on the floor: an id first, else a room's name (any case), else refused naming the rooms. */
function cropPart(plan: FloorPlan, floor: string, crop: string): PartBounds {
  const parts = partBounds(plan, floor)
  const byId = parts.find((p) => p.id === crop)
  if (byId) return byId
  const wanted = crop.trim().toLowerCase()
  const named = plan.rooms.filter((r) => floorOf(r) === floor && r.name.trim().toLowerCase() === wanted)
  if (named.length > 1) throw new ToolRefusal(`${named.length} rooms on that floor are named so: crop by id, one of ${named.map((r) => q(r.id)).join(', ')}.`)
  const room = named[0] && parts.find((p) => p.id === named[0]!.id)
  if (room) return room
  const rooms = plan.rooms.filter((r) => floorOf(r) === floor).slice(0, 30).map((r) => `${q(r.id)} (${q(r.name)})`)
  throw new ToolRefusal(`crop names no room, door, window or wall drawn on floor ${q(floor)}, nor a room's name. Its rooms: ${rooms.join(', ') || 'none'}.`)
}

/** The rooms, doors and windows of one floor, by id, as the check view draws them. */
function idsOnFloor(plan: FloorPlan, floor: string): string[] {
  const walls = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  return [
    ...plan.rooms.filter((r) => floorOf(r) === floor).map((r) => r.id),
    ...plan.openings.filter((o) => walls.get(o.wall) === floor).map((o) => o.id),
  ]
}

/**
 * What comes with the check view (VEW-2): the rooms with their areas and what each opening
 * joins, by id (the agent's description), then the counts on the floor and the drawing's
 * problems. Ids are those drawn on the picture.
 */
function checkViewText(loaded: LoadedPlan, floor: string): string[] {
  const { plan } = loaded
  const walls = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  const openings = plan.openings.filter((o) => walls.get(o.wall) === floor)
  const rooms = plan.rooms.filter((r) => floorOf(r) === floor).length
  const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`
  const doors = openings.filter((o) => o.type === 'door').length
  const windows = openings.filter((o) => o.type === 'window').length
  const lines = [
    'On the picture every room carries its id in brackets after its name, and every door, window and opening its id beside it.',
    `On floor ${q(floor)}: ${count(rooms, 'room')}, ${count(doors, 'door')}, ${count(windows, 'window')} and ${count(openings.length - doors - windows, 'doorless opening')}.`,
    describePlan(loaded, 'rooms', 'agent').trimEnd(),
  ]
  const issues = loaded.issues
  lines.push(`Problems in the drawing, on every floor: ${issues.length === 0 ? 'none found' : issues.length}.`)
  for (const issue of issues.slice(0, 8)) lines.push(`  ${issue.severity === 'error' ? 'left out' : 'worth a look'}, ${issue.entity} ${q(issue.id)}: ${issue.message}`)
  if (issues.length > 8) lines.push(`  … ${issues.length - 8} more: grid_check lists them all.`)
  return lines
}

/**
 * CNT-9: what a plan picture picks out: the parts `highlight` names, in one colour, and the parts
 * of the floor coloured by a field or a fact (`colour`), one colour per value. Ids not on the floor
 * drawn are counted, never drawn; an id the plan does not have is refused with the nearest one.
 */
function paintOf(survey: Survey, floor: string, by: string | undefined, highlight: readonly string[] | undefined): {
  paint: Map<string, string>
  key: { colour: string; words: string }[]
  groups: { colour: string; value: Value; words: string; ids: string[] }[]
  lines: string[]
} | null {
  if (by === undefined && highlight === undefined) return null
  return asked(() => {
    const ask = askPlan(survey)
    const onFloor = ask.parts.filter((p) => p.floor === floor && p.kind !== 'floor')
    const paint = new Map<string, string>()
    const key: { colour: string; words: string }[] = []
    const groups: { colour: string; value: Value; words: string; ids: string[] }[] = []
    const lines: string[] = []
    if (by !== undefined) {
      const field = fieldOf(ask, by, 'colour')
      const carrying = onFloor.filter((p) => {
        const value = ask.value(p, field)
        return value !== null && !(Array.isArray(value) && value.length === 0)
      })
      const found = groupParts(ask, carrying, field, [])
      // One colour per value; past the palette, the last colour stands for all the others.
      const own = found.length <= GROUP_COLOURS.length ? found.length : GROUP_COLOURS.length - 1
      found.forEach((group, i) => {
        const colour = GROUP_COLOURS[Math.min(i, own)]!
        for (const id of group.ids) paint.set(id, colour)
        groups.push({ colour, value: group.value, words: valueWords(group.value), ids: [...group.ids] })
        if (i < own) key.push({ colour, words: `${fieldName(field)}: ${valueWords(group.value)}` })
      })
      if (found.length > own) key.push({ colour: GROUP_COLOURS[own]!, words: `${fieldName(field)}: ${found.length - own} other values` })
      lines.push(found.length === 0
        ? `No part on this floor carries ${q(fieldName(field))}: nothing is coloured.`
        : `Coloured by ${q(fieldName(field))}: ${groups.map((g) => `${q(g.words)} ${g.ids.length} (${g.colour})`).join(', ')}. Parts with no value keep their usual look.`)
    }
    if (highlight !== undefined) {
      const known = new Map(ask.parts.filter((p) => p.kind !== 'floor').map((p) => [p.id, p] as const))
      const missing = highlight.filter((id) => !known.has(id))
      if (missing.length > 0) {
        const near = likelyId(missing[0]!, [...known.keys()])
        throw new ToolRefusal(`highlight names ${missing.length === 1 ? 'an id' : `${missing.length} ids`} the plan has no room, wall, door, window or opening for.${near === null ? '' : ` The nearest known id is ${q(near)}.`}`)
      }
      const here = highlight.filter((id) => known.get(id)!.floor === floor)
      for (const id of here) paint.set(id, HIGHLIGHT_COLOUR)
      key.push({ colour: HIGHLIGHT_COLOUR, words: 'Picked out' })
      groups.push({ colour: HIGHLIGHT_COLOUR, value: null, words: 'picked out', ids: here })
      const elsewhere = new Map<string, number>()
      for (const id of highlight) if (known.get(id)!.floor !== floor) elsewhere.set(known.get(id)!.floor, (elsewhere.get(known.get(id)!.floor) ?? 0) + 1)
      lines.push(`Picked out ${here.length} of the ${highlight.length} asked for on this floor${elsewhere.size === 0 ? '' : `; the others are on ${[...elsewhere].map(([f, n]) => `floor ${q(f)} (${n})`).join(', ')}`}.`)
    }
    return { paint, key, groups, lines }
  })
}

const viewTool: GridTool = {
  name: 'grid_view',
  title: 'Draw a view of the plan',
  hint: 'read',
  description:
    'Use this when the person asks to see the plan: "can I see it", a floor plan, a 3D view from the garden side or from above, "stand me in the kitchen looking at the garden", "can I see out sitting down", or a black and white drawing. '
    + 'kind=plan draws one floor from above with its sizes; kind=3d draws the model from a side of the drawing (north here is the top of the drawing, whatever north the plan states; grid_measure what=facing says which way the rooms face); kind=eye stands in a room at eye_height and looks level toward an opening or a direction, and lists the window sills against that eye height. '
    + 'It returns the picture with the numbers that made it; look at the picture before you describe it. It changes nothing and writes no file. Do not use for a file to hand on (grid_export) or to move the person\'s live preview (grid_preview). The model of one floor has no roof; a building of several floors is drawn with a flat roof over every part with nothing above. It has no furniture, glass or door leaves. Units are metres.',
  args: {
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    plan: PLAN_ARG,
    kind: { type: 'string', required: true, enum: ['plan', '3d', 'eye'], description: 'plan, 3d or eye.', examples: ['plan', 'eye'] },
    floor: { ...FLOOR_ARG, description: 'For plan: the floor to draw, the lowest when left out. For 3d: that floor cut away, the whole building when left out.' },
    from: { type: 'string', enum: SIDES, description: 'For 3d: the side of the drawing the camera stands on, or above. south-east when left out.', examples: ['south', 'above'] },
    room: { type: 'string', id: true, description: 'For eye: the room to stand in.', examples: ['kitchen', 'living'] },
    toward: { type: 'string', maxLength: 64, description: 'For eye: an opening id to look at, or a direction (north, north-east, east, south-east, south, south-west, west, north-west). The room\'s first window when left out.', examples: ['back-door', 'north'] },
    eye_height: { type: 'number', length: true, description: 'For eye: metres above the floor. 1.6 standing when left out; about 1.2 seated.', examples: [1.6, 1.2], minimum: 0.3, maximum: 3 },
    look: { type: 'string', enum: LOOKS, description: 'For plan: working (the default: clear labels and strong contrast), technical for black on white as on a sheet, with lines in millimetres at the scale and doors with no stated swing marked "?", or dark. light and mono are older names for working and technical.', examples: ['working', 'technical'] },
    dimensions: { type: 'boolean', description: 'For plan: false to leave the sizes off, for a clean drawing. true when left out.', examples: [true, false] },
    crop: { type: 'string', maxLength: 120, description: 'For plan: frame just this part: a room, door, window or wall id, or a room\'s name. The whole floor when left out.', examples: ['kitchen', 'front-door'] },
    ids: { type: 'boolean', description: 'For plan: true to draw the id of every room, door and window on the picture, as the plan file holds them, and to list them in the text with the areas, what each door joins, the counts and the drawing\'s problems. false when left out.', examples: [true] },
    hide: { type: 'string', maxLength: 120, description: 'For plan: parts to leave off, joined by commas: title, key, notes, sketch, dimensions, areas, swings, warnings, above (the dashed outline of the floor above). Everything is drawn when left out.', examples: ['areas,swings', 'sketch'] },
    colour: { type: 'string', maxLength: 120, description: 'For plan: use fills each room by its use and lists the uses in the key; any other field or fact, by name as grid_fields lists it (department, fire rating), colours each room, wall, door and window by its value, with a key: grid_count\'s view passes it. One fill for every room when left out.', examples: ['use', 'department', 'fire rating'] },
    highlight: { type: 'array', description: 'For plan: rooms, walls, doors, windows or openings to pick out, by id, in one colour with a key: grid_find\'s view passes its ids here. Nothing picked out when left out.', examples: [['d1', 'd4'], ['office-2']], items: { id: true }, minItems: 1, maxItems: 2000 },
    key: { type: 'boolean', description: 'For plan: true to add a key under the drawing, even where the plan asks for none.', examples: [true] },
  },
  outputSchema: objectSchema({ kind: STRING, floor: { type: ['string', 'null'] }, camera: { type: ['object', 'null'] }, pxPerMetre: NULLABLE_NUMBER, sills: { type: 'array' }, ids: listSchema(STRING), boxes: { type: 'array' }, painted: { type: 'array' } }, ['kind', 'floor', 'camera', 'pxPerMetre', 'sills', 'ids', 'boxes']),
  async run(args, context) {
    const { loaded } = readPlan(context, args['plan'])
    const survey = surveyPlan(loaded.plan)
    const floor = floorArg(loaded.plan, args['floor'])
    const kind = args['kind'] as 'plan' | '3d' | 'eye'
    const allowed: Record<string, readonly string[]> = { plan: ['floor', 'look', 'dimensions', 'ids', 'crop', 'hide', 'colour', 'key', 'highlight'], '3d': ['floor', 'from'], eye: ['room', 'toward', 'eye_height'] }
    const stray = ['floor', 'from', 'room', 'toward', 'eye_height', 'look', 'dimensions', 'ids', 'crop', 'hide', 'colour', 'key', 'highlight'].filter((key) => args[key] !== undefined && !allowed[kind]!.includes(key))
    if (stray.length > 0) throw new ToolRefusal(`kind=${kind} takes ${allowed[kind]!.join(', ')}, not ${stray.join(', ')}.`)
    const plan = survey.plan
    if (kind === 'plan') {
      const asked = (args['look'] as LookName | undefined) ?? 'working'
      const look = asked === namedLook(asked) ? asked : `${namedLook(asked)} (asked as ${asked})`
      const { planView } = await import('../draw/views')
      const withIds = args['ids'] === true
      const shown = floor ?? survey.facts.floors[0]?.id ?? 'ground'
      const crop = args['crop'] === undefined ? null : cropPart(plan, shown, args['crop'] as string)
      // What went wrong, numbered as grid_check numbers it, marked on the drawing (MSG-8).
      const faults = inspectPlan(plan).lines
      const display = args['units'] === undefined && args['decimal'] === undefined ? undefined : displayFor(args['units'], args['decimal'], plan)
      // SHT-7: what the picture shows, read as grid draw reads --hide, --colour and --key.
      let shownParts
      const colour = args['colour'] as string | undefined
      try {
        shownParts = drawShowOf({ hide: args['hide'] as string | undefined, colour: colour === 'use' ? 'use' : undefined, key: args['key'] === true })
      } catch (error) {
        if (error instanceof UsageError) throw new ToolRefusal(error.message.replace(/--(hide|colour|key)\b/g, '$1'))
        throw error
      }
      // CNT-9: parts picked out by id, or coloured by a field or fact, from grid_find's and grid_count's view.
      const painted = paintOf(survey, shown, colour === 'use' ? undefined : colour, args['highlight'] as string[] | undefined)
      if (painted !== null) shownParts = { ...shownParts, show: { ...shownParts.show, paint: painted.paint, paintKey: painted.key } }
      const dimensions = args['dimensions'] !== false && shownParts.showDimensions
      const view = await planView(plan, { floor: shown, look: asked, dimensions, ids: withIds, faults, show: shownParts.show, ...(display ? { display } : {}), ...(crop ? { frame: cropFrame(crop) } : {}) })
      const lines = [`Plan of floor ${q(shown)}${crop ? `, cropped to ${crop.kind} ${q(crop.id)}` : ''}, ${look}${args['dimensions'] === false ? ', without sizes' : ', with inside sizes'}: ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px. ${plan.north === undefined ? 'North is the top of the drawing; the plan holds no real north.' : `The north arrow in its top-right corner points to the north the plan states, ${northWords(wrapDegrees(plan.north))}; the sides named in other answers are the drawing's, north at the top.`} Look at the picture before you describe it.`]
      const ids = withIds ? idsOnFloor(plan, shown) : []
      const undecided = view.undecidedDoors ?? []
      if (undecided.length > 0) {
        lines.push(`Drawn with a dashed line and "?" as undecided, ${undecided.length === 1 ? 'a door' : `${undecided.length} doors`} with no stated swing: ${undecided.map(q).join(', ')}. Ask the person which side each is hinged on and which way it opens, then set its hinge and swing.`)
      }
      lines.push('Each part\'s box on the picture, in pixels from its top-left corner, is in boxes: id, kind and x, y, width, height.')
      const marked = faults.filter((line) => line.floor === null || line.floor === shown).length
      if (marked > 0) lines.push(`${marked} of grid_check's lines are about this floor: each has its grid_check number on the part it is about, and all are listed under the drawing. A room that cannot be drawn is the dashed box round its walls.`)
      if (withIds) lines.push(...checkViewText(loaded, shown))
      if (painted !== null) lines.push(...painted.lines)
      return {
        text: lines.join('\n'),
        data: { kind, floor: shown, camera: null, pxPerMetre: view.pxPerMetre, sills: [], ids, boxes: view.boxes ?? [], ...(painted === null ? {} : { painted: painted.groups }) },
        image: { data: view.png, mimeType: 'image/png' },
      }
    }
    if (kind === '3d') {
      const from = (args['from'] as Side | undefined) ?? 'south-east'
      const { modelView } = await import('../draw/views')
      const view = await modelView(plan, { from, ...(floor ? { floor } : {}) })
      // LVL-4: the whole of a building of several floors is drawn closed, with its roofs; one floor
      // alone, or a floor cut away, is drawn open from above, as the 3D view draws it.
      const roofed = floor === undefined && planFloors(plan).length > 1
      const roof = roofed ? 'Every part with nothing above it has a flat roof; the model has no furniture, glass or door leaves.' : 'The model has no roof, furniture, glass or door leaves.'
      return {
        text: `The model from the ${from === 'above' ? 'air, looking down' : `${from} side of the drawing`}${floor ? `, floor ${q(floor)} cut away` : ''}. North is the top of the drawing${plan.north === undefined ? '' : `, not the north the plan states (${northWords(wrapDegrees(plan.north))})`}. ${roof} Look at the picture before you describe it.`,
        data: { kind, floor: floor ?? null, camera: view.camera, pxPerMetre: null, sills: [], ids: [], boxes: [] },
        image: { data: view.png, mimeType: 'image/png' },
      }
    }
    if (args['room'] === undefined) throw new ToolRefusal('kind=eye needs room: the room to stand in.')
    const id = roomArg(plan, args['room'])
    const room = survey.byId.get(id)
    if (!room || room.polygon.length < 3) throw new ToolRefusal('That room has no outline Grid can draw; grid_check says why.')
    const height = (args['eye_height'] as number | undefined) ?? 1.6
    const windows = room.openings.filter((o) => o.type === 'window')
    let toward: number | { x: number; y: number }
    let looking: string
    const given = args['toward'] as string | undefined
    if (given !== undefined && Object.hasOwn(COMPASS_HEADING, given)) {
      toward = COMPASS_HEADING[given]!
      looking = given
    } else {
      const target = given !== undefined ? openingArg(plan, given) : (windows[0]?.id ?? room.openings[0]?.id)
      if (target === undefined) throw new ToolRefusal('That room has no opening to look at: pass toward as a direction, such as north.')
      const facts = survey.facts.openings.get(target)
      if (!facts) throw new ToolRefusal('That opening can\'t be drawn; grid_check says why.')
      const wall = plan.walls.find((w) => w.id === facts.wall)!
      const t = (facts.offset + facts.width / 2) / Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      toward = { x: wall.start[0] + (wall.end[0] - wall.start[0]) * t, y: wall.start[1] + (wall.end[1] - wall.start[1]) * t }
      looking = `${facts.type} ${q(target)}`
    }
    const { eyeView } = await import('../draw/views')
    const view = await eyeView(plan, { floor: room.facts.floor, polygon: room.polygon, height, toward })
    const sills = windows.map((w) => ({ id: w.id, sill: w.sill, top: w.sill + w.height, seenOver: w.sill < height }))
    const sillText = sills.length === 0
      ? 'The room has no windows.'
      : `Windows in the room, sill and top against the eye at ${m(height)} m: ${sills.map((s) => `${q(s.id)} sill ${m(s.sill)}, top ${m(s.top)} (${s.sill < height ? 'the eye is above the sill' : 'the sill is at or above the eye'})`).join('; ')}.`
    return {
      text: `Standing in ${q(room.facts.name)} at (${m(view.camera.at[0])}, ${m(view.camera.at[1])}), eye ${m(height)} m above the floor, looking level toward ${looking} (heading ${view.camera.heading.toFixed(0)}° from the top of the drawing), 90° across. ${sillText} The model has no ceiling, glass, furniture or anything outside. Look at the picture before you describe it.`,
      data: { kind, floor: room.facts.floor, camera: view.camera, pxPerMetre: null, sills, ids: [], boxes: [] },
      image: { data: view.png, mimeType: 'image/png' },
    }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_describe

const describeTool: GridTool = {
  name: 'grid_describe',
  title: 'Read the plan in room terms',
  hint: 'read',
  description:
    'Use this when the person asks what is in the plan, what the rooms are and how they connect, which side a door or window is on, or when you need to read the plan before changing it. '
    + 'It gives the plan in rooms: each room with its inside size and area, the rooms next to it, and each door and window with the side it is on, its distance from the corners and the two rooms it joins. '
    + 'length=line is one line, rooms (the default) each room, walls also every wall. for=person never shows an id; for=agent is terse and gives the ids to edit with. '
    + 'as=rooms reads the plan back as rooms text instead, the way plans are written: change it and pass it to grid_write_rooms, which writes it back losing nothing. Do not use for an area table (grid_areas) or a picture (grid_view). Units are metres.',
  args: {
    plan: PLAN_ARG,
    length: { type: 'string', enum: DESCRIBE_LENGTHS, description: 'line, rooms or walls. rooms when left out.', examples: ['rooms', 'line'] },
    for: { type: 'string', enum: DESCRIBE_AUDIENCES, description: 'person (names only, no ids) or agent (terse, with ids). agent when left out.', examples: ['agent', 'person'] },
    as: { type: 'string', enum: ['rooms'], description: 'rooms: the plan as rooms text, to change and write again with grid_write_rooms. Takes no length or for.', examples: ['rooms'] },
  },
  outputSchema: objectSchema({ length: { type: ['string', 'null'] }, for: { type: ['string', 'null'] }, as: { type: ['string', 'null'] }, text: STRING }),
  run(args, context) {
    if (args['as'] !== undefined && (args['length'] !== undefined || args['for'] !== undefined)) {
      throw new ToolRefusal('as=rooms reads the plan back as rooms text, which has no length or for: leave them out.')
    }
    const { loaded } = readPlan(context, args['plan'])
    if (args['as'] === 'rooms') {
      const text = describeRooms(loaded)
      return { text, data: { length: null, for: null, as: 'rooms', text } }
    }
    const length = (args['length'] as (typeof DESCRIBE_LENGTHS)[number] | undefined) ?? 'rooms'
    const audience = (args['for'] as (typeof DESCRIBE_AUDIENCES)[number] | undefined) ?? 'agent'
    const text = describePlan(loaded, length, audience)
    return { text, data: { length, for: audience, as: null, text } }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_check

/** The country argument of grid_check and grid_mark_seen: the numbers follow the record it makes. */
export const COUNTRY_ARG: ArgSpec = {
  type: 'string',
  maxLength: PLACE_TEXT_MAX,
  description: 'Where it will be built, for this check, in place of the plan\'s site.country: a country\'s name or its two- or three-letter code (US, USA, United States, Spain). Figures are applied only where they hold; with no place stated, none is.',
  examples: ['US', 'United States', 'ES'],
}

/** COD-3: how grid_check's first line names the place it was given. */
const TOOL_PLACE: PlaceWords = { request: 'the country argument', give: 'give country' }

/** MSG-10: a line's seen state as data: the mark, and with `back` the parts that changed since. */
function seenData(state: SeenState | undefined): Record<string, unknown> | undefined {
  if (state === undefined || state.state === 'new') return undefined
  const { reason, by, at } = state.mark
  return state.state === 'seen'
    ? { state: 'seen', reason, by, at }
    : { state: 'back', reason, by, at, changed: state.changed.map((p) => ({ kind: p.kind, id: p.id })) }
}

/** One line of grid_check's list. COD-2: a line that used a figure says what it needed, which names the kind of building the figure was read for. */
function toolLine(result: CheckResult, index: number): string {
  const line = result.result.lines[index]!
  // MSG-5: a line that follows from another is set under it, and says so.
  return `  ${line.causedBy ? '  ' : ''}${result.numbers[index]}. ${KIND_WORDS[line.kind]}, ${thingText(line)}: ${line.message}.${usedFigures(line) ? ` Needed: ${line.needed}.` : ''}${line.causedBy ? ` Follows from ${causeText(line.causedBy)}.` : ` Fix: ${line.fix}`} [${line.code}]`
}

const checkTool: GridTool = {
  name: 'grid_check',
  title: 'Check the plan',
  hint: 'read',
  description:
    'Use this when you have changed the plan, or when the person asks whether the plan is drawn right or what Grid\'s checks find: problems in the drawing itself, and notes from the general checks it runs (room sizes, ways out, door swings). '
    + 'Every answer carries the label "General guidance, not your local rules". It never says a plan complies or is allowed: "is it allowed" is for the person\'s local authority, and the answer says what was not checked. '
    + 'The answer is short and about this plan: the notes, the figures they used, what each check looked at, and the notes the person set aside as seen (grid_mark_seen), each still listed under Seen; full=true adds the checks run, every figure and what these checks never look at. '
    + 'Do not use to measure (grid_measure) or for areas (grid_areas).',
  args: {
    plan: PLAN_ARG,
    floor: { ...FLOOR_ARG, description: 'Only what was found on this floor. Every floor when left out.' },
    country: COUNTRY_ARG,
    full: { type: 'boolean', description: 'true for the whole report: the checks run, every figure with its basis and status, each check\'s coverage and what these checks never look at. Short when left out.', examples: [true] },
  },
  outputSchema: objectSchema({
    label: STRING,
    // MSG-1: the one list and the one count, as docs/result-contract.md sets them out.
    count: { type: 'number' },
    // MSG-5: the lines that follow from no other: the problems to act on.
    problems: { type: 'number' },
    lines: listSchema(objectSchema({
      code: STRING,
      kind: STRING,
      thing: objectSchema({ kind: STRING, id: STRING }),
      floor: { type: ['string', 'null'] },
      also: listSchema(STRING),
      message: STRING,
      found: STRING,
      needed: STRING,
      fix: STRING,
      // On a finding that applied a figure: each figure with its source and status.
      figures: { type: 'array' },
      // MSG-7: the change that would clear the line, as data, and the same as a call to retry.
      fixes: { type: 'array' },
      calls: listSchema(objectSchema({ tool: STRING, arguments: { type: 'object' } }, ['tool', 'arguments'])),
      // MSG-5: the line this one follows from; the parts a line for several stands for; the notes held back.
      causedBy: objectSchema({ code: STRING, id: STRING }),
      each: listSchema(objectSchema({ kind: STRING, id: STRING })),
      held: listSchema(objectSchema({
        code: STRING,
        thing: objectSchema({ kind: STRING, id: STRING }),
        floor: STRING,
        also: listSchema(STRING),
        waitsFor: listSchema(STRING),
      })),
      // MSG-10: the person's seen mark, when the line has one: seen, or back (new again, its parts changed since).
      seen: objectSchema({ state: STRING, reason: STRING, by: STRING, at: STRING, changed: listSchema(objectSchema({ kind: STRING, id: STRING })) }, ['state', 'reason', 'by', 'at']),
    }, ['code', 'kind', 'thing', 'floor', 'also', 'message', 'found', 'needed', 'fix'])),
    // MSG-10: how many lines are seen, the marks file beside the plan, and why it could not be read.
    seenCount: { type: 'number' },
    marksFile: STRING,
    marksProblem: { type: ['string', 'null'] },
    // The rooms a finding is about, by id and name, apart from the message: text from the plan file.
    findings: listSchema(objectSchema({ floor: STRING, message: STRING, rooms: listSchema(objectSchema({ id: STRING, name: STRING })) })),
    notChecked: listSchema(objectSchema({ floor: STRING, message: STRING })),
    drawing: listSchema(objectSchema({ severity: STRING, entity: STRING, id: STRING, message: STRING })),
    // MSG-2: what each check looked at and skipped, with the reason and a count (docs/result-contract.md).
    coverage: listSchema(objectSchema({
      ruleId: STRING,
      title: STRING,
      looksAt: STRING,
      lookedAt: listSchema(objectSchema({ floor: STRING, ids: listSchema(STRING) })),
      lookedAtCount: { type: 'number' },
      skipped: listSchema(objectSchema({ floor: STRING, ids: listSchema(STRING), reason: STRING, why: STRING })),
      skippedCount: { type: 'number' },
      findings: { type: 'number' },
    }, ['ruleId', 'title', 'looksAt', 'lookedAt', 'lookedAtCount', 'skipped', 'skippedCount', 'findings'])),
    // COD-4: what these checks never look at, whatever the plan (ceiling height, which walls carry load).
    limits: listSchema(STRING),
    // COD-3: the place the figure checks were for, from Grid's list, or null when none is stated (then no figure was applied).
    place: { type: ['object', 'null'], properties: { country: STRING, name: STRING, from: STRING } },
    // COD-3: with no place, how many lines the US figures would have given.
    withoutPlace: objectSchema({ usLines: { type: 'number' } }, ['usLines']),
  }),
  run(args, context) {
    const { loaded, project, file } = readPlan(context, args['plan'])
    const floor = floorArg(loaded.plan, args['floor'])
    const full = args['full'] === true
    let result
    try {
      result = checkPlan(loaded, { ...(floor ? { floor } : {}), ...(args['country'] ? { country: args['country'] as string } : {}) }, 'country')
      result = withSeen(result, loaded, readSeen(project, file))
    } catch (error) {
      throw asRefusal(error)
    }
    const roomName = new Map(loaded.plan.rooms.map((r) => [r.id, r.name]))
    const findings = result.report.findings.map((f) => ({
      floor: f.floor,
      message: f.message,
      rooms: f.rooms.map((id) => ({ id, name: roomName.get(id) ?? '' })),
    }))
    const notChecked = result.report.notChecked.map((n) => ({ floor: n.floor, message: n.message }))
    const drawing = result.issues.map((i) => ({ severity: i.severity, entity: i.entity, id: i.id, message: i.message }))
    const record = result.result
    const states = result.seen?.states ?? []
    const seen = seenCount(result)
    // COD-3: right after the label, the place and the figures applied, or that none was.
    const lines: string[] = [GENERAL_GUIDANCE_LABEL, placeText(result.report, TOOL_PLACE)]
    if (result.seen?.problem) lines.push(`The seen marks were not read: ${result.seen.problem}. Every note is listed as new.`)
    const seenWords = seen > 0 ? `; ${seen} of them seen, under Seen` : ''
    const checksRun = result.report.rules.length === 0 ? `Checks run: none. ${NOTHING_CHECKED}` : `Checks run: ${result.report.rules.length}.`
    // NOTHING_FOUND: an empty list only means these checks found nothing.
    lines.push(`To look at: ${record.count === 0 ? `nothing. ${NOTHING_FOUND}` : `${record.count} (${countsText(record)}${seenWords}).${problemsText(record)}`} ${checksRun}`)
    if (full) for (const rule of result.report.rules) lines.push(`  - ${rule.title} (${rule.source.label})`)
    // A seen line is listed under Seen, never left out (MSG-10).
    const open = record.lines.map((_, index) => index).filter((index) => states[index]?.state !== 'seen')
    for (const index of open.slice(0, 12)) {
      lines.push(toolLine(result, index))
      const state = states[index]
      if (state?.state === 'back') lines.push(`${record.lines[index]!.causedBy ? '  ' : ''}      ${seenBeforeText(state)}.`)
    }
    if (open.length > 12) lines.push(`  … ${open.length - 12} more in the data, each with what was found and needed.`)
    // WRT-6 (lab WR-15): what was assumed, for the person to confirm, named even past the first 12.
    // A seen one is under Seen with the others (MSG-10).
    const toConfirm = open.map((index) => record.lines[index]!).filter((line) => line.kind === 'to-confirm')
    if (toConfirm.length > 0) lines.push(`To confirm with the person (${toConfirm.length}), assumed and not given: ${toConfirm.slice(0, 8).map((line) => line.message).join('; ')}${toConfirm.length > 8 ? `; and ${toConfirm.length - 8} more in the data` : ''}.`)
    if (seen > 0) {
      lines.push(`Seen (${seen}): ${SEEN_HEADING_NOTE}.`)
      record.lines.forEach((line, index) => {
        const state = states[index]
        if (state?.state === 'seen') lines.push(`  ${result.numbers[index]}. ${KIND_WORDS[line.kind]}, ${thingText(line)}: ${line.message}. Seen ${seenByText(state.mark)}. [${line.code}]`)
      })
    }
    // MSG-7: each line one call would clear carries that call, ready to send.
    const withCalls = record.lines.map((line, index) => {
      const withFix = withFixCalls(line, args['plan'])
      const mark = seenData(states[index])
      return mark === undefined ? withFix : { ...withFix, seen: mark }
    })
    const callable = withCalls.filter((line) => line.calls !== undefined).length
    if (callable > 0) lines.push(`${callable === 1 ? 'One line carries' : `${callable} lines carry`} the call that would fix it, under calls in the data.`)
    if (record.counts.finding === 0 && record.count > 0) lines.push('No findings only means these checks found nothing, not that the plan meets any rule.')
    if (full) {
      // MSG-2: what each check looked at, beside the count, so an empty list cannot read as a pass.
      const rooms = result.rooms
      lines.push(`Looked at by at least one check: ${rooms.rooms === 0 ? 'no rooms, the plan has none' : `${rooms.lookedAt} of ${partsText(rooms.rooms, 'room')}`}.`)
      for (const check of record.coverage) {
        const skipped = check.skippedCount === 0 ? '' : `; not looked at ${check.skippedCount}: ${[...new Set(check.skipped.map((s) => s.why))].join('; ')}`
        const readFor = check.readFor === undefined || check.readFor.length === 0 ? '' : `; its figures were read for ${buildingKindsText(check.readFor)}`
        lines.push(check.lookedAtCount === 0 ? `  ${nothingCheckedText(check.title, check.looksAt)}${skipped}${readFor}.` : `  ${check.title}: looked at ${partsText(check.lookedAtCount, check.looksAt)}${skipped}${readFor}.`)
      }
      // MSG-3: each figure as the figure used here, with its basis and status.
      if (record.figures.length > 0) lines.push(`Figures used (${record.figures.length}):`, ...record.figures.map((figure) => `  ${figureUsedText(figure)}`))
      // COD-4: the same lines `grid check` prints, so nothing on this list can read as checked.
      lines.push(`Never looked at, whatever the plan (${record.limits.length}):`, ...record.limits.map((limit) => `  ${limit}.`))
    } else {
      // MSG-10: the counts, the gaps with their reasons, and where the rest is.
      lines.push(...coverageSummary(result).filter((line) => line !== '').map((line) => line.replace(/^ {2}- /, '  ')), restText(result.report, 'full=true'))
    }
    return {
      text: lines.join('\n'),
      data: {
        label: GENERAL_GUIDANCE_LABEL,
        count: record.count,
        problems: record.problems,
        lines: withCalls,
        seenCount: seen,
        marksFile: result.seen?.file ?? '',
        marksProblem: result.seen?.problem ?? null,
        findings,
        notChecked,
        drawing,
        coverage: record.coverage,
        limits: record.limits,
        place: record.place,
        ...(record.withoutPlace ? { withoutPlace: record.withoutPlace } : {}),
      },
    }
  },
}

/** A call to a tool of this server, ready to send. */
export interface FixCall {
  readonly tool: string
  readonly arguments: Readonly<Record<string, unknown>>
}

/**
 * MSG-7: the calls that make a line's fixes, each the edit tool with the corrected argument: a
 * width keeping the opening's start, an offset as its distance from the wall's start, a height
 * or a sill. A change the tool would refuse (a width under its 0.3 m, a height under 0.2 m) is
 * not offered. The plan argument is the one this call was given.
 */
export function fixCalls(fixes: readonly PlanFix[], plan: unknown): FixCall[] {
  const base = (id: string): Record<string, unknown> => ({ ...(typeof plan === 'string' ? { plan } : {}), opening: id })
  return fixes.flatMap((fix): FixCall[] => {
    const tool = 'grid_change_opening'
    if (fix.width !== undefined) return fix.width >= 0.3 ? [{ tool, arguments: { ...base(fix.id), width: fix.width, keep: 'start' } }] : []
    if (fix.offset !== undefined) return [{ tool, arguments: { ...base(fix.id), from: 'start', distance: fix.offset } }]
    if (fix.height !== undefined) return fix.height >= 0.2 ? [{ tool, arguments: { ...base(fix.id), height: fix.height } }] : []
    if (fix.sill !== undefined) return [{ tool, arguments: { ...base(fix.id), sill: fix.sill } }]
    // A wall id meant (`fix.wall`) has no tool that sets it: it stays data beside the message.
    return []
  })
}

function withFixCalls(line: ResultLine, plan: unknown): ResultLine & { readonly calls?: readonly FixCall[] } {
  const calls = line.fixes ? fixCalls(line.fixes, plan) : []
  return calls.length > 0 ? { ...line, calls } : line
}

export const READ_TOOLS: readonly GridTool[] = [compareTool, areasTool, takeoffTool, scheduleTool, fieldsTool, findTool, countTool, measureTool, viewTool, describeTool, checkTool]

/** What the sides of an opening are called in an answer. Exported for the edit tools. */
export function openingBetween(survey: Survey, id: string): string {
  const facts = survey.facts.openings.get(id)
  if (!facts) return ''
  const [a, b] = sideNames(facts)
  const name = (side: string): string => (survey.facts.rooms.has(side) ? q(survey.facts.rooms.get(side)!.name) : side)
  return `${name(a)} ↔ ${name(b)}`
}

