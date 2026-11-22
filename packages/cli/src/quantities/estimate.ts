/**
 * ARE-13: the quantities a first estimate needs, line by line (lab AC-1, AC-6, AC-14).
 *
 * Each line has a key a rates file can price (`rates.ts`), a quantity in m², m or nr, the rule
 * it is measured by in one sentence, and an `assumed` mark when it rests on something the plan
 * does not hold: ceilings, the slab, upper floor structures and the roof. Nothing here is a
 * price, and nothing comes from a price list.
 *
 * Built on the measuring that is already there: the rooms' take-off (`takeoff.ts`: floor,
 * ceiling, skirting and wall face of each room), the areas (`areas.ts`: gross internal per
 * floor), the opening facts (each door and window once, as the schedule counts them) and the
 * library's outlines (`planShell`: the outside face, the slab and the roof). Floor finishes and
 * wall faces are grouped by the room's stated use, because the plan holds no finishes (lab
 * AC-4): which finish a use gets is the person's, through the key they price.
 *
 * Pure: a survey in, lines out. Nothing here reads a file.
 */
import { planShell, shellKnown, tolerance } from '@ongrid/floorplan/geometry'
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { AREA_RULES, planAreas } from './areas'
import type { Survey } from './survey'
import { roomTakeoff } from './takeoff'

export type QuantityUnit = 'm2' | 'm' | 'nr'

/** The rule of each kind of line, one sentence each, in Grid's words. */
export const ESTIMATE_RULES = {
  floor: 'Net floor area of the rooms of this use, between their wall faces as grid_areas measures it, so a stair room over a stair room below is counted once, on the floor the stair rises from; the plan holds no finishes, so which finish goes down is the person\'s, by the key they price.',
  ceiling: 'Assumed: a flat ceiling the size of the floor below it in every room, because the plan holds no ceilings.',
  wallFinish: 'Each inside side of the rooms of this use times the height of the wall it is on, less every door, window and opening in it at its full size; both faces of an inside wall are counted, dividing lines are not.',
  skirting: 'Each room\'s inside perimeter less the width of every door and doorless opening on it; dividing lines take none.',
  reveals: 'Round each door and window, its two sides and its head, and its sill when it has one, times the thickness of its wall; doorless openings are left out.',
  walls: 'The centre-line length of each solid wall of this kind and thickness, each wall counted once, times its height, less every opening in it; the kind is the one the plan states.',
  externalFinish: 'The outer edge of each floor\'s outline, corners included, times the height of the wall it runs along, less every opening in those walls.',
  openings: 'Counted once per opening, not once per room, by the size of its hole in the wall, width by height; the plan holds no frames, leaves or types.',
  slab: 'Assumed: a slab under the lowest floor\'s outline, its gross external area, because the plan holds no slab.',
  upperFloor: 'Assumed: the gross internal area of each upper floor, less the footprint of every stair the plan states arriving on it, because the plan holds no floor structure.',
  roof: 'Assumed: a flat roof over every part of a floor\'s outline that no floor above covers, because the plan holds no roof, pitch or overhang; a floor that is part of a larger building gets one too.',
  grossInternal: `${AREA_RULES.grossInternal} For a rate per square metre of the whole building: an alternative to the other lines, never added to them.`,
} as const

export interface EstimateLine {
  /** What a rates file prices it by: `floor:bedroom`, `wall:exterior:0.35`, `door:0.8x2.1`. */
  readonly key: string
  readonly what: string
  readonly quantity: number
  readonly unit: QuantityUnit
  readonly rule: string
  /** True when it rests on something the plan does not hold. */
  readonly assumed: boolean
  /** For the slab, upper floors and roof: each floor's part. */
  readonly floors?: readonly { readonly floor: string; readonly quantity: number }[]
}

export interface Estimate {
  readonly lines: readonly EstimateLine[]
  /** What the lines leave out, and why. */
  readonly notes: readonly string[]
}

/** The line that is an alternative to the others: a rate for the whole building. */
export const WHOLE_BUILDING_KEY = 'gross_internal'

const NO_USE = 'no-use'

const USE_WORDS: Readonly<Record<string, string>> = {
  bedroom: 'bedrooms',
  living: 'living rooms',
  dining: 'dining rooms',
  kitchen: 'kitchens',
  bathroom: 'bathrooms',
  corridor: 'corridors and halls',
  stair: 'stairs',
  lift: 'lift shafts',
  storage: 'stores',
  other: 'other rooms',
  [NO_USE]: 'rooms with no use stated',
}

/** A size as a key writes it: metres, to the millimetre, with no trailing zeros. */
const size = (value: number): string => String(Math.round(value * 1000) / 1000)
/** A size as the line's words write it. */
const metres = (value: number): string => value.toFixed(2)

const KIND_ORDER = { exterior: 0, separating: 1, interior: 2, partition: 3 } as const

