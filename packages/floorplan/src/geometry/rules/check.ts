/**
 * Checks that a plan can be left: a way out, a door on every room, a route from every
 * room to the way out, and doors that lead somewhere. Checks on the drawing, not on any
 * building code.
 *
 * Pure: a plan in, plain data out. No AI, no file, no network.
 */

import type { FloorPlan } from '../plan'
import { planFloors, planForFloor } from '../floors'
import { validatePlan } from '../validate'
import { LIMITS, RULES } from './catalogue'
import { floorGraph } from './graph'
import type { FloorGraph } from './graph'
import { messages } from './messages'
import type { FindingCode, NotChecked, RuleFinding, RulesReport } from './types'
import { GENERAL_GUIDANCE_LABEL, RULES_REPORT_SCHEMA_VERSION } from './types'

const RULE_OF: Record<FindingCode, string> = {
  no_exit: 'floor-has-exit',
  room_without_door: 'room-has-door',
  no_route_to_exit: 'room-reaches-exit',
  door_to_undrawn_space: 'door-leads-somewhere'
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Rooms that no route can reach: none of their own, or none that leads to an exit. */
function routeFindings(
  graph: FloorGraph,
  floor: string,
  floorName: string,
  roomName: (id: string) => string,
  /** False above or below the ground floor: with no stairs, only the rooms themselves are checked. */
  routes: boolean
): { findings: RuleFinding[]; wayOutNotDrawn: boolean } {
  const finding = (
    code: FindingCode,
    rooms: string[],
    message: string,
    openings: string[] = []
  ): RuleFinding => ({ code, ruleId: RULE_OF[code], floor, rooms, openings, message })
  const findings: RuleFinding[] = []

  const doorlessOnly = !routes
  // A door with nothing drawn behind it: probably a corridor or a stair nobody drew. It
  // is said, never guessed at, and never an exit. On every floor (MSG-14): a door into
  // floor nobody drew is as worth a look upstairs as on the ground.
  for (const { room, opening } of graph.undrawn) {
    findings.push(
      finding('door_to_undrawn_space', [room], messages.doorToUndrawnSpace(roomName(room)), [opening])
    )
  }

  // A room with nothing to go through at all. The most specific finding it can get.
  const touched = new Set<string>([
    ...graph.links.flatMap((l) => l.rooms),
    ...graph.exits.map((e) => e.room),
    ...graph.undrawn.map((u) => u.room)
  ])
  // Off the ground floor, a floor that is one open room is reached by a stair the plan
  // cannot draw: it is not a room without a door.
  const loneRoom = doorlessOnly && graph.rooms.length === 1
  const doorless = loneRoom ? [] : graph.rooms.filter((room) => !touched.has(room))
  for (const room of doorless) {
    findings.push(finding('room_without_door', [room], messages.roomWithoutDoor(roomName(room))))
  }

  if (doorlessOnly || graph.rooms.length === 0) return { findings, wayOutNotDrawn: false }
  // A flat drawn on its own leaves through its entrance, into a landing nobody drew. That door
  // is already reported, and whether it is a way out cannot be told. The rooms that reach no
  // such door, nor any exit, are still said (MSG-14, lab CH-7): they are cut off either way.
  const wayOutNotDrawn = graph.exits.length === 0 && graph.undrawn.length > 0
  if (graph.exits.length === 0 && !wayOutNotDrawn) {
    // No exit on the floor: one finding for the floor, not one per room.
    findings.push(finding('no_exit', [], messages.noExit(floorName)))
    return { findings, wayOutNotDrawn: false }
  }

  // Breadth-first from every exit at once, or, when the way out is not drawn, from every door
  // into a space not drawn.
  const neighbours = new Map<string, string[]>()
  for (const { rooms: [a, b] } of graph.links) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  const reached = new Set((wayOutNotDrawn ? graph.undrawn : graph.exits).map((e) => e.room))
  const queue = [...reached]
  while (queue.length > 0) {
    for (const next of neighbours.get(queue.shift()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  const doorlessSet = new Set(doorless)
  for (const room of graph.rooms) {
    if (reached.has(room) || doorlessSet.has(room)) continue
    // Where its ways through lead, so the warning can say "its only door opens into the bathroom".
    const through = graph.links
      .filter((link) => link.rooms.includes(room))
      .map((link) => ({ room: link.rooms[0] === room ? link.rooms[1] : link.rooms[0], via: link.via }))
      .sort((a, b) => byText(a.room, b.room) || byText(a.via, b.via))
    const message = wayOutNotDrawn ? messages.noRouteToAnyDoorOut(roomName(room)) : messages.noRoute(roomName(room))
    findings.push({ ...finding('no_route_to_exit', [room], message), through })
  }

  return { findings, wayOutNotDrawn }
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

/**
 * The plan checks alone: a way out, a door on every room, a route to the way out, and doors
 * that lead somewhere. Not the full check: `checkLocalRules` in `@ongrid/rules` runs these and
 * the figure checks, and `inspectPlan` there gives everything in one record (MSG-1). The two
 * no longer share a name, so importing the wrong one does not compile.
 */
export function checkPlanSanity(plan: FloorPlan): RulesReport {
  const floors = planFloors(plan)
  const level = new Map(floors.map((f) => [f.id, f.level] as const))
  const names = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const roomName = (id: string): string => names.get(id) ?? id

  // The plan has no stairs, so only the ground floor can reach the outside: the floor at
  // level 0, or the only floor there is. Any other floor is said to be unchecked, never
  // passed: a balcony door upstairs is not a way out.
  const ground = floors.length === 1 ? floors : floors.filter((f) => f.level === 0)
  const groundIds = new Set(ground.map((f) => f.id))

  const findings: RuleFinding[] = []
  const notChecked: NotChecked[] = []
  for (const floor of floors) {
    const floorName = floor.name || floor.id
    const { storey, leftOut } = drawable(planForFloor(plan, floor.id))
    const graph = floorGraph(storey, leftOut.rooms)
    if (leftOut.rooms.size + leftOut.openings.size > 0) {
      const rooms = [...leftOut.rooms].sort(byText)
      notChecked.push({
        reason: 'cannot_be_drawn',
        floor: floor.id,
        rooms,
        openings: [...leftOut.openings].sort(byText),
        message: messages.cannotBeDrawn(floorName, rooms.map(roomName))
      })
    }
    const routes = groundIds.has(floor.id)
    const found = routeFindings(graph, floor.id, floorName, roomName, routes)
    findings.push(...found.findings)
    if (found.wayOutNotDrawn) {
      notChecked.push({
        reason: 'way_out_not_drawn',
        floor: floor.id,
        rooms: [],
        openings: graph.undrawn.map((u) => u.opening).sort(byText),
        message: messages.wayOutNotDrawn(floorName)
      })
    }
    if (!routes && graph.rooms.length > 0) {
      notChecked.push({
        reason: 'no_stairs',
        floor: floor.id,
        rooms: [],
        openings: [],
        message: messages.noStairs(floorName)
      })
    }
  }

  return {
    schemaVersion: RULES_REPORT_SCHEMA_VERSION,
    basis: 'general-baseline',
    label: GENERAL_GUIDANCE_LABEL,
    rules: RULES,
    findings: findings.sort(
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
