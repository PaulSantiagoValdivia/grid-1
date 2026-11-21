/**
 * Measuring in a person's terms: a room's sizes and the widest circle it holds, whether a box
 * or a circle fits in it, the way from one room to another with the doors it passes, and what
 * is narrower than a figure the person gives.
 *
 * Every answer measures the empty room between its wall faces: the plan holds no furniture,
 * fixtures, radiators or door leaves, and says so.
 */
import { planForFloor, poleOfInaccessibility, spotsInside, type Vec2 } from '@ongrid/floorplan/geometry'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { floorGraph } from '@ongrid/floorplan/geometry/rules/graph'
import { compassOf, type Compass } from '../describe/facts'
import type { Survey, SurveyRoom } from './survey'

export const EMPTY_ROOM_RULE =
  'Measured in the empty room between wall faces: furniture, fixtures, radiators, door leaves and the space a person needs round them are not in the plan.'

export interface RoomSide {
  readonly facing: Compass
  readonly length: number
  readonly wall: string | null
}

export interface RoomMeasure {
  readonly id: string
  readonly name: string
  readonly floor: string
  readonly area: number
  readonly perimeter: number
  /** Across (x) and up (y) the drawing: its sizes when the room is a rectangle square to it. */
  readonly across: number
  readonly up: number
  readonly rectangle: boolean
  /** The widest circle that fits, and where its centre is. */
  readonly widestCircle: number
  readonly circleAt: Vec2
  readonly sides: readonly RoomSide[]
}

function sidesOf(room: SurveyRoom): RoomSide[] {
  return room.edges.map((edge) => {
    // The side's own direction turned outward: the outline runs counter-clockwise.
    const out = { x: edge.to.y - edge.from.y, y: -(edge.to.x - edge.from.x) }
    return { facing: compassOf(out), length: edge.length, wall: edge.wall?.id ?? null }
  })
}

export function measureRoom(room: SurveyRoom): RoomMeasure {
  const pole = poleOfInaccessibility(room.polygon)
  const shape = room.facts.shape
  return {
    id: room.facts.id,
    name: room.facts.name,
    floor: room.facts.floor,
    area: shape?.area ?? 0,
    perimeter: room.edges.reduce((sum, edge) => sum + edge.length, 0),
    across: shape?.across ?? 0,
    up: shape?.up ?? 0,
    rectangle: shape?.rectangle ?? false,
    widestCircle: 2 * pole.distance,
    circleAt: pole.point,
    sides: sidesOf(room),
  }
}

export interface FitAnswer {
  readonly fits: boolean
  readonly what: string
  /** Where its middle can go, when it fits: one spot, and how it is turned. */
  readonly at: Vec2 | null
  readonly turned: boolean
  /** For a box: the biggest square it would take, as a hint when it does not fit. */
  readonly widestCircle: number
}

export function fitInRoom(room: SurveyRoom, shape: { width: number; depth: number } | { diameter: number }): FitAnswer {
  const pole = poleOfInaccessibility(room.polygon)
  if ('diameter' in shape) {
    const fits = 2 * pole.distance >= shape.diameter - 1e-6
    return { fits, what: `a circle ${shape.diameter.toFixed(2)} m across`, at: fits ? pole.point : null, turned: false, widestCircle: 2 * pole.distance }
  }
  const what = `a ${shape.width.toFixed(2)} × ${shape.depth.toFixed(2)} m rectangle`
  const along = spotsInside(room.polygon, shape.width / 2, shape.depth / 2)
  if (along.length > 0) return { fits: true, what, at: along[0]!, turned: false, widestCircle: 2 * pole.distance }
  const turned = spotsInside(room.polygon, shape.depth / 2, shape.width / 2)
  if (turned.length > 0) return { fits: true, what, at: turned[0]!, turned: true, widestCircle: 2 * pole.distance }
  return { fits: false, what, at: null, turned: false, widestCircle: 2 * pole.distance }
}

export interface RouteStep {
  /** The opening or dividing line passed, and its width; a dividing line has none. */
  readonly via: string
  readonly type: 'door' | 'window' | 'opening' | 'open side'
  readonly width: number | null
  readonly into: string
}

export interface Route {
  readonly from: string
  readonly to: string
  /** Rooms in order, the first and the last included. */
  readonly rooms: readonly string[]
  readonly steps: readonly RouteStep[]
  /** The narrowest door or opening on the way, and the room with the narrowest widest circle. */
  readonly narrowestPassage: { readonly via: string; readonly width: number } | null
  readonly narrowestRoom: { readonly room: string; readonly widestCircle: number } | null
}

/** The way with the fewest rooms between two rooms of one floor, or to any way out ('outside'). */
export function routeBetween(survey: Survey, from: string, to: string): Route | null {
  const floor = survey.byId.get(from)!.facts.floor
  const { storey, leftOut } = drawable(planForFloor(survey.plan, floor))
  const graph = floorGraph(storey, leftOut.rooms)
  const openings = new Map(storey.openings.map((o) => [o.id, o]))
  const next = new Map<string, Array<{ room: string; via: string }>>()
  const join = (a: string, b: string, via: string): void => {
    if (!next.has(a)) next.set(a, [])
    next.get(a)!.push({ room: b, via })
  }
  for (const l of graph.links) {
    join(l.rooms[0], l.rooms[1], l.via)
    join(l.rooms[1], l.rooms[0], l.via)
  }
  const OUT = '\u0000outside'
  for (const exit of graph.exits) join(exit.room, OUT, exit.opening)
  const goal = to === 'outside' ? OUT : to

  const back = new Map<string, { room: string; via: string }>()
  const queue = [from]
  const seen = new Set([from])
  while (queue.length > 0) {
    const room = queue.shift()!
    if (room === goal) break
    for (const step of next.get(room) ?? []) {
      if (seen.has(step.room)) continue
      seen.add(step.room)
      back.set(step.room, { room, via: step.via })
      queue.push(step.room)
    }
  }
  if (!seen.has(goal)) return null

  const rooms: string[] = []
  const steps: RouteStep[] = []
  for (let at = goal; at !== from;) {
    const prev = back.get(at)!
    const opening = openings.get(prev.via)
    steps.unshift({
      via: prev.via,
      type: opening?.type ?? 'open side',
      width: opening?.width ?? null,
      into: at === OUT ? 'outside' : at,
    })
    if (at !== OUT) rooms.unshift(at)
    at = prev.room
  }
  rooms.unshift(from)

  let narrowestPassage: Route['narrowestPassage'] = null
  for (const step of steps) {
    if (step.width !== null && (narrowestPassage === null || step.width < narrowestPassage.width)) narrowestPassage = { via: step.via, width: step.width }
  }
  let narrowestRoom: Route['narrowestRoom'] = null
  for (const id of rooms) {
    const room = survey.byId.get(id)
    if (room === undefined || room.polygon.length < 3) continue
    const circle = 2 * poleOfInaccessibility(room.polygon).distance
    if (narrowestRoom === null || circle < narrowestRoom.widestCircle) narrowestRoom = { room: id, widestCircle: circle }
  }
  return { from, to, rooms, steps, narrowestPassage, narrowestRoom }
}
