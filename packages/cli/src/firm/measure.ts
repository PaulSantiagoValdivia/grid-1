/**
 * COD-8: the drawing measured for each of the firm's standards, by the measures Grid already
 * has: CNT-13's use indicators (the way through a room, a doorway's clear width, the turning
 * space, the floor in front of a fixture, `quantities/use.ts` and the library's `use.ts`),
 * ARE-9's net area (`planAreas`) and the widest circle an empty room holds (`measureRoom`). The
 * firm's figures go to the front door (`inspectPlan`'s `firm`), which says which parts are short
 * of them, under their own heading.
 *
 * Pure but for `firmForCheck`, which reads the firm's file beside the plan through the project.
 */
import { add, doorwayClearance, fixtureSpace, floorOf, itemName, lerp, normalize, passageWidth, perp, pointInPolygon, pointMouth, scale, signedDistanceToOutline, sub, tolerance, turningSpace, type FloorPlan, type Segment, type Vec2 } from '@ongrid/floorplan/geometry'
import type { FirmInput, FirmMeasured, FirmStandard } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { planAreas } from '../quantities/areas'
import { measureRoom } from '../quantities/measure'
import { surveyPlan, type Survey, type SurveyRoom } from '../quantities/survey'
import { besideText, fixturesOf, mouthOf, waysOf } from '../quantities/use'
import { readFirm } from './standards'

const q = (text: string): string => JSON.stringify(text)
const m = (value: number): string => `${value.toFixed(2)} m`

/** The most ways between a corridor's doorways measured, as `grid_measure what=use` measures them. */
export const CORRIDOR_WAYS_MAX = 10
/** How many steps across the reach a corridor's start near a doorway is looked for on, at most: finer steps add nothing a person would notice. */
const CORRIDOR_START_STEPS = 100

/** The rooms a room standard is for: its uses, else every room (for a corridor width, the rooms used as corridor). Zones are part of a room, and not measured on their own. */
function roomsFor(survey: Survey, standard: FirmStandard): SurveyRoom[] {
  const uses = standard.uses.length > 0 ? standard.uses : standard.measure === 'corridor_width' ? ['corridor'] : null
  return survey.rooms.filter((room) => room.polygon.length >= 3 && room.facts.zoneOf === undefined && (uses === null || (room.facts.use !== undefined && uses.includes(room.facts.use))))
}

/**
 * Where a way through a corridor starts from a doorway: the point near the doorway with the most
 * clear floor round it, so the corridor's own width is measured and not the doorway's (that is the
 * clear width of a doorway, a standard of its own). Near is within the reach of the room straight
 * in from the middle of the doorway, to its far side; points are tried a few centimetres apart.
 */
function startIn(room: SurveyRoom, mouth: Segment, obstacles: readonly { readonly outline: readonly Vec2[] }[]): Vec2 {
  const holes = [...room.holes, ...obstacles.map((o) => o.outline)]
  const middle = lerp(mouth[0], mouth[1], 0.5)
  const raster = tolerance('useRaster')
  // How far the room reaches straight in from the doorway, on whichever side the room is.
  let reach = 0
  for (const sign of [1, -1]) {
    const inward = scale(normalize(perp(sub(mouth[1], mouth[0]))), sign)
    let t = raster
    while (pointInPolygon(add(middle, scale(inward, t)), room.polygon)) t += raster
    reach = Math.max(reach, t - raster)
  }
  const step = Math.max(raster, reach / CORRIDOR_START_STEPS)
  let best = middle
  let clear = -Infinity
  for (let x = -reach; x <= reach; x += step) {
    for (let y = -reach; y <= reach; y += step) {
      if (x * x + y * y > reach * reach) continue
      const p = add(middle, { x, y })
      const d = signedDistanceToOutline(p, room.polygon, holes)
      if (d > clear) {
        clear = d
        best = p
      }
    }
  }
  return best
}

/**
 * The narrowest of the ways through a room between its doorways, as CNT-13 measures each (the
 * widest body that gets through, clear of the walls and fixtures), from the corridor's own middle
 * in front of each doorway; from its one doorway to its widest point; or, with none, its widest
 * circle.
 */
function corridorWay(survey: Survey, room: SurveyRoom, i: number): FirmMeasured {
  const { items, obstacles: onFloor } = fixturesOf(survey)
  const obstacles = onFloor(room.facts.floor)
  const base = { standard: i, thing: { kind: 'room', id: room.facts.id } as const, floor: room.facts.floor }
  const mouths = waysOf(survey, room).flatMap((way) => {
    const mouth = mouthOf(survey, room, way.via)
    return mouth === null ? [] : [{ via: way.via, at: startIn(room, mouth, obstacles) }]
  })
  const widest = turningSpace(room.polygon, room.holes, obstacles)
  if (mouths.length === 0) return { ...base, measured: widest.diameter, precision: 0, said: 'it has no doorway, so the widest circle its free floor holds', also: [] }
  const pairs: { from: string; to: string; a: Vec2; b: Vec2 }[] = []
  if (mouths.length === 1) pairs.push({ from: mouths[0]!.via, to: 'its widest point', a: mouths[0]!.at, b: widest.at })
  for (let a = 0; a < mouths.length; a++) for (let b = a + 1; b < mouths.length; b++) pairs.push({ from: mouths[a]!.via, to: q(mouths[b]!.via), a: mouths[a]!.at, b: mouths[b]!.at })
  const measured = pairs.slice(0, CORRIDOR_WAYS_MAX)
  const more = pairs.length > measured.length ? `, the narrowest of the first ${measured.length} of its ${pairs.length} ways between doorways` : ''
  let narrowest: { width: number | null; said: string; step: number; beside: readonly string[] } | null = null
  for (const pair of measured) {
    const way = passageWidth(room.polygon, room.holes, obstacles, pointMouth(pair.a), pointMouth(pair.b))
    const between = `from ${q(pair.from)} to ${pair.to}`
    if (way === null) {
      narrowest = { width: null, said: `${between}, no way through clear of its fixtures`, step: 0, beside: [] }
      break
    }
    if (narrowest !== null && narrowest.width !== null && narrowest.width <= way.width) continue
    narrowest = { width: way.width, said: `${between}, at its narrowest at (${way.at.x.toFixed(2)}, ${way.at.y.toFixed(2)})${besideText(way, items)}`, step: way.step, beside: way.beside.fixtures }
  }
  const found = narrowest!
  return { ...base, measured: found.width, precision: found.step, said: `${found.said}${more}`, also: [...found.beside] }
}

