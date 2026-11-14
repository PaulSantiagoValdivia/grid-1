import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { diffPlans } from '../diff'
import {
  edit,
  moveWall,
  opening,
  plan,
  sixRoomHouse,
  twoRoomBox,
  wall,
  withWall
} from './diff-fixtures'

const entityIds = (diff: ReturnType<typeof diffPlans>) => diff.changes.map((c) => c.entity.id)

describe('a plan with something that cannot be drawn', () => {
  it('compares what is valid and names the rest, without throwing', () => {
    const plan = twoRoomBox()
    const next = edit(moveWall(plan, 'w_mid', 0.5, 0), (copy) => {
      copy.walls.push(wall('w_bad', [1, 1], [1, 1]))
    })
    const diff = diffPlans(plan, next)
    expect(entityIds(diff)).toContain('w_mid')
    expect(entityIds(diff)).not.toContain('w_bad')
    expect(diff.issues).toContainEqual({
      code: 'invalid_head',
      message: expect.stringContaining('w_bad'),
      entities: [{ type: 'wall', id: 'w_bad' }]
    })
  })

  it('says the same about the earlier plan, with the earlier code', () => {
    const plan = twoRoomBox()
    const broken = edit(plan, (copy) => {
      copy.walls.push(wall('w_bad', [1, 1], [1, 1]))
    })
    const diff = diffPlans(broken, moveWall(plan, 'w_mid', 0.5, 0))
    expect(diff.issues.map((i) => i.code)).toEqual(['invalid_base'])
    expect(entityIds(diff)).toContain('w_mid')
  })

  it('reports each side that had something wrong', () => {
    const broken = edit(twoRoomBox(), (copy) => {
      copy.walls.push(wall('w_bad', [1, 1], [1, 1]))
    })
    const diff = diffPlans(broken, broken)
    expect(diff.issues.map((i) => i.code)).toEqual(['invalid_base', 'invalid_head'])
    expect(diff.changes).toEqual([])
  })

  it('does not call a wall that became invalid modified, and names only that wall', () => {
    const plan = twoRoomBox()
    const next = withWall(plan, 'w_mid', { start: [4, 0], end: [4, 0] })
    const diff = diffPlans(plan, next)
    expect(entityIds(diff)).not.toContain('w_mid')
    // The door on it did not change: nothing to report.
    expect(entityIds(diff)).not.toContain('o_door')
    const invalid = diff.issues.find((i) => i.code === 'invalid_head')!
    expect(invalid.entities).toEqual([{ type: 'wall', id: 'w_mid' }])
  })

  it('still reports the edits to the rooms and doors that rest on a wall that broke', () => {
    const plan = twoRoomBox()
    const next = edit(withWall(plan, 'w_mid', { thickness: 0 }), (copy) => {
      copy.rooms.find((r) => r.id === 'r_left')!.name = 'Kitchen'
      copy.openings.find((o) => o.id === 'o_door')!.width = 1.2
    })
    const diff = diffPlans(plan, next)
    expect(diff.changes.find((c) => c.id === 'room:r_left:modified')).toMatchObject({
      derived: false,
      props: [{ key: 'name', before: 'Left room', after: 'Kitchen' }]
    })
    expect(diff.changes.find((c) => c.id === 'opening:o_door:modified')).toMatchObject({
      floor: 'ground',
      props: [{ key: 'width', before: 0.9, after: 1.2 }]
    })
    expect(entityIds(diff)).not.toContain('w_mid')
    const invalid = diff.issues.filter((i) => i.code === 'invalid_head')
    expect(invalid.map((i) => i.entities)).toEqual([[{ type: 'wall', id: 'w_mid' }]])
  })

  it('reports the same edits when the wall was broken before and repaired after', () => {
    const plan = withWall(twoRoomBox(), 'w_mid', { thickness: 0 })
    const next = edit(withWall(plan, 'w_mid', { thickness: 0.1 }), (copy) => {
      copy.rooms.find((r) => r.id === 'r_left')!.name = 'Kitchen'
    })
    const diff = diffPlans(plan, next)
    expect(entityIds(diff)).toContain('r_left')
    expect(diff.issues.find((i) => i.code === 'invalid_base')!.entities).toEqual([
      { type: 'wall', id: 'w_mid' }
    ])
  })

  it('keeps comparing a room that merely stopped closing', () => {
    const plan = twoRoomBox()
    const next = withWall(plan, 'w_mid', { start: [4, 0], end: [7, 0] })
    const diff = diffPlans(plan, next)
    expect(diff.issues.map((i) => i.code)).not.toContain('invalid_head')
    expect(diff.areas.find((a) => a.roomId === 'r_left')?.after).toBeNull()
  })

  it('skips an invalid entity that only exists on one side', () => {
    const plan = twoRoomBox()
    const next = edit(plan, (copy) => {
      copy.walls.push(wall('w_new_bad', [2, 2], [2, 2]))
    })
    expect(entityIds(diffPlans(plan, next))).not.toContain('w_new_bad')
  })
})

