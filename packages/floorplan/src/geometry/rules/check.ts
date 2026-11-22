/**
 * Checks that a plan can be left: a way out, a door on every room, a route from every
 * room to the way out, and doors that lead somewhere. Checks on the drawing, not on any
 * building code.
 *
 * Pure: a plan in, plain data out. No AI, no file, no network.
 */

import type { FloorPlan } from '../plan'
import { floorOf, planFloors, planForFloor, wholePlan } from '../floors'
import { validatePlan } from '../validate'
import { floorElevations } from '../elevations'
import { groundLevel, openingsBelowGround } from '../ground'
import { limit } from '../tolerances'
import type { ShortOf } from './graph'
import { metresText } from '../rounding'
import { LIMITS, RULES } from './catalogue'
import { floorGraph, roomOutlines } from './graph'
import type { FloorGraph } from './graph'
import { floorJoins } from '../floorJoins'
import { indexPlan } from '../plan'
import type { Vec2 } from '../vec2'
import { messages, overBoundaryText, setbackShortText } from './messages'
import { siteMeasures } from '../site'
import type { FindingCode, HeldFinding, NotChecked, RuleFinding, RulesReport } from './types'
import type { Opening } from '../plan'
import { roomWallIds } from '../plan'
import type { LeftOutPart } from '../../types/readParts'
import { damaged, doorWaitsFor, leadsWaitsFor, planDamage, routeWaitsFor, type DrawnFloor, type FloorDamage } from './held'
import { GENERAL_GUIDANCE_LABEL, RULES_REPORT_SCHEMA_VERSION } from './types'

