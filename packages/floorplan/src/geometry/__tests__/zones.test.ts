import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type Room } from '../../types/floorplan'
import { readingNotes } from '../../types/reading'
import { planAreaFigures } from '../areas'
import { buildScene } from '../scene3d'
import { indexPlan } from '../plan'
import { roomOverlaps } from '../overlaps'
import { floorGraph, openingSides, roomOutlines } from '../rules/graph'
import { floorSpaces, spacesKnown } from '../spaces'
import { validatePlan } from '../validate'
import { roomZones } from '../zones'
import { roomNumbers } from '../roomNumbers'
import { toIfc } from '../export/ifc'
import { entity, ofType, parseDoc, ref, refs, str, type Doc, type Value } from '../export/__tests__/step-reader'

/**
 * CNT-8 (lab EL-13, A-22): zones inside one room. The lab's studio is a 5.0 × 5.0 m room inside
 * its outer walls, with a shower room in one corner, split by two dividing lines into a sleeping
 * corner, a living area and a kitchenette. Drawn as zones, the three are kept, named and measured,
 * and the studio is the room: measured, counted and reached as a whole.
 */

const DATA = resolve(__dirname, '../../../../../scoreboard/data')

/** A plan the lab wrote, as the scoreboard keeps it. */
function labPlan(name: string): FloorPlan {
  const line = gunzipSync(readFileSync(resolve(DATA, 'lab-plans.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .find((l) => l.includes(`"name":${JSON.stringify(name)}`))
  if (!line) throw new Error(`no lab plan ${name}`)
  return parseFloorPlan(JSON.parse((JSON.parse(line) as { text: string }).text))
}

/** The studio round its own walls: everything inside the outer walls but the shower room. */
const STUDIO: Room = { id: 'studio', name: 'Studio', boundary: ['ext-s', 'ext-e', 'bath-s', 'bath-w', 'ext-n', 'ext-w'] }
const ZONES = ['sleep', 'living', 'kitchen']

/** The lab's studio with its three parts drawn as zones of one room. */
export function zonedStudio(studio: Partial<Room> = {}): FloorPlan {
  const plan = labPlan('A/scenarios/studio.json')
  return {
    ...plan,
    rooms: [{ ...STUDIO, ...studio }, ...plan.rooms.map((room) => (ZONES.includes(room.id) ? { ...room, partOf: 'studio' } : room))]
  }
}

const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((issue) => issue.code)

describe('zones inside one room (CNT-8)', () => {
  it('reads partOf as a field of the format, and names nothing as unknown', () => {
    const plan = zonedStudio()
    expect(plan.rooms.find((r) => r.id === 'sleep')?.partOf).toBe('studio')
    expect(readingNotes(JSON.parse(JSON.stringify(plan)))).toEqual([])
  })

  it('finds each zone and its room, and the dividing lines only zones list', () => {
    const zones = roomZones(indexPlan(zonedStudio()))
    expect(Object.fromEntries(zones.zoneOf)).toEqual({ sleep: 'studio', living: 'studio', kitchen: 'studio' })
    expect(zones.zones.get('studio')).toEqual(['sleep', 'living', 'kitchen'])
    expect([...zones.lines].sort()).toEqual(['kit-s', 'sleep-e'])
    expect(zones.faults).toEqual([])
  })

  it('leaves a zone and its room alone: no overlap, no space mismatch, no line across the room', () => {
    const plan = zonedStudio()
    expect(roomOverlaps(plan).overlaps).toEqual([])
    const spaces = floorSpaces(plan, 'ground')
    expect(spacesKnown(spaces) && spaces.mismatches).toEqual([])
    expect(spacesKnown(spaces) && spaces.unclaimed).toEqual([])
    // Only what the lab's own studio has: the drawing's checks find nothing new in the zones.
    const before = codes(labPlan('A/scenarios/studio.json'))
    expect(codes(plan).filter((code) => !before.includes(code))).toEqual([])
    expect(codes(plan)).not.toContain('room/overlap')
    expect(codes(plan)).not.toContain('wall/crosses-room')
    expect(codes(plan)).not.toContain('wall/stands-in-room')
  })

  it('still names two zones of one room that share floor', () => {
    const plan = zonedStudio()
    // The sleeping corner drawn over the living area too.
    const wide = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'sleep' ? { ...r, boundary: ['ext-s', 'ext-e', 'bath-s', 'kit-s', 'ext-w'] } : r)) }
    const found = roomOverlaps(wide).overlaps.map((o) => [...o.rooms].sort().join('+'))
    expect(found).toContain('living+sleep')
    expect(found).not.toContain('sleep+studio')
  })

  it('opens the door into the room, not one of its zones, and reaches every room but the zones', () => {
    const plan = zonedStudio()
    const index = indexPlan(plan)
    const outlines = roomOutlines(plan, index)
    const door = plan.openings.find((o) => o.id === 'door-entry')!
    expect(openingSides(door, index, outlines).filter((s) => s !== null)).toEqual(['studio'])
    const graph = floorGraph(plan)
    expect(graph.rooms).toEqual(['bath', 'studio'])
    expect(graph.exits.map((e) => e.room)).toEqual(['studio'])
    expect(graph.links.map((l) => l.rooms.join('+'))).toEqual(['bath+studio'])
    expect(codes(plan)).not.toContain('room/no-door')
  })

  it('counts every square metre once: zones are listed and measured, in no total', () => {
    const zoned = planAreaFigures(zonedStudio({ use: 'living' }))
    const asDrawn = planAreaFigures(labPlan('A/scenarios/studio.json'))
    const floor = zoned.floors[0]!
    const area = (id: string): number => floor.rooms.find((r) => r.id === id)!.area
    expect(floor.rooms.filter((r) => r.zoneOf === 'studio').map((r) => r.id)).toEqual(ZONES)
    // The studio is its zones together, and the net is the studio and the shower room.
    expect(area('studio')).toBeCloseTo(area('sleep') + area('living') + area('kitchen'), 1)
    expect(floor.net).toBeCloseTo(area('studio') + area('bath'), 9)
    // The zones' dividing lines are hairlines: the net is the same as drawn in four rooms.
    expect(floor.net).toBeCloseTo(asDrawn.floors[0]!.net, 1)
    // By use, each zone's floor goes to its own use, and the sliver between them to the first.
    expect(floor.byUse['bedroom']).toBeCloseTo(area('sleep'), 1)
    expect(floor.byUse['kitchen']).toBeCloseTo(area('kitchen'), 9)
    expect(Object.values(floor.byUse).reduce((a, b) => a + b, 0)).toBeCloseTo(floor.net, 9)
    // The gross figures add up as before: nothing lies off its space.
    expect(floor.offSpace).toBeCloseTo(0, 6)
    expect(floor.grossExternal).toBeCloseTo(asDrawn.floors[0]!.grossExternal!, 6)
  })

  it('draws one floor slab for the room, none for its zones', () => {
    const slabs = buildScene(zonedStudio()).slabs.map((slab) => slab.roomId).sort()
    expect(slabs).toEqual(['bath', 'studio'])
  })

  it('names a zone that is not in its room, and counts it as a room of its own', () => {
    const plan = zonedStudio()
    const with_ = (id: string, room: Partial<Room>): FloorPlan => ({ ...plan, rooms: plan.rooms.map((r) => (r.id === id ? { ...r, ...room } : r)) })
    const lines = (p: FloorPlan): string[] =>
      validatePlan(p).issues.filter((i) => i.code === 'room/zone-not-in-room').map((i) => i.message)
    expect(lines(with_('sleep', { partOf: 'nowhere' }))[0]).toContain('the plan has no room "nowhere" on floor "ground"')
    expect(lines(with_('sleep', { partOf: 'sleep' }))[0]).toContain('a room cannot be a zone of itself')
    expect(lines(with_('sleep', { partOf: 'kitchen' }))[0]).toContain('is a zone itself')
    // The shower room does not lie in the studio.
    const bath = with_('bath', { partOf: 'studio' })
    expect(lines(bath)[0]).toMatch(/^Room "bath" is marked as a zone of room "studio", but 3\.\d\d m² of it lies outside room "studio"/)
    expect(roomZones(indexPlan(bath)).zoneOf.has('bath')).toBe(false)
    expect(planAreaFigures(bath).floors[0]!.rooms.find((r) => r.id === 'bath')?.zoneOf).toBeNull()
  })
})

