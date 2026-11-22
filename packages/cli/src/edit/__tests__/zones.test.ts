import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { inspectPlan } from '@ongrid/rules'
import { runGrid } from '../../command/main'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { planAreas } from '../../quantities/areas'
import { roomSchedule } from '../../quantities/schedule'
import { surveyPlan } from '../../quantities/survey'
import { describeText } from '../../describe/card'
import { planFacts } from '../../describe/facts'

/**
 * CNT-8, lab AB-9: merging the kitchen and the living room kept the first room's id and use, so
 * the flat lost its living room in silence. A merge of two rooms of different uses now asks for
 * the merged room's use, or keeps both as zones of one open-plan room, and the verdict names a
 * use the plan no longer has. The flat is the lab's two-bedroom flat (E), as WRT-3 has it.
 */

const FLAT = resolve(__dirname, '../../../../floorplan/fixtures/edits/flat-v00.json')
const flat = (): Record<string, unknown> => JSON.parse(readFileSync(FLAT, 'utf8')) as Record<string, unknown>

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': flat() })
})
afterAll(() => b.close())

const written = (file: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(b.folder, file), 'utf8')))
const data = (reply: { data: unknown }) => reply.data as { verdict: string; changed: string[]; guessed: string[]; doors: string[]; toLookAt: { before: number; after: number } }

