import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { wallAxis, type FloorPlan } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../../quantities/survey'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/**
 * WRT-3, lab WR-2: the six requests a person made of the two-bedroom flat in the lab (E), each
 * as one call, on E's version before it, compared with the version E made by hand. Walls are
 * compared by where they are (their ids are names), rooms and openings by id, everything to the
 * millimetre. An opening's anchor, which E's files cannot have, is left out of the comparison.
 */

const FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures/edits')
const raw = (name: string): Record<string, unknown> => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as Record<string, unknown>

const mm = (v: number): string => (Math.round(v * 1000) / 1000).toFixed(3)
const point = (p: { x: number; y: number }): string => `${mm(p.x)},${mm(p.y)}`

/** What a plan is, in words that do not depend on ids of walls or on which way a wall runs. */
function picture(plan: FloorPlan, openingIds: Record<string, string> = {}): Map<string, string> {
  const out = new Map<string, string>()
  const wallKey = new Map<string, string>()
  for (const w of plan.walls) {
    const ends = [`${mm(w.start[0])},${mm(w.start[1])}`, `${mm(w.end[0])},${mm(w.end[1])}`].sort().join(' ')
    const key = `wall ${ends}`
    wallKey.set(w.id, key)
    out.set(key, `t ${mm(w.thickness)} h ${mm(w.height)} ${w.kind}${w.virtual ? ' virtual' : ''} ${w.floor ?? 'ground'}`)
  }
  const survey = surveyPlan(plan)
  for (const r of plan.rooms) {
    const walls = r.boundary.map((id) => wallKey.get(id) ?? `missing ${id}`).sort().join(' | ')
    out.set(`room ${r.id}`, `${r.name} / ${r.use ?? '-'} / ${r.floor ?? 'ground'} / ${mm(survey.byId.get(r.id)?.facts.shape?.area ?? -1)} m2 / ${walls}`)
  }
  for (const o of plan.openings) {
    const wall = plan.walls.find((w) => w.id === o.wall)!
    const axis = wallAxis(wall)
    const at = (s: number) => ({ x: axis.start.x + axis.dir.x * s, y: axis.start.y + axis.dir.y * s })
    const ends = [point(at(o.offset)), point(at(o.offset + o.width))].sort().join(' ')
    const facts = survey.facts.openings.get(o.id)
    const side = (i: number): string => {
      const s = facts?.sides[i]
      return typeof s === 'object' && s !== null ? s.room : String(s)
    }
    const opens = o.swing === undefined ? 'no swing' : `opens into ${side(o.swing === 'left' ? 0 : 1)}, hinge at ${point(at(o.hinge === 'end' ? o.offset + o.width : o.offset))}`
    out.set(`opening ${openingIds[o.id] ?? o.id}`, `${o.type} ${ends} w ${mm(o.width)} h ${mm(o.height)} sill ${mm(o.sill)} ${o.type === 'door' ? opens : ''} on ${wallKey.get(o.wall)}`)
  }
  return out
}

/** Every way two plans differ, one line each. */
function differences(mine: FloorPlan, theirs: FloorPlan, openingIds: Record<string, string> = {}): string[] {
  const a = picture(mine, openingIds)
  const b = picture(theirs)
  const lines: string[] = []
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(key) !== b.get(key)) lines.push(`${key}: mine ${a.get(key) ?? 'none'}; by hand ${b.get(key) ?? 'none'}`)
  }
  return lines.sort()
}

let b: Bench
const files: Record<string, unknown> = {}
for (const v of ['00', '01', '02', '03', '04', '05']) files[`v${v}.json`] = raw(`flat-v${v}`)
beforeAll(() => {
  b = bench(files)
})
afterAll(() => b.close())

const written = (file: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(b.folder, file), 'utf8')))
const byHand = (v: string): FloorPlan => parseFloorPlan(raw(`flat-v${v}`))

