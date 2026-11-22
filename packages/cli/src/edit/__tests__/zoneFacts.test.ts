/**
 * CNT-8 with CNT-9: two rooms merged with `zones` keep their facts of the person's own and their
 * stated numbers as zones, and the merged room gets what a merged room gets without zones: the
 * first room's number and facts, with the second's it does not carry. So the room numbers, the
 * schedule's totals and `grid_count`'s groups are the ones main's merge gives, and no zone is
 * numbered or counted besides its room. The plan is CNT-9's stand-in office, every room numbered.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dxfFactsOf, planForFloor, roomNumbers } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { bench, type Bench, type Reply } from '../../mcp/__tests__/replay/harness'
import { roomSchedule } from '../../quantities/schedule'
import { surveyPlan } from '../../quantities/survey'

let b: Bench
let zoned: FloorPlan
let one: FloorPlan
let reply: Reply
beforeAll(async () => {
  b = bench({ 'zones.json': factsOffice(), 'one.json': factsOffice() })
  reply = await b.call('grid_merge_rooms', { plan: 'zones.json', room: 'g-office', with: 'g-meeting', zones: true })
  expect(reply.isError, reply.text).toBe(false)
  const merged = await b.call('grid_merge_rooms', { plan: 'one.json', room: 'g-office', with: 'g-meeting' })
  expect(merged.isError, merged.text).toBe(false)
  zoned = onDisk('zones.json')
  one = onDisk('one.json')
})
afterAll(() => b.close())

function onDisk(file: string): FloorPlan {
  return parseFloorPlan(JSON.parse(readFileSync(join(b.folder, file), 'utf8')))
}

const room = (plan: FloorPlan, id: string) => plan.rooms.find((r) => r.id === id)!
// The merged room's id: the first room's without zones, a new one with them.
const same = (id: string): string => (id === 'g-office-g-meeting' ? 'g-office' : id)

describe('a zones merge keeps CNT-9\'s facts and numbers (CNT-8)', () => {
  it('keeps each zone\'s facts and number, and gives the merged room the first room\'s', () => {
    expect(room(zoned, 'g-office')).toMatchObject({ partOf: 'g-office-g-meeting', number: 'G.02', properties: { department: 'Sales', 'head count': 8, finish: 'Carpet' } })
    expect(room(zoned, 'g-meeting')).toMatchObject({ partOf: 'g-office-g-meeting', number: 'G.03', properties: { department: 'Sales', 'head count': 6, finish: 'Carpet' } })
    expect(room(zoned, 'g-office-g-meeting').number).toBe(room(one, 'g-office').number)
    expect(room(zoned, 'g-office-g-meeting').properties).toEqual(room(one, 'g-office').properties)
    // What the second room said otherwise, and its number, are named, never dropped in silence.
    expect(reply.text).toContain('"Open office and Meeting room" takes the room number of "Open office", "G.02".')
    expect(reply.text).toContain('"head count"')
    expect(reply.text).toContain('The room number of "Meeting room", "G.03", stays on it as a zone but is not shown')
  })

  it('numbers the rooms as main\'s merge does, and no zone', () => {
    const numbers = (plan: FloorPlan) => roomNumbers(plan).map((n) => [n.number, n.stated, n.floor, same(n.id)])
    expect(numbers(zoned)).toEqual(numbers(one))
    expect(roomNumbers(zoned).map((n) => n.id)).not.toContain('g-meeting')
    expect(roomNumbers(zoned).map((n) => n.id)).not.toContain('g-office')
  })

  it('gives the room schedule main\'s rows and totals, with each zone\'s facts under its room', () => {
    const [z, o] = [roomSchedule(surveyPlan(zoned)), roomSchedule(surveyPlan(one))]
    const rows = (s: typeof z) => s.rows.map((r) => [r.number, r.roomNumber, same(r.id), r.properties])
    expect(rows(z)).toEqual(rows(o))
    expect(z.floors.map((f) => f.rooms)).toEqual(o.floors.map((f) => f.rooms))
    expect(z.total.rooms).toBe(o.total.rooms)
    expect(z.total.area).toBeCloseTo(o.total.area, 2)
    const zones = z.rows.find((r) => r.id === 'g-office-g-meeting')!.zones!
    expect(zones.map((zone) => [zone.id, zone.properties['head count']])).toEqual([['g-meeting', 6], ['g-office', 8]])
  })

  it('counts by a fact as main\'s merge does, the zones counted with their room', async () => {
    const count = async (plan: string) => {
      const r = await b.call('grid_count', { plan, kind: ['room'], by: 'department', sum: ['head count'] })
      expect(r.isError, r.text).toBe(false)
      return r
    }
    const [z, o] = [await count('zones.json'), await count('one.json')]
    const groups = (r: Reply) => (r.data!['groups'] as { value: string; count: number; sums: object; ids: string[] }[]).map((g) => [g.value, g.count, g.sums, g.ids.map(same)])
    expect(groups(z)).toEqual(groups(o))
    expect(z.data!['total']).toEqual(o.data!['total'])
    expect(z.text).toContain('Not counted: 2 zones of a room, counted with the room: "g-meeting", "g-office".')
    // A zone has no number of its own to find; the room has the first room's.
    const found = await b.call('grid_find', { plan: 'zones.json', kind: ['room'], where: ['number = G.02'] })
    expect(found.data!['ids']).toEqual(['g-office-g-meeting'])
  })

  it('writes no room number for a zone in the DXF, and keeps its facts there', () => {
    const facts = dxfFactsOf(planForFloor(zoned, 'ground'), null).parts
    const of = (id: string) => facts.find((p) => p.id === id)
    expect(of('g-office')).toEqual({ id: 'g-office', properties: room(zoned, 'g-office').properties })
    expect(of('g-meeting')?.number).toBeUndefined()
    expect(of('g-office-g-meeting')?.number).toBe('G.02')
  })
})
