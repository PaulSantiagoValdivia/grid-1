/**
 * A builder's take-off: metres of wall by kind, and per room the floor, the ceiling, the
 * skirting and the wall face to plaster, each with the rule it is measured by.
 *
 * Every figure comes from the plan's own walls and openings. The plan holds no ceilings,
 * finishes or fixtures, so a ceiling is the floor area under it and nothing is taken off for
 * a kitchen unit or a bath.
 */
import { wallAxis, type Wall } from '@ongrid/floorplan/geometry'
import type { Survey, SurveyRoom } from './survey'

export const TAKEOFF_RULES = {
  walls: 'Wall length is the length of each solid wall along its centre line, each wall counted once; gross is with openings, net takes off the width of every opening in it.',
  floor: 'Floor and ceiling area is the room between its wall faces (the net area). The plan has no ceilings, so a ceiling is the floor below it.',
  skirting: 'Skirting is the room\'s inside perimeter less the width of every door and doorless opening on it.',
  plaster: 'Wall face is each inside side of the room times the height of the wall it is on, less every door, window and opening in it (width times height). Dividing lines are not plastered.',
} as const

export interface WallRun {
  readonly kind: Wall['kind']
  readonly count: number
  /** Centre-line metres. */
  readonly gross: number
  readonly net: number
}

export interface RoomTakeoff {
  readonly id: string
  readonly name: string
  readonly floor: string
  readonly floorArea: number
  readonly ceiling: number
  readonly perimeter: number
  readonly skirting: number
  readonly wallFace: number
  readonly openingsOff: number
  /** The usual height of the room's walls. */
  readonly height: number | null
}

export interface Takeoff {
  readonly walls: readonly WallRun[]
  readonly rooms: readonly RoomTakeoff[]
  readonly totals: { readonly floorArea: number; readonly ceiling: number; readonly skirting: number; readonly wallFace: number }
  readonly rules: readonly string[]
}

const KINDS: readonly Wall['kind'][] = ['exterior', 'interior', 'partition']

export function roomTakeoff(room: SurveyRoom): RoomTakeoff {
  const perimeter = room.edges.reduce((sum, edge) => sum + edge.length, 0)
  let face = 0
  const heights: number[] = []
  for (const edge of room.edges) {
    if (edge.wall === null || edge.wall.virtual === true) continue
    face += edge.length * edge.wall.height
    heights.push(edge.wall.height)
  }
  // Openings in this room's sides: in a dividing line there is nothing to take off.
  let openingsOff = 0
  let passages = 0
  const virtual = new Set(room.edges.filter((edge) => edge.wall?.virtual === true).map((edge) => edge.wall!.id))
  for (const opening of room.openings) {
    if (virtual.has(opening.wall)) continue
    const wall = room.edges.find((edge) => edge.wall?.id === opening.wall)?.wall
    const top = Math.min(opening.sill + opening.height, wall?.height ?? Infinity)
    openingsOff += opening.width * Math.max(0, top - opening.sill)
    if (opening.type !== 'window') passages += opening.width
  }
  const area = room.facts.shape?.area ?? 0
  heights.sort((a, b) => a - b)
  return {
    id: room.facts.id,
    name: room.facts.name,
    floor: room.facts.floor,
    floorArea: area,
    ceiling: area,
    perimeter,
    skirting: Math.max(0, perimeter - passages),
    wallFace: Math.max(0, face - openingsOff),
    openingsOff,
    height: heights.length > 0 ? heights[Math.floor(heights.length / 2)]! : null,
  }
}

export function planTakeoff(survey: Survey, floors?: readonly string[], rooms?: readonly string[]): Takeoff {
  const onFloor = (floor: string): boolean => floors === undefined || floors.includes(floor)
  const wallFloor = new Map(survey.facts.floors.flatMap((f) => f.walls.map((w) => [w.id, f.id] as const)))
  const walls = survey.plan.walls.filter((wall) => wall.virtual !== true && wallFloor.has(wall.id) && onFloor(wallFloor.get(wall.id)!))
  const openingWidth = new Map<string, number>()
  for (const o of survey.plan.openings) openingWidth.set(o.wall, (openingWidth.get(o.wall) ?? 0) + o.width)
  const runs: WallRun[] = KINDS.map((kind) => {
    const of = walls.filter((wall) => wall.kind === kind)
    const gross = of.reduce((sum, wall) => sum + wallAxis(wall).length, 0)
    const net = of.reduce((sum, wall) => sum + Math.max(0, wallAxis(wall).length - (openingWidth.get(wall.id) ?? 0)), 0)
    return { kind, count: of.length, gross, net }
  }).filter((run) => run.count > 0)
  // A zone's floor, walls and ceiling are its room's (CNT-8): taken off once, unless asked for by name.
  const list = survey.rooms
    .filter((room) => onFloor(room.facts.floor) && (rooms === undefined ? room.facts.zoneOf === undefined : rooms.includes(room.facts.id)))
    .map(roomTakeoff)
  const total = (key: 'floorArea' | 'ceiling' | 'skirting' | 'wallFace'): number => list.reduce((sum, room) => sum + room[key], 0)
  return {
    walls: runs,
    rooms: list,
    totals: { floorArea: total('floorArea'), ceiling: total('ceiling'), skirting: total('skirting'), wallFace: total('wallFace') },
    rules: Object.values(TAKEOFF_RULES),
  }
}
