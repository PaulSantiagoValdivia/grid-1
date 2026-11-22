/**
 * Two rooms knocked into one (WRT-3, lab WR-2): the stretch of the wall between them is taken
 * out, the first room takes in the second, and the doors and windows in the stretch go with it.
 * The merged room keeps the first room's facts of the person's own and its number, and takes the
 * second's facts it does not carry (CNT-9); what the second said otherwise is named, never kept
 * in silence. The pieces of a cut wall each keep the wall's facts.
 *
 * The way of doing it comes from the lab's edit prototype (`merge-rooms`): the wall is cut at
 * the centre lines of the walls that meet it where the two rooms stop sharing it, so what is
 * left of it still bounds the rooms beside it; every room that named the wall names the pieces
 * beside it instead, in its own order (C3).
 *
 * Pure: a survey in, a patch out.
 */
import { cross, dot, signedArea, sub, tolerance, wallAxis, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { factOf } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import type { Survey, SurveyRoom } from '../quantities/survey'
import { type OpeningChange, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'
import { r3 } from './seat'

const TOL = 0.011

/** An id the plan does not use yet, from a base. */
export function freshId(used: ReadonlySet<string>, base: string): string {
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

export function usedIds(survey: Survey): Set<string> {
  const plan = survey.plan
  return new Set([...plan.walls.map((w) => w.id), ...plan.rooms.map((r) => r.id), ...plan.openings.map((o) => o.id)])
}

/** Where a room's outline runs along a wall: its span from the wall's start, and +1 or -1 for the way the outline goes. */
export function spanOn(room: SurveyRoom, wall: Wall): { lo: number; hi: number; sign: number } | null {
  const axis = wallAxis(wall)
  let best: { lo: number; hi: number; sign: number } | null = null
  for (const edge of room.edges) {
    if (edge.wall?.id !== wall.id) continue
    const a = dot(sub(edge.from, axis.start), axis.dir)
    const b = dot(sub(edge.to, axis.start), axis.dir)
    const span = { lo: Math.min(a, b), hi: Math.max(a, b), sign: b >= a ? 1 : -1 }
    if (best === null || span.hi - span.lo > best.hi - best.lo) best = span
  }
  return best
}

/** The room's wall list, turned counter-clockwise if it was written the other way. */
export function ccwBoundary(room: SurveyRoom, plan: Survey['plan']): string[] {
  const listed = plan.rooms.find((r) => r.id === room.facts.id)!.boundary
  const points: Vec2[] = []
  for (const id of listed) {
    const wall = plan.walls.find((w) => w.id === id)
    if (!wall) continue
    const axis = wallAxis(wall)
    const span = spanOn(room, wall)
    const s = span ? (span.lo + span.hi) / 2 : axis.length / 2
    points.push({ x: axis.start.x + axis.dir.x * s, y: axis.start.y + axis.dir.y * s })
  }
  return signedArea(points) < 0 ? [...listed].reverse() : [...listed]
}

interface Piece {
  readonly lo: number
  readonly hi: number
  readonly id: string
}

/** The pieces of a cut wall beside a room's side on it, in the order its outline meets them. */
export function piecesBeside(room: SurveyRoom, wall: Wall, pieces: readonly Piece[]): string[] {
  const span = spanOn(room, wall)
  if (!span) return []
  const own = pieces.filter((p) => Math.min(p.hi, span.hi) - Math.max(p.lo, span.lo) > 0.05).sort((a, b) => a.lo - b.lo)
  if (span.sign < 0) own.reverse()
  return own.map((p) => p.id)
}

/** The wall cut into pieces, as a patch's walls to add, change or take out. */
export function cutWall(wall: Wall, pieces: readonly Piece[]): { change?: { start: [number, number]; end: [number, number] }; add: Record<string, unknown>[]; remove: boolean } {
  const axis = wallAxis(wall)
  const at = (s: number): [number, number] => [r3(axis.start.x + axis.dir.x * s), r3(axis.start.y + axis.dir.y * s)]
  if (pieces.length === 1 && pieces[0]!.id === wall.id) return { change: { start: at(pieces[0]!.lo), end: at(pieces[0]!.hi) }, add: [], remove: false }
  const rest: Record<string, unknown> = { ...wall }
  for (const key of ['id', 'start', 'end']) delete rest[key]
  return { add: pieces.map((p) => ({ id: p.id, start: at(p.lo), end: at(p.hi), ...rest })), remove: true }
}

/** Where along a wall the walls crossing it near `s` have their centre line, or `s` when none does. */
export function cutAt(plan: Survey['plan'], wall: Wall, s: number): number {
  const axis = wallAxis(wall)
  let near: number | null = null
  for (const other of plan.walls) {
    if (other.id === wall.id || (other.floor ?? 'ground') !== (wall.floor ?? 'ground')) continue
    const x = wallAxis(other)
    const denom = cross(axis.dir, x.dir)
    if (Math.abs(denom) < tolerance('parallel')) continue
    const t = cross(sub(x.start, axis.start), x.dir) / denom
    const u = cross(sub(x.start, axis.start), axis.dir) / denom
    if (Math.abs(t - s) <= other.thickness / 2 + TOL && u >= -TOL && u <= x.length + TOL) {
      if (near === null || Math.abs(t - s) < Math.abs(near - s)) near = t
    }
  }
  return near ?? s
}

export interface MergeRequest {
  readonly name?: string
  readonly use?: string
}

export function mergeRooms(survey: Survey, aId: string, bId: string, request: MergeRequest): Patch {
  const plan = survey.plan
  if (aId === bId) throw new EditRefused('Name two different rooms to merge.')
  const A = survey.byId.get(aId)!
  const B = survey.byId.get(bId)!
  const aRoom = plan.rooms.find((r) => r.id === aId)!
  const bRoom = plan.rooms.find((r) => r.id === bId)!
  const an = quoted(A.facts.name)
  const bn = quoted(B.facts.name)
  if ((aRoom.floor ?? 'ground') !== (bRoom.floor ?? 'ground')) throw new EditRefused(`${an} and ${bn} are on different floors.`)
  if (A.polygon.length < 3 || B.polygon.length < 3) throw new EditRefused(`${A.polygon.length < 3 ? an : bn} has no outline Grid can measure; grid_check says why.`)
  if ((bRoom.holes?.length ?? 0) > 0 || (aRoom.holes?.length ?? 0) > 0) throw new EditRefused('A room with a hole is not merged by this tool; write the plan again with grid_write_rooms.')

  const shared: Array<{ wall: Wall; s0: number; s1: number }> = []
  for (const id of new Set(aRoom.boundary.filter((w) => bRoom.boundary.includes(w)))) {
    const wall = plan.walls.find((w) => w.id === id)
    if (!wall) continue
    const ea = spanOn(A, wall)
    const eb = spanOn(B, wall)
    // The two outlines run along the wall the opposite way: one room on each face.
    if (!ea || !eb || ea.sign === eb.sign) continue
    const s0 = Math.max(ea.lo, eb.lo)
    const s1 = Math.min(ea.hi, eb.hi)
    if (s1 - s0 > 0.05) shared.push({ wall, s0, s1 })
  }
  if (shared.length === 0) {
    const beside = plan.rooms.filter((r) => r.id !== aId && r.boundary.some((w) => aRoom.boundary.includes(w))).map((r) => quoted(r.name))
    throw new EditRefused(`${an} and ${bn} do not share a wall, so there is nothing to take out. Rooms that share a wall with ${an}: ${beside.join(', ') || 'none'}.`)
  }
  if (shared.length > 1) throw new EditRefused(`${an} and ${bn} share ${shared.length} walls (${shared.map((s) => quoted(s.wall.id)).join(', ')}); this tool takes out one. Take the others out with grid_write_rooms.`)
  const { wall, s0, s1 } = shared[0]!
  const axis = wallAxis(wall)
  const c0 = cutAt(plan, wall, s0)
  const c1 = cutAt(plan, wall, s1)
  const used = usedIds(survey)
  const kept: Piece[] = []
  if (c0 > 0.05) kept.push({ lo: 0, hi: c0, id: '' })
  if (axis.length - c1 > 0.05) kept.push({ lo: c1, hi: axis.length, id: '' })
  const pieces: Piece[] = kept.length === 1 ? [{ ...kept[0]!, id: wall.id }] : kept.map((p, i) => {
    const id = freshId(used, `${wall.id}-${'ab'[i]}`)
    used.add(id)
    return { ...p, id }
  })

  // The merged room's walls, counter-clockwise: A up to the wall, then B round, then A again.
  const around = (room: SurveyRoom): { head: string[]; pre: string[]; post: string[]; tail: string[] } => {
    const list = ccwBoundary(room, plan)
    const k = list.indexOf(wall.id)
    const span = spanOn(room, wall)!
    const own = piecesBeside(room, wall, pieces)
    const mid = (s0 + s1) / 2
    const centre = (id: string): number => {
      const p = pieces.find((x) => x.id === id)!
      return (p.lo + p.hi) / 2
    }
    const pre = own.filter((id) => (centre(id) < mid) === (span.sign > 0))
    const post = own.filter((id) => (centre(id) < mid) !== (span.sign > 0))
    return { head: list.slice(0, k), pre, post, tail: list.slice(k + 1) }
  }
  const a = around(A)
  const b = around(B)
  const joined: string[] = []
  for (const id of [...a.head, ...a.pre, ...b.post, ...b.tail, ...b.head, ...b.pre, ...a.post, ...a.tail]) {
    if (joined[joined.length - 1] !== id) joined.push(id)
  }
  while (joined.length > 1 && joined[0] === joined[joined.length - 1]) joined.pop()

  const said: string[] = []
  const guessed: string[] = []
  const rooms = new Map<string, RoomChange>()
  const change: RoomChange = { boundary: joined }
  if (request.name !== undefined) change.name = request.name
  if (request.use !== undefined) change.use = request.use
  rooms.set(aId, change)
  if (request.name === undefined) guessed.push(`The merged room keeps the id, name and use of ${an} (${aRoom.use ?? 'no use'}); pass name or use to change them.`)
  // CNT-9: the merged room keeps the facts of the first room, and takes the second's it does not carry.
  const notKept: string[] = []
  const aFacts = aRoom.properties ?? {}
  const bFacts = bRoom.properties ?? {}
  const taken = Object.entries(bFacts).filter(([fact]) => factOf(aRoom, fact) === undefined)
  const differ = Object.entries(bFacts).filter(([fact, value]) => factOf(aRoom, fact) !== undefined && factOf(aRoom, fact) !== value)
  if (taken.length > 0) change.properties = { ...aFacts, ...Object.fromEntries(taken) }
  if (taken.length > 0) said.push(`${request.name !== undefined ? quoted(request.name) : an} takes the facts of ${bn} it did not carry: ${taken.map(([fact]) => quoted(fact)).join(', ')}.`)
  if (differ.length > 0) notKept.push(`${bn} said otherwise of ${differ.map(([fact]) => quoted(fact)).join(', ')}; the merged room keeps what ${an} says.`)
  if (bRoom.number !== undefined) notKept.push(`The room number of ${bn}, ${quoted(bRoom.number)}, is gone with it${aRoom.number !== undefined ? `; the merged room keeps ${quoted(aRoom.number)}` : ''}.`)
  // Other rooms that named the wall now name the pieces beside them.
  for (const room of survey.rooms) {
    const id = room.facts.id
    if (id === aId || id === bId) continue
    const listed = plan.rooms.find((r) => r.id === id)!.boundary
    if (!listed.includes(wall.id)) continue
    const beside = piecesBeside(room, wall, pieces)
    if (beside.length === 1 && beside[0] === wall.id) continue
    const k = listed.indexOf(wall.id)
    rooms.set(id, { boundary: [...listed.slice(0, k), ...beside, ...listed.slice(k + 1)] })
  }

  // Openings in the wall: those in a kept piece stay where they are; those in the stretch go.
  const openings = new Map<string, OpeningChange>()
  const removeOpenings = new Set<string>()
  for (const o of plan.openings) {
    if (o.anchor?.room === bId) openings.set(o.id, { anchor: { ...o.anchor, room: aId } })
    if (o.wall !== wall.id) continue
    const home = pieces.find((p) => p.lo - tolerance('joint') <= o.offset && o.offset + o.width <= p.hi + tolerance('joint'))
    if (!home) {
      removeOpenings.add(o.id)
      said.push(`Removed ${o.type} ${quoted(o.id)}: it was in the wall taken out.`)
      continue
    }
    if (home.id !== wall.id || home.lo > 0) openings.set(o.id, { ...(openings.get(o.id) ?? {}), wall: home.id, offset: r3(o.offset - home.lo) })
  }

  const cut = cutWall(wall, pieces)
  const length = c1 - c0
  const strip = wall.virtual === true ? 0 : (s1 - s0) * wall.thickness
  said.unshift(
    pieces.length === 0
      ? `Took out wall ${quoted(wall.id)} (${axis.length.toFixed(2)} m) between ${an} and ${bn}.`
      : `Took ${length.toFixed(2)} m out of wall ${quoted(wall.id)} between ${an} and ${bn}; what is left: ${pieces.map((p) => `${quoted(p.id)} (${(p.hi - p.lo).toFixed(2)} m)`).join(', ')}.`,
    `${request.name !== undefined ? quoted(request.name) : an} is the ${(A.facts.shape?.area ?? 0).toFixed(2)} m² of ${an} and the ${(B.facts.shape?.area ?? 0).toFixed(2)} m² of ${bn}${strip > 0 ? `, with ${strip.toFixed(2)} m² under the wall taken out` : ''}; ${bn} is gone.`,
  )
  return {
    walls: cut.change ? new Map([[wall.id, cut.change]]) : new Map(),
    openings,
    removeOpenings,
    rooms,
    said,
    guessed,
    removeWalls: cut.remove ? new Set([wall.id]) : new Set(),
    addWalls: cut.add,
    removeRooms: new Set([bId]),
    roomsBecome: new Map([[bId, aId]]),
    notKept,
  }
}