/** Every part each standard looks at, measured. */
export function firmMeasures(plan: FloorPlan, standards: readonly FirmStandard[]): FirmMeasured[] {
  if (standards.length === 0) return []
  const survey = surveyPlan(plan)
  const out: FirmMeasured[] = []
  const net = new Map<string, number | null>()
  if (standards.some((s) => s.measure === 'room_area')) for (const floor of planAreas(survey).floors) for (const room of floor.rooms) net.set(room.id, room.net)
  standards.forEach((standard, i) => {
    switch (standard.measure) {
      case 'corridor_width':
        for (const room of roomsFor(survey, standard)) out.push(corridorWay(survey, room, i))
        return
      case 'turning_circle': {
        const { rows, obstacles } = fixturesOf(survey)
        for (const room of roomsFor(survey, standard)) {
          const circle = turningSpace(room.polygon, room.holes, obstacles(room.facts.floor))
          const own = rows.filter((row) => row.room === room.facts.id).length
          const clearOf = own === 0 ? 'the room holds no fixtures' : `clear of ${own === 1 ? 'its fixture' : `its ${own} fixtures`}`
          out.push({ standard: i, thing: { kind: 'room', id: room.facts.id }, floor: room.facts.floor, measured: circle.diameter, precision: 0, said: `centred at (${circle.at.x.toFixed(2)}, ${circle.at.y.toFixed(2)}), ${clearOf}`, also: [] })
        }
        return
      }
      case 'room_width':
        for (const room of roomsFor(survey, standard)) {
          out.push({ standard: i, thing: { kind: 'room', id: room.facts.id }, floor: room.facts.floor, measured: measureRoom(room).widestCircle, precision: 0, said: 'the widest circle the empty room holds', also: [] })
        }
        return
      case 'room_area':
        for (const room of roomsFor(survey, standard)) {
          const area = net.get(room.facts.id)
          if (area === undefined || area === null) continue
          out.push({ standard: i, thing: { kind: 'room', id: room.facts.id }, floor: room.facts.floor, measured: area, precision: 0, said: 'net, to the faces of its walls', also: [] })
        }
        return
      case 'door_clear_width': {
        const { items, obstacles } = fixturesOf(survey)
        for (const floor of survey.facts.floors) {
          for (const facts of floor.openings) {
            if (facts.type === 'window') continue
            const opening = plan.openings.find((o) => o.id === facts.id)
            const wall = plan.walls.find((w) => w.id === facts.wall)
            if (!opening || !wall || wall.virtual === true) continue
            const d = doorwayClearance(wall, opening, obstacles(floorOf(wall)))
            const leaf = d.leaf > 0 ? ` less ${m(d.leaf)} for the open leaf and its stop` : ''
            const names = items.filter((item) => d.narrowedBy.includes(item.id)).map(itemName)
            const narrowed = names.length === 0 ? '' : `, ${names.join(', ')} ${names.length === 1 ? 'stands' : 'stand'} in front of ${m(d.covered)} of it`
            out.push({ standard: i, thing: { kind: 'opening', id: opening.id }, floor: floorOf(wall), measured: d.clear, precision: 0, said: `its ${m(d.hole)} hole${leaf}${narrowed}`, also: [...d.narrowedBy] })
          }
        }
        return
      }
      case 'fixture_clearance': {
        const { rows, items, obstacles } = fixturesOf(survey)
        for (const row of rows) {
          if (standard.kinds.length > 0 && !standard.kinds.includes(row.kind)) continue
          const room = row.room === null ? undefined : survey.byId.get(row.room)
          const item = items.find((it) => it.id === row.id)
          if (room === undefined || room.polygon.length < 3 || item === undefined) continue
          const front = fixtureSpace(item, room.polygon, room.holes, obstacles(row.floor)).front
          // Nothing in front of it bounds the floor: it is open, so never short.
          if (front === null) continue
          out.push({ standard: i, thing: { kind: 'item', id: row.id }, floor: row.floor, measured: front, precision: 0, said: `in ${q(room.facts.name)}, to the nearest wall face, doorway or fixture`, also: [room.facts.id] })
        }
        return
      }
    }
  })
  return out
}

/**
 * The firm's standards beside the plan, measured on it, for the check; undefined when the plan
 * has no firm's file beside it, so a plan without one is checked exactly as before.
 */
export function firmForCheck(project: Project, planFile: string, plan: FloorPlan): FirmInput | undefined {
  const read = readFirm(project, planFile)
  if (read === null) return undefined
  return { file: read.file, problem: read.problem, standards: read.standards, measured: read.problem === null ? firmMeasures(plan, read.standards) : [] }
}
