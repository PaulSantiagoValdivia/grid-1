/**
 * A builder's take-off: metres of wall by kind, per room the floor, the ceiling, the skirting and
 * the wall face to plaster, and per floor the slab and the roof (LVL-4), each with the rule it is
 * measured by.
 *
 * Every figure comes from the plan's own walls and openings. The plan holds no finishes, so a
 * ceiling is the floor area under it, at the room's height or its lowered zones', and nothing is
 * taken off for a kitchen unit or a bath.
 *
 * The plan states no slab and no roof: Grid works them out from each floor's outline
 * (`planEnvelope`). So every slab and roof line is marked assumed, with what was assumed (lab
 * AC-6): taking the top floor's outline as the roof missed 47% of the odd house's.
 */
import {
  SLAB_THICKNESS,
  floorElevations,
  floorOf,
  indexPlan,
  planEnvelope,
  planFloors,
  planForFloor,
  roomCeiling,
  wallAxis,
  faceUnderTop,
  wallTopProfile,
  type FloorEnvelope,
  type FloorPlan,
  type RoofShape,
  type SlabOpeningKind,
  type Wall,
} from '@ongrid/floorplan/geometry'
import type { Survey, SurveyRoom } from './survey'

export const TAKEOFF_RULES = {
  walls: 'Wall length is the length of each solid wall along its centre line, each wall counted once; gross is with openings, net takes off the width of every opening in it.',
  floor: 'Floor and ceiling area is the room between its wall faces (the net area). A ceiling is the floor below it, at the room\'s height, its lowered zones at theirs.',
  skirting: 'Skirting is the room\'s inside perimeter less the width of every door and doorless opening on it.',
  plaster: 'Wall face is each inside side of the room times the height of the wall it is on, less every door, window and opening in it (width times height). Dividing lines are not plastered.',
  envelope: 'Slab and roof area is on plan, from each floor\'s outline to the outside face of its walls: a slab is the outline less its openings over stairs, lifts and voids; a roof is the outline less the floors on the level above, so every part with nothing above it is roofed.',
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
  /** LVL-4: the ceiling's height above the floor: the room's stated height, else its walls' usual one. */
  readonly ceilingHeight: number | null
  /** LVL-4: the zones of its ceiling lowered under the rest, each with its height and area. */
  readonly lowered: readonly { readonly name: string; readonly height: number; readonly area: number }[]
}

/** What a slab is open over, in a line. */
export interface SlabOpeningLine {
  readonly kind: SlabOpeningKind
  readonly via: string
  readonly area: number
}

/** LVL-4: one floor's slab and roof, worked out from its outline, never stated by the plan. */
export interface EnvelopeLine {
  readonly floor: string
  readonly floorName: string
  /** The floor's outline, on plan, to the outside face of its walls. */
  readonly outline: number | null
  /** The slab it stands on, as built: less its openings. Null when the floor has no outline. */
  readonly slab: { readonly kind: 'base' | 'floor'; readonly area: number; readonly thickness: number; readonly openings: readonly SlabOpeningLine[] } | null
  /**
   * The roof over every part of it with nothing above, and its parapet's height. Null when it has
   * none. LVL-6: the shape the floor states (null: flat, as Grid lays it), its pitch in degrees, its
   * area on the slope and how many rooflights it holds.
   */
  readonly roof: {
    readonly area: number
    readonly parapet: number | null
    readonly shape: RoofShape | null
    readonly pitch: number
    readonly slopeArea: number
    readonly rooflights: number
  } | null
  /** Always: the plan states no slab and no roof, so Grid's are an assumption. */
  readonly state: 'assumed'
  /** What Grid assumed, in words. */
  readonly assumed: readonly string[]
  /** Why there is no slab or roof, when there is none. */
  readonly why: string | null
}

export interface EnvelopeTakeoff {
  readonly floors: readonly EnvelopeLine[]
  /** Every slab, as built; null when a floor's outline is not known. */
  readonly slabs: number | null
  /** Every roof, on plan; null when a floor's outline is not known. */
  readonly roof: number | null
  readonly state: 'assumed'
}

export interface Takeoff {
  readonly walls: readonly WallRun[]
  readonly rooms: readonly RoomTakeoff[]
  readonly totals: { readonly floorArea: number; readonly ceiling: number; readonly skirting: number; readonly wallFace: number }
  /** LVL-4: the slabs and the roof, floor by floor. */
  readonly envelope: EnvelopeTakeoff
  readonly rules: readonly string[]
}

const KINDS: readonly Wall['kind'][] = ['exterior', 'interior', 'partition']

