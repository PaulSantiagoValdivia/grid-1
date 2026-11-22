import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type Room } from '@ongrid/floorplan/types/floorplan'
import { checkLocalRules } from '../check'
import { inspectPlan } from '../../result'
import type { RulesReport } from '../types'

/**
 * CNT-8, lab EL-13 (A-22): split into zones, the studio's sleeping corner got "under 6.5 m²";
 * drawn as one room it got nothing. The size checks now read the whole room and say which use
 * they applied, so both drawings give the same result.
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

/** The lab's studio, every length times `k`, wall thicknesses kept. */
function studio(k = 1): FloorPlan {
  const plan = labPlan('A/scenarios/studio.json')
  if (k === 1) return plan
  const at = (p: readonly [number, number]): [number, number] => [p[0] * k, p[1] * k]
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, start: at(w.start), end: at(w.end) })),
    openings: plan.openings.map((o) => ({ ...o, offset: o.offset * k, width: o.width * k }))
  }
}

/** Drawn with zones: the studio is the room, and its three parts are zones of it. */
const zoned = (k = 1, own: Partial<Room> = {}): FloorPlan => {
  const plan = studio(k)
  return { ...plan, rooms: [{ ...STUDIO, ...own }, ...plan.rooms.map((r) => (ZONES.includes(r.id) ? { ...r, partOf: 'studio' } : r))] }
}

/** Drawn as one room with that use (null: none), and the shower room. */
const oneRoom = (k = 1, use: Room['use'] | null = 'bedroom'): FloorPlan => {
  const plan = studio(k)
  return { ...plan, rooms: [{ ...STUDIO, ...(use === null ? {} : { use }) }, ...plan.rooms.filter((r) => !ZONES.includes(r.id))] }
}

/** What the size and escape checks gave, room by room: the room, the code and the area. */
const result = (report: RulesReport, rule: string): unknown[] =>
  report.findings.filter((f) => f.ruleId === rule).map((f) => ({ room: f.rooms[0], code: f.code, area: f.area ?? null }))
const coverage = (report: RulesReport, rule: string) => report.coverage.find((c) => c.ruleId === rule)!

describe('size checks on a room with zones (CNT-8, lab EL-13)', () => {
  it('the studio split into four rooms: the sleeping corner is under the figure (the lab\'s finding)', () => {
    // The lab measured 6.16 m² when a dividing line still took 0.1 m; Grid draws it as a hairline now.
    const report = checkLocalRules(studio())
    expect(result(report, 'habitable-room-area')).toEqual([{ room: 'sleep', code: 'room_too_small', area: 6.41 }])
  })

  it('the studio drawn with zones and drawn as one room give the same size-check result', () => {
    const asZones = checkLocalRules(zoned())
    const asOne = checkLocalRules(oneRoom())
    expect(result(asZones, 'habitable-room-area')).toEqual([])
    expect(result(asZones, 'habitable-room-area')).toEqual(result(asOne, 'habitable-room-area'))
    expect(coverage(asZones, 'habitable-room-area').lookedAt).toEqual(coverage(asOne, 'habitable-room-area').lookedAt)
    expect(coverage(asZones, 'habitable-room-area').lookedAt).toEqual([{ floor: 'ground', ids: ['studio'] }])
    // No room is said to have no use: the studio's use is its sleeping corner's.
    expect(asZones.notChecked.filter((n) => n.reason === 'no_use')).toEqual([])
    // It says which use it applied, and where it read it.
    expect(coverage(asZones, 'habitable-room-area').wholeRooms).toEqual([{ floor: 'ground', room: 'studio', use: 'bedroom', zone: 'sleep' }])
    expect(coverage(asOne, 'habitable-room-area').wholeRooms).toBeUndefined()
    // The zones are looked at as part of the studio, never on their own.
    expect(coverage(asZones, 'habitable-room-area').skipped).toContainEqual(expect.objectContaining({ reason: 'part_of_room', ids: ['kitchen', 'living', 'sleep'] }))
  })

  it('gives the same result whether the studio states its own use or takes its zone\'s', () => {
    const own = checkLocalRules(zoned(1, { use: 'bedroom' }))
    expect(result(own, 'habitable-room-area')).toEqual(result(checkLocalRules(oneRoom()), 'habitable-room-area'))
    expect(coverage(own, 'habitable-room-area').wholeRooms).toEqual([{ floor: 'ground', room: 'studio', use: 'bedroom', zone: null }])
    // A kitchen's own use is not one the figure covers: its sleeping zone's is.
    const kitchen = checkLocalRules(zoned(1, { use: 'kitchen' }))
    expect(coverage(kitchen, 'habitable-room-area').wholeRooms).toEqual([{ floor: 'ground', room: 'studio', use: 'bedroom', zone: 'sleep' }])
  })

  it('a studio too small as a whole gets one finding on the room in both drawings, with the same area', () => {
    const asZones = checkLocalRules(zoned(0.55))
    const asOne = checkLocalRules(oneRoom(0.55))
    const found = result(asZones, 'habitable-room-area')
    expect(found).toHaveLength(1)
    expect(found).toEqual(result(asOne, 'habitable-room-area'))
    const finding = asZones.findings.find((f) => f.code === 'room_too_small')!
    expect(finding.rooms).toEqual(['studio', 'sleep'])
    expect(finding).toMatchObject({ use: 'bedroom', zone: 'sleep' })
    // The result line says it, in its found.
    const line = inspectPlan(zoned(0.55)).lines.find((l) => l.code === 'room/too-small')!
    expect(line.thing).toEqual({ kind: 'room', id: 'studio' })
    expect(line.also).toEqual(['sleep'])
    expect(line.found).toMatch(/ net, the whole room with its zones, checked as a bedroom, the use of its zone "Sleeping corner"$/)
  })

  it('checks escape from the whole room when one of its zones is a bedroom, as from one bedroom', () => {
    const asZones = checkLocalRules(zoned())
    const asOne = checkLocalRules(oneRoom())
    expect(result(asZones, 'escape-opening')).toEqual(result(asOne, 'escape-opening'))
    expect(coverage(asZones, 'escape-opening').lookedAt).toEqual([{ floor: 'ground', ids: ['studio'] }])
    expect(coverage(asZones, 'escape-opening').wholeRooms).toEqual([{ floor: 'ground', room: 'studio', use: 'bedroom', zone: 'sleep' }])
  })

  it('says a room with zones that state no use has none, as one room with none', () => {
    const plain = zoned()
    const noUses = { ...plain, rooms: plain.rooms.map((r) => (r.partOf === undefined ? r : { ...r, use: undefined })) }
    const asZones = checkLocalRules(noUses)
    const asOne = checkLocalRules(oneRoom(1, null))
    expect(asZones.notChecked.filter((n) => n.reason === 'no_use').map((n) => n.rooms)).toEqual([['studio']])
    expect(asOne.notChecked.filter((n) => n.reason === 'no_use').map((n) => n.rooms)).toEqual([['studio']])
  })

  it('reaches the studio through its door, and gives the zones no route check of their own', () => {
    const report = checkLocalRules(zoned())
    expect(report.findings.filter((f) => f.code === 'room_without_door' || f.code === 'no_route_to_exit')).toEqual([])
    const door = coverage(report, 'room-has-door')
    expect(door.lookedAt).toEqual([{ floor: 'ground', ids: ['bath', 'studio'] }])
    expect(door.skipped).toContainEqual(expect.objectContaining({ reason: 'part_of_room', ids: ['kitchen', 'living', 'sleep'] }))
  })
})