describe('merging two rooms of different uses (CNT-8, lab AB-9)', () => {
  it('asks for the merged room\'s use, or zones, and writes nothing', async () => {
    const before = readFileSync(join(b.folder, 'plan.json'), 'utf8')
    const reply = await b.call('grid_merge_rooms', { room: 'kitchen', with: 'living', out: 'asked.json' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toBe(
      '"Kitchen" is used as kitchen and "Living room" as living, and one room has one use. Say the merged room\'s use with use (kitchen, living or another), or keep both uses with zones: true, as zones of one open-plan room. Nothing was written.'
    )
    expect(readFileSync(join(b.folder, 'plan.json'), 'utf8')).toBe(before)
  })

  it('with a use, names the use the plan loses in the verdict', async () => {
    const reply = await b.call('grid_merge_rooms', { room: 'kitchen', with: 'living', use: 'kitchen', out: 'one-use.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(data(reply).verdict).toMatch(/ The plan now has no room or zone used as living, which the plan before had\.$/)
    expect(written('one-use.json').rooms.map((r) => r.use)).not.toContain('living')
  })

  it('keeps both uses as zones of one open-plan room, and loses none', async () => {
    const reply = await b.call('grid_merge_rooms', { room: 'kitchen', with: 'living', zones: true, name: 'Kitchen and living', out: 'zones.json' })
    expect(reply.isError, reply.text).toBe(false)
    const plan = written('zones.json')
    const room = (id: string) => plan.rooms.find((r) => r.id === id)!
    // The merged room is new, round both; each room is kept as a zone, with its id, name and use.
    expect(room('kitchen-living').name).toBe('Kitchen and living')
    expect(room('kitchen-living').use).toBeUndefined()
    expect(room('kitchen')).toMatchObject({ name: 'Kitchen', use: 'kitchen', partOf: 'kitchen-living' })
    expect(room('living')).toMatchObject({ name: 'Living room', use: 'living', partOf: 'kitchen-living' })
    // The wall between them is a dividing line now, which the two zones list and the room does not.
    const line = plan.walls.find((w) => w.id === 'living-north-line')!
    expect(line.virtual).toBe(true)
    expect(plan.walls.some((w) => w.id === 'living-north')).toBe(false)
    expect(room('kitchen').boundary).toContain('living-north-line')
    expect(room('living').boundary).toContain('living-north-line')
    expect(room('kitchen-living').boundary).not.toContain('living-north-line')
    // The answer says so, loses no use, and no door is said to join other rooms.
    expect(data(reply).changed[1]).toMatch(/^"Kitchen and living" \("kitchen-living"\) is one room of the [\d.]+ m² of "Kitchen" and the [\d.]+ m² of "Living room", with [\d.]+ m² under the wall taken out\. "Kitchen" \(kitchen\) and "Living room" \(living\) are kept as its zones, with their ids, names and uses, on either side of the dividing line "living-north-line"\.$/)
    expect(data(reply).verdict).not.toMatch(/no room or zone used as/)
    expect(data(reply).doors).toEqual([])
    expect(data(reply).guessed).toEqual(['The merged room\'s id is "kitchen-living"; pass new_room for another.'])
    // Nothing new in the drawing: no overlap, no line across the room, no zone outside it.
    const codes = (p: FloorPlan): string[] => validatePlan(p).issues.map((i) => i.code)
    const before = codes(parseFloorPlan(flat()))
    expect(codes(plan).filter((code) => !before.includes(code))).toEqual([])
    expect(data(reply).toLookAt.after).toBeLessThanOrEqual(data(reply).toLookAt.before)
  })

  it('counts the open-plan room once: the same net as the one room E made by hand', async () => {
    const zoned = planAreas(surveyPlan(written('zones.json')))
    const byHand = planAreas(surveyPlan(parseFloorPlan(JSON.parse(readFileSync(resolve(FLAT, '../flat-v02.json'), 'utf8')))))
    expect(zoned.net).toBeCloseTo(byHand.net, 6)
    // By use, each zone keeps its floor: the plan still has a kitchen and a living room.
    expect(Object.keys(zoned.byUse)).toEqual(expect.arrayContaining(['kitchen', 'living']))
    const floor = zoned.floors[0]!
    expect(floor.rooms.filter((r) => r.zoneOf === 'kitchen-living').map((r) => r.id).sort()).toEqual(['kitchen', 'living'])
    // The room schedule numbers the room once, with its zones under it, and its total is the net.
    const schedule = roomSchedule(surveyPlan(written('zones.json')))
    expect(schedule.rows.map((r) => r.id)).not.toContain('kitchen')
    expect(schedule.rows.find((r) => r.id === 'kitchen-living')!.zones!.map((z) => z.id)).toEqual(['kitchen', 'living'])
    expect(schedule.total.area).toBeCloseTo(zoned.net, 9)
    expect(schedule.rows.reduce((sum, r) => sum + (r.area ?? 0), 0)).toBeCloseTo(zoned.net, 9)
  })

  it('checks the open-plan room as a whole, with the living room\'s use, never the zones on their own', () => {
    const result = inspectPlan(written('zones.json'))
    const size = result.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(size.lookedAt.flatMap((g) => g.ids)).toContain('kitchen-living')
    expect(size.wholeRooms).toEqual([{ floor: 'ground', room: 'kitchen-living', use: 'living', zone: 'living' }])
    expect(result.lines.filter((l) => l.code === 'room/overlap' || l.code === 'room/zone-not-in-room')).toEqual([])
  })

  it('describes each zone as part of its room, and counts the floor once', () => {
    const facts = planFacts(written('zones.json'))
    const text = describeText(facts, 'rooms', 'person')
    expect(text).toMatch(/: 5 rooms and 2 zones, [\d.]+ m²\./)
    expect(text).toMatch(/\n"?Kitchen"? \(a zone of "?Kitchen and living"?\): /)
    const floor = facts.floors[0]!
    expect(floor.area).toBeCloseTo(floor.rooms.filter((r) => r.zoneOf === undefined).reduce((sum, r) => sum + (r.shape?.area ?? 0), 0), 9)
    expect(describeText(facts, 'rooms', 'agent')).toMatch(/\nkitchen "Kitchen" kitchen .* zone-of:kitchen-living\n/)
  })

  it('refuses to merge a zone, or rooms with zones into zones', async () => {
    const zone = await b.call('grid_merge_rooms', { plan: 'zones.json', room: 'kitchen', with: 'hall', use: 'kitchen', out: 'no.json' })
    expect(zone.isError).toBe(true)
    expect(zone.text).toBe('"Kitchen" is a zone of room "kitchen-living"; merge rooms, not their zones. Nothing was written.')
  })

  it('names a use lost whatever the merge: the bathroom merged into a bedroom', async () => {
    const same = await b.call('grid_merge_rooms', { room: 'bed1', with: 'bath', use: 'bedroom', out: 'no-bath.json' })
    expect(same.isError, same.text).toBe(false)
    expect(data(same).verdict).toMatch(/no room or zone used as bathroom/)
  })
})

describe('grid edit merge (CNT-8)', () => {
  const made: string[] = []
  afterAll(() => {
    for (const path of made) rmSync(path, { recursive: true, force: true })
  })
  function project(): string {
    const dir = mkdtempSync(join(tmpdir(), 'grid-zones-'))
    made.push(dir)
    writeFileSync(join(dir, 'grid.json'), '{"version":1}\n')
    writeFileSync(join(dir, 'plan.json'), readFileSync(FLAT))
    return dir
  }
  async function grid(dir: string, ...args: string[]): Promise<{ status: number; out: string; err: string }> {
    let out = ''
    let err = ''
    const status = await runGrid(args, {
      stdout: (d) => (out += typeof d === 'string' ? d : Buffer.from(d).toString('utf8')),
      stderr: (text) => (err += text),
      stdoutIsTerminal: false,
      cwd: dir,
    })
    return { status, out, err }
  }

  it('asks, writes nothing, and keeps both uses with --zones', async () => {
    const dir = project()
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const asked = await grid(dir, 'edit', 'merge', '--room', 'kitchen', '--with', 'living')
    expect(asked.status).toBe(1)
    expect(asked.err).toMatch(/one room has one use\. Say the merged room's use with use \(kitchen, living or another\), or keep both uses with zones: true/)
    expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
    const kept = await grid(dir, 'edit', 'merge', '--room', 'kitchen', '--with', 'living', '--zones', '--new-room', 'open-plan')
    expect(kept.err).toBe('')
    expect(kept.status).toBe(0)
    expect(kept.out).toMatch(/are kept as its zones/)
    const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { rooms: Array<{ id: string; partOf?: string }> }
    expect(plan.rooms.filter((r) => r.partOf === 'open-plan').map((r) => r.id).sort()).toEqual(['kitchen', 'living'])
  })
})
