/**
 * VEW-9: the walk-through, `grid describe --length walk`, the long form of the description.
 *
 * Each floor is walked from its way in: the door the plan names as its front, else the widest
 * door from outside into a corridor, else the widest door from outside. A floor with no way in
 * from outside starts in its stair room, where the stairs arrive. From there the walk goes room
 * by room through the doors, doorless openings and open sides, as the way-out check reads them
 * (`wayGraph`): it takes the ways out of each room from left to right as you stand in its doorway,
 * goes as deep as it can, and comes back. A room no way reaches is said as such.
 *
 * In each room you stand in the doorway you came in by, at its middle on the room's side, facing
 * into the room square to the wall. What is in the room is said by the wall it is on: ahead, on
 * your left, on your right, and in the wall you stand in (behind you), each with how far it is.
 * A fixture is on the wall nearest its middle. Left and right are the building's: when the plan
 * says its y runs down the page, the drawing is the building mirrored and they are read the
 * right way round.
 *
 * Pictures (`walkPictures.ts`) are taken at eye height from each doorway, a step into the room,
 * looking ahead, with VEW-3's eye camera.
 *
 * Nothing here checks anything. Pure: a survey in, facts out; `walkText` words them.
 */
import { dot, planOrientation, poleOfInaccessibility, sub, tolerance, type Vec2 } from '@ongrid/floorplan/geometry'
import { planFixtures } from '../quantities/fixtures'
import { OUTSIDE, wayGraph } from '../quantities/measure'
import { crossingOf } from '../quantities/walked'
import type { Survey, SurveyRoom } from '../quantities/survey'
import { compassOf, type Compass } from './facts'
import { PersonNames, type DescribeAudience } from './card'

/** How high the eye of a walk's pictures is above the floor, as grid_view kind=eye takes it. */
export const WALK_EYE_HEIGHT = 1.6
/** The most pictures one grid_describe answer carries: a floor at a time beyond that. */
export const WALK_PICTURES_MAX = 12
/** Within this much of straight ahead (or of beside you), a thing is said to be straight there. */
const STRAIGHT = 0.3

export type WalkWall = 'ahead' | 'left' | 'right' | 'behind'

export interface WalkThing {
  readonly kind: 'door' | 'window' | 'opening' | 'open side' | 'fixture'
  readonly id: string
  /** An opening's width, an open side's shared stretch; a fixture's width along its back. */
  readonly width: number
  /** The room on the other side, by id, or `outside`, `nothing drawn` or `a room left out`; null for a fixture. */
  readonly to: string | null
  /** A fixture's label, else its kind in words. */
  readonly label?: string
  /** How far ahead of you its middle is, along the way you face. */
  readonly ahead: number
  /** How far to your left (+) or right (−) its middle is. */
  readonly across: number
}

export interface WalkStop {
  readonly room: string
  readonly floor: string
  /** Where you came from: a room id, `outside`, or null where the walk starts with no doorway. */
  readonly from: string | null
  readonly via: string | null
  readonly viaKind: WalkThing['kind'] | null
  readonly viaWidth: number | null
  /** Where you stand: the doorway's middle on the room's side, or the room's middle with no doorway. */
  readonly stand: Vec2
  /** The way you face on the drawing, and as a heading in degrees clockwise from its top. */
  readonly facing: Compass
  readonly heading: number
  /** The room as you face it: across from side to side, and deep from where you stand. */
  readonly across: number
  readonly deep: number
  readonly area: number
  /** How far the wall ahead, on your left and on your right is, straight out from where you stand. */
  readonly reach: { readonly ahead: number | null; readonly left: number | null; readonly right: number | null }
  readonly ahead: readonly WalkThing[]
  readonly left: readonly WalkThing[]
  readonly right: readonly WalkThing[]
  readonly behind: readonly WalkThing[]
}

export interface FloorWalk {
  readonly floor: string
  /** How the walk starts: the named front door, a door from outside, or the stair room. */
  readonly start: 'front' | 'way in' | 'stair' | 'first room' | null
  readonly stops: readonly WalkStop[]
  /** Rooms of the floor no way of the walk reaches, by id. */
  readonly notReached: readonly string[]
  /** The earlier floor this one is laid out like, when it is not walked again. */
  readonly repeats: string | null
}

export interface PlanWalk {
  readonly floors: readonly FloorWalk[]
  /** The plan says its y runs down the page: left and right are read the right way round. */
  readonly mirrored: boolean
}

