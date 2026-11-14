import { describe, expect, it } from 'vitest'
import { diffPlans } from '../diff'
import type { PlanDiff } from '../diff'
import {
  edit,
  moveWall,
  room,
  sixRoomHouse,
  twoFloorPlan,
  twoRoomBox,
  withOpening,
  withRoom,
  withWall
} from './diff-fixtures'

function summaryOf(diff: PlanDiff, id: string): string {
  const change = diff.changes.find((c) => c.entity.id === id)
  if (!change) throw new Error(`no change for ${id}`)
  return change.summary
}

describe('what a wall change says', () => {
  it('says how far a wall moved, in metres to two decimals', () => {
    const plan = twoRoomBox()
    expect(summaryOf(diffPlans(plan, moveWall(plan, 'w_mid', 0.5, 0)), 'w_mid')).toBe(
      'Wall moved 0.50 m'
    )
    expect(summaryOf(diffPlans(plan, moveWall(plan, 'w_mid', 0, -1.256)), 'w_mid')).toBe(
      'Wall moved 1.26 m'
    )
  })

  it('says an extended wall was extended, and a shortened one shortened', () => {
    const plan = twoRoomBox()
    expect(summaryOf(diffPlans(plan, withWall(plan, 'w_s', { end: [8.3, 0] })), 'w_s')).toBe(
      'Wall extended 0.30 m'
    )
    expect(summaryOf(diffPlans(plan, withWall(plan, 'w_s', { end: [7.5, 0] })), 'w_s')).toBe(
      'Wall shortened 0.50 m'
    )
  })

  it('says a rotated wall rotated, with the angle', () => {
    const plan = twoRoomBox()
    const turned = withWall(plan, 'w_mid', { end: [4 + 4 * Math.sin(Math.PI / 6), 4 * Math.cos(Math.PI / 6)] })
    expect(summaryOf(diffPlans(plan, turned), 'w_mid')).toBe('Wall rotated 30° clockwise')
  })

  it('says a reshaped wall was reshaped', () => {
    const plan = twoRoomBox()
    const reshaped = withWall(plan, 'w_mid', { start: [4.5, 0.5], end: [6, 6] })
    expect(summaryOf(diffPlans(plan, reshaped), 'w_mid')).toBe('Wall reshaped')
  })

  it('names the floor a wall moved to', () => {
    const plan = twoFloorPlan()
    expect(summaryOf(diffPlans(plan, withWall(plan, 'g_s', { floor: 'first' })), 'g_s')).toBe(
      'Wall moved to First floor'
    )
  })

  it('says what else changed, after the movement', () => {
    const plan = twoRoomBox()
    const next = withWall(moveWall(plan, 'w_mid', 0.5, 0), 'w_mid', {
      start: [4.5, 0],
      end: [4.5, 4],
      thickness: 0.15,
      kind: 'partition'
    })
    expect(summaryOf(diffPlans(plan, next), 'w_mid')).toBe(
      'Wall moved 0.50 m; thickness 0.10 → 0.15 m; kind interior → partition'
    )
  })

  it('says walls were added and removed', () => {
    const plan = twoRoomBox()
    const without = edit(plan, (copy) => {
      copy.walls = copy.walls.filter((w) => w.id !== 'w_mid')
      copy.rooms = []
      copy.openings = []
    })
    expect(summaryOf(diffPlans(plan, without), 'w_mid')).toBe('Wall removed')
    expect(summaryOf(diffPlans(without, plan), 'w_mid')).toBe('Wall added')
  })
})

