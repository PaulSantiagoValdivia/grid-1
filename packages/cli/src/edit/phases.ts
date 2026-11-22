/**
 * CNT-10 (lab EL-10, CP4-4): what Grid's edits do in a plan with phases, and in a fit-out on a
 * base plan.
 *
 * A fit-out's base is read-only (`baseTouched`): a change that would move, cut or take out one of
 * the base's walls or openings, or put an opening in a base wall, is refused, naming them, and
 * nothing is written. The base's parts are never in the file, so no change can write them.
 *
 * In a plan that states phases (`phasedPatch`), an edit is the work: what it adds is new, what it
 * takes out of what stood before stays in the plan, to be demolished, and a door or window it
 * changes keeps its old self beside it, demolished, so a widened door is its old opening and a
 * new one in the same place. A wall or a room that stood before and that a change moves, cuts or
 * reshapes is changed in place, and the answer says so: the plan then no longer holds how it
 * stood. Pure: a plan and a patch in, a patch out.
 */
import { phaseReading, planHasPhases, wallAxis, type FloorPlan, type Opening, type Wall } from '@ongrid/floorplan/geometry'
import { quoted } from '../fs/projectFiles'
import { listed, type OpeningChange, type Patch } from './edits'

type RawRecord = Record<string, unknown>

/** The base's walls and openings a patch would change, by id; empty when it leaves them as they are. */
export function baseTouched(patch: Patch, base: { readonly walls: ReadonlySet<string>; readonly openings: ReadonlySet<string> }): string[] {
  const touched = new Set<string>()
  for (const id of [...patch.walls.keys(), ...(patch.removeWalls ?? [])]) if (base.walls.has(id)) touched.add(id)
  for (const id of [...patch.openings.keys(), ...patch.removeOpenings]) if (base.openings.has(id)) touched.add(id)
  // An opening put in a base wall, or moved into one, cuts the shell.
  for (const opening of patch.addOpenings ?? []) if (base.walls.has(opening['wall'] as string)) touched.add(opening['wall'] as string)
  for (const change of patch.openings.values()) if (change.wall !== undefined && base.walls.has(change.wall)) touched.add(change.wall)
  return [...touched]
}

/** The words of a refusal for a change that touches a base, naming the parts. */
export function baseRefusal(touched: readonly string[], file: string): string {
  const names = listed(touched.map(quoted), 4)
  return `That change would touch the base plan ${quoted(file)}: ${names} ${touched.length === 1 ? 'is' : 'are'} part of the shell this plan is fitted out in, which is read-only here. Change the base plan itself, or make the change inside the shell. Nothing was written.`
}

/** What a change to an opening alters of the opening itself, rather than how it is hung or kept. */
const SHAPE_KEYS: readonly (keyof OpeningChange)[] = ['offset', 'width', 'height', 'sill', 'type', 'wall']

/** An id the plan does not use: `<id>-before`, then `-before-2` and on. */
function freeId(taken: Set<string>, id: string): string {
  let next = `${id}-before`
  for (let n = 2; taken.has(next); n++) next = `${id}-before-${n}`
  taken.add(next)
  return next
}

/** Whether a wall lies along another, on its line and within its length: a piece it was cut into. */
function pieceOf(piece: RawRecord, wall: Wall): boolean {
  const start = piece['start'] as [number, number] | undefined
  const end = piece['end'] as [number, number] | undefined
  if (start === undefined || end === undefined) return false
  const axis = wallAxis(wall)
  const near = (p: [number, number]): boolean => {
    const dx = p[0] - axis.start.x
    const dy = p[1] - axis.start.y
    const along = dx * axis.dir.x + dy * axis.dir.y
    const off = Math.abs(dx * axis.dir.y - dy * axis.dir.x)
    return off < 1e-3 && along > -1e-3 && along < axis.length + 1e-3
  }
  return near(start) && near(end)
}

/**
 * A patch made on the building after the work, turned into the work itself, for a plan that
 * states phases (see the header). `plan` is the plan as read, every phase in it. A plan with no
 * phases, or one fitted out in a base, gets its patch as it is.
 */
