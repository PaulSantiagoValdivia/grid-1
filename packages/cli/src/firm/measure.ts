/**
 * COD-8: the drawing measured for each of the firm's standards, by the measures Grid already
 * has. Where CNT-17's accessibility numbers measure the same thing, the same measure: a
 * corridor's narrowest point from end to end (`corridorEnds`), a doorway's clear width and a
 * room's turning space (CNT-13's `doorwayClearance` and `turningSpace`, as CNT-17 reads them).
 * Then CNT-13's floor in front of a fixture (`quantities/use.ts` and the library's `use.ts`),
 * ARE-9's net area (`planAreas`) and the widest circle an empty room holds (`measureRoom`). The
 * firm's figures go to the front door (`inspectPlan`'s `firm`), which says which parts are short
 * of them, under their own heading.
 *
 * Pure but for `firmForCheck`, which reads the firm's file beside the plan through the project.
 */
import { doorwayClearance, fixtureSpace, floorOf, itemName, turningSpace, type FloorPlan } from '@ongrid/floorplan/geometry'
import type { FirmInput, FirmMeasured, FirmStandard } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { planAreas } from '../quantities/areas'
import { measureRoom } from '../quantities/measure'
import { surveyPlan, type Survey, type SurveyRoom } from '../quantities/survey'
import { corridorEnds } from '../quantities/access'
import { besideText, fixturesOf } from '../quantities/use'
import { readFirm } from './standards'

const q = (text: string): string => JSON.stringify(text)
const m = (value: number): string => `${value.toFixed(2)} m`

/** The rooms a room standard is for: its uses, else every room (for a corridor width, the rooms used as corridor). Zones are part of a room, and not measured on their own. */
function roomsFor(survey: Survey, standard: FirmStandard): SurveyRoom[] {
  const uses = standard.uses.length > 0 ? standard.uses : standard.measure === 'corridor_width' ? ['corridor'] : null
  return survey.rooms.filter((room) => room.polygon.length >= 3 && room.facts.zoneOf === undefined && (uses === null || (room.facts.use !== undefined && uses.includes(room.facts.use))))
}

/**
 * A corridor's width: CNT-17's narrowest point from end to end (`corridorEnds`, CNT-13's way
 * through a room between the corridor's two ends), so the firm's figure and the accessibility
 * numbers read the same measure; the widest circle it holds when Grid finds no two ends.
 */
function corridorWay(survey: Survey, room: SurveyRoom, i: number): FirmMeasured {
  const { items, obstacles } = fixturesOf(survey)
  const { way, widest } = corridorEnds(room, obstacles(room.facts.floor))
  const base = { standard: i, thing: { kind: 'room', id: room.facts.id } as const, floor: room.facts.floor }
  if (way === null) return { ...base, measured: widest, precision: 0, said: 'Grid finds no two ends to it, so the widest circle its free floor holds', also: [] }
  const where = way.atDoorway ? '' : besideText(way, items)
  return { ...base, measured: way.width, precision: way.step, said: `from end to end, at its narrowest at (${way.at.x.toFixed(2)}, ${way.at.y.toFixed(2)})${where}`, also: [...way.beside.fixtures] }
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