describe('what an opening change says', () => {
  it('says a widened window was widened, with both widths', () => {
    const plan = twoRoomBox()
    const narrow = withOpening(plan, 'o_win', { width: 0.8 })
    expect(summaryOf(diffPlans(narrow, withOpening(plan, 'o_win', { width: 1.3 })), 'o_win')).toBe(
      'Window widened 0.80 → 1.30 m'
    )
    expect(summaryOf(diffPlans(withOpening(plan, 'o_win', { width: 1.3 }), narrow), 'o_win')).toBe(
      'Window narrowed 1.30 → 0.80 m'
    )
  })

  it('says a door that only followed its wall followed its wall', () => {
    const plan = twoRoomBox()
    expect(summaryOf(diffPlans(plan, moveWall(plan, 'w_mid', 0.5, 0)), 'o_door')).toBe(
      'Door moved with its wall'
    )
  })

  it('says how far an opening slid along its wall', () => {
    const plan = twoRoomBox()
    expect(summaryOf(diffPlans(plan, withOpening(plan, 'o_door', { offset: 2 })), 'o_door')).toBe(
      'Door moved 0.50 m along its wall'
    )
  })

  it('says what a changed type turned into', () => {
    const plan = twoRoomBox()
    expect(
      summaryOf(diffPlans(plan, withOpening(plan, 'o_win', { type: 'door', sill: 0 })), 'o_win')
    ).toBe('Door changed from window; sill 0.90 → 0.00 m')
  })

  it('says openings were added and removed, by their type', () => {
    const plan = twoRoomBox()
    const without = edit(plan, (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'o_door')
    })
    expect(summaryOf(diffPlans(plan, without), 'o_door')).toBe('Door removed')
    expect(summaryOf(diffPlans(without, plan), 'o_door')).toBe('Door added')
  })
})

describe('what a room or floor change says', () => {
  it('names an added room', () => {
    const plan = twoRoomBox()
    const next = edit(plan, (copy) => {
      copy.rooms.push(room('r_new', 'Bedroom 4', ['w_s', 'w_mid', 'w_n', 'w_w']))
    })
    expect(summaryOf(diffPlans(plan, next), 'r_new')).toBe('Room added: Bedroom 4')
    expect(summaryOf(diffPlans(next, plan), 'r_new')).toBe('Room removed: Bedroom 4')
  })

  it('says a room was renamed, by its old name', () => {
    const plan = twoRoomBox()
    const named = withRoom(plan, 'r_left', { name: 'Kitchen' })
    expect(
      summaryOf(diffPlans(named, withRoom(plan, 'r_left', { name: 'Kitchen and dining' })), 'r_left')
    ).toBe('Kitchen renamed to Kitchen and dining')
  })

  it('says a room’s walls changed', () => {
    const plan = twoRoomBox()
    const next = withRoom(plan, 'r_left', { boundary: ['w_s', 'w_mid', 'w_n', 'w_w', 'w_s'] })
    expect(summaryOf(diffPlans(plan, next), 'r_left')).toBe('Left room walls changed')
  })

  it('names a floor that was renamed, added or removed', () => {
    const plan = twoFloorPlan()
    const renamed = edit(plan, (copy) => {
      copy.floors = copy.floors!.map((f) => (f.id === 'first' ? { ...f, name: 'Upper floor' } : f))
    })
    expect(summaryOf(diffPlans(plan, renamed), 'first')).toBe('First floor renamed to Upper floor')
    const without = edit(plan, (copy) => {
      copy.walls = copy.walls.filter((w) => w.floor !== 'first')
      copy.rooms = copy.rooms.filter((r) => r.floor !== 'first')
      copy.openings = copy.openings.filter((o) => o.id !== 'f_win')
      copy.floors = copy.floors!.filter((f) => f.id !== 'first')
    })
    expect(summaryOf(diffPlans(plan, without), 'first')).toBe('Floor removed: First floor')
    expect(summaryOf(diffPlans(without, plan), 'first')).toBe('Floor added: First floor')
  })
})

describe('every summary', () => {
  const COMPASS = /\b(north|south|east|west|northern|southern|eastern|western)\b/i

  it('is written, one line, with no compass words and no stray decimals', () => {
    const plan = sixRoomHouse()
    const next = edit(moveWall(plan, 'v1_0', 0.3333333, 0.1), (copy) => {
      copy.openings[0]!.width = 1.123456
    })
    const diff = diffPlans(plan, next)
    expect(diff.changes.length).toBeGreaterThan(0)
    for (const change of diff.changes) {
      expect(change.summary).not.toBe('')
      expect(change.summary).not.toContain('\n')
      expect(change.summary).not.toMatch(COMPASS)
      expect(change.summary).not.toMatch(/\d\.\d{3,}/)
    }
  })

  it('reads the same for the same two plans', () => {
    const plan = sixRoomHouse()
    const next = moveWall(plan, 'v1_0', 0.5, 0)
    const first = diffPlans(plan, next).changes.map((c) => c.summary)
    const second = diffPlans(plan, next).changes.map((c) => c.summary)
    expect(first).toEqual(second)
  })
})