export function phasedPatch(plan: FloorPlan, patch: Patch): Patch {
  if (!planHasPhases(plan) || plan.base !== undefined) return patch
  const read = phaseReading(plan)
  const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
  const openings = new Map(plan.openings.map((o) => [o.id, o] as const))
  const rooms = new Map(plan.rooms.map((r) => [r.id, r] as const))
  const taken = new Set([...walls.keys(), ...openings.keys(), ...rooms.keys(), ...(plan.items ?? []).map((i) => i.id)])
  const existing = (phase: string): boolean => phase === 'existing'
  const said: string[] = []
  const inPlace: string[] = []

  // Walls: one taken out stays, to be demolished, unless it was cut into pieces that stay.
  const removedWalls = new Set<string>()
  const wallChanges = new Map(patch.walls)
  const addWalls = (patch.addWalls ?? []).map((wall) => {
    const cutFrom = [...(patch.removeWalls ?? [])].map((id) => walls.get(id)).find((w): w is Wall => w !== undefined && pieceOf(wall, w))
    // A piece keeps what its wall stated; a wall of its own is new.
    return cutFrom !== undefined || wall['phase'] !== undefined ? wall : { ...wall, phase: 'new' }
  })
  for (const id of patch.removeWalls ?? []) {
    const wall = walls.get(id)
    if (wall === undefined || !existing(read.wall(wall))) {
      removedWalls.add(id)
      continue
    }
    if (addWalls.some((added) => pieceOf(added, wall))) {
      removedWalls.add(id)
      inPlace.push(`wall ${quoted(id)}`)
      continue
    }
    wallChanges.set(id, { phase: 'demolished' })
  }
  for (const [id, change] of patch.walls) {
    const wall = walls.get(id)
    if (wall !== undefined && existing(read.wall(wall)) && (change.start !== undefined || change.end !== undefined)) inPlace.push(`wall ${quoted(id)}`)
  }

  // Openings: one taken out stays, to be demolished; one changed keeps its old self, demolished.
  const removeOpenings = new Set<string>()
  const openingChanges = new Map(patch.openings)
  const addOpenings: RawRecord[] = (patch.addOpenings ?? []).map((o) => (o['phase'] === undefined ? { ...o, phase: 'new' } : o))
  for (const id of patch.removeOpenings) {
    const opening = openings.get(id)
    if (opening === undefined || !existing(read.opening(opening))) removeOpenings.add(id)
    else {
      openingChanges.set(id, { phase: 'demolished' })
      said.push(`${quoted(id)} stood before the work: it stays in the plan, to be demolished.`)
    }
  }
  for (const [id, change] of patch.openings) {
    const opening = openings.get(id)
    if (opening === undefined || !existing(read.opening(opening)) || !SHAPE_KEYS.some((key) => change[key] !== undefined)) continue
    const before = freeId(taken, id)
    addOpenings.push({ ...statedOpening(opening), id: before, phase: 'demolished' })
    openingChanges.set(id, { ...change, phase: 'new' })
    said.push(`${quoted(id)} is new work; the opening it was is kept as ${quoted(before)}, to be demolished.`)
  }

  // Rooms: one taken out stays, to be demolished; one added is new.
  const removeRooms = new Set<string>()
  const roomChanges = new Map(patch.rooms)
  for (const id of patch.removeRooms ?? []) {
    const room = rooms.get(id)
    if (room === undefined || !existing(read.room(room))) removeRooms.add(id)
    else roomChanges.set(id, { phase: 'demolished' })
  }
  for (const [id, change] of patch.rooms) {
    const room = rooms.get(id)
    if (room !== undefined && existing(read.room(room)) && change.boundary !== undefined) inPlace.push(`room ${quoted(id)}`)
  }
  const addRooms = (patch.addRooms ?? []).map((room) => (room['phase'] === undefined ? { ...room, phase: 'new' } : room))

  const notKept = inPlace.length === 0 ? [] : [
    `${listed([...new Set(inPlace)], 4)} stood before the work and ${inPlace.length === 1 ? 'is' : 'are'} changed in place, so the plan no longer holds how ${inPlace.length === 1 ? 'it' : 'they'} stood. To keep both, mark the old one demolished and add the new one with phase new.`,
  ]
  return {
    ...patch,
    walls: wallChanges,
    removeWalls: removedWalls,
    addWalls,
    openings: openingChanges,
    removeOpenings,
    addOpenings,
    rooms: roomChanges,
    removeRooms,
    addRooms,
    said: [...patch.said, ...said],
    notKept: [...(patch.notKept ?? []), ...notKept],
  }
}

/** An opening as a file would state it: the fields the schema reads, without its phase. */
function statedOpening(opening: Opening): RawRecord {
  const { phase: _phase, ...rest } = opening
  return { ...rest }
}