describe('an opening on a wall that does not exist', () => {
  it('is a dangling-host issue, not a change', () => {
    const base = twoRoomBox()
    const next = edit(base, (copy) => {
      copy.openings.push(opening('o_orphan', 'no_such_wall', 'door', 1, 0.9))
    })
    const diff = diffPlans(base, next)
    expect(diff.changes).toEqual([])
    expect(diff.issues).toEqual([
      {
        code: 'dangling_host',
        message: expect.stringContaining('o_orphan'),
        entities: [{ type: 'opening', id: 'o_orphan' }]
      }
    ])
  })

  it('is reported for the earlier plan as well', () => {
    const base = edit(twoRoomBox(), (copy) => {
      copy.openings.push(opening('o_orphan', 'no_such_wall', 'door', 1, 0.9))
    })
    const diff = diffPlans(base, twoRoomBox())
    expect(diff.issues.map((i) => i.code)).toEqual(['dangling_host'])
    expect(diff.issues[0]!.message).toContain('earlier')
  })
})

describe('plans that are empty or strange', () => {
  const empty: FloorPlan = plan({ walls: [] })

  it('lists everything as added when the earlier plan is empty, and as removed the other way', () => {
    const house = sixRoomHouse()
    const added = diffPlans(empty, house)
    expect(added.changes.every((c) => c.kind === 'added')).toBe(true)
    expect(added.changes).toHaveLength(house.walls.length + house.rooms.length + house.openings.length)
    const removed = diffPlans(house, empty)
    expect(removed.changes.every((c) => c.kind === 'removed')).toBe(true)
    expect(removed.changes).toHaveLength(added.changes.length)
  })

  it('compares two empty plans', () => {
    expect(diffPlans(empty, empty).changes).toEqual([])
  })

  it('does not throw on an id that appears twice', () => {
    const next = edit(twoRoomBox(), (copy) => {
      copy.walls.push(wall('w_s', [0, 0], [2, 0]))
    })
    expect(() => diffPlans(twoRoomBox(), next)).not.toThrow()
  })

  it('does not throw on a room that names a wall that does not exist', () => {
    const next = edit(twoRoomBox(), (copy) => {
      copy.rooms[0]!.boundary = ['w_s', 'ghost', 'w_n', 'w_w']
    })
    expect(() => diffPlans(twoRoomBox(), next)).not.toThrow()
  })

  it('does not throw on numbers that are not numbers', () => {
    const next = edit(twoRoomBox(), (copy) => {
      copy.walls[0]!.end = [Number.NaN, 0]
    })
    expect(() => diffPlans(twoRoomBox(), next)).not.toThrow()
    expect(() => diffPlans(next, twoRoomBox())).not.toThrow()
  })
})
