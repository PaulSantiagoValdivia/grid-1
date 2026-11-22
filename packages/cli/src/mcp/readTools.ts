/**
 * The tools of `grid serve` that read the plan and change nothing in it, in the order of the
 * requests they answer most often (lab entry Y-2): comparing options, areas, the builder's
 * take-off and schedule, measuring, the named views, reading the plan in room terms, and the
 * check.
 *
 * Every answer is short text in Grid's own words, with the same facts as data under the tool's
 * output schema. Names and ids that come from the plan file are quoted.
 */
import { floorOf, itemFootprint, limit, tolerance, type FloorPlan, type PlanFix } from '@ongrid/floorplan/geometry'
import { PATH_MAX } from '../fs/projectFiles'
import { GENERAL_GUIDANCE_LABEL, buildingKindsText, inspectPlan, type ResultLine } from '@ongrid/rules'
import { checkPlan, countsText, KIND_WORDS, nothingCheckedText, partsText, thingText, usedFigures } from '../command/check'
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
import { openingSchedule, openingScheduleCsv, planSchedule, roomSchedule, roomScheduleCsv } from '../quantities/schedule'
import { fixtureCountText, FIXTURE_RULES, planFixtures } from '../quantities/fixtures'
import { surveyPlan, sideNames, type Survey } from '../quantities/survey'
import { planEstimate, WHOLE_BUILDING_KEY, type Estimate, type EstimateLine, type QuantityUnit } from '../quantities/estimate'
import { estimateCsv, priceEstimate, rateCard, RATE_UNITS, RATES_FILE, RatesRefused, readRates, type PricedLine, type Pricing, type Rates } from '../quantities/rates'
import { planTakeoff, TAKEOFF_RULES } from '../quantities/takeoff'
import { areaText, csv, DISPLAY_UNITS, displayFor, lengthText, sqFt } from '../quantities/units'
import type { Display } from '@ongrid/floorplan/types/units'
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
      measures: areas.measures,
      rules: areas.rules,
      notes: areas.notes,
      states: areas.states,
      sureness: areas.sureness ?? null,
    }
    if (args['format'] === 'csv') {
      const rows = areas.floors.flatMap((f) => f.rooms.map((r) => [f.floor, r.id, r.name, r.use, r.size?.[0] ?? null, r.size?.[1] ?? null, r.net, r.net === null ? null : sqFt(r.net), r.outside ? 'outside' : 'inside', r.state]))
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
        lines.push(`  ${q(r.name)}${r.use ? ` (${r.use})` : ''}: ${measured}${r.net === null ? '' : surenessText(r.sureness, units)}${r.outside ? ', outside: not counted' : ''}`)
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
    lines.push(`Assumed: ${areas.reader.why} Grid's own rule, not checked against any local standard.`)
    if (areas.grossInternal !== null && areas.reader.gross.includes('grossInternal')) {
      lines.push(`Circulation: ${areas.circulation.toFixed(2)} m², ${percent(areas.circulationShare)} of gross internal. Net to gross: ${percent(areas.netToGross)}.`)
    }
    const outsideArea = areas.floors.reduce((sum, f) => sum + f.outsideRooms, 0)
    if (outsideArea > 0) lines.push(`Outside, listed apart: ${areaText(outsideArea, units)}.`)
    for (const rule of areas.measures) {
      if (rule.measure === 'net' || areas.reader.gross.includes(rule.measure)) lines.push(`${rule.name}: ${rule.notTakenOff} ${rule.cannotSay}`)
    }
    // Any rule beyond the measures', such as free floor where fixtures stand (CNT-12).
    const measureRules: readonly string[] = Object.values(AREA_RULES)
    lines.push(...areas.rules.filter((rule) => !measureRules.includes(rule)), ...areas.notes)
    return { text: lines.join('\n'), data }
  },
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
    'Use this when a builder or the person asks for quantities to price work: metres of wall (outside walls, inner walls, partitions), plaster or paint area per room less openings, ceiling areas, skirting lengths, or these as a spreadsheet. '
    + 'With for=estimate, or when the person asks what the plan will cost, how much flooring, paint or plasterboard it takes, or for a bill of quantities, it gives the figures a first estimate needs instead: floor finishes and wall faces by room use, ceilings, skirting, reveals, walls by kind and thickness, the outside face, doors and windows by size, the slab, upper floors and the roof (assumed: the plan holds none), and the gross internal area, each line with a key, its rule and an assumed mark. '
    + `A cost comes only from the person's own rates file (rates, or ${RATES_FILE} beside the plan), which must name its currency; with none, the answer is a rate card to fill in and holds no money. Lines with no rate and rates in the wrong unit are listed apart. Grid has no prices. `
    + 'Every figure is worked out from the plan\'s walls and openings by a rule stated in the answer. '
    + 'Do not use for floor areas alone (grid_areas) or a list of doors and windows (grid_schedule). The plan holds no finishes, ceilings or fixtures. Units are metres.',
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
    rooms: listSchema(objectSchema({ id: STRING, name: STRING, floor: STRING, floorArea: NUMBER, ceiling: NUMBER, perimeter: NUMBER, skirting: NUMBER, wallFace: NUMBER, openingsOff: NUMBER, height: NULLABLE_NUMBER })),
    totals: objectSchema({ floorArea: NUMBER, ceiling: NUMBER, skirting: NUMBER, wallFace: NUMBER }),
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
    const data = { walls: t.walls, rooms: t.rooms, totals: t.totals, rules: t.rules }
    if (args['format'] === 'csv') {
      const rows = [
        ...t.walls.map((w) => ['wall', `${w.kind} walls (${w.count})`, null, null, null, null, w.gross, w.net]),
        ...t.rooms.map((r) => ['room', r.name, r.floorArea, r.ceiling, r.skirting, r.wallFace, r.perimeter, null]),
        ['total', 'all rooms', t.totals.floorArea, t.totals.ceiling, t.totals.skirting, t.totals.wallFace, null, null],
      ]
      return { text: csv(['row', 'what', 'floor m2', 'ceiling m2', 'skirting m', 'wall face m2', 'length or perimeter m', 'net length m'], rows), data }
    }
    const lines = [
      `Walls: ${t.walls.map((w) => `${w.kind} ${lengthText(w.gross, units)} (${w.count} wall${w.count === 1 ? '' : 's'}; ${lengthText(w.net, units)} less openings)`).join('; ')}.`,
      'By room: floor and ceiling, skirting, wall face to plaster.',
      ...t.rooms.map((r) => `  ${q(r.name)}: floor ${areaText(r.floorArea, units)}, ceiling ${areaText(r.ceiling, units)}, skirting ${lengthText(r.skirting, units)}, wall face ${areaText(r.wallFace, units)} (${r.openingsOff.toFixed(2)} m² of openings off, walls ${r.height === null ? 'none' : `${r.height.toFixed(2)} m`} high)`),
      `Totals: floor ${areaText(t.totals.floorArea, units)}, ceiling ${areaText(t.totals.ceiling, units)}, skirting ${lengthText(t.totals.skirting, units)}, wall face ${areaText(t.totals.wallFace, units)}.`,
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
    const lines = s.rows.map((r) => `${r.number}. ${q(r.name)}${r.use ? ` (${r.use})` : ''}, ${q(r.floorName)}: ${r.area === null ? 'not measured: it could not be drawn' : areaText(r.area, units)}, ${r.height === null ? 'height not known' : `${lengthText(r.height, units)} high`}${r.state === 'not-proven' ? ', not proven' : ''}`)
    for (const t of s.floors) lines.push(`${q(t.floorName!)}: ${t.rooms} rooms, ${areaText(t.area, units)}${stateText(t.state, several)}.`)
    lines.push(`All floors: ${s.total.rooms} rooms, ${areaText(s.total.area, units)}${stateText(s.total.state, several)}.`, ...s.rules)
    return { text: lines.join('\n'), data }
  }
  const s = openingSchedule(survey, floors === undefined ? {} : { floors })
  const data = { rows: s.rows, counts: s.counts, rule: s.rule }
  if (asCsv) return { text: openingScheduleCsv(s), data }
  const lines = s.rows.map((r) => `${r.number}. ${r.type} ${q(r.id)}, ${q(r.floorName)}: ${lengthText(r.width, units)} wide × ${lengthText(r.height, units)} high${r.type === 'window' ? `, sill ${lengthText(r.sill, units, 'height')}` : ''}, ${r.between[0]} ↔ ${r.between[1]}`)
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
// grid_measure