const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y)
  return l < tolerance('noLength') ? { x: 0, y: 1 } : { x: v.x / l, y: v.y / l }
}
const leftOf = (f: Vec2): Vec2 => ({ x: -f.y, y: f.x })

/** How far a ray from `p` along `d` goes before it meets the room's outline or a hole. */
function rayReach(room: SurveyRoom, p: Vec2, d: Vec2): number | null {
  let best: number | null = null
  for (const ring of [room.polygon, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const e = sub(b, a)
      const den = d.x * e.y - d.y * e.x
      if (Math.abs(den) < tolerance('noLength')) continue
      const w = sub(a, p)
      const t = (w.x * e.y - w.y * e.x) / den
      const u = (w.x * d.y - w.y * d.x) / den
      if (t > tolerance('joint') && u >= -tolerance('noLength') && u <= 1 + tolerance('noLength') && (best === null || t < best)) best = t
    }
  }
  return best
}

/** Which wall a face whose outward normal is `out` is, for someone facing `f`. */
function wallFor(out: Vec2, f: Vec2): WalkWall {
  const a = dot(out, f)
  const l = dot(out, leftOf(f))
  if (Math.abs(a) >= Math.abs(l)) return a > 0 ? 'ahead' : 'behind'
  return l > 0 ? 'left' : 'right'
}

interface Ways {
  readonly next: Map<string, Array<{ room: string; via: string }>>
}

/** The things in a room, by wall, as seen from `stand` facing `f`; `skip` is the doorway you stand in. */
function thingsIn(survey: Survey, ways: Ways, room: SurveyRoom, stand: Vec2, f: Vec2, skip: string | null, mirror: number, fixtures: ReadonlyMap<string, FixtureSpot[]>): Record<WalkWall, WalkThing[]> {
  const out: Record<WalkWall, WalkThing[]> = { ahead: [], left: [], right: [], behind: [] }
  const place = (middle: Vec2): { ahead: number; across: number } => ({ ahead: dot(sub(middle, stand), f), across: mirror * dot(sub(middle, stand), leftOf(f)) })
  const put = (wall: WalkWall, thing: WalkThing): void => {
    // Mirrored, the drawing's left wall is the building's right one.
    const side = mirror < 0 && (wall === 'left' || wall === 'right') ? (wall === 'left' ? 'right' : 'left') : wall
    out[side].push(thing)
  }
  for (const facts of room.openings) {
    if (facts.id === skip) continue
    const mine = facts.sides.findIndex((side) => typeof side === 'object' && side.room === room.facts.id)
    const otherSide = facts.sides[mine === 0 ? 1 : 0]!
    const other = typeof otherSide === 'object' ? otherSide.room : otherSide
    if (other === room.facts.id) continue
    const crossing = crossingOf(survey, room, facts.id)
    if (crossing === null) continue
    put(wallFor({ x: -crossing.inward.x, y: -crossing.inward.y }, f), { kind: facts.type, id: facts.id, width: facts.width, to: other, ...place(crossing.near) })
  }
  // Open sides: the stretches of the outline on a dividing line, one per line.
  const seen = new Set<string>()
  for (const edge of room.edges) {
    const wall = edge.wall
    if (wall === null || wall.virtual !== true || seen.has(wall.id) || wall.id === skip) continue
    seen.add(wall.id)
    const to = (ways.next.get(room.facts.id) ?? []).find((w) => w.via === wall.id)?.room
    const crossing = crossingOf(survey, room, wall.id, to === undefined ? null : (survey.byId.get(to) ?? null))
    if (crossing === null) continue
    const stretch = room.edges.filter((e) => e.wall?.id === wall.id).reduce((sum, e) => sum + e.length, 0)
    put(wallFor({ x: -crossing.inward.x, y: -crossing.inward.y }, f), { kind: 'open side', id: wall.id, width: stretch, to: to === undefined || to === OUTSIDE ? 'nothing drawn' : to, ...place(crossing.near) })
  }
  for (const spot of fixtures.get(room.facts.id) ?? []) {
    let best: { d: number; out: Vec2 } | null = null
    for (const edge of room.edges) {
      const e = sub(edge.to, edge.from)
      const span = dot(e, e)
      if (span < tolerance('noLength') ** 2) continue
      const t = Math.max(0, Math.min(1, dot(sub(spot.at, edge.from), e) / span))
      const d = Math.hypot(edge.from.x + e.x * t - spot.at.x, edge.from.y + e.y * t - spot.at.y)
      if (best === null || d < best.d) best = { d, out: unit({ x: e.y, y: -e.x }) }
    }
    if (best === null) continue
    put(wallFor(best.out, f), { kind: 'fixture', id: spot.id, width: spot.width, to: null, label: spot.label, ...place(spot.at) })
  }
  // Ahead and behind from left to right; along the side walls, nearest first.
  out.ahead.sort((a, b) => b.across - a.across)
  out.behind.sort((a, b) => b.across - a.across)
  out.left.sort((a, b) => a.ahead - b.ahead)
  out.right.sort((a, b) => a.ahead - b.ahead)
  return out
}

