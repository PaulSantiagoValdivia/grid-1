/**
 * The whole building made wider or longer (WRT-3, lab WR-2, WR-4): "the flat 30 cm wider".
 *
 * Everything beyond a line across the building moves out by the distance asked: walls wholly
 * beyond it move, walls across it get longer, and the rooms the line crosses grow. The line is
 * just inside the outside wall on that side unless the call puts it through a room. Every floor
 * moves together unless one is named.
 *
 * The way of doing it comes from the lab's edit prototype (`widen`). Openings keep their anchor
 * or their place in the building (`seat.ts`), so an entrance in a wall that grows at its start
 * stays where it was instead of sliding into a junction (WR-4).
 *
 * Pure: a survey in, a patch out.
 */
import { tolerance, type Vec2 } from '@ongrid/floorplan/geometry'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { listed, refuseCurved, type Direction, type OpeningChange, type Patch } from './edits'
import { EditRefused } from './refused'
import { COMPASS, r3, seatOpenings } from './seat'

export interface StretchRequest {
  readonly side: Direction
  readonly by: number
  /** A room the line runs through, across its middle. */
  readonly through?: string
  readonly floor?: string
}

export function stretchPlan(survey: Survey, request: StretchRequest): Patch {
  const plan = survey.plan
  const { side, by } = request
  const out = COMPASS[side]
  const across = side === 'east' || side === 'west'
  const sign = side === 'east' || side === 'north' ? 1 : -1
  const coord = (p: readonly [number, number] | Vec2): number => (Array.isArray(p) ? (across ? p[0] : p[1]) : across ? (p as Vec2).x : (p as Vec2).y)
  const onFloor = (floor: string | undefined): boolean => request.floor === undefined || (floor ?? 'ground') === request.floor
  const walls = plan.walls.filter((w) => onFloor(w.floor))
  if (walls.length === 0) throw new EditRefused('That floor has no walls to stretch.')
  const guessed: string[] = []
  let line: number
  let where: string
  if (request.through !== undefined) {
    const room = survey.byId.get(request.through)!
    if (room.polygon.length < 3) throw new EditRefused('That room has no outline Grid can measure; grid_check says why.')
    if (!onFloor(room.facts.floor)) throw new EditRefused(`That room is on floor ${quoted(room.facts.floor)}, not the floor named.`)
    const values = room.polygon.map(coord)
    line = (Math.min(...values) + Math.max(...values)) / 2
    where = `through the middle of ${quoted(room.facts.name)}`
  } else {
    const values = walls.flatMap((w) => [coord(w.start), coord(w.end)])
    line = sign > 0 ? Math.max(...values) - 0.01 : Math.min(...values) + 0.01
    where = `at its ${side} outside wall`
    guessed.push(`Only the rooms along the ${side} side grow: the ${side} outside wall moves out. Pass through with a room to stretch the building through that room instead.`)
  }
  const beyond = (p: readonly [number, number] | Vec2): boolean => sign * (coord(p) - line) > 0
  const v = { x: out.x * by, y: out.y * by }
  const move = (p: readonly [number, number]): [number, number] => [r3(p[0] + v.x), r3(p[1] + v.y)]

  const changes = new Map<string, { start?: [number, number]; end?: [number, number] }>()
  const moved: string[] = []
  const longer: string[] = []
  for (const w of walls) {
    const s = beyond(w.start)
    const e = beyond(w.end)
    if (!s && !e) continue
    refuseCurved([w], 'stretch')
    const change = { ...(s ? { start: move(w.start) } : {}), ...(e ? { end: move(w.end) } : {}) }
    const ns = change.start ?? w.start
    const ne = change.end ?? w.end
    if (Math.hypot(ne[0] - ns[0], ne[1] - ns[1]) < 0.05) throw new EditRefused(`That would leave wall ${quoted(w.id)} with no length.`)
    changes.set(w.id, change)
    ;(s && e ? moved : longer).push(w.id)
  }
  if (changes.size === 0) throw new EditRefused(`Nothing of the plan lies ${side} of that line, so nothing would move.`)
  const floors = new Set(walls.map((w) => w.floor ?? 'ground'))
  if (request.floor === undefined && floors.size > 1) guessed.push(`All ${floors.size} floors are stretched together; pass floor to stretch one.`)

  const seated = seatOpenings(survey, changes, (p) => (beyond(p) ? { x: p.x + v.x, y: p.y + v.y } : p), { shift: v, what: 'stretching it' })
  const openings = new Map<string, OpeningChange>()
  const said = [
    `Stretched the plan ${Math.abs(by).toFixed(2)} m ${by >= 0 ? `to the ${side}` : `back from the ${side}`}, ${where}: ${moved.length} wall${moved.length === 1 ? '' : 's'} moved and ${longer.length} ${by >= 0 ? 'longer' : 'shorter'}${floors.size > 1 && request.floor === undefined ? `, on all ${floors.size} floors` : ''}.`,
  ]
  const stayed: string[] = []
  for (const [id, offset] of seated.offsets) {
    const o = plan.openings.find((x) => x.id === id)!
    if (Math.abs(offset - o.offset) <= tolerance('noLength')) continue
    openings.set(id, { offset })
    const change = changes.get(o.wall)
    if (change?.start !== undefined && change.end === undefined && o.anchor === undefined) stayed.push(`${o.type} ${quoted(o.id)}`)
  }
  // CNT-12: a fixture beyond the line moves with the walls round it.
  const items = new Map<string, { at: [number, number]; turn: number }>()
  for (const item of plan.items ?? []) {
    if (onFloor(item.floor) && beyond(item.at)) items.set(item.id, { at: move(item.at), turn: item.turn ?? 0 })
  }
  if (items.size > 0) said.push(`${items.size} fixture${items.size === 1 ? '' : 's'} beyond the line moved with ${items.size === 1 ? 'it' : 'them'}.`)
  if (stayed.length > 0) said.push(`${listed(stayed)} ${stayed.length === 1 ? 'stays where it was: its wall grew at its start, so its offset is' : 'stay where they were: their walls grew at their start, so their offsets are'} ${Math.abs(by).toFixed(2)} m ${by >= 0 ? 'longer' : 'shorter'}.`)
  return { walls: changes, openings, removeOpenings: new Set(), rooms: new Map(), ...(items.size === 0 ? {} : { items }), said, guessed: [...guessed, ...seated.guessed], notKept: seated.notKept }
}