/** A room's height in words (ARE-10), with where it comes from. */
function heightText(height: RoomHeight, L: (v: number) => string): string {
  const { value, walls } = height
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
    + 'what=room gives a room\'s inside sizes, side by side, its height and the widest circle it holds; what=between gives the clear distance from one wall, door, window, opening, fixture or room (from) to another (to) or to a point (x, y), between their faces as a tape measures it, so a door\'s distance from the inside corner is between the door and the wall at the corner, and the gap between two fixtures is between their edges; what=wall gives a wall\'s length on its centre line and the length of its face in each room; what=fit says whether a box (width × depth) or a circle (diameter) fits and where; what=route gives the way from room to room (or to "outside") with every door it passes and the narrowest one; what=narrow lists the doors and openings narrower than under, and the rooms whose widest circle is less than under. '
    + 'It measures the room between wall faces: what=fit keeps clear of the room\'s fixtures, the other measures take none off, the plan holds no furniture or door leaves, and the answer says so. It checks no rule: a figure the person gives is their own. Do not use for floor areas (grid_areas) or for what a building code asks (grid_check). Units are metres.',
  args: {
    plan: PLAN_ARG,
    what: { type: 'string', required: true, enum: ['room', 'between', 'wall', 'fit', 'route', 'narrow'], description: 'What to measure: room, between, wall, fit, route or narrow.', examples: ['between', 'fit', 'route'] },
    room: { type: 'string', id: true, description: 'For room, fit and route: the room id, where the route starts.', examples: ['kitchen', 'hall'] },
    from: { type: 'string', id: true, description: 'For between: the id of a wall, door, window, opening, fixture or room to measure from.', examples: ['front-door', 'w-west'] },
    to: { type: 'string', id: true, description: 'For between: the id of the wall, door, window, opening, fixture or room to measure to. For route: the room id where it ends, or "outside" for the nearest way out.', examples: ['w-west', 'bed1', 'outside'] },
    x: { type: 'number', length: true, description: 'For between, instead of to: a point\'s x on the drawing in metres, such as an inside corner. The plan names no points.', examples: [0.15], minimum: -limit('largest'), maximum: limit('largest') },
    y: { type: 'number', length: true, description: 'For between, with x: the point\'s y on the drawing in metres.', examples: [0.15], minimum: -limit('largest'), maximum: limit('largest') },
    wall: { type: 'string', id: true, description: 'For wall: the wall id.', examples: ['w-south'] },
    width: { type: 'number', length: true, description: 'For fit: the box\'s width in metres; a table of 1.8 × 0.9 m with 0.75 m round it for chairs is 3.3.', examples: [3.3, 1.2], minimum: 0.05, maximum: 100 },
    depth: { type: 'number', length: true, description: 'For fit: the box\'s depth in metres. It is tried both ways round.', examples: [2.4, 0.6], minimum: 0.05, maximum: 100 },
    diameter: { type: 'number', length: true, description: 'For fit: a circle instead of a box, such as 1.5 for a wheelchair turning circle.', examples: [1.5], minimum: 0.05, maximum: 100 },
    under: { type: 'number', length: true, description: 'For narrow: the person\'s figure in metres, such as 0.8 for a door or 1.5 for a turning circle.', examples: [0.8, 1.5], minimum: 0.05, maximum: 100 },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
  },
  outputSchema: objectSchema({ what: STRING, answer: { type: 'object' }, rule: STRING }),
  run(args, context) {
    const { survey } = load(context, args['plan'])
    const what = args['what'] as 'room' | 'between' | 'wall' | 'fit' | 'route' | 'narrow'
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const L = (v: number): string => lengthText(v, units)
    const allowed: Record<string, readonly string[]> = {
      room: ['room'],
      between: ['from', 'to', 'x', 'y'],
      wall: ['wall'],
      fit: ['room', 'width', 'depth', 'diameter'],
      route: ['room', 'to'],
      narrow: ['under'],
    }
    const stray = ['room', 'from', 'to', 'x', 'y', 'wall', 'width', 'depth', 'diameter', 'under'].filter((key) => args[key] !== undefined && !allowed[what]!.includes(key))
    if (stray.length > 0) throw new ToolRefusal(`what=${what} takes ${allowed[what]!.join(', ')}, not ${stray.join(', ')}.`)
    const roomOf = (): ReturnType<Survey['byId']['get']> & object => {
      if (args['room'] === undefined) throw new ToolRefusal(`what=${what} needs room: a room id.`)
      const id = roomArg(survey.plan, args['room'])
      const room = survey.byId.get(id)
      if (!room || room.polygon.length < 3) throw new ToolRefusal('That room has no outline Grid can measure; grid_check says why.')
      return room
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
      const room = roomOf()
      if (args['to'] === undefined) throw new ToolRefusal('what=route needs to: a room id, or "outside".')
      const to = args['to'] === 'outside' ? 'outside' : roomArg(survey.plan, args['to'], 'to')
      if (to !== 'outside' && survey.byId.get(to)?.facts.floor !== room.facts.floor) throw new ToolRefusal('Both rooms of a route must be on the same floor: the plan says nothing of what joins floors.')
      const route = routeBetween(survey, room.facts.id, to)
      if (route === null) {
        return { text: `There is no way from ${q(room.facts.name)} to ${to === 'outside' ? 'the outside' : q(survey.byId.get(to)!.facts.name)} through the plan's doors and openings.\n${EMPTY_ROOM_RULE}`, data: { what, answer: { found: false }, rule: EMPTY_ROOM_RULE } }
      }
      const name = (id: string): string => (id === 'outside' ? 'outside' : q(survey.byId.get(id)?.facts.name ?? id))
      const steps = route.steps.map((s) => `${s.type} ${q(s.via)}${s.width === null ? '' : ` ${L(s.width)}`} into ${name(s.into)}`).join(', then ')
      const widths = route.rooms.map((id) => {
        const r = survey.byId.get(id)!
        return `${name(id)} ${L(measureRoom(r).widestCircle)}`
      }).join(', ')
      const lines = [
        `From ${name(route.from)} to ${name(route.to)}: ${steps}.`,
        route.narrowestPassage ? `Narrowest door or opening on the way: ${q(route.narrowestPassage.via)}, ${L(route.narrowestPassage.width)}.` : 'No door or opening on the way, only open sides.',
        `Widest circle in each room on the way: ${widths}.`,
        EMPTY_ROOM_RULE,
      ]
      return { text: lines.join('\n'), data: { what, answer: { found: true, ...route }, rule: EMPTY_ROOM_RULE } }
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

const viewTool: GridTool = {
  name: 'grid_view',
  title: 'Draw a view of the plan',
  hint: 'read',
  description:
    'Use this when the person asks to see the plan: "can I see it", a floor plan, a 3D view from the garden side or from above, "stand me in the kitchen looking at the garden", "can I see out sitting down", or a black and white drawing. '
    + 'kind=plan draws one floor from above with its sizes; kind=3d draws the model from a side of the drawing (north is the top of the drawing: the plan holds no real north); kind=eye stands in a room at eye_height and looks level toward an opening or a direction, and lists the window sills against that eye height. '
    + 'It returns the picture with the numbers that made it; look at the picture before you describe it. It changes nothing and writes no file. Do not use for a file to hand on (grid_export) or to move the person\'s live preview (grid_preview). The model has no roof, furniture, glass or door leaves. Units are metres.',
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
    hide: { type: 'string', maxLength: 120, description: 'For plan: parts to leave off, joined by commas: title, key, notes, sketch, dimensions, areas, swings, warnings. Everything is drawn when left out.', examples: ['areas,swings', 'sketch'] },
    colour: { type: 'string', enum: ['use'], description: 'For plan: use fills each room by its use and lists the uses in the key. One fill for every room when left out.', examples: ['use'] },
    key: { type: 'boolean', description: 'For plan: true to add a key under the drawing, even where the plan asks for none.', examples: [true] },
  },
  outputSchema: objectSchema({ kind: STRING, floor: { type: ['string', 'null'] }, camera: { type: ['object', 'null'] }, pxPerMetre: NULLABLE_NUMBER, sills: { type: 'array' }, ids: listSchema(STRING), boxes: { type: 'array' } }),
  async run(args, context) {
    const { loaded } = readPlan(context, args['plan'])
    const survey = surveyPlan(loaded.plan)
    const floor = floorArg(loaded.plan, args['floor'])
    const kind = args['kind'] as 'plan' | '3d' | 'eye'
    const allowed: Record<string, readonly string[]> = { plan: ['floor', 'look', 'dimensions', 'ids', 'crop', 'hide', 'colour', 'key'], '3d': ['floor', 'from'], eye: ['room', 'toward', 'eye_height'] }
    const stray = ['floor', 'from', 'room', 'toward', 'eye_height', 'look', 'dimensions', 'ids', 'crop', 'hide', 'colour', 'key'].filter((key) => args[key] !== undefined && !allowed[kind]!.includes(key))
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
      try {
        shownParts = drawShowOf({ hide: args['hide'] as string | undefined, colour: args['colour'] as string | undefined, key: args['key'] === true })
      } catch (error) {
        if (error instanceof UsageError) throw new ToolRefusal(error.message.replace(/--(hide|colour|key)\b/g, '$1'))
        throw error
      }
      const dimensions = args['dimensions'] !== false && shownParts.showDimensions
      const view = await planView(plan, { floor: shown, look: asked, dimensions, ids: withIds, faults, show: shownParts.show, ...(display ? { display } : {}), ...(crop ? { frame: cropFrame(crop) } : {}) })
      const lines = [`Plan of floor ${q(shown)}${crop ? `, cropped to ${crop.kind} ${q(crop.id)}` : ''}, ${look}${args['dimensions'] === false ? ', without sizes' : ', with inside sizes'}: ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px. North is the top of the drawing; the plan holds no real north. Look at the picture before you describe it.`]
      const ids = withIds ? idsOnFloor(plan, shown) : []
      const undecided = view.undecidedDoors ?? []
      if (undecided.length > 0) {
        lines.push(`Drawn with a dashed line and "?" as undecided, ${undecided.length === 1 ? 'a door' : `${undecided.length} doors`} with no stated swing: ${undecided.map(q).join(', ')}. Ask the person which side each is hinged on and which way it opens, then set its hinge and swing.`)
      }
      lines.push('Each part\'s box on the picture, in pixels from its top-left corner, is in boxes: id, kind and x, y, width, height.')
      const marked = faults.filter((line) => line.floor === null || line.floor === shown).length
      if (marked > 0) lines.push(`${marked} of grid_check's lines are about this floor: each has its grid_check number on the part it is about, and all are listed under the drawing. A room that cannot be drawn is the dashed box round its walls.`)
      if (withIds) lines.push(...checkViewText(loaded, shown))
      return {
        text: lines.join('\n'),
        data: { kind, floor: shown, camera: null, pxPerMetre: view.pxPerMetre, sills: [], ids, boxes: view.boxes ?? [] },
        image: { data: view.png, mimeType: 'image/png' },
      }
    }
    if (kind === '3d') {
      const from = (args['from'] as Side | undefined) ?? 'south-east'
      const { modelView } = await import('../draw/views')
      const view = await modelView(plan, { from, ...(floor ? { floor } : {}) })
      return {
        text: `The model from the ${from === 'above' ? 'air, looking down' : `${from} side of the drawing`}${floor ? `, floor ${q(floor)} cut away` : ''}. North is the top of the drawing. The model has no roof, furniture, glass or door leaves. Look at the picture before you describe it.`,
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

const checkTool: GridTool = {
  name: 'grid_check',
  title: 'Check the plan',
  hint: 'read',
  description:
    'Use this when you have changed the plan, or when the person asks whether the plan is drawn right or what Grid\'s checks find: problems in the drawing itself, and notes from the general checks it runs (room sizes, ways out, door swings). '
    + 'Every answer carries the label "General guidance, not your local rules". It never says a plan complies or is allowed: "is it allowed" is for the person\'s local authority, and the answer says what was not checked. '
    + 'Do not use to measure (grid_measure) or for areas (grid_areas).',
  args: {
    plan: PLAN_ARG,
    floor: { ...FLOOR_ARG, description: 'Only what was found on this floor. Every floor when left out.' },
    country: { type: 'string', maxLength: 2, description: 'Where it will be built, as a two-letter country code. Figures are applied only where they hold.', examples: ['US', 'GB'] },
  },
  outputSchema: objectSchema({
    label: STRING,
    // MSG-1: the one list and the one count, as docs/result-contract.md sets them out.
    count: { type: 'number' },
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
    }, ['code', 'kind', 'thing', 'floor', 'also', 'message', 'found', 'needed', 'fix'])),
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
  }),
  run(args, context) {
    const { loaded } = readPlan(context, args['plan'])
    const floor = floorArg(loaded.plan, args['floor'])
    let result
    try {
      result = checkPlan(loaded, { ...(floor ? { floor } : {}), ...(args['country'] ? { country: args['country'] as string } : {}) })
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
    const lines: string[] = [GENERAL_GUIDANCE_LABEL]
    lines.push(`To look at: ${record.count === 0 ? 'nothing' : `${record.count} (${countsText(record)})`}. Checks run: ${result.report.rules.length}.`)
    // COD-2: a line that used a figure says what it needed, which names the kind of building the figure was read for.
    record.lines.slice(0, 12).forEach((line, index) => lines.push(`  ${result.numbers[index]}. ${KIND_WORDS[line.kind]}, ${thingText(line)}: ${line.message}.${usedFigures(line) ? ` Needed: ${line.needed}.` : ''} Fix: ${line.fix} [${line.code}]`))
    if (record.count > 12) lines.push(`  … ${record.count - 12} more in the data, each with what was found and needed.`)
    // WRT-6 (lab WR-15): what was assumed, for the person to confirm, named even past the first 12.
    const toConfirm = record.lines.filter((line) => line.kind === 'to-confirm')
    if (toConfirm.length > 0) lines.push(`To confirm with the person (${toConfirm.length}), assumed and not given: ${toConfirm.slice(0, 8).map((line) => line.message).join('; ')}${toConfirm.length > 8 ? `; and ${toConfirm.length - 8} more in the data` : ''}.`)
    // MSG-7: each line one call would clear carries that call, ready to send.
    const withCalls = record.lines.map((line) => withFixCalls(line, args['plan']))
    const callable = withCalls.filter((line) => line.calls !== undefined).length
    if (callable > 0) lines.push(`${callable === 1 ? 'One line carries' : `${callable} lines carry`} the call that would fix it, under calls in the data.`)
    if (record.counts.finding === 0) lines.push('No findings only means these checks found nothing, not that the plan meets any rule.')
    // MSG-2: what each check looked at, beside the count, so an empty list cannot read as a pass.
    const rooms = result.rooms
    lines.push(`Looked at by at least one check: ${rooms.rooms === 0 ? 'no rooms, the plan has none' : `${rooms.lookedAt} of ${partsText(rooms.rooms, 'room')}`}.`)
    for (const check of record.coverage) {
      const skipped = check.skippedCount === 0 ? '' : `; not looked at ${check.skippedCount}: ${[...new Set(check.skipped.map((s) => s.why))].join('; ')}`
      const readFor = check.readFor === undefined || check.readFor.length === 0 ? '' : `; its figures were read for ${buildingKindsText(check.readFor)}`
      lines.push(check.lookedAtCount === 0 ? `  ${nothingCheckedText(check.title, check.looksAt)}${skipped}${readFor}.` : `  ${check.title}: looked at ${partsText(check.lookedAtCount, check.looksAt)}${skipped}${readFor}.`)
    }
    // COD-4: the same lines `grid check` prints, so nothing on this list can read as checked.
    lines.push(`Never looked at, whatever the plan (${record.limits.length}):`, ...record.limits.map((limit) => `  ${limit}.`))
    return {
      text: lines.join('\n'),
      data: { label: GENERAL_GUIDANCE_LABEL, count: record.count, lines: withCalls, findings, notChecked, drawing, coverage: record.coverage, limits: record.limits },
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

export const READ_TOOLS: readonly GridTool[] = [compareTool, areasTool, takeoffTool, scheduleTool, measureTool, viewTool, describeTool, checkTool]

/** What the sides of an opening are called in an answer. Exported for the edit tools. */
export function openingBetween(survey: Survey, id: string): string {
  const facts = survey.facts.openings.get(id)
  if (!facts) return ''
  const [a, b] = sideNames(facts)
  const name = (side: string): string => (survey.facts.rooms.has(side) ? q(survey.facts.rooms.get(side)!.name) : side)
  return `${name(a)} ↔ ${name(b)}`
}