const RULE_OF: Record<FindingCode, string> = {
  no_exit: 'floor-has-exit',
  room_without_door: 'room-has-door',
  no_route_to_exit: 'room-reaches-exit',
  door_to_undrawn_space: 'door-leads-somewhere',
  door_to_outside_above_ground: 'door-leads-somewhere',
  stair_out_of_line: 'stairs-line-up',
  lift_out_of_line: 'stairs-line-up',
  opening_too_small_to_pass: 'room-has-door',
  opening_below_ground: 'openings-above-ground',
  setback_short: 'site-boundary',
  over_boundary: 'site-boundary'
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

/** One floor as the routes read it. */
interface FloorRoutes {
  readonly id: string
  readonly name: string
  readonly graph: FloorGraph
  /** Its doors to the outside count as ways out: it does not stand above the ground (LVL-1). */
  readonly exitsCount: boolean
}

const finding = (
  code: FindingCode,
  floor: string,
  rooms: string[],
  message: string,
  openings: string[] = []
): RuleFinding => ({ code, ruleId: RULE_OF[code], floor, rooms, openings, message })

/** A room on a floor: ids repeat from floor to floor in some plans, so routes go by both. */
interface Place {
  readonly floor: string
  readonly room: string
}

/** The key a route knows a room by: its floor, then its id. */
const at = (floor: string, room: string): string => `${floor}\u0000${room}`

/** A stair between two rooms of different floors (LVL-3), and what joins them. */
interface StairLink {
  readonly ends: readonly [Place, Place]
  readonly via: string
}

/**
 * What every floor says on its own: doors into floor nobody drew, and rooms with nothing to go
 * through at all. `joined` are the rooms a stair joins to another floor, by `at` (LVL-3): a
 * stair is a way through, so a room it leaves from is not a room without a door.
 */
function floorFindings(
  floor: FloorRoutes,
  joined: ReadonlySet<string>,
  roomName: (id: string) => string,
  loneRoomReached: boolean,
  /** Rooms marked as a void (LVL-4): no room to stand in, so they need no door and no route. */
  voids: ReadonlySet<string>
): { findings: RuleFinding[]; doorless: string[] } {
  const { graph } = floor
  const findings: RuleFinding[] = []
  // A door with nothing drawn behind it: probably a corridor or a stair nobody drew. It
  // is said, never guessed at, and never an exit. On every floor (MSG-14): a door into
  // floor nobody drew is as worth a look upstairs as on the ground.
  for (const { room, opening } of graph.undrawn) {
    findings.push(finding('door_to_undrawn_space', floor.id, [room], messages.doorToUndrawnSpace(roomName(room)), [opening]))
  }
  // A room with nothing to go through at all. The most specific finding it can get.
  const touched = new Set<string>([
    ...graph.links.flatMap((l) => l.rooms),
    ...graph.exits.map((e) => e.room),
    ...graph.undrawn.map((u) => u.room),
    ...graph.rooms.filter((room) => joined.has(at(floor.id, room)))
  ])
  // A floor that is one open room and that no stair joins is reached by a stair the plan does
  // not draw: it is not a room without a door.
  const loneRoom = loneRoomReached && graph.rooms.length === 1
  const doorless = loneRoom ? [] : graph.rooms.filter((room) => !touched.has(room) && !voids.has(room))
  for (const room of doorless) {
    findings.push(finding('room_without_door', floor.id, [room], messages.roomWithoutDoor(roomName(room))))
  }
  // A void is left out of the routes as a room without a door is: nothing there to get out of.
  return { findings, doorless: [...doorless, ...graph.rooms.filter((room) => voids.has(room))] }
}

/**
 * The routes of floors joined by stairs, as one: from every way out of the floors that do not
 * stand above the ground, up and down the stairs, to every room. `stairs` are the joins
 * between rooms of these floors, and `doorless` the rooms already said to have no door, by
 * `at`. A room no route reaches is said, with every way through it.
 */
function routeFindings(
  floors: readonly FloorRoutes[],
  stairs: readonly StairLink[],
  doorless: ReadonlySet<string>,
  /** The floors the way out is checked from: the ground floors among them. */
  ground: readonly FloorRoutes[],
  roomName: (id: string) => string
): { findings: RuleFinding[]; wayOutNotDrawn: boolean } {
  const findings: RuleFinding[] = []
  const starts = (pick: (f: FloorRoutes) => readonly { readonly room: string }[]): string[] =>
    floors.flatMap((f) => pick(f).map((e) => at(f.id, e.room)))
  const exits = starts((f) => (f.exitsCount ? f.graph.exits : []))
  const undrawn = starts((f) => f.graph.undrawn)
  if (floors.every((f) => f.graph.rooms.length === 0)) return { findings, wayOutNotDrawn: false }
  // A flat drawn on its own leaves through its entrance, into a landing nobody drew. That door
  // is already reported, and whether it is a way out cannot be told. The rooms that reach no
  // such door, nor any exit, are still said (MSG-14, lab CH-7): they are cut off either way.
  const wayOutNotDrawn = exits.length === 0 && undrawn.length > 0
  if (exits.length === 0 && !wayOutNotDrawn) {
    // No exit: one finding for each ground floor, not one per room.
    for (const floor of ground) findings.push(finding('no_exit', floor.id, [], messages.noExit(floor.name)))
    return { findings, wayOutNotDrawn: false }
  }

  // Every way through, on a floor or up and down a stair (LVL-3), by the rooms it joins.
  const links: { ends: readonly [Place, Place]; via: string }[] = [
    ...floors.flatMap((f) =>
      f.graph.links.map((l) => ({ ends: [{ floor: f.id, room: l.rooms[0] }, { floor: f.id, room: l.rooms[1] }] as const, via: l.via }))
    ),
    ...stairs
  ]
  const neighbours = new Map<string, string[]>()
  for (const { ends: [a, b] } of links) {
    const ka = at(a.floor, a.room)
    const kb = at(b.floor, b.room)
    neighbours.set(ka, [...(neighbours.get(ka) ?? []), kb])
    neighbours.set(kb, [...(neighbours.get(kb) ?? []), ka])
  }
  // Breadth-first from every exit at once, or, when the way out is not drawn, from every door
  // into a space not drawn.
  const reached = new Set(wayOutNotDrawn ? undrawn : exits)
  const queue = [...reached]
  while (queue.length > 0) {
    for (const next of neighbours.get(queue.shift()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  for (const floor of floors) {
    for (const room of floor.graph.rooms) {
      const key = at(floor.id, room)
      if (reached.has(key) || doorless.has(key)) continue
      // Where its ways through lead, so the warning can say "its only door opens into the bathroom".
      const through = links
        .flatMap(({ ends: [a, b], via }) =>
          at(a.floor, a.room) === key ? [{ room: b.room, via }] : at(b.floor, b.room) === key ? [{ room: a.room, via }] : []
        )
        .sort((a, b) => byText(a.room, b.room) || byText(a.via, b.via))
      const message = wayOutNotDrawn ? messages.noRouteToAnyDoorOut(roomName(room)) : messages.noRoute(roomName(room))
      findings.push({ ...finding('no_route_to_exit', floor.id, [room], message), through })
    }
  }
  return { findings, wayOutNotDrawn }
}

/** The finding for a door or doorless opening no person fits through (MSG-18). */
function tooSmallFinding(
  opening: Opening,
  rooms: readonly string[],
  short: ShortOf,
  floor: string,
  roomName: (id: string) => string
): RuleFinding {
  const key = short === 'width' ? 'passableWidth' : short === 'height' ? 'passableHeight' : 'passableSill'
  const passable = limit(key)
  const value = short === 'width' ? opening.width : short === 'height' ? opening.height : opening.sill
  const size = metresText(value, 2, passable)
  const kind = opening.type === 'door' ? 'door' : 'opening'
  return {
    code: 'opening_too_small_to_pass',
    ruleId: RULE_OF.opening_too_small_to_pass,
    floor,
    rooms: [...rooms],
    openings: [opening.id],
    message: messages.openingTooSmall(roomName(rooms[0]!)),
    passage: { kind, short, drawn: Number(size), passable }
  }
}

/**
 * The storey without the walls and openings validation rejects, and the rooms it
 * rejects (including those resting on a rejected wall), which stay in the plan so
 * a door beside them is not read as leading nowhere.
 *
 * Exported for checks built on top of this one, so they read a floor the same way.
 */
export function drawable(storey: FloorPlan): {
  storey: FloorPlan
  leftOut: { rooms: Set<string>; openings: Set<string> }
} {
  const { broken } = validatePlan(storey, undefined, { spaces: false })
  const rooms = new Set(storey.rooms.filter((r) => broken.has(r.id)).map((r) => r.id))
  const openings = new Set(
    storey.openings.filter((o) => broken.has(o.id) || broken.has(o.wall)).map((o) => o.id)
  )
  return {
    storey: {
      ...storey,
      walls: storey.walls.filter((w) => !broken.has(w.id)),
      openings: storey.openings.filter((o) => !openings.has(o.id))
    },
    leftOut: { rooms, openings }
  }
}

export interface SanityOptions {
  /**
   * MSG-5: the walls, rooms and openings the reader left out of the plan (`readPlanParts`). A
   * note that rests on one is held back, as one on a part the drawing check leaves out is.
   */
  readonly leftOut?: readonly LeftOutPart[]
}

/**
 * The floors' "could not be drawn" notices (MSG-5): one for each floor where something could not
 * be drawn, naming it, with the findings held back because they rest on it. A finding is held on
 * its own floor's notice, or, for a route followed down a stair, on the first floor of its group
 * where something could not be drawn.
 */
export function cannotBeDrawnNotices(
  floors: readonly { readonly id: string }[],
  damage: ReadonlyMap<string, FloorDamage>,
  held: readonly (HeldFinding<RuleFinding> & { readonly on: string })[],
  floorName: (id: string) => string,
  roomName: (id: string) => string
): NotChecked[] {
  return floors.flatMap((floor) => {
    const at = damage.get(floor.id)
    if (!damaged(at)) return []
    const mine = held.filter((h) => h.on === floor.id).map(({ finding, waitsFor }) => ({ finding, waitsFor }))
    return [
      {
        reason: 'cannot_be_drawn' as const,
        floor: floor.id,
        rooms: at.rooms,
        openings: at.openings,
        message: messages.cannotBeDrawn(floorName(floor.id), at.rooms.map(roomName), at.openings),
        ...(mine.length > 0 ? { held: mine } : {})
      }
    ]
  })
}

/**
 * The plan checks alone: a way out, a door on every room, a route to the way out, and doors
 * that lead somewhere. Not the full check: `checkLocalRules` in `@ongrid/rules` runs these and
 * the figure checks, and `inspectPlan` there gives everything in one record (MSG-1). The two
 * no longer share a name, so importing the wrong one does not compile.
 */
export function checkPlanSanity(plan: FloorPlan, options: SanityOptions = {}): RulesReport {
  const floors = planFloors(plan)
  const level = new Map(floors.map((f) => [f.id, f.level] as const))
  const names = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const roomName = (id: string): string => names.get(id) ?? id
  const floorNames = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const floorName = (id: string): string => floorNames.get(id) ?? id

  // The way out is checked from the ground floor: the floor at level 0, or the only floor there
  // is, unless it stands above the ground (LVL-1, lab VE-8: a flat whose only floor is the
  // third). With the site's ground level stated (LVL-4, lab VE-7), the floor nearest the ground,
  // and a floor stands above the ground by its height over that level. A floor a stair joins to
  // it, directly or through other floors, is checked with it, its routes followed down the stair
  // to a door (LVL-3, lab VE-1). Any other floor is said to be unchecked, never passed: a balcony
  // door upstairs is not a way out.
  const elevations = floorElevations(plan)
  const site = groundLevel(plan, elevations)
  const standsAt = (id: string): number => site.above.get(id) ?? 0
  const aboveGround = site.aboveGround
  const ground = site.groundFloors
  const groundIds = new Set(ground.map((f) => f.id))
  const openingIds = new Set(plan.openings.map((o) => o.id))

  const findings: RuleFinding[] = []
  const notChecked: NotChecked[] = []
  const routes = new Map<string, FloorRoutes>()
  const outlines = new Map<string, Map<string, readonly Vec2[]>>()
  const leftOutOn = new Map<string, ReadonlySet<string>>()
  const drawnFloors = new Map<string, DrawnFloor>()
  for (const floor of floors) {
    const drawn = drawable(planForFloor(plan, floor.id))
    drawnFloors.set(floor.id, drawn)
    const { storey, leftOut } = drawn
    const index = indexPlan(storey)
    const graph = floorGraph(storey, leftOut.rooms)
    routes.set(floor.id, { id: floor.id, name: floorName(floor.id), graph, exitsCount: !aboveGround(floor.id) })
    // A door no person fits through (MSG-18), on every floor: it is why a room may have no door.
    const openingsById = new Map(storey.openings.map((o) => [o.id, o] as const))
    for (const { opening, rooms, short } of graph.tooSmall) {
      const drawn = openingsById.get(opening)
      if (drawn === undefined) continue
      findings.push(tooSmallFinding(drawn, rooms, short, floor.id, roomName))
    }
    outlines.set(floor.id, new Map([...roomOutlines(storey, index, leftOut.rooms)].map(([id, o]) => [id, o.polygon] as const)))
    leftOutOn.set(floor.id, leftOut.rooms)
  }
  // MSG-5: what could not be drawn, floor by floor, with what the reader left out.
  const damage = planDamage(plan, drawnFloors, options.leftOut)

  // The floors' joins: stairs the plan states, and stair rooms one over the other. A lift is
  // lined up, never taken as a way out.
  const joins = floorJoins(plan, outlines, (slice) => leftOutOn.get(wholePlan(slice).floor ?? '') ?? new Set())
  const stairLinks: StairLink[] = joins.joins
    .filter((j) => j.kind !== 'lift')
    .map((j) => ({ ends: [j.lower, j.upper] as const, via: j.via }))
  const joined = new Set(stairLinks.flatMap((l) => l.ends.map((e) => at(e.floor, e.room))))

  // Floors joined by stairs, as groups: each group is checked as one if it holds a ground floor.
  const group = new Map(floors.map((f) => [f.id, f.id] as const))
  const find = (id: string): string => {
    let at = id
    while (group.get(at) !== at) at = group.get(at)!
    return at
  }
  for (const { ends: [a, b] } of stairLinks) group.set(find(a.floor), find(b.floor))
  const checkedGroups = new Set([...groundIds].map(find))

  const doorless = new Set<string>()
  for (const floor of floors) {
    const checked = checkedGroups.has(find(floor.id))
    const voids = new Set(planForFloor(plan, floor.id).rooms.filter((room) => room.void === true).map((room) => room.id))
    const own = floorFindings(routes.get(floor.id)!, joined, roomName, !checked, voids)
    findings.push(...own.findings)
    for (const room of own.doorless) doorless.add(at(floor.id, room))
  }
  for (const root of checkedGroups) {
    const members = floors.filter((f) => find(f.id) === root).map((f) => routes.get(f.id)!)
    const memberIds = new Set(members.map((m) => m.id))
    const found = routeFindings(
      members,
      stairLinks.filter((l) => memberIds.has(l.ends[0].floor)),
      doorless,
      members.filter((m) => groundIds.has(m.id)),
      roomName
    )
    findings.push(...found.findings)
    if (found.wayOutNotDrawn) {
      for (const member of members) {
        if (!groundIds.has(member.id) || member.graph.undrawn.length === 0) continue
        notChecked.push({
          reason: 'way_out_not_drawn',
          floor: member.id,
          rooms: [],
          openings: member.graph.undrawn.map((u) => u.opening).sort(byText),
          message: messages.wayOutNotDrawn(member.name)
        })
      }
    }
  }

  for (const floor of floors) {
    const graph = routes.get(floor.id)!.graph
    // A door to the outside in mid-air (lab VE-8): said, and never a way out. Open sides of a
    // virtual wall are left alone: they edge a terrace or a stand, not a door.
    if (aboveGround(floor.id)) {
      const height = metresText(standsAt(floor.id))
      for (const { room, opening } of graph.exits) {
        if (!openingIds.has(opening)) continue
        findings.push({
          code: 'door_to_outside_above_ground',
          ruleId: RULE_OF.door_to_outside_above_ground,
          floor: floor.id,
          rooms: [room],
          openings: [opening],
          message: messages.doorOutAboveGround(roomName(room), height),
          elevation: Number(height)
        })
      }
    }
    if (!checkedGroups.has(find(floor.id)) && graph.rooms.length > 0) {
      notChecked.push({
        reason: 'no_stairs',
        floor: floor.id,
        rooms: [],
        openings: [],
        message: messages.noStairs(floorName(floor.id))
      })
    }
  }

  // Doors and windows in outside walls below the ground the site states (LVL-4, lab VE-7).
  for (const below of openingsBelowGround(plan, elevations)) {
    const room = below.rooms[0]
    const depth = below.wholly ? below.topBelow : below.sillBelow
    findings.push({
      code: 'opening_below_ground',
      ruleId: RULE_OF.opening_below_ground,
      floor: below.floor,
      rooms: [...below.rooms],
      openings: [below.opening],
      message: messages.belowGround(below.type, room === undefined ? null : roomName(room), below.wall, below.wholly, metresText(depth)),
      belowGround: { foot: Number(metresText(below.sillBelow)), top: Number(metresText(below.topBelow)), wholly: below.wholly }
    })
  }

  // The building against its plot (BRF-3, lab EL-16): over an edge of the boundary, or nearer an
  // edge than the set-back the person asked for. Their figures, never a code's: a distance that
  // keeps to one is not said to be enough, it is only not named.
  if (plan.site?.boundary !== undefined) {
    const site = siteMeasures(plan)
    // A boundary that crosses itself is the drawing check's to name (`plan/boundary-crosses`).
    if (site.boundary !== null && site.boundary.problem === null && site.footprint === null) {
      notChecked.push({
        reason: 'boundary_not_measured',
        floor: '',
        rooms: [],
        openings: [],
        message: `No distance to the plot's boundary was measured: ${site.why === null ? 'the building has no outline' : lowerFirst(site.why)}`
      })
    }
    for (const at of site.edges) {
      if (at.past === 0 && at.short === null) continue
      const { edge } = at
      const asked = edge.setback
      const boundary = {
        edge: edge.edge,
        faces: edge.faces,
        street: edge.street,
        name: edge.name,
        distance: Number(metresText(at.distance, 3)),
        past: Number(metresText(at.past, 3)),
        asked: asked === null ? null : { distance: asked.distance, from: asked.from, source: asked.source },
        northStated: site.boundary!.northStated
      }
      findings.push(
        at.past > 0
          ? { ...finding('over_boundary', at.floor, [], overBoundaryText(metresText(at.past), edge.name)), boundary }
          : {
              ...finding('setback_short', at.floor, [], setbackShortText(metresText(at.distance, 2, asked!.distance), edge.name, metresText(asked!.distance), asked!.source)),
              boundary
            }
      )
    }
  }

  // Stair rooms, or lift shafts, that do not line up from one floor to the next (LVL-3, AU2).
  for (const out of joins.outOfLine) {
    const upperFloor = out.upper[0]!.floor
    const lowerFloors = [...new Set(out.lower.map((r) => r.floor))]
    const upperFloors = [...new Set(out.upper.map((r) => r.floor))]
    const code = out.kind === 'stair' ? 'stair_out_of_line' : 'lift_out_of_line'
    findings.push(
      finding(
        code,
        upperFloor,
        [...out.upper.map((r) => r.room), ...out.lower.map((r) => r.room)],
        messages.outOfLine(
          out.kind,
          out.upper.map((r) => roomName(r.room)),
          upperFloors.map(floorName),
          out.lower.map((r) => roomName(r.room)),
          lowerFloors.map(floorName)
        )
      )
    )
  }

  // MSG-5 (lab MS-4, W-6): a note that rests on a part that could not be drawn is held back, and
  // the floor's notice names the part and keeps the note.
  const rooms = new Map(plan.rooms.map((room) => [at(floorOf(room), room.id), room] as const))
  const openingWall = new Map(plan.openings.map((o) => [o.id, o.wall] as const))
  const groupOf = (id: string): string[] => floors.filter((f) => find(f.id) === find(id)).map((f) => f.id)
  const held: (HeldFinding<RuleFinding> & { on: string })[] = []
  const given = findings.filter((found) => {
    let waitsFor: string[] = []
    let on = found.floor
    const room = rooms.get(at(found.floor, found.rooms[0] ?? ''))
    switch (found.code) {
      case 'no_exit':
      case 'no_route_to_exit': {
        const group = groupOf(found.floor)
        waitsFor = routeWaitsFor(group.map((id) => damage.get(id)))
        on = damaged(damage.get(found.floor)) ? found.floor : group.find((id) => damaged(damage.get(id))) ?? found.floor
        break
      }
      case 'room_without_door':
        waitsFor = room === undefined ? [] : doorWaitsFor(roomWallIds(room), damage.get(found.floor))
        break
      case 'door_to_undrawn_space':
        waitsFor = leadsWaitsFor(openingWall.get(found.openings[0] ?? ''), damage.get(found.floor))
        break
      default:
        break
    }
    if (waitsFor.length === 0) return true
    held.push({ finding: found, waitsFor, on })
    return false
  })
  notChecked.unshift(...cannotBeDrawnNotices(floors, damage, held, floorName, roomName))

  return {
    schemaVersion: RULES_REPORT_SCHEMA_VERSION,
    basis: 'general-baseline',
    label: GENERAL_GUIDANCE_LABEL,
    rules: RULES,
    findings: given.sort(
      (a, b) =>
        (level.get(a.floor) ?? 0) - (level.get(b.floor) ?? 0) ||
        byText(a.floor, b.floor) ||
        byText(a.code, b.code) ||
        byText(a.rooms.join(','), b.rooms.join(',')) ||
        byText(a.openings.join(','), b.openings.join(','))
    ),
    notChecked,
    limits: LIMITS
  }
}
