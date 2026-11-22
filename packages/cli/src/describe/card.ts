/**
 * `grid describe` in three lengths, for a person or for an agent.
 *
 * - `line`: one line, what the plan is and where it is entered from outside.
 * - `rooms`: the line, then each room's inside size, position and neighbours, and every
 *   opening in it with the room on its other side and its distance to the two inside
 *   corners of that side of the room.
 * - `walls`: the rooms, then every wall with its openings, each with the rooms on its two
 *   sides. The agent's form leaves openings and neighbours out of its room lines, to stay
 *   short: every opening under its wall names the rooms it joins.
 *
 * The person's form names rooms and floors by their names and never prints an id: ids are
 * the plan's own handles, which an agent needs to edit it and a person never does. The
 * agent's form is terse and carries every id.
 *
 * What the plan cannot say (north when it states none, the kind of building, how floors
 * connect, which rooms make a flat) is said as such. A floor laid out like an earlier one is said once. Wall and
 * sill heights are one line: the usual height and the exceptions.
 *
 * The cards check nothing, and say so. `describePlan` puts the label "General guidance, not
 * your local rules" first, as every report of Grid's does (MSG-3). No line says a plan
 * complies.
 */
import { BUILDING_TYPE_TEXT } from '@ongrid/floorplan/types/floorplan'
import type { Beyond, CornerGap, FloorFacts, HeightException, OpeningFacts, OpeningSide, PlanFacts, RoomFacts } from './facts'

export const DESCRIBE_LENGTHS = ['line', 'rooms', 'walls'] as const
export type DescribeLength = (typeof DESCRIBE_LENGTHS)[number]

export const DESCRIBE_AUDIENCES = ['person', 'agent'] as const
export type DescribeAudience = (typeof DESCRIBE_AUDIENCES)[number]