interface FixtureSpot {
  readonly id: string
  readonly label: string
  readonly width: number
  readonly at: Vec2
}

function fixtureSpots(survey: Survey): Map<string, FixtureSpot[]> {
  const byRoom = new Map<string, FixtureSpot[]>()
  if ((survey.plan.items ?? []).length === 0) return byRoom
  for (const row of planFixtures(survey.plan).rows) {
    if (row.room === null) continue
    if (!byRoom.has(row.room)) byRoom.set(row.room, [])
    byRoom.get(row.room)!.push({ id: row.id, label: row.label, width: row.size[0], at: { x: row.at[0], y: row.at[1] } })
  }
  return byRoom
}

const CIRCULATION = new Set(['corridor', 'reception'])

/** The way into a floor from outside: the named front, else the widest door into a corridor, else the widest. */
function wayIn(survey: Survey, ways: Ways, rooms: ReadonlySet<string>, done: ReadonlySet<string>): { room: string; via: string; front: boolean } | null {
  const front = survey.plan.front?.opening
  const doors: { room: string; via: string; width: number; circulation: boolean }[] = []
  for (const [room, next] of ways.next) {
    if (!rooms.has(room) || done.has(room)) continue
    for (const w of next) {
      if (w.room !== OUTSIDE) continue
      const facts = survey.facts.openings.get(w.via)
      if (facts === undefined || facts.type === 'window') continue
      if (w.via === front) return { room, via: w.via, front: true }
      doors.push({ room, via: w.via, width: facts.width, circulation: CIRCULATION.has(survey.byId.get(room)?.facts.use ?? '') })
    }
  }
  doors.sort((a, b) => Number(b.circulation) - Number(a.circulation) || b.width - a.width)
  const best = doors[0]
  return best === undefined ? null : { room: best.room, via: best.via, front: false }
}

/** One stop: standing in the doorway `via` of `room` (or in its middle), facing in. */
function stopAt(survey: Survey, ways: Ways, room: SurveyRoom, from: string | null, via: string | null, toward: Vec2 | null, mirror: number, fixtures: ReadonlyMap<string, FixtureSpot[]>): WalkStop | null {
  if (room.polygon.length < 3) return null
  let stand: Vec2
  let f: Vec2
  const other = from === null || from === OUTSIDE || from === 'outside' ? null : (survey.byId.get(from) ?? null)
  const crossing = via === null ? null : crossingOf(survey, room, via, other)
  if (crossing !== null) {
    stand = crossing.near
    f = crossing.inward
  } else {
    stand = poleOfInaccessibility(room.polygon, undefined, room.holes).point
    f = toward === null ? { x: 0, y: 1 } : unit(sub(toward, stand))
  }
  const things = thingsIn(survey, ways, room, stand, f, via, mirror, fixtures)
  const l = leftOf(f)
  const ahead = room.polygon.map((p) => dot(sub(p, stand), f))
  const across = room.polygon.map((p) => dot(sub(p, stand), l))
  const inside = { x: stand.x + f.x * tolerance('joint') * 2, y: stand.y + f.y * tolerance('joint') * 2 }
  const reachLeft = rayReach(room, inside, l)
  const reachRight = rayReach(room, inside, { x: -l.x, y: -l.y })
  const opening = via === null ? undefined : survey.facts.openings.get(via)
  return {
    room: room.facts.id,
    floor: room.facts.floor,
    from: from === OUTSIDE ? 'outside' : from,
    via,
    viaKind: via === null ? null : (opening?.type ?? 'open side'),
    viaWidth: opening?.width ?? null,
    stand,
    facing: compassOf(f),
    heading: ((Math.atan2(f.x, f.y) * 180) / Math.PI + 360) % 360,
    across: Math.max(...across) - Math.min(...across),
    deep: Math.max(...ahead) - Math.max(0, Math.min(...ahead)),
    area: room.facts.shape?.area ?? 0,
    reach: {
      ahead: rayReach(room, stand, f),
      left: mirror < 0 ? reachRight : reachLeft,
      right: mirror < 0 ? reachLeft : reachRight,
    },
    ...things,
  }
}

