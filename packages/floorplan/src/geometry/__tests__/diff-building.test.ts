/**
 * WRT-8: two versions compared by what stands where in the building, not by ids.
 *
 * The cases are the lab's (WR-8, Y-4, RT-8, U-4), rebuilt on the repository's own fixtures: the
 * two-bedroom flat (`two-bed-flat.json`) and the same flat written rooms first
 * (`rooms/flat.rooms`). "Today" in a test name is what the id diff alone says of the same pair.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { alignPlans, compareBuildings, diffPlans, sameRing } from '../diff'

const FIXTURES = resolve(__dirname, '../../../fixtures')
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, 'two-bed-flat.json'), 'utf8')))
const roomsText = (): string => readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8')

/** Rooms text written as `grid write` writes it: with what it records of how it was written. */
function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { ...plan, written: stampFor(plan) }
}

/** Every id new, every wall drawn the other way round, the lists in another order, the origin moved and every point slipped a little. */
function renamedAndMoved(plan: FloorPlan, shift: readonly [number, number], slip = 0.004): FloorPlan {
  const walls = new Map(plan.walls.map((w, i) => [w.id, `wall-${i + 1}`] as const))
  const openings = new Map(plan.openings.map((o, i) => [o.id, `${o.type}-${i + 1}`] as const))
  const rooms = new Map(plan.rooms.map((r, i) => [r.id, `room-${i + 1}`] as const))
  const lengths = new Map(plan.walls.map((w) => [w.id, Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])] as const))
  const at = (p: readonly [number, number], k: number): [number, number] => [p[0] + shift[0] + slip * (k % 2), p[1] + shift[1] - slip * (k % 3 === 0 ? 1 : 0)]
  return {
    ...plan,
    walls: plan.walls.map((w, i) => ({ ...w, id: walls.get(w.id)!, start: at(w.end, i), end: at(w.start, i + 1) })).reverse(),
    openings: plan.openings
      .map((o) => ({
        ...o,
        id: openings.get(o.id)!,
        wall: walls.get(o.wall)!,
        offset: lengths.get(o.wall)! - o.offset - o.width,
        ...(o.hinge ? { hinge: o.hinge === 'start' ? ('end' as const) : ('start' as const) } : {}),
        ...(o.swing ? { swing: o.swing === 'left' ? ('right' as const) : ('left' as const) } : {})
      }))
      .reverse(),
    rooms: plan.rooms.map((r) => ({ ...r, id: rooms.get(r.id)!, boundary: [...r.boundary].reverse().map((id) => walls.get(id)!) })).reverse()
  }
}

describe('the same building under new ids (done-when 1, lab WR-8 and Y-4)', () => {
  it('compares as no change, with one line saying how many ids were renamed', () => {
    const before = flat()
    const after = renamedAndMoved(before, [0.15, -0.15])
    // Today: the id diff alone lists every part as removed and added.
    expect(diffPlans(before, after).changes.length).toBe(56)

    const compared = compareBuildings(before, after)
    expect(compared.changes).toEqual([])
    expect(compared.sameBuilding).toBe(true)
    expect(compared.renamed).toMatchObject({ count: 28, walls: 9, openings: 13, rooms: 6 })
    expect(compared.issues).toEqual([])
    expect(compared.verdict).toContain('Same building, 28 ids renamed (9 walls, 13 openings, 6 rooms)')
    expect(compared.shift[0]).toBeCloseTo(0.15, 2)
    expect(compared.diff.changes).toEqual([])
  })

  it('reads the flat written rooms first and the one drawn by hand as one building (Y-4)', () => {
    const byHand = renamedAndMoved(flat(), [0.15, 0.15], 0)
    const compared = compareBuildings(byHand, written(roomsText()))
    expect(compared.changes).toEqual([])
    expect(compared.renamed.count).toBeGreaterThan(0)
    expect(compared.verdict).toMatch(/^Same building, \d+ ids renamed/)
  })

  it('still says what changed in a building that kept its walls but lost a figure', () => {
    const before = flat()
    const after = renamedAndMoved({ ...before, walls: before.walls.map((w) => ({ ...w, height: 2.7 })) }, [0, 0], 0)
    const compared = compareBuildings(before, after)
    expect(compared.changes.map((c) => c.text)).toEqual([expect.stringMatching(/^9 walls height 2\.60 → 2\.70 m: /)])
    expect(compared.renamed.count).toBe(28)
  })
})