/** A length in metres: two decimals at most, no trailing zeros. */
function m(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** An area in square metres, one decimal for a person. */
function m2(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1)
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "3 rooms", or "2 rooms and 3 zones" on a floor with zones (CNT-8). */
function roomCount(floor: FloorFacts): string {
  const zones = floor.rooms.filter((room) => room.zoneOf !== undefined).length
  const rooms = plural(floor.rooms.length - zones, 'room')
  return zones === 0 ? rooms : `${rooms} and ${plural(zones, 'zone')}`
}

/** `a, b and c`. */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** At most `most` items, and how many more. */
function capped(items: readonly string[], most: number): string[] {
  return items.length <= most ? [...items] : [...items.slice(0, most - 1), `${items.length - most + 1} more`]
}

const isSide = (side: OpeningSide | Beyond): side is OpeningSide => typeof side !== 'string'

/** Names for a person: a room by its name, numbered when two on a floor share it. */
class PersonNames {
  private readonly rooms = new Map<string, string>()
  private readonly floors = new Map<string, string>()

  constructor(facts: PlanFacts) {
    facts.floors.forEach((floor, i) => {
      this.floors.set(floor.id, floor.name ?? `Unnamed floor ${i + 1}`)
      const seen = new Map<string, number>()
      const total = new Map<string, number>()
      for (const room of floor.rooms) total.set(room.name.trim(), (total.get(room.name.trim()) ?? 0) + 1)
      for (const room of floor.rooms) {
        const name = room.name.trim() || 'Unnamed room'
        const n = (seen.get(name) ?? 0) + 1
        seen.set(name, n)
        this.rooms.set(room.id, (total.get(room.name.trim()) ?? 0) > 1 ? `${name} (${n})` : name)
      }
    })
  }

  room(id: string): string {
    return this.rooms.get(id) ?? 'a room'
  }

  floor(id: string): string {
    return this.floors.get(id) ?? 'a floor'
  }
}

interface Way {
  readonly room: string
  readonly opening: OpeningFacts
}

/** Doors and doorless openings that lead in from outside, with the room they lead into. */
function waysIn(facts: PlanFacts): Way[] {
  const ways: Way[] = []
  for (const floor of facts.floors) {
    for (const opening of floor.openings) {
      if (opening.type === 'window') continue
      const [a, b] = opening.sides
      if (isSide(a) && b === 'outside') ways.push({ room: a.room, opening })
      else if (isSide(b) && a === 'outside') ways.push({ room: b.room, opening })
    }
  }
  return ways
}

function usesText(facts: PlanFacts): string {
  const rooms = [...facts.rooms.values()]
  const count = (use: string): number => rooms.filter((room) => room.use === use).length
  const unsaid = rooms.filter((room) => room.use === undefined).length
  const parts: string[] = []
  const bedrooms = count('bedroom')
  const bathrooms = count('bathroom')
  if (bedrooms > 0) parts.push(plural(bedrooms, 'bedroom'))
  if (bathrooms > 0) parts.push(plural(bathrooms, 'bathroom'))
  if (unsaid === rooms.length && rooms.length > 0) parts.push(rooms.length === 1 ? 'it does not say what it is for' : 'none says what it is for')
  else if (unsaid > 0) parts.push(`${unsaid} do not say what they are for`)
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

/** The floors that repeat an earlier one, by the floor they repeat. */
function repeatGroups(facts: PlanFacts): Map<string, FloorFacts[]> {
  const groups = new Map<string, FloorFacts[]>()
  for (const floor of facts.floors) {
    if (floor.repeats === null) continue
    const group = groups.get(floor.repeats.of) ?? []
    group.push(floor)
    groups.set(floor.repeats.of, group)
  }
  return groups
}

function totalArea(facts: PlanFacts): number {
  return facts.floors.reduce((sum, floor) => sum + floor.area, 0)
}

/** `a door leads`, `3 doors lead`, `2 doors and 1 doorless opening lead`. */
function waysText(ways: readonly Way[]): string {
  const doors = ways.filter((way) => way.opening.type === 'door').length
  const gaps = ways.length - doors
  if (ways.length === 1) return doors === 1 ? 'a door leads' : 'a doorless opening leads'
  const parts = [...(doors > 0 ? [plural(doors, 'door')] : []), ...(gaps > 0 ? [plural(gaps, 'doorless opening')] : [])]
  return `${parts.join(' and ')} lead`
}

function personLine(facts: PlanFacts, names: PersonNames): string {
  const floors = facts.floors.length
  const repeats = [...repeatGroups(facts)].map(([of, group]) =>
    `${listed(group.map((floor) => names.floor(floor.id)))} ${group.length === 1 ? 'is' : 'are'} laid out like ${names.floor(of)}`)
  const floorText = floors === 1 ? 'one floor' : `${floors} floors${repeats.length > 0 ? ` (${repeats.join('; ')})` : ''}`
  const ways = waysIn(facts)
  const into = [...new Set(ways.map((way) => names.room(way.room)))]
  const entered = into.length === 0
    ? 'no door leads in from outside'
    : `from outside, ${waysText(ways)} into ${listed(capped(into, 5))}`
  return `A plan of ${floorText} with ${plural(facts.rooms.size, 'room')}${usesText(facts)}, ${m2(totalArea(facts))} m² inside; ${entered}.${personBuilding(facts, names)}${personWork(facts)}`
}

/** CNT-10: what the plan's work holds, as a sentence; every other figure is after the work. */
function personWork(facts: PlanFacts): string {
  if (facts.work === null) return ''
  const { counts, base } = facts.work
  const parts = (n: { walls: number; openings: number; rooms: number }): string => [plural(n.walls, 'wall'), plural(n.openings, 'opening'), plural(n.rooms, 'room')].join(', ')
  const shell = base === null ? '' : ` It is fitted out in ${JSON.stringify(base)}, whose walls and openings are existing and are not changed here.`
  return ` It holds work: to be demolished ${parts(counts.demolished)}; new ${parts(counts.new)}; the sizes here are after the work.${shell}`
}

/** CNT-10: the same for an agent, as `WORK demolished 1 wall, …; new …; figures after the work`. */
function agentWork(facts: PlanFacts): string {
  if (facts.work === null) return ''
  const { counts, base } = facts.work
  const parts = (n: { walls: number; openings: number; rooms: number }): string => `${n.walls} walls ${n.openings} openings ${n.rooms} rooms`
  return ` WORK existing ${parts(counts.existing)}; demolished ${parts(counts.demolished)}; new ${parts(counts.new)}; figures after the work${base === null ? '' : `; BASE ${JSON.stringify(base)} read-only`}.`
}

/** CNT-5: what kind of building the plan says it is, and each floor that says otherwise, as a sentence. */
function personBuilding(facts: PlanFacts, names: PersonNames): string {
  const { plan, floors } = facts.building
  const own = floors.map((f) => `${names.floor(f.floor)} is ${BUILDING_TYPE_TEXT[f.building]}`)
  if (plan === undefined) return own.length === 0 ? '' : ` The plan says ${listed(own)}.`
  return ` The plan says it is ${BUILDING_TYPE_TEXT[plan]}${own.length === 0 ? '' : `, and ${listed(own)}`}.`
}

/** CNT-5: the same for an agent, as `BUILDING home; ground shop`. */
function agentBuilding(facts: PlanFacts): string {
  const { plan, floors } = facts.building
  if (plan === undefined && floors.length === 0) return ''
  return ` BUILDING ${[...(plan === undefined ? [] : [plan]), ...floors.map((f) => `${f.floor} ${f.building}`)].join('; ')}.`
}

function agentLine(facts: PlanFacts): string {
  const ways = waysIn(facts)
  const into = ways.length === 0 ? 'no way in from outside' : `from outside into ${capped([...new Set(ways.map((way) => way.room))], 8).join(', ')}`
  return `PLAN ${plural(facts.floors.length, 'floor')}, ${plural(facts.rooms.size, 'room')}${usesText(facts)}, ${m(totalArea(facts))} m2 inside, ${plural(facts.wallCount, 'wall')}, ${plural(facts.openingCount, 'opening')}; ${into}.${agentBuilding(facts)}${agentWork(facts)}`
}

/** What the plan cannot say, which a reader may expect, for a person and for an agent. */
function unsaid(facts: PlanFacts, names: PersonNames): { person: string[]; agent: string[] } {
  // CNT-3: a plan that states its north says so in its own lines.
  // CNT-5: a plan may say what kind of building it is; one that says it for every floor is not asked.
  const said = facts.building.plan !== undefined || (facts.floors.length > 0 && facts.floors.every((f) => facts.building.floors.some((b) => b.floor === f.id)))
  const person = [...(facts.northStated ? [] : ['where north is']), ...(said ? [] : ['what kind of building it is'])]
  const agent = [...(facts.northStated ? [] : ['north']), ...(said ? [] : ['kind of building'])]
  if (facts.floors.length > 1) {
    // Floors no stair joins (LVL-3): a stair the plan states, or stair rooms one over the other.
    const { unjoined } = facts.connections
    if (unjoined.length > 0) {
      const stairs = facts.stairRooms > 0 ? plural(facts.stairRooms, 'room') : ''
      const all = unjoined.length === facts.floors.length
      const one = !all && unjoined.length === 1
      const subject = all ? 'its floors connect' : `${listed(unjoined.map((id) => names.floor(id)))} ${one ? 'connects' : 'connect'} to the other floors`
      person.push(`how ${subject} (no stair joins ${one ? 'it' : 'them'}${stairs ? `; ${stairs} marked as a stair` : ''})`)
      agent.push(`how floors connect (no stair joins ${unjoined.join(' ')}${stairs ? `; ${stairs} with use stair` : ''})`)
    }
    person.push('which rooms make up each flat or home')
    agent.push('which rooms make each flat')
  }
  return { person, agent }
}

/** Pairs of floors, lower first, joined into runs: ground to first and first to second is one run. */
function runs(pairs: readonly (readonly [string, string])[]): string[][] {
  const out: string[][] = []
  for (const [a, b] of pairs) {
    const run = out.find((r) => r[r.length - 1] === a)
    if (run) run.push(b)
    else out.push([a, b])
  }
  return out
}

/** The stairs and shafts that join the floors (LVL-3), or nothing in a plan with none. */
function personStairs(facts: PlanFacts, names: PersonNames): string[] {
  const { stairs, stairRooms, lifts, outOfLine } = facts.connections
  const parts = [
    ...stairs.map((stair) =>
      `${JSON.stringify(stair.name)} from ${names.floor(stair.lower)} up to ${names.floor(stair.upper)}, ${stair.risers} risers of ${m(stair.riserHeight)} m, going ${m(stair.going)} m, ${m(stair.width)} m wide`),
    ...runs(stairRooms).map((run) =>
      `the stair rooms lie one over the other from ${names.floor(run[0]!)} to ${names.floor(run[run.length - 1]!)}`),
    ...runs(lifts).map((run) => `the lift shaft runs from ${names.floor(run[0]!)} to ${names.floor(run[run.length - 1]!)}`),
    ...outOfLine.map((out) => `the ${out.kind === 'stair' ? 'stair rooms' : 'lift shafts'} on ${names.floor(out.floors[0])} and ${names.floor(out.floors[1])} do not line up`),
  ]
  return parts.length === 0 ? [] : [`Stairs: ${parts.join('; ')}.`]
}

function agentStairs(facts: PlanFacts): string[] {
  const { stairs, stairRooms, lifts, outOfLine } = facts.connections
  const parts = [
    ...stairs.map((stair) => `${stair.id} ${stair.lower}->${stair.upper} ${stair.risers}x${m(stair.riserHeight)} going ${m(stair.going)} width ${m(stair.width)}`),
    ...runs(stairRooms).map((run) => `stair rooms ${run.join('->')}`),
    ...runs(lifts).map((run) => `lift ${run.join('->')}`),
    ...outOfLine.map((out) => `${out.kind} rooms out of line ${out.floors[0]}->${out.floors[1]}`),
  ]
  return parts.length === 0 ? [] : [`STAIRS ${parts.join('; ')}`]
}

/** How a person can tell an opening apart: by its type and the rooms it joins. */
function personOpening(opening: OpeningFacts, names: PersonNames): string {
  const rooms = opening.sides.filter(isSide).map((side) => names.room(side.room))
  const what = opening.type === 'opening' ? 'opening' : opening.type
  if (rooms.length === 2) return `the ${what} between ${rooms[0]} and ${rooms[1]}`
  if (rooms.length === 1) {
    const past = opening.sides.find((side): side is Beyond => !isSide(side))
    if (opening.type === 'window') return `the ${rooms[0]} window${past === 'outside' ? '' : ` to ${past}`}`
    return past === 'outside' ? `the ${what} from outside into ${rooms[0]}` : `the ${what} from ${rooms[0]} to ${past}`
  }
  return `a ${what} with no room on either side`
}

/** Exceptions by floor and height, counted: for when there are too many to name. */
function counted(list: readonly HeightException[], what: string, floorName: (id: string) => string): string[] {
  const groups = new Map<string, { floor: string; value: number; count: number }>()
  for (const item of list) {
    const key = `${item.floor}\u0000${item.value}`
    const group = groups.get(key) ?? { floor: item.floor, value: item.value, count: 0 }
    group.count++
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => `${plural(group.count, what)} on ${floorName(group.floor)} at ${m(group.value)} m`)
}

function personHeights(facts: PlanFacts, names: PersonNames): string {
  const { heights } = facts
  const floorName = (id: string): string => names.floor(id)
  const opening = (exception: HeightException): string => {
    const found = facts.openings.get(exception.id)
    return `${found ? personOpening(found, names) : 'one'} at ${m(exception.value)} m`
  }
  const openings = (list: readonly HeightException[], what: string): string => {
    if (list.length === 0) return ''
    return `, except ${listed(list.length <= 4 ? list.map(opening) : capped(counted(list, what, floorName), 4))}`
  }
  const parts: string[] = []
  if (heights.wall !== null) {
    // Walls have no names a person knows, so their exceptions are counted.
    const odd = [
      ...heights.floorWalls.map((floor) => `${m(floor.value)} m on ${names.floor(floor.floor)}`),
      ...counted(heights.walls, 'wall', floorName),
    ]
    parts.push(`walls ${m(heights.wall)} m high${odd.length > 0 ? `, except ${listed(capped(odd, 4))}` : ''}`)
  }
  // WRT-6 (lab AU3-6): a height nothing states is said so, never as a figure the person gave.
  const { notStated } = heights
  if (notStated.count > 0) {
    parts.push(heights.wall === null
      ? `wall height not stated (drawn ${m(notStated.drawn)} m high)`
      : `${plural(notStated.count, 'wall')} with no height stated (drawn ${m(notStated.drawn)} m high)`)
  }
  if (heights.windowSill !== null) parts.push(`window sills ${m(heights.windowSill)} m${openings(heights.windowSills, 'window')}`)
  parts.push(`door sills at the floor${openings(heights.doorSills, 'door')}`)
  return `Heights: ${parts.join('; ')}.`
}

function agentHeights(facts: PlanFacts): string {
  const { heights } = facts
  const say = (exception: HeightException): string => `${exception.id} ${m(exception.value)}`
  const except = (list: readonly HeightException[]): string => {
    if (list.length === 0) return ''
    if (list.length <= 8) return ` except ${list.map(say).join(', ')}`
    const groups = new Map<string, number>()
    for (const item of list) groups.set(`${item.floor} ${m(item.value)}`, (groups.get(`${item.floor} ${m(item.value)}`) ?? 0) + 1)
    return ` except ${[...groups].map(([key, count]) => `${count} on ${key}`).join(', ')}`
  }
  const parts: string[] = []
  if (heights.wall !== null) {
    const floors = heights.floorWalls.map((floor) => `, ${floor.floor} ${m(floor.value)}`).join('')
    parts.push(`walls ${m(heights.wall)}${floors}${except(heights.walls)}`)
  }
  if (heights.notStated.count > 0) parts.push(`${heights.wall === null ? 'walls' : `${heights.notStated.count} walls`} not stated, drawn ${m(heights.notStated.drawn)}`)
  if (heights.windowSill !== null) parts.push(`window sills ${m(heights.windowSill)}${except(heights.windowSills)}`)
  parts.push(`door sills 0${except(heights.doorSills)}`)
  return `HEIGHTS ${parts.join('; ')}`
}

const TYPE_LETTER: Record<OpeningFacts['type'], string> = { door: 'd', opening: 'o', window: 'w' }

const BEYOND_TOKEN: Record<Beyond, string> = { outside: 'OUT', 'nothing drawn': 'NONE', 'a room left out': 'LEFT' }

const WEST_OR_SOUTH = new Set(['W', 'SW', 'NW', 'S'])

/** The two corner gaps of a side, the western one first, or the southern one on a wall that runs north. */
function inOrder(side: OpeningSide): readonly [CornerGap, CornerGap] | null {
  if (side.corners === null) return null
  const [a, b] = side.corners
  return WEST_OR_SOUTH.has(a.toward) ? [a, b] : [b, a]
}

/** The side of an opening that is in `room`, and what is on its other side. */
function from(opening: OpeningFacts, room: string): { here: OpeningSide; there: OpeningSide | Beyond } | null {
  const [a, b] = opening.sides
  if (isSide(a) && a.room === room) return { here: a, there: b }
  if (isSide(b) && b.room === room) return { here: b, there: a }
  return null
}

/** The openings in a room, and the rooms open to it along a virtual wall. */
function roomOpenings(floor: FloorFacts, room: string): { openings: Array<{ opening: OpeningFacts; here: OpeningSide; there: OpeningSide | Beyond }>; open: Array<{ wall: string; other: string }> } {
  const openings = floor.openings.flatMap((opening) => {
    const sides = from(opening, room)
    return sides === null ? [] : [{ opening, ...sides }]
  })
  const open = floor.openSides.flatMap((side) => {
    if (side.rooms[0] === room) return [{ wall: side.wall, other: side.rooms[1] }]
    if (side.rooms[1] === room) return [{ wall: side.wall, other: side.rooms[0] }]
    return []
  })
  return { openings, open }
}

/** Neighbours with no opening and no open side to them. */
function nextOnly(floor: FloorFacts, room: RoomFacts): string[] {
  const { openings, open } = roomOpenings(floor, room.id)
  const joined = new Set([
    ...openings.flatMap(({ there }) => (isSide(there) ? [there.room] : [])),
    ...open.map((side) => side.other),
  ])
  return room.neighbours.filter((id) => !joined.has(id))
}

function personRoom(floor: FloorFacts, room: RoomFacts, names: PersonNames): string[] {
  const name = names.room(room.id)
  if (room.shape === null) return [`${name}: can't be measured, so nothing is said about it; grid check says why.`]
  const { shape } = room
  const size = shape.rectangle ? `${m(shape.across)} × ${m(shape.up)}` : `not a rectangle, ${m(shape.across)} × ${m(shape.up)} at its widest`
  const next = nextOnly(floor, room)
  // CNT-8: a zone is named as part of its room, and its floor is in its room's.
  const of = room.zoneOf === undefined ? '' : ` (a zone of ${names.room(room.zoneOf)})`
  const lines = [`${name}${of}: ${size}, ${m2(shape.area)} m², at ${m(shape.at.x)}, ${m(shape.at.y)}.${next.length > 0 ? ` Next to ${listed(next.map((id) => names.room(id)))}.` : ''}`]
  const { openings, open } = roomOpenings(floor, room.id)
  for (const side of open) lines.push(`  Open to ${names.room(side.other)}, with no wall between.`)
  for (const { opening, here, there } of openings) {
    const what = opening.type === 'window' ? 'Window' : opening.type === 'door' ? 'Door' : 'Opening'
    const to = isSide(there) ? ` to ${names.room(there.room)}` : opening.type === 'window' && there === 'outside' ? '' : ` to ${there}`
    const gaps = inOrder(here)
    const corners = gaps === null ? '' : `, ${m(gaps[0].distance)} from ${gaps[0].toward} corner, ${m(gaps[1].distance)} from ${gaps[1].toward}`
    lines.push(`  ${what} ${m(opening.width)}${to}, ${here.face} side${corners}.`)
  }
  return lines
}

function agentRoomHead(room: RoomFacts): string {
  const use = room.use ?? '-'
  if (room.shape === null) return `${room.id} ${JSON.stringify(room.name)} ${use} LEFT OUT (grid check says why)`
  const { shape } = room
  return `${room.id} ${JSON.stringify(room.name)} ${use} ${shape.rectangle ? '' : '~'}${m(shape.across)}x${m(shape.up)} @${m(shape.at.x)},${m(shape.at.y)} ${m(shape.area)}${room.zoneOf === undefined ? '' : ` zone-of:${room.zoneOf}`}`
}

function agentRoom(floor: FloorFacts, room: RoomFacts): string {
  if (room.shape === null) return agentRoomHead(room)
  const next = nextOnly(floor, room)
  const { openings, open } = roomOpenings(floor, room.id)
  const items = [
    ...open.map((side) => `${side.wall} v>${side.other}`),
    ...openings.map(({ opening, here, there }) => {
      const to = isSide(there) ? `>${there.room}` : opening.type === 'window' && there === 'outside' ? '' : `>${BEYOND_TOKEN[there]}`
      const gaps = inOrder(here)
      const corners = gaps === null ? '' : ` ${gaps[0].toward}${m(gaps[0].distance)}/${gaps[1].toward}${m(gaps[1].distance)}`
      return `${opening.id} ${TYPE_LETTER[opening.type]}${m(opening.width)}${to} ${here.face}${corners}`
    }),
  ]
  return `${agentRoomHead(room)}${next.length > 0 ? ` | next ${next.join(' ')}` : ''}${items.length > 0 ? ` | ${items.join('; ')}` : ''}`
}

const KIND_LETTER = { exterior: 'x', interior: 'i', partition: 'p' } as const

/** Gaps add up to the side's length less the opening's width: the shorter side is the closer reference. */
function stretch(side: OpeningSide): number {
  return side.corners === null ? Infinity : side.corners[0].distance + side.corners[1].distance
}

/**
 * An opening under its wall: the room whose side is shorter with its gaps to that side's two
 * corners, nearer the wall's start first, then what is on the other side. A window to outside
 * has one room only.
 */
function agentWallOpening(opening: OpeningFacts): string {
  const [a, b] = opening.sides
  const rooms = [a, b].filter(isSide).sort((x, y) => stretch(x) - stretch(y))
  const head = `${opening.id} ${TYPE_LETTER[opening.type]} ${m(opening.offset)}+${m(opening.width)}`
  const first = rooms[0]
  if (first === undefined) return `${head} ${BEYOND_TOKEN[a as Beyond]}|${BEYOND_TOKEN[b as Beyond]}`
  const gaps = first.corners === null ? '' : ` ${m(first.corners[0].distance)}/${m(first.corners[1].distance)}`
  const other = rooms[1]?.room ?? [a, b].find((side): side is Beyond => !isSide(side))!
  const shown = rooms[1] !== undefined ? `|${rooms[1].room}` : other === 'outside' ? '' : `|${BEYOND_TOKEN[other as Beyond]}`
  return `${head} ${first.room}${gaps}${shown}`
}

function agentWalls(floor: FloorFacts): string[] {
  return floor.walls.map((wall) => {
    const height = wall.virtual || wall.height === floor.wallHeight ? '' : wall.heightNotStated ? ' h?' : ` h${m(wall.height)}`
    const head = ` ${wall.id} ${m(wall.start.x)},${m(wall.start.y)}>${m(wall.end.x)},${m(wall.end.y)} ${wall.virtual ? 'v' : `${m(wall.thickness)} ${KIND_LETTER[wall.kind]}`}${height}`
    const openings = floor.openings.filter((o) => o.wall === wall.id).map(agentWallOpening)
    const open = floor.openSides.find((side) => side.wall === wall.id)
    const joins = open ? ` | ${open.rooms[0]}|${open.rooms[1]}` : ''
    return `${head}${joins}${openings.length > 0 ? ` | ${openings.join('; ')}` : ''}`
  })
}

function personSide(side: OpeningSide | Beyond, names: PersonNames): string {
  return isSide(side) ? names.room(side.room) : side
}

function personWalls(floor: FloorFacts, names: PersonNames): string[] {
  const at = (x: number, y: number): string => `${m(x)}, ${m(y)}`
  return floor.walls.map((wall) => {
    const what = wall.virtual
      ? 'a line on the floor, no wall'
      : `${wall.kind} wall, ${m(wall.thickness)} thick${wall.height === floor.wallHeight ? '' : wall.heightNotStated ? ', height not stated' : `, ${m(wall.height)} high`}`
    const open = floor.openSides.find((side) => side.wall === wall.id)
    const joins = open ? `; ${names.room(open.rooms[0])} on one side, ${names.room(open.rooms[1])} on the other` : ''
    const openings = floor.openings
      .filter((o) => o.wall === wall.id)
      .map((opening) => `${opening.type} ${m(opening.width)} at ${m(opening.offset)} (${personSide(opening.sides[0], names)} | ${personSide(opening.sides[1], names)})`)
    return `  From ${at(wall.start.x, wall.start.y)} to ${at(wall.end.x, wall.end.y)}: ${what}${joins}.${openings.length > 0 ? ` Along it from its start: ${openings.join('; ')}.` : ''}`
  })
}

const PERSON_KEY = 'Metres, inside the walls: a size is across by up the drawing, a position the lower-left inside corner. Directions are on the drawing, north at the top.'
const AGENT_KEY_ROOMS = 'KEY metres, inside, N=+y. room: id "name" use WxD(~ not a rectangle) @lower-left m2 | next: across a wall, no way through | opening: id d/o/w(door/opening/window) or v(virtual wall) width >other side(none=outside window, OUT=outside, NONE=nothing drawn, LEFT=left out) side of this room, gaps to its corners'
const AGENT_KEY_WALLS = 'KEY metres, inside, N=+y. room: id "name" use WxD(~ not a rectangle) @lower-left m2. wall: id start>end thickness x/i/p/v(exterior/interior/partition/virtual) h=not the floor\'s usual | opening: id d/o/w offset+width room gaps to its side\'s corners(start end first)|other(none=outside, NONE=nothing drawn, LEFT=left out)'

// The label leads every description (`describePlan`, MSG-3), so the close need not repeat it.
const PERSON_CLOSE = 'This describes the plan and checks nothing: grid check runs the checks.'
const AGENT_CLOSE = 'CHECKS none here: grid check.'

function personFloorHead(floor: FloorFacts, names: PersonNames): string {
  const left = floor.leftOut.length > 0 ? ` ${plural(floor.leftOut.length, 'part')} can't be drawn and ${floor.leftOut.length === 1 ? 'is' : 'are'} left out.` : ''
  return `${names.floor(floor.id)}: ${roomCount(floor)}, ${m2(floor.area)} m².${left}`
}

function agentFloorHead(floor: FloorFacts): string {
  const left = floor.leftOut.length > 0 ? `; left out ${floor.leftOut.join(' ')}` : ''
  return `FLOOR ${floor.id} ${floor.name === null ? '(no name)' : JSON.stringify(floor.name)} level ${floor.level}: ${roomCount(floor)}, ${m(floor.area)} m2${left}`
}

function personCard(facts: PlanFacts, withWalls: boolean): string[] {
  const names = new PersonNames(facts)
  const lines = [personLine(facts, names), PERSON_KEY, `Not in the plan: ${listed(unsaid(facts, names).person)}.`, personHeights(facts, names), ...personStairs(facts, names)]
  const groups = repeatGroups(facts)
  for (const floor of facts.floors) {
    if (floor.repeats !== null) {
      const group = groups.get(floor.repeats.of)!
      if (group[0] === floor) lines.push('', `${listed(group.map((f) => names.floor(f.id)))}: laid out like ${names.floor(floor.repeats.of)}.`)
      continue
    }
    lines.push('', personFloorHead(floor, names))
    for (const room of floor.rooms) lines.push(...personRoom(floor, room, names))
    if (withWalls && floor.walls.length > 0) lines.push(`Walls of ${names.floor(floor.id)}:`, ...personWalls(floor, names))
  }
  lines.push('', PERSON_CLOSE)
  return lines
}

function agentCard(facts: PlanFacts, withWalls: boolean): string[] {
  const lines = [agentLine(facts), withWalls ? AGENT_KEY_WALLS : AGENT_KEY_ROOMS, `NOT IN PLAN ${unsaid(facts, new PersonNames(facts)).agent.join('; ')}`, agentHeights(facts), ...agentStairs(facts)]
  const groups = repeatGroups(facts)
  for (const floor of facts.floors) {
    const repeat = floor.repeats
    if (repeat !== null && repeat.prefix !== null) {
      const group = groups.get(repeat.of)!.filter((f) => f.repeats?.prefix != null)
      if (group[0] === floor) {
        const [was] = repeat.prefix
        lines.push(`FLOORS ${group.map((f) => `${f.id} ${f.name === null ? '-' : JSON.stringify(f.name)}`).join(', ')}: as ${repeat.of}, ids with its own prefix (${group.map((f) => f.repeats!.prefix![1]).join(', ')}) for ${was}`)
      }
      continue
    }
    lines.push(`${agentFloorHead(floor)}${repeat !== null ? `; laid out as ${repeat.of}, other ids` : ''}`)
    for (const room of floor.rooms) lines.push(withWalls ? agentRoomHead(room) : agentRoom(floor, room))
    if (withWalls) lines.push(...agentWalls(floor))
  }
  lines.push(AGENT_CLOSE)
  return lines
}

/** The description, ending in a new line. */
export function describeText(facts: PlanFacts, length: DescribeLength, audience: DescribeAudience): string {
  if (length === 'line') return `${audience === 'person' ? personLine(facts, new PersonNames(facts)) : agentLine(facts)}\n`
  const lines = audience === 'person' ? personCard(facts, length === 'walls') : agentCard(facts, length === 'walls')
  return `${lines.join('\n')}\n`
}
