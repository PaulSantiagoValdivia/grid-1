/**
 * The plan's fixtures (CNT-12), counted and measured: how many of each kind, where each stands,
 * and the floor they take from each room, so a room's free floor is its net area less the floor
 * its fixtures stand on. Every size is the plan's own; Grid gives a fixture none of its own.
 */
import {
  floorOf,
  indexPlan,
  isItemKind,
  ITEM_KIND_WORDS,
  ITEM_KINDS,
  itemFloorTaken,
  itemRoom,
  MEASURES,
  roomShapes,
  roomZones,
  tryRoomShape,
  validatePlan,
  type FloorPlan,
  type Item,
  type ItemKind,
} from '@ongrid/floorplan/geometry'

export const FIXTURE_RULES = {
  count: 'Fixtures are the plan\'s items, counted by kind; the room each is in is the one that holds the middle of its footprint. The plan holds fixed fixtures only: loose furniture, points and seats come later.',
  // ARE-14: one of the area measures, said in its words.
  free: MEASURES.freeFloor.measures,
} as const

export interface FixtureRow {
  readonly id: string
  readonly kind: ItemKind
  /** Its label, else its kind in words. */
  readonly label: string
  readonly floor: string
  /** The room it stands in, or null. */
  readonly room: string | null
  readonly at: readonly [number, number]
  /** Width along its back × depth to its front, in metres. */
  readonly size: readonly [number, number]
  readonly height: number
  /** Degrees, counter-clockwise. */
  readonly turn: number
}

export interface Fixtures {
  /** The fixtures that can be drawn, in plan order. */
  readonly rows: readonly FixtureRow[]
  /** How many of each kind, every kind listed. */
  readonly counts: Readonly<Record<ItemKind, number>>
  /** The floor fixtures take in each room, by room id, in square metres. */
  readonly taken: ReadonlyMap<string, number>
  /** ARE-14: the floor fixtures take in each zone (CNT-8), by zone id: those whose middle is in the zone, within it. Its room's `taken` holds them too. */
  readonly zoneTaken: ReadonlyMap<string, number>
  /** Items left out (a kind not held yet, a number not accepted): grid_check says why. */
  readonly leftOut: readonly string[]
}

function emptyCounts(): Record<ItemKind, number> {
  return Object.fromEntries(ITEM_KINDS.map((kind) => [kind, 0])) as Record<ItemKind, number>
}

/** The plan's fixtures, on the floors given (every floor when left out). */
export function planFixtures(plan: FloorPlan, floors?: readonly string[]): Fixtures {
  const items = (plan.items ?? []).filter((item) => floors === undefined || floors.includes(floorOf(item)))
  if (items.length === 0) return { rows: [], counts: emptyCounts(), taken: new Map(), zoneTaken: new Map(), leftOut: [] }
  const index = indexPlan(plan)
  const { broken } = validatePlan(plan, index)
  const shapes = roomShapes(index, broken)
  const sound: (Item & { kind: ItemKind })[] = []
  const leftOut: string[] = []
  for (const item of items) {
    if (broken.has(item.id) || !isItemKind(item.kind)) leftOut.push(item.id)
    else sound.push(item as Item & { kind: ItemKind })
  }
  const counts = emptyCounts()
  const rows = sound.map((item): FixtureRow => {
    counts[item.kind] += 1
    return {
      id: item.id,
      kind: item.kind,
      label: item.label ?? ITEM_KIND_WORDS[item.kind],
      floor: floorOf(item),
      room: itemRoom(item, shapes)?.id ?? null,
      at: item.at,
      size: item.size,
      height: item.height,
      turn: item.turn ?? 0,
    }
  })
  const zones = roomZones(index)
  const zoneShapes = plan.rooms.flatMap((room) => {
    if (broken.has(room.id) || !zones.zoneOf.has(room.id)) return []
    const shape = tryRoomShape(room, index)
    return shape === null ? [] : [{ room, shape }]
  })
  return { rows, counts, taken: itemFloorTaken(sound, shapes), zoneTaken: zoneShapes.length === 0 ? new Map() : itemFloorTaken(sound, zoneShapes), leftOut }
}

/** "2 toilets, 1 basin", kinds with none left out; "no fixtures" when there are none. */
export function fixtureCountText(counts: Readonly<Record<ItemKind, number>>): string {
  const parts = ITEM_KINDS.filter((kind) => counts[kind] > 0).map((kind) => {
    const word = ITEM_KIND_WORDS[kind]
    return `${counts[kind]} ${word}${counts[kind] === 1 ? '' : 's'}`
  })
  return parts.length === 0 ? 'no fixtures' : parts.join(', ')
}