/** The lines of a first estimate for the plan, or for the floors given. */
export function planEstimate(survey: Survey, options: { floors?: readonly string[] } = {}): Estimate {
  const onFloor = (floor: string): boolean => options.floors === undefined || options.floors.includes(floor)
  const lines: EstimateLine[] = []
  const notes: string[] = []
  const add = (line: EstimateLine): void => {
    if (line.quantity > tolerance('areaEqual')) lines.push(line)
  }

  const areas = planAreas(survey, options.floors === undefined ? {} : { floors: options.floors })
  // SHT-11: a stair room over a stair room below has its floor counted there, as in the net area.
  const overStair = new Set(areas.floors.flatMap((f) => f.rooms.filter((room) => room.countedWith !== undefined).map((room) => `${f.floor}\u0000${room.id}`)))

  // Rooms: floor and wall faces by use, ceilings and skirting.
  const floorByUse = new Map<string, number>()
  const wallByUse = new Map<string, number>()
  let ceiling = 0
  let skirting = 0
  const leftOut: string[] = []
  for (const room of survey.rooms) {
    // A zone's floor and walls are its room's (CNT-8): priced once.
    if (!onFloor(room.facts.floor) || room.facts.zoneOf !== undefined) continue
    if (room.facts.shape === null || room.polygon.length < 3) {
      leftOut.push(JSON.stringify(room.facts.name))
      continue
    }
    const t = roomTakeoff(room)
    const use = room.facts.use ?? NO_USE
    if (!overStair.has(`${room.facts.floor}\u0000${room.facts.id}`)) floorByUse.set(use, (floorByUse.get(use) ?? 0) + t.floorArea)
    wallByUse.set(use, (wallByUse.get(use) ?? 0) + t.wallFace)
    ceiling += t.ceiling
    skirting += t.skirting
  }
  const uses = [...ROOM_USES, NO_USE].filter((use) => floorByUse.has(use))
  for (const use of uses) add({ key: `floor:${use}`, what: `Floor finish, ${USE_WORDS[use]}`, quantity: floorByUse.get(use)!, unit: 'm2', rule: ESTIMATE_RULES.floor, assumed: false })
  add({ key: 'ceiling', what: 'Ceilings, every room', quantity: ceiling, unit: 'm2', rule: ESTIMATE_RULES.ceiling, assumed: true })
  for (const use of uses) add({ key: `wall_finish:${use}`, what: `Inside wall faces, ${USE_WORDS[use]}`, quantity: wallByUse.get(use)!, unit: 'm2', rule: ESTIMATE_RULES.wallFinish, assumed: false })
  add({ key: 'skirting', what: 'Skirting, every room', quantity: skirting, unit: 'm', rule: ESTIMATE_RULES.skirting, assumed: false })

  // Openings, each once: the holes they take out of their walls, their reveals and their sizes.
  const holes = new Map<string, number>()
  const wallKey = (floor: string, wall: string): string => `${floor}\u0000${wall}`
  let reveals = 0
  const counts = new Map<string, { type: 'door' | 'window'; width: number; height: number; count: number }>()
  for (const floor of survey.facts.floors) {
    if (!onFloor(floor.id)) continue
    const walls = new Map(floor.walls.map((wall) => [wall.id, wall] as const))
    for (const opening of floor.openings) {
      const wall = walls.get(opening.wall)
      if (wall === undefined) continue
      const height = Math.max(0, Math.min(opening.sill + opening.height, wall.height) - opening.sill)
      holes.set(wallKey(floor.id, wall.id), (holes.get(wallKey(floor.id, wall.id)) ?? 0) + opening.width * height)
      if (opening.type === 'opening') continue
      if (wall.virtual !== true) reveals += (2 * height + opening.width * (opening.sill > tolerance('noLength') ? 2 : 1)) * wall.thickness
      const key = `${opening.type}:${size(opening.width)}x${size(opening.height)}`
      const counted = counts.get(key) ?? { type: opening.type, width: opening.width, height: opening.height, count: 0 }
      counts.set(key, { ...counted, count: counted.count + 1 })
    }
  }
  add({ key: 'reveals', what: 'Reveal linings round doors and windows', quantity: reveals, unit: 'm2', rule: ESTIMATE_RULES.reveals, assumed: false })

  // Walls by kind and thickness, on their centre lines.
  const byKind = new Map<string, { kind: keyof typeof KIND_ORDER; thickness: number; area: number }>()
  for (const floor of survey.facts.floors) {
    if (!onFloor(floor.id)) continue
    for (const wall of floor.walls) {
      if (wall.virtual) continue
      // Along a curved wall's curve (CNT-18).
      const length = wall.curve?.length ?? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
      if (length < tolerance('noLength')) continue
      const key = `wall:${wall.kind}:${size(wall.thickness)}`
      const run = byKind.get(key) ?? { kind: wall.kind, thickness: wall.thickness, area: 0 }
      byKind.set(key, { ...run, area: run.area + Math.max(0, length * wall.height - (holes.get(wallKey(floor.id, wall.id)) ?? 0)) })
    }
  }
  const kinds = [...byKind.entries()].sort(([, a], [, b]) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.thickness - b.thickness)
  for (const [key, run] of kinds) {
    const kind = run.kind.charAt(0).toUpperCase() + run.kind.slice(1)
    add({ key, what: `${kind} walls ${metres(run.thickness)} m thick`, quantity: run.area, unit: 'm2', rule: ESTIMATE_RULES.walls, assumed: false })
  }

  // The outside: the outline's edge, then what stands on and over the outlines.
  const shells = planShell(survey.plan)
  const built = shells.filter((shell) => !shellKnown(shell) || shell.area > tolerance('areaEqual'))
  let outside = 0
  for (const shell of built) {
    if (!onFloor(shell.floor)) continue
    if (!shellKnown(shell)) {
      notes.push(`Floor ${JSON.stringify(shell.floor)} has no outline Grid can work out, so its outside face, slab and roof are left out: ${shell.reason}.`)
      continue
    }
    const faced = new Set(shell.faces.map((face) => face.wall))
    outside += shell.faces.reduce((sum, face) => sum + face.length * face.height, 0)
    for (const wall of faced) outside -= holes.get(wallKey(shell.floor, wall)) ?? 0
  }
  add({ key: 'external_finish', what: 'Outside face of the outer walls', quantity: Math.max(0, outside), unit: 'm2', rule: ESTIMATE_RULES.externalFinish, assumed: false })
  for (const [key, c] of [...counts.entries()].sort(([, a], [, b]) => (a.type === b.type ? 0 : a.type === 'door' ? -1 : 1) || a.width - b.width || a.height - b.height)) {
    add({ key, what: `${c.type === 'door' ? 'Door' : 'Window'} ${metres(c.width)} × ${metres(c.height)} m`, quantity: c.count, unit: 'nr', rule: ESTIMATE_RULES.openings, assumed: false })
  }

  const lowest = built[0]
  if (lowest !== undefined && onFloor(lowest.floor) && shellKnown(lowest)) {
    add({ key: 'slab', what: `Lowest floor slab (${floorName(survey, lowest.floor)})`, quantity: lowest.area, unit: 'm2', rule: ESTIMATE_RULES.slab, assumed: true, floors: [{ floor: lowest.floor, quantity: lowest.area }] })
  }
  const upper: { floor: string; quantity: number }[] = []
  for (const shell of built.slice(1)) {
    if (!onFloor(shell.floor)) continue
    const gross = areas.floors.find((f) => f.floor === shell.floor)?.grossInternal ?? null
    if (gross === null) {
      notes.push(`Floor ${JSON.stringify(shell.floor)} has no gross internal area, so its floor structure is left out of upper_floor.`)
      continue
    }
    const stairs = survey.facts.connections.stairs.filter((stair) => stair.upper === shell.floor).reduce((sum, stair) => sum + stair.footprint, 0)
    upper.push({ floor: shell.floor, quantity: Math.max(0, gross - stairs) })
  }
  if (upper.length > 0) {
    const named = upper.map((part) => floorName(survey, part.floor)).join(', ')
    add({ key: 'upper_floor', what: `Upper floor structure (${named})`, quantity: upper.reduce((sum, part) => sum + part.quantity, 0), unit: 'm2', rule: ESTIMATE_RULES.upperFloor, assumed: true, floors: upper })
  }
  const roof: { floor: string; quantity: number }[] = []
  for (const shell of built) {
    if (!onFloor(shell.floor) || !shellKnown(shell)) continue
    if (shell.open === null) {
      notes.push(`The roof over floor ${JSON.stringify(shell.floor)} is left out: ${shell.openWhy}.`)
      continue
    }
    if (shell.open > tolerance('areaEqual')) roof.push({ floor: shell.floor, quantity: shell.open })
  }
  if (roof.length > 0) {
    const parts = roof.map((part) => `${floorName(survey, part.floor)} ${part.quantity.toFixed(2)} m²`).join(', ')
    add({ key: 'roof', what: `Roof, taken as flat, wherever no floor is above (${parts})`, quantity: roof.reduce((sum, part) => sum + part.quantity, 0), unit: 'm2', rule: ESTIMATE_RULES.roof, assumed: true, floors: roof })
  }
  if (areas.grossInternal !== null) {
    add({ key: WHOLE_BUILDING_KEY, what: 'Gross internal area, for a rate for the whole building', quantity: areas.grossInternal, unit: 'm2', rule: ESTIMATE_RULES.grossInternal, assumed: false })
  } else if (areas.grossWhy !== null) {
    notes.push(`${areas.grossWhy}, so the line for a rate for the whole building is left out.`)
  }

  if (leftOut.length > 0) {
    notes.unshift(`The room lines leave out ${leftOut.length === 1 ? 'a room' : `${leftOut.length} rooms`} Grid could not draw, and are short by ${leftOut.length === 1 ? 'it' : 'them'}: ${leftOut.join(', ')}. grid_check says why.`)
  }
  return { lines, notes }
}

function floorName(survey: Survey, floor: string): string {
  const facts = survey.facts.floors.find((f) => f.id === floor)
  return JSON.stringify(facts?.name ?? floor)
}