/** One room's take-off; `ceiling` gives its stated ceiling height and lowered zones (none stated when left out). */
export function roomTakeoff(
  room: SurveyRoom,
  ceiling: (room: SurveyRoom) => Pick<RoomTakeoff, 'lowered'> & { readonly stated: number | null } = () => ({ stated: null, lowered: [] }),
  plan?: FloorPlan
): RoomTakeoff {
  const perimeter = room.edges.reduce((sum, edge) => sum + edge.length, 0)
  let face = 0
  const heights: number[] = []
  for (const edge of room.edges) {
    if (edge.wall === null || edge.wall.virtual === true) continue
    // LVL-6: a wall the floor's roof cuts has its face under the top the roof leaves it.
    const top = plan === undefined ? null : wallTopProfile(plan, edge.wall)
    if (top === null) {
      face += edge.length * edge.wall.height
      heights.push(edge.wall.height)
      continue
    }
    const axis = wallAxis(edge.wall)
    const along = (p: { x: number; y: number }): number => (p.x - axis.start.x) * axis.dir.x + (p.y - axis.start.y) * axis.dir.y
    const under = faceUnderTop(top, along(edge.from), along(edge.to))
    face += under
    heights.push(edge.length > 0 ? under / edge.length : edge.wall.height)
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
  const height = heights.length > 0 ? heights[Math.floor(heights.length / 2)]! : null
  const { stated, lowered } = ceiling(room)
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
    height,
    ceilingHeight: stated ?? height,
    lowered,
  }
}

/** What Grid takes for a floor's slab and roof that the plan does not state. */
function assumptions(env: FloorEnvelope, thicknessStated: boolean): string[] {
  const out: string[] = []
  if (env.slab !== null) {
    out.push('the slab is the floor\'s outline, to the outside face of its walls: the plan states no slab')
    if (!thicknessStated) out.push(`the slab is ${SLAB_THICKNESS.toFixed(2)} m thick: the floor states no slab thickness`)
    if (env.slab.openings.some((o) => o.kind === 'stair-room')) out.push('the opening over a stair room is the floor it shares with the stair room below: the plan states no stair there')
  }
  if (env.roof !== null && env.roof.shape === null) out.push('the roof is flat, over every part with nothing above, with no overhang and no fall: the plan states no roof')
  // LVL-6: the floor states its roof's shape and slope, but not where it ends or what it is made of.
  if (env.roof !== null && env.roof.shape !== null) out.push(`the roof is the ${env.roof.shape} roof the floor states, over every part with nothing above, with no overhang: the plan states its shape and slope, not its build-up`)
  return out
}

/** LVL-4: the slabs and roofs of the floors given, from their outlines. */
export function envelopeTakeoff(survey: Survey, floors?: readonly string[]): EnvelopeTakeoff {
  const names = new Map(survey.facts.floors.map((f) => [f.id, f.name] as const))
  const stated = new Map(planFloors(survey.plan).map((f) => [f.id, f.slab !== undefined && Number.isFinite(f.slab)] as const))
  const envelope = planEnvelope(survey.plan, floors === undefined ? {} : { floors })
  const lines: EnvelopeLine[] = envelope.floors.map((env) => ({
    floor: env.floor,
    floorName: names.get(env.floor) ?? env.floor,
    outline: env.outlineArea,
    slab:
      env.slab === null
        ? null
        : { kind: env.slab.kind, area: env.slab.area, thickness: env.slab.thickness, openings: env.slab.openings.map((o) => ({ kind: o.kind, via: o.via, area: o.area })) },
    roof:
      env.roof === null
        ? null
        : { area: env.roof.area, parapet: env.roof.parapet?.height ?? null, shape: env.roof.shape, pitch: env.roof.pitch, slopeArea: env.roof.slopeArea, rooflights: env.roof.rooflights.length },
    state: 'assumed',
    assumed: assumptions(env, stated.get(env.floor) ?? false),
    why: env.why,
  }))
  return { floors: lines, slabs: envelope.slabArea, roof: envelope.roofArea, state: 'assumed' }
}

/** Each room's stated ceiling height and lowered zones, by floor and room id. */
function ceilings(survey: Survey): (room: SurveyRoom) => Pick<RoomTakeoff, 'lowered'> & { readonly stated: number | null } {
  const storeys = floorElevations(survey.plan).floors
  const indexes = new Map<string, ReturnType<typeof indexPlan>>()
  return (room) => {
    const floor = room.facts.floor
    const plan = survey.plan.rooms.find((r) => r.id === room.facts.id && floorOf(r) === floor) ?? survey.plan.rooms.find((r) => r.id === room.facts.id)
    const stated = plan?.height !== undefined && Number.isFinite(plan.height) ? plan.height : null
    if (plan?.ceiling === undefined) return { stated, lowered: [] }
    let index = indexes.get(floor)
    if (index === undefined) {
      index = indexPlan(planForFloor(survey.plan, floor))
      indexes.set(floor, index)
    }
    const pieces = roomCeiling(plan, index, storeys.get(floor)?.clearHeight ?? 0) ?? []
    return { stated, lowered: pieces.filter((p) => p.zone !== null).map((p) => ({ name: p.zone!, height: p.height, area: p.area })) }
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
  const ceilingOf = ceilings(survey)
  const list = survey.rooms
    .filter((room) => onFloor(room.facts.floor) && (rooms === undefined || rooms.includes(room.facts.id)))
    .map((room) => roomTakeoff(room, ceilingOf, survey.plan))
  const total = (key: 'floorArea' | 'ceiling' | 'skirting' | 'wallFace'): number => list.reduce((sum, room) => sum + room[key], 0)
  return {
    walls: runs,
    rooms: list,
    totals: { floorArea: total('floorArea'), ceiling: total('ceiling'), skirting: total('skirting'), wallFace: total('wallFace') },
    envelope: envelopeTakeoff(survey, floors),
    rules: Object.values(TAKEOFF_RULES),
  }
}