/** The studio drawn as the one room, without its zones or their dividing lines. */
function plainStudio(): FloorPlan {
  const plan = labPlan('A/scenarios/studio.json')
  const lines = [...roomZones(indexPlan(zonedStudio())).lines]
  return { ...plan, walls: plan.walls.filter((w) => !lines.includes(w.id)), rooms: [STUDIO, ...plan.rooms.filter((r) => !ZONES.includes(r.id))] }
}

/** Each space of an IFC file by its GlobalId: its fields and every property and quantity on it. */
function spacesOf(doc: Doc): Record<string, unknown> {
  const value = (v: Value | undefined): unknown => (v?.t === 'typed' ? value(v.v) : v?.t === 'num' ? Number(v.v.toFixed(9)) : v?.t === 'str' || v?.t === 'enum' ? v.v : null)
  const sets = new Map<number, Record<string, Record<string, unknown>>>()
  for (const rel of ofType(doc, 'IFCRELDEFINESBYPROPERTIES')) {
    const set = entity(doc, ref(rel.args[5]))
    const parts = refs(set.type === 'IFCPROPERTYSET' ? set.args[4] : set.args[5]).map((id) => entity(doc, id))
    const values = Object.fromEntries(parts.map((part) => [str(part.args[0]), value(part.args[part.type === 'IFCPROPERTYSINGLEVALUE' ? 2 : 3])]))
    for (const id of refs(rel.args[4])) sets.set(id, { ...sets.get(id), [str(set.args[2])]: values })
  }
  return Object.fromEntries(ofType(doc, 'IFCSPACE').map((s) => [str(s.args[0]), { name: str(s.args[2]), use: value(s.args[4]), longName: str(s.args[7]), sets: sets.get(s.id) ?? {} }]))
}