/** Walk one floor from its way in, room by room, left to right, as deep as it goes. */
function walkFloor(survey: Survey, floorId: string, mirror: number, fixtures: ReadonlyMap<string, FixtureSpot[]>): FloorWalk {
  const floor = survey.facts.floors.find((f) => f.id === floorId)!
  const roomIds = floor.rooms.filter((r) => r.zoneOf === undefined).map((r) => r.id)
  const rooms = new Set(roomIds)
  const ways: Ways = wayGraph(survey, floorId)
  const visited = new Set<string>()
  const stops: WalkStop[] = []
  let start: FloorWalk['start'] = null

  const tour = (first: { room: string; from: string | null; via: string | null; toward: Vec2 | null }): void => {
    const stack = [first]
    while (stack.length > 0) {
      const at = stack.pop()!
      if (visited.has(at.room)) continue
      const room = survey.byId.get(at.room)
      if (room === undefined) continue
      visited.add(at.room)
      const stop = stopAt(survey, ways, room, at.from, at.via, at.toward, mirror, fixtures)
      if (stop === null) continue
      stops.push(stop)
      // The ways on, from left to right as you stand here, sweeping round from your left hand.
      const all = [...stop.ahead, ...stop.left, ...stop.right, ...stop.behind].sort((a, b) => Math.atan2(b.across, b.ahead) - Math.atan2(a.across, a.ahead))
      const order = new Map(all.map((t, i) => [t.id, i]))
      const onward = (ways.next.get(at.room) ?? [])
        .filter((w) => w.room !== OUTSIDE && rooms.has(w.room) && !visited.has(w.room) && order.has(w.via))
        .sort((a, b) => order.get(a.via)! - order.get(b.via)!)
      const firstBy = new Map<string, string>()
      for (const w of onward) if (!firstBy.has(w.room)) firstBy.set(w.room, w.via)
      const next = [...firstBy.entries()]
      for (let i = next.length - 1; i >= 0; i--) stack.push({ room: next[i]![0], from: at.room, via: next[i]![1], toward: null })
    }
  }

  for (;;) {
    const way = wayIn(survey, ways, rooms, visited)
    if (way === null) break
    if (start === null) start = way.front ? 'front' : 'way in'
    tour({ room: way.room, from: OUTSIDE, via: way.via, toward: null })
  }
  if (start === null && roomIds.length > 0) {
    const stair = roomIds.find((id) => survey.byId.get(id)?.facts.use === 'stair')
    const first = stair ?? roomIds[0]!
    start = stair !== undefined ? 'stair' : 'first room'
    const door = (ways.next.get(first) ?? []).find((w) => w.room !== OUTSIDE)
    const room = survey.byId.get(first)
    const toward = door === undefined || room === undefined ? null : (crossingOf(survey, room, door.via, survey.byId.get(door.room) ?? null)?.near ?? null)
    tour({ room: first, from: null, via: null, toward })
  }
  return { floor: floorId, start, stops, notReached: roomIds.filter((id) => !visited.has(id)), repeats: null }
}

/** The walk of every floor, or of the one asked for; a floor laid out like an earlier one is said once. */
export function planWalk(survey: Survey, onlyFloor?: string): PlanWalk {
  const mirrored = planOrientation(survey.plan).yAxis === 'down'
  const mirror = mirrored ? -1 : 1
  const fixtures = fixtureSpots(survey)
  const floors = survey.facts.floors
    .filter((floor) => onlyFloor === undefined || floor.id === onlyFloor)
    .map((floor): FloorWalk => {
      if (onlyFloor === undefined && floor.repeats !== null) return { floor: floor.id, start: null, stops: [], notReached: [], repeats: floor.repeats.of }
      return walkFloor(survey, floor.id, mirror, fixtures)
    })
  return { floors, mirrored }
}

// ---------------------------------------------------------------------------------------------
// Words

