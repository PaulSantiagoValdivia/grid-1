/**
 * CNT-8 with WRT-6 and HND-2: a zone's floor is its room's, so neither the give or take on an
 * area from a scan nor the room numbers count it again. The lab's studio, its walls marked
 * scanned, drawn once with its three parts as zones (and their dividing lines marked too) and
 * once as the one room without them, gives the same bands on the rooms, the floor and the plan,
 * and the same room schedule.
 */
import { describe, expect, it } from 'vitest'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { parseFloorPlan, type FloorPlan, type Room } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../survey'
import { planAreas } from '../areas'
import { roomSchedule } from '../schedule'

const STUDIO = 'A/scenarios/studio.json'
const LINES = ['kit-s', 'sleep-e']
const ZONES = ['sleep', 'living', 'kitchen']

function studio(zoned: boolean): FloorPlan {
  const plan = labPlan(STUDIO)
  const room: Room = { id: 'studio', name: 'Studio', boundary: ['ext-s', 'ext-e', 'bath-s', 'bath-w', 'ext-n', 'ext-w'] }
  const walls = plan.walls.filter((w) => zoned || !LINES.includes(w.id))
  return parseFloorPlan({
    ...plan,
    walls,
    rooms: [room, ...plan.rooms.flatMap((r) => (ZONES.includes(r.id) ? (zoned ? [{ ...r, partOf: 'studio' }] : []) : [r]))],
    marks: walls.map((w) => ({ part: 'wall', id: w.id, source: 'scanned', tolerance: 0.02 })),
  })
}

describe('zones in the areas from a scan and the room numbers (CNT-8, WRT-6, HND-2)', () => {
  const [zoned, plain] = [planAreas(surveyPlan(studio(true))), planAreas(surveyPlan(studio(false)))]

  it('adds no zone\'s give or take into the floor\'s or the plan\'s', () => {
    const zones = zoned.floors[0]!.rooms.filter((r) => r.zoneOf === 'studio')
    expect(zones.map((r) => r.id)).toEqual(ZONES)
    // Each zone has a band of its own, from the walls and dividing lines round it.
    for (const zone of zones) expect(zone.sureness?.plusMinus).toBeGreaterThan(0)
    expect(zoned.sureness).toBeDefined()
    expect(zoned.sureness).toEqual(plain.sureness)
    expect(zoned.floors[0]!.sureness).toEqual(plain.floors[0]!.sureness)
    expect(zoned.net).toBeCloseTo(plain.net, 9)
    const rooms = (areas: typeof zoned) => areas.floors[0]!.rooms.filter((r) => r.zoneOf === undefined).map((r) => [r.id, r.sureness])
    expect(rooms(zoned)).toEqual(rooms(plain))
  })

  it('numbers the rooms in the schedule as the room without zones', () => {
    const rows = (plan: FloorPlan) => roomSchedule(surveyPlan(plan)).rows.map((r) => [r.number, r.id])
    expect(rows(studio(true))).toEqual(rows(studio(false)))
    expect(rows(studio(true))).toEqual([[1, 'bath'], [2, 'studio']])
  })
})