describe('zones in HND-2\'s IFC spaces and room numbers (CNT-8)', () => {
  const options = { projectId: 'zones', timestamp: new Date(0) }

  it('numbers no zone, so the rooms keep the numbers they have without zones', () => {
    expect(roomNumbers(zonedStudio())).toEqual(roomNumbers(plainStudio()))
    expect(roomNumbers(zonedStudio()).map((n) => n.id)).toEqual(['bath', 'studio'])
  })

  it('gives a room with zones the same spaces, numbers, areas and quantities as the room without them', () => {
    const [zoned, plain] = [spacesOf(parseDoc(toIfc(zonedStudio(), options))), spacesOf(parseDoc(toIfc(plainStudio(), options)))]
    expect(Object.keys(zoned)).toHaveLength(2)
    expect(zoned).toEqual(plain)
    expect(Object.values(zoned).map((s) => (s as { name: string; longName: string }).longName + ' ' + (s as { name: string }).name).sort()).toEqual(['Shower room 1', 'Studio 2'])
  })
})

describe('zones read back as rooms text (CNT-8, WRT-2)', () => {
  it('loses nothing: written again, every zone still names its room', async () => {
    const { readRoomsText } = await import('../../rooms/read')
    const { compileRoomsText } = await import('../../rooms/compile')
    const plan = zonedStudio()
    const again = compileRoomsText(readRoomsText(plan).text).plan!
    expect(again.rooms.filter((r) => r.partOf !== undefined).map((r) => [r.id, r.partOf])).toEqual(ZONES.map((id) => [id, 'studio']))
  })
})