/** A length in metres: two decimals at most, no trailing zeros. */
function m(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

const KIND_LETTER: Record<WalkThing['kind'], string> = { door: 'd', window: 'w', opening: 'o', 'open side': 'v', fixture: 'f' }
const BEYOND_AGENT: Record<string, string> = { outside: 'OUT', 'nothing drawn': 'NONE', 'a room left out': 'LEFT' }

export const WALK_PERSON_CLOSE = 'This describes the plan as it is walked and checks nothing: grid check runs the checks.'
export const WALK_AGENT_CLOSE = 'CHECKS none here: grid check.'

function personThing(thing: WalkThing, names: PersonNames): string {
  if (thing.kind === 'fixture') return `the ${thing.label ?? 'fixture'}`
  const to = thing.to === null ? '' : thing.to === 'outside' ? ' to outside' : thing.to === 'nothing drawn' || thing.to === 'a room left out' ? `, with ${thing.to} beyond` : ` to ${names.room(thing.to)}`
  if (thing.kind === 'window') return `a window ${m(thing.width)} m wide`
  if (thing.kind === 'open side') return `the open side${to}, ${m(thing.width)} m long`
  return `${thing.kind === 'door' ? 'a door' : 'an opening'} ${m(thing.width)} m wide${to}`
}

const sideways = (across: number): string => (Math.abs(across) < STRAIGHT ? 'straight ahead' : `${m(Math.abs(across))} m to your ${across > 0 ? 'left' : 'right'}`)
const besideYou = (across: number): string => (Math.abs(across) < STRAIGHT ? 'where you stand' : `${m(Math.abs(across))} m to your ${across > 0 ? 'left' : 'right'}`)
const along = (ahead: number): string => (ahead < STRAIGHT ? 'beside you' : `${m(ahead)} m ahead`)

function personStop(n: number, stop: WalkStop, names: PersonNames): string[] {
  const lines: string[] = []
  const via = stop.viaKind === null ? '' : stop.viaKind === 'open side' ? ' across the open side' : ` through ${stop.viaKind === 'door' ? 'a door' : 'an opening'}${stop.viaWidth === null ? '' : ` ${m(stop.viaWidth)} m wide`}`
  const came = stop.from === null ? ', where the walk starts, standing in its middle' : stop.from === 'outside' ? `, in from outside${via}` : `, from ${names.room(stop.from)}${via}`
  lines.push(`${n}. ${names.room(stop.room)}${came}. Facing ${stop.facing}, it is ${m(stop.across)} m across and ${m(stop.deep)} m deep, ${(Math.round(stop.area * 10) / 10).toFixed(1)} m².`)
  const list = (things: readonly WalkThing[], where: (t: WalkThing) => string): string => things.map((t) => `${personThing(t, names)}, ${where(t)}`).join('; ')
  const reach = (r: number | null): string => (r === null ? '' : `, ${m(r)} m away`)
  lines.push(`   Ahead${reach(stop.reach.ahead)}: ${stop.ahead.length === 0 ? 'a plain wall' : list(stop.ahead, (t) => sideways(t.across))}.`)
  lines.push(`   On your left${reach(stop.reach.left)}: ${stop.left.length === 0 ? 'a plain wall' : list(stop.left, (t) => along(t.ahead))}.`)
  lines.push(`   On your right${reach(stop.reach.right)}: ${stop.right.length === 0 ? 'a plain wall' : list(stop.right, (t) => along(t.ahead))}.`)
  if (stop.behind.length > 0) lines.push(`   ${stop.via === null ? 'Behind you' : 'In the wall you stand in'}: ${list(stop.behind, (t) => besideYou(t.across))}.`)
  return lines
}

function agentThing(thing: WalkThing): string {
  if (thing.kind === 'fixture') return `${thing.id} f`
  const to = thing.to === null ? '' : `>${BEYOND_AGENT[thing.to] ?? thing.to}`
  return `${thing.id} ${KIND_LETTER[thing.kind]}${m(thing.width)}${to}`
}

const lr = (across: number): string => (Math.abs(across) < STRAIGHT ? '0' : `${across > 0 ? 'L' : 'R'}${m(Math.abs(across))}`)

function agentStop(n: number, stop: WalkStop): string {
  const came = stop.from === null ? 'START' : `<${stop.from === 'outside' ? 'OUT' : stop.from} ${stop.via}${stop.viaKind === null || stop.viaKind === 'open side' ? '' : ` ${KIND_LETTER[stop.viaKind]}${stop.viaWidth === null ? '' : m(stop.viaWidth)}`}`
  const group = (letter: string, reach: number | null, things: readonly WalkThing[], where: (t: WalkThing) => string): string =>
    `${letter}${reach === null ? '' : m(reach)} ${things.length === 0 ? '-' : things.map((t) => `${agentThing(t)} ${where(t)}`).join('; ')}`
  return [
    `${n} ${stop.room} ${came}`,
    `${stop.facing} ${m(stop.across)}x${m(stop.deep)} ${m(stop.area)}`,
    group('A', stop.reach.ahead, stop.ahead, (t) => lr(t.across)),
    group('L', stop.reach.left, stop.left, (t) => `+${m(Math.max(0, t.ahead))}`),
    group('R', stop.reach.right, stop.right, (t) => `+${m(Math.max(0, t.ahead))}`),
    group('B', null, stop.behind, (t) => lr(t.across)),
  ].join(' | ')
}

const START_PERSON: Record<NonNullable<FloorWalk['start']>, string> = {
  front: 'It starts at the front door the plan names.',
  'way in': 'The plan names no front door: it starts at the widest door from outside into a corridor, or the widest door from outside when none leads into one.',
  stair: 'No door leads in from outside on this floor: it starts in the stair room, where the stairs arrive.',
  'first room': 'No door leads in from outside and no room is a stair: it starts in the first room of the floor.',
}

/** The walk in words, for a person (names only, never an id) or an agent (terse, with every id). */
export function walkText(survey: Survey, walk: PlanWalk, audience: DescribeAudience, pictures: ReadonlyMap<WalkStop, string> = new Map()): string {
  const lines: string[] = []
  if (audience === 'person') {
    const names = new PersonNames(survey.facts)
    lines.push('The plan walked room by room. In each room you stand in the doorway you came in by, at its middle, facing in square to the wall; what is in the room is said by the wall it is on, with how far its middle is. Metres, inside the walls; directions are on the drawing, north at the top.')
    if (walk.mirrored) lines.push('The plan says its y runs down the page: the drawing is the building mirrored, and left and right are read the right way round.')
    for (const floor of walk.floors) {
      lines.push('')
      if (floor.repeats !== null) {
        lines.push(`${names.floor(floor.floor)} is laid out like ${names.floor(floor.repeats)}: the same walk.`)
        continue
      }
      lines.push(`${names.floor(floor.floor)}: ${floor.stops.length} ${floor.stops.length === 1 ? 'room' : 'rooms'} walked. ${floor.start === null ? 'It has no room to walk.' : START_PERSON[floor.start]}`)
      floor.stops.forEach((stop, i) => {
        lines.push(...personStop(i + 1, stop, names))
        const picture = pictures.get(stop)
        if (picture !== undefined) lines.push(`   Picture: ${picture}, at eye height (${m(WALK_EYE_HEIGHT)} m), a step in, looking ahead.`)
      })
      if (floor.notReached.length > 0) lines.push(`Not reached through any door, opening or open side: ${floor.notReached.map((id) => names.room(id)).join(', ')}.`)
    }
    lines.push('')
    lines.push(WALK_PERSON_CLOSE)
  } else {
    lines.push('KEY walk: n room <from via(OUT=outside, START=no doorway) | facing WxD(across x deep from the doorway) m2 | A(head) wall dist: things, left (L) or right (R) of you, 0=straight | L(eft wall) dist, R(ight wall) dist: things, +metres ahead | B(ehind, the wall you stand in): things L/R. Thing: id d/w/o/v(open side)/f(fixture) width >other side. Ways on are walked left to right, depth first.')
    if (walk.mirrored) lines.push('Y DOWN: the drawing is the building mirrored; L and R are the building\'s.')
    for (const floor of walk.floors) {
      if (floor.repeats !== null) {
        lines.push(`WALK ${floor.floor} as ${floor.repeats}`)
        continue
      }
      lines.push(`WALK ${floor.floor}: ${floor.stops.length} stops, start ${floor.start ?? 'none'}`)
      floor.stops.forEach((stop, i) => {
        const picture = pictures.get(stop)
        lines.push(`${agentStop(i + 1, stop)}${picture === undefined ? '' : ` | PIC ${picture}`}`)
      })
      if (floor.notReached.length > 0) lines.push(`NOT REACHED ${floor.notReached.join(' ')}`)
    }
    lines.push(WALK_AGENT_CLOSE)
  }
  return `${lines.join('\n')}\n`
}