describe('walls drawn in other pieces (lab RT-8: the same flat with one wall per stretch)', () => {
  it('reads the outside wall cut in two where the rooms meet, either way, as the same building', () => {
    const before = flat()
    const south = before.walls.find((w) => w.id === 'ext-south')!
    const cutAt = 4.6
    const after: FloorPlan = {
      ...before,
      walls: [...before.walls.filter((w) => w.id !== 'ext-south'), { ...south, id: 'south-a', end: [cutAt, 0] }, { ...south, id: 'south-b', start: [south.end[0], 0], end: [cutAt, 0] }],
      openings: before.openings.map((o) => {
        if (o.wall !== 'ext-south') return o
        const middle = o.offset + o.width / 2
        return middle < cutAt ? { ...o, wall: 'south-a' } : { ...o, wall: 'south-b', offset: south.end[0] - o.offset - o.width }
      }),
      rooms: before.rooms.map((r) => ({ ...r, boundary: r.boundary.map((id) => (id !== 'ext-south' ? id : r.id === 'living' ? 'south-a' : 'south-b')) }))
    }
    expect(diffPlans(before, after).changes.length).toBeGreaterThan(0)
    for (const [a, b] of [[before, after], [after, before]] as const) {
      const compared = compareBuildings(a, b)
      expect(compared.changes).toEqual([])
      expect(compared.redrawn).toHaveLength(1)
    }
    expect(compareBuildings(before, after).verdict).toBe('Same building, 1 wall drawn as 2 pieces standing where it stood: every room, wall and opening stands where it stood.')
  })
})

describe('a one-number edit to a flat written rooms first (done-when 2, lab RT-8)', () => {
  const base = (): FloorPlan => written(roomsText())
  const wider = (): FloorPlan => written(roomsText().replace('living   4.4 x 4.2', 'living   4.7 x 4.2'))

  it('has at most two change lines, and says the kitchen door stayed where it was', () => {
    const [before, after] = [base(), wider()]
    // Today: 23 changes, the kitchen door "moved to another wall; moved 4.40 m along its wall".
    expect(diffPlans(before, after).changes.length).toBe(23)
    expect(diffPlans(before, after).changes.find((c) => c.entity.id === 'door-kitchen')?.summary).toContain('moved 4.40 m')

    const compared = compareBuildings(before, after)
    expect(compared.roomsFirst).toBe(true)
    expect(compared.changes.length).toBeLessThanOrEqual(2)
    expect(compared.changes.map((c) => c.text)).toEqual([
      '"Living room" 18.48 m² → 19.74 m² (4.40 × 4.20 m → 4.70 × 4.20 m)',
      '"Bedroom 1", "Hall", "Bathroom" and "Bedroom 2" moved 0.30 m east on the drawing, as they were'
    ])
    expect(compared.changes.some((c) => c.entities.some((e) => e.id === 'door-kitchen'))).toBe(false)
    expect(compared.stayed.find((s) => s.opening === 'door-kitchen')?.text).toBe(
      'Door "door-kitchen" stayed where it was, in "Hall" and "Kitchen", on the wall that replaced its own'
    )
    expect(compared.issues).toEqual([])
  })

  it('reads a room given another short name as the same room (RT-8: 10 changes today)', () => {
    const renamed = written(roomsText().replace(/\bbed1\b/g, 'study'))
    expect(diffPlans(base(), renamed).changes.length).toBeGreaterThan(0)
    const compared = compareBuildings(base(), renamed)
    expect(compared.changes).toEqual([])
    expect(compared.issues).toEqual([])
    expect(compared.renamed.pairs).toContainEqual({ type: 'room', before: 'bed1', after: 'study' })
  })

  it('keeps the scope check to the rooms named, and names what moved outside them', () => {
    const compared = compareBuildings(base(), wider(), { rooms: ['living'] })
    expect(compared.scope.checked).toBe(true)
    expect(compared.scope.outside.map((c) => c.text)).toEqual([expect.stringContaining('moved 0.30 m east')])
    expect(compared.verdict).toContain('1 change outside the rooms named ("living")')
  })

  it('marks for a picture what was removed, what was added and the room that grew', () => {
    const { marks } = compareBuildings(base(), wider())
    expect(marks.removed.walls).toContain('w-x4.6')
    expect(marks.added.walls).toEqual(expect.arrayContaining(['w-living-east', 'w-kitchen-hall']))
    expect(marks.changedRooms).toContainEqual({ room: 'living', label: 'Living room: 18.48 m² to 19.74 m²' })
  })
})