describe("E's six requests, one call each", () => {
  it('1. kitchen 1 m deeper: the same walls and rooms as by hand; the living-room door is said not to be kept', async () => {
    const reply = await b.call('grid_move_room_side', { plan: 'v00.json', room: 'kitchen', side: 'south', to: 4.0, out: 'r1.json' })
    expect(reply.isError, reply.text).toBe(false)
    const diff = differences(written('r1.json'), byHand('01'))
    // By hand, E carried the door 1 m with the wall, into the bedroom's wall: it joins the living
    // room and bedroom 1 there (lab WR-3). Grid leaves it, and says it could not keep it.
    expect(diff).toHaveLength(1)
    expect(diff[0]).toMatch(/^opening door-living:/)
    const data = reply.data as { couldNotKeep: string[]; guessed: string[]; doors: string[] }
    expect(data.couldNotKeep).toEqual(['door "door-living" could not stay between the same rooms: they no longer share enough wall where it is. It was left in place.'])
    expect(data.guessed[0]).toBe('"Living room" gives the 1.00 m: the wall is its side too.')
    expect(data.doors).toEqual(['"door-living" joined "hall" and "living"; it now joins "hall" and "kitchen".'])
    expect(reply.text.split('\n')[1]).toBe('"Kitchen": inside depth (north-south) 3.00 → 4.00 m.')
  })

  it('2. knock the kitchen and living room into one: the same plan as by hand', async () => {
    // CNT-8 (lab AB-9): two uses are never made one in silence. E kept the living room's by hand.
    const reply = await b.call('grid_merge_rooms', { plan: 'v01.json', room: 'living', with: 'kitchen', name: 'Kitchen and living', use: 'living', out: 'r2.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(differences(written('r2.json'), byHand('02'))).toEqual([])
    expect(reply.text).toMatch(/Removed opening "pass-kitchen-living": it was in the wall taken out\./)
    expect(reply.text).toMatch(/The plan now has no room or zone used as kitchen, which the plan before had\./)
  })

  it('3. the bathroom door to the other wall: the same plan as by hand', async () => {
    const reply = await b.call('grid_change_opening', { plan: 'v02.json', opening: 'door-bath', room: 'bath', side: 'north', from: 'west', distance: 0.25, out: 'r3.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(differences(written('r3.json'), byHand('03'))).toEqual([])
    expect(written('r3.json').openings.find((o) => o.id === 'door-bath')!.anchor).toEqual({ from: 'west', room: 'bath' })
  })

  it('4. bedroom 2 into a study and a second bathroom: the same plan as by hand', async () => {
    const reply = await b.call('grid_split_room', {
      plan: 'v03.json', room: 'bed2', side: 'east', size: 1.4, new_room: 'bath2', new_name: 'Bathroom 2', new_use: 'bathroom',
      name: 'Study', use: 'other', wall: 'study-east', door_width: 0.7, door_from: 'south', door_distance: 1.35, out: 'r4.json',
    })
    expect(reply.isError, reply.text).toBe(false)
    expect(differences(written('r4.json'), byHand('04'))).toEqual([])
    expect((reply.data as { couldNotKeep: string[] }).couldNotKeep).toEqual(['"Study" has no window now: its window is in "Bathroom 2".'])
  })

  it('4b. a new wall that would end in a window is refused, with the nearest size clear of it (MSG-16)', async () => {
    const reply = await b.call('grid_split_room', { plan: 'v03.json', room: 'bed2', side: 'north', size: 1, new_room: 'box', new_name: 'Box room', door_width: 0, out: 'r4b.json' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^The new wall would end inside window "win-bed2" of wall "ext-east", on the east side of ".+"\. The nearest size clear of it is 0\.45 m across from the north side; or move the window first\. Nothing was written\.$/)
  })

  it('5. a 3 x 4 m extension at the back with sliding doors: the same plan as by hand, the door with no swing', async () => {
    const reply = await b.call('grid_add_room', {
      plan: 'v04.json', room: 'extension', name: 'Garden room', use: 'living', against: 'living', side: 'south', width: 3, depth: 4, size: 'centre',
      from: 'west', distance: 0.8, in_the_way: 'remove', opening_width: 2.4, door_width: 2.2, out: 'r5.json',
    })
    expect(reply.isError, reply.text).toBe(false)
    expect(differences(written('r5.json'), byHand('05'), { 'door-extension': 'slide-garden' })).toEqual([])
    expect(reply.text).toMatch(/Removed window "win-living-south": it was in the wall the new room covers\./)
    expect((reply.data as { guessed: string[] }).guessed.join('\n')).toMatch(/no swing drawn, as a sliding or folding door would have/)
  })

  it('5b. left to say what happens to the window in the way, it is refused in one line naming it', async () => {
    const reply = await b.call('grid_add_room', { plan: 'v04.json', room: 'extension', name: 'Garden room', against: 'living', side: 'south', width: 3, depth: 4, size: 'centre', from: 'west', distance: 0.8, out: 'r5b.json' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toBe('window "win-living-south" is in the stretch of wall the new room covers: pass in_the_way remove to take it out, or keep to keep it between the two rooms. Nothing was written.')
  })

  it('6. the whole flat 30 cm wider: the same plan as by hand, with the entrance where it was', async () => {
    const reply = await b.call('grid_stretch', { plan: 'v05.json', side: 'east', by: 0.3, out: 'r6.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(differences(written('r6.json'), byHand('06'))).toEqual([])
    expect(reply.text).toMatch(/door "door-entrance" stays where it was: its wall grew at its start, so its offset is 0\.30 m longer\./)
  })
})

describe('openings that stay put (WR-4)', () => {
  it('keeps the entrance off the wall junction when the flat is widened', async () => {
    await b.call('grid_stretch', { plan: 'v00.json', side: 'east', by: 0.3, out: 'wide.json' })
    const plan = written('wide.json')
    const door = plan.openings.find((o) => o.id === 'door-entrance')!
    const wall = plan.walls.find((w) => w.id === door.wall)!
    const axis = wallAxis(wall)
    const span = [door.offset, door.offset + door.width].map((s) => axis.start.x + axis.dir.x * s).sort((x, y) => x - y) as [number, number]
    expect(span.map((x) => Math.round(x * 1000) / 1000)).toEqual([4.85, 5.75])
    // No wall that meets the north wall stands in the doorway.
    for (const other of plan.walls) {
      if (other.id === wall.id || other.start[0] !== other.end[0]) continue
      const half = other.thickness / 2
      expect(other.start[0] + half <= span[0] || other.start[0] - half >= span[1], other.id).toBe(true)
    }
  })

  it('keeps an opening anchored to a room corner at its distance within 1 mm when the wall moves', async () => {
    // Bedroom 2's door, kept from the bedroom's south side: then that side moves 0.3 m south.
    const pinned = await b.call('grid_change_opening', { plan: 'v00.json', opening: 'door-bed2', room: 'bed2', from: 'south', out: 'pinned.json' })
    expect(pinned.isError, pinned.text).toBe(false)
    expect(pinned.text.split('\n')[1]).toBe('door "door-bed2" keeps its place from the south side of "Bedroom 2" when walls move.')
    const gap = (plan: FloorPlan): number => {
      const survey = surveyPlan(plan)
      const face = Math.min(...survey.byId.get('bed2')!.polygon.map((p) => p.y))
      const door = plan.openings.find((o) => o.id === 'door-bed2')!
      const wall = plan.walls.find((w) => w.id === door.wall)!
      return wall.start[1] + door.offset - face
    }
    const before = gap(written('pinned.json'))
    const moved = await b.call('grid_move_room_side', { plan: 'pinned.json', room: 'bed2', side: 'south', by: 0.3, out: 'moved.json' })
    expect(moved.isError, moved.text).toBe(false)
    expect(Math.abs(gap(written('moved.json')) - before)).toBeLessThanOrEqual(0.001)
    expect(written('moved.json').openings.find((o) => o.id === 'door-bed2')!.offset).toBeCloseTo(1.7, 6)
  })

  it('keeps an opening anchored to the far end of its wall at its distance from that end', async () => {
    await b.call('grid_change_opening', { plan: 'v00.json', opening: 'door-entrance', from: 'west', out: 'west.json' })
    const plan = written('west.json')
    expect(plan.openings.find((o) => o.id === 'door-entrance')!.anchor).toEqual({ from: 'west' })
    await b.call('grid_stretch', { plan: 'west.json', side: 'east', by: 0.3, out: 'west-wide.json' })
    const after = written('west-wide.json')
    const door = after.openings.find((o) => o.id === 'door-entrance')!
    // ext-north runs east to west: its west end is its end, which did not move.
    expect(door.offset).toBeCloseTo(3.75, 6)
  })
})

describe('rename and a change of use (AB-8)', () => {
  it('renames a room and says which checks now apply differently', async () => {
    const reply = await b.call('grid_rename_room', { plan: 'v00.json', room: 'bed2', name: 'Study', use: 'other', out: 'study.json' })
    expect(reply.isError, reply.text).toBe(false)
    // MSG-3: the label leads every answer; the receipt follows it.
    const lines = reply.text.split('\n')
    expect(lines[0]).toBe('General guidance, not your local rules')
    expect(lines.slice(1, 4)).toEqual([
      'Renamed "Bedroom 2" to "Study".',
      '"Study" is used as other now, not bedroom.',
      'Checks that no longer do: Rooms people live or sleep in have a minimum floor area; Bedrooms have a window or door to the outside someone can escape through.',
    ])
    expect((reply.data as { checks: unknown }).checks).toEqual({ now: [], noLonger: ['habitable-room-area', 'escape-opening'] })
    const plan = written('study.json')
    expect(plan.rooms.find((r) => r.id === 'bed2')).toMatchObject({ name: 'Study', use: 'other' })
  })

  it('says when a change of use brings a check in', async () => {
    const reply = await b.call('grid_rename_room', { plan: 'v00.json', room: 'living', use: 'bedroom', out: 'living-bed.json' })
    expect(reply.text.split('\n')[2]).toBe('Checks that now look at it: Bedrooms have a window or door to the outside someone can escape through.')
  })

  it('renames only, and says the same checks apply', async () => {
    const reply = await b.call('grid_rename_room', { plan: 'v00.json', room: 'kitchen', name: 'Cocina', out: 'es.json' })
    expect(reply.text.split('\n')[1]).toBe('Renamed "Kitchen" to "Cocina".')
    expect((reply.data as { checks: unknown }).checks).toEqual({ now: [], noLonger: [] })
  })
})