describe('a room list read as a ring (lab U-4)', () => {
  it('reads the same walls from another wall, or the other way round, as no change', () => {
    expect(sameRing(['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b'])).toBe(true)
    expect(sameRing(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'])).toBe(true)
    expect(sameRing(['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd'])).toBe(false)
    const before = flat()
    const after = { ...before, rooms: before.rooms.map((r) => (r.id === 'bed2' ? { ...r, boundary: [...r.boundary.slice(1), r.boundary[0]!] } : r)) }
    expect(diffPlans(before, after).changes).toEqual([])
    expect(compareBuildings(before, after).changes).toEqual([])
  })
})

describe('the issues, first', () => {
  it('names a door that now joins other rooms and a wall that now meets a window', () => {
    const before = flat()
    // A wall across Bedroom 2, from the hall to the outside wall, ending inside its window.
    const bed2 = before.openings.find((o) => o.id === 'win-bed2')!
    const host = before.walls.find((w) => w.id === bed2.wall)!
    const y = host.start[1] + bed2.offset + bed2.width / 2
    const after: FloorPlan = {
      ...before,
      walls: [...before.walls, { id: 'split', start: [6, y], end: [host.start[0], y], thickness: 0.1, height: 2.6, kind: 'interior' }]
    }
    const compared = compareBuildings(before, after)
    expect(compared.issues.map((i) => i.code)).toContain('opening_crossed')
    expect(compared.issues.find((i) => i.code === 'opening_crossed')!.message).toBe('Wall "split" now meets wall "ext-east" inside window "win-bed2"')
    expect(compared.verdict).toMatch(/^\d+ issues? to look at first\./)
  })

  it('says which notes of the drawing check came and went, following renamed ids', () => {
    const before = flat()
    const after = renamedAndMoved(before, [0, 0], 0)
    const note = (code: string, id: string): { code: string; thing: { kind: string; id: string }; also: string[]; message: string } => ({ code, thing: { kind: 'room', id }, also: [], message: `${code} on ${id}` })
    const compared = compareBuildings(before, after, { notes: { before: [note('room/too-small', 'bed2'), note('room/no-window', 'hall')], after: [note('room/too-small', 'room-6'), note('room/no-door', 'room-1')] } })
    expect(compared.issues.map((i) => [i.code, i.message])).toEqual([
      ['note_added', 'New note room/no-door: room/no-door on room-1'],
      ['note_gone', 'Note gone room/no-window: room/no-window on hall']
    ])
  })
})

describe('laying one version on the other', () => {
  it('pairs walls by place before id, and keeps a pair the other way round', () => {
    const before = flat()
    const after = renamedAndMoved(before, [0, 0], 0)
    const alignment = alignPlans(before, after)
    expect(alignment.walls.size).toBe(9)
    expect(alignment.openings.size).toBe(13)
    expect(alignment.rooms.size).toBe(6)
    expect(alignment.shift).toEqual([0, 0])
  })
})

describe('a door of another kind (CNT-14 with WRT-8)', () => {
  it('names the new kind and the part that opens on the door, under new ids too', () => {
    const before = flat()
    const door = before.openings.find((o) => o.type === 'door')!
    const after: FloorPlan = { ...before, openings: before.openings.map((o) => (o.id === door.id ? { ...o, kind: 'sliding' as const, opens: { width: 0.5 } } : o)) }
    const line = (plan: FloorPlan): string | undefined => compareBuildings(before, plan).changes.map((c) => c.text).find((t) => t.includes('now sliding'))
    expect(line(after)).toContain('part that opens the whole of it → 0.5')
    expect(line(renamedAndMoved(after, [3, -2]))).toContain('now sliding')
  })
})
