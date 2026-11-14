import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { changesOutsideScope, diffPlans } from '../diff'
import type { ScopeTargets } from '../diff'
import {
  edit,
  moveWall,
  room,
  sixRoomHouse,
  twoFloorPlan,
  wall,
  withRoom,
  withWall
} from './diff-fixtures'

function scope(base: FloorPlan, head: FloorPlan, targets: ScopeTargets, minMovement?: number) {
  return changesOutsideScope(
    diffPlans(base, head),
    base,
    head,
    targets,
    minMovement === undefined ? undefined : { minMovement }
  )
}

const ids = (result: ReturnType<typeof scope>) => result.changes.map((c) => c.entity.id)

describe('an edit that stayed inside the named room', () => {
  it('returns nothing for a moved wall, the door on it and the room on the other side', () => {
    const house = sixRoomHouse()
    // v1_0 divides r00 from r10; d0 is its door; r10 changes shape as a consequence.
    const next = moveWall(house, 'v1_0', 0.5, 0)
    const result = scope(house, next, { rooms: ['r00'] })
    expect(result.checked).toBe(true)
    expect(result.changes).toEqual([])
    expect(result.issues).toEqual([])
  })

  it('allows the walls of a room in either version', () => {
    const house = sixRoomHouse()
    // r00 grows to take in h0_1; the wall is added on its new boundary.
    const next = edit(house, (copy) => {
      copy.rooms.find((r) => r.id === 'r00')!.boundary.push('h0_1')
    })
    expect(scope(house, next, { rooms: ['r00'] }).changes).toEqual([])
  })
})

describe('an edit that reached outside', () => {
  it('returns a wall elsewhere, with the door and the rooms that followed it', () => {
    const house = sixRoomHouse()
    const result = scope(house, moveWall(house, 'v2_1', 0.3, 0), { rooms: ['r00'] })
    expect(ids(result).sort()).toEqual(['d1', 'r11', 'r21', 'v2_1'])
  })

  it('returns a change on another floor', () => {
    const plan = twoFloorPlan()
    const result = scope(plan, moveWall(plan, 'f_s', 0, 0.5), { rooms: ['g_room'] })
    expect(ids(result)).toEqual(['f_s', 'f_room'])
  })

  it('returns a neighbour that does not share a wall with the named room', () => {
    const house = sixRoomHouse()
    const result = scope(house, withRoom(house, 'r21', { name: 'Garage' }), { rooms: ['r00'] })
    expect(ids(result)).toEqual(['r21'])
  })

  it('returns a renamed id that also moved: both changes and the suspicion', () => {
    const house = sixRoomHouse()
    const next = edit(house, (copy) => {
      const top = copy.walls.find((w) => w.id === 'h2_2')!
      top.id = 'h2_2x'
      top.start = [8.3, 8]
      top.end = [12.3, 8]
      const r21 = copy.rooms.find((r) => r.id === 'r21')!
      r21.boundary = r21.boundary.map((id) => (id === 'h2_2' ? 'h2_2x' : id))
    })
    const result = scope(house, next, { rooms: ['r00'] })
    expect(ids(result)).toEqual(expect.arrayContaining(['h2_2', 'h2_2x']))
    expect(result.issues.map((i) => i.code)).toEqual(['suspected_id_churn'])
  })

  it('returns a room that stopped closing', () => {
    const house = sixRoomHouse()
    // h0_2 turned parallel to the walls beside it cannot make a corner.
    const next = withWall(house, 'v3_0', { start: [12, 0], end: [14, 0] })
    const result = scope(house, next, { rooms: ['r00'] })
    expect(result.issues.map((i) => i.code)).toContain('room_unclosed')
  })

  it('is quiet about issues inside the named room', () => {
    const house = sixRoomHouse()
    // Turned parallel to the divider beside it, h0_0 makes no corner with it.
    const next = withWall(house, 'h0_0', { start: [1, 0], end: [1, 4] })
    const result = scope(house, next, { rooms: ['r00'] })
    expect(result.issues.filter((i) => i.code === 'room_unclosed')).toEqual([])
  })
})

describe('movements too small to count', () => {
  it('ignores a wall that moved 4 mm', () => {
    const house = sixRoomHouse()
    const result = scope(house, moveWall(house, 'v2_1', 0.004, 0), { rooms: ['r00'] })
    expect(result.changes).toEqual([])
  })

  it('counts the largest part of a movement, not the sum', () => {
    const house = sixRoomHouse()
    expect(scope(house, moveWall(house, 'v2_1', 0.008, 0.008), { rooms: ['r00'] }).changes).toEqual([])
    expect(ids(scope(house, moveWall(house, 'v2_1', 0.008, 0.012), { rooms: ['r00'] }))).toContain(
      'v2_1'
    )
  })

  it('lets the caller choose how small is too small', () => {
    const house = sixRoomHouse()
    const next = moveWall(house, 'v2_1', 0.004, 0)
    expect(ids(scope(house, next, { rooms: ['r00'] }, 0.001))).toContain('v2_1')
  })

  it('never ignores a change that is not a distance', () => {
    const house = sixRoomHouse()
    expect(ids(scope(house, withWall(house, 'v2_1', { kind: 'partition' }), { rooms: ['r00'] }))).toEqual([
      'v2_1'
    ])
    expect(ids(scope(house, withRoom(house, 'r21', { name: 'X' }), { rooms: ['r00'] }))).toEqual(['r21'])
  })

  it('never ignores an entity that appeared or disappeared', () => {
    const house = sixRoomHouse()
    const next = edit(house, (copy) => {
      copy.walls.push(wall('extra', [20, 20], [20.001, 20]))
    })
    expect(ids(scope(house, next, { rooms: ['r00'] }))).toEqual(['extra'])
  })
})

describe('what the check is told', () => {
  it('is off when nothing is named, whatever changed', () => {
    const house = sixRoomHouse()
    const result = scope(house, moveWall(house, 'v2_1', 3, 0), { rooms: [] })
    expect(result).toEqual({ checked: false, changes: [], issues: [] })
    expect(scope(house, moveWall(house, 'v2_1', 3, 0), { rooms: [], floors: [] }).checked).toBe(false)
  })

  it('treats everything on a named floor as inside', () => {
    const plan = twoFloorPlan()
    const next = edit(moveWall(plan, 'f_s', 0, 0.5), (copy) => {
      copy.floors = copy.floors!.map((f) => (f.id === 'first' ? { ...f, name: 'Upper' } : f))
    })
    expect(scope(plan, next, { rooms: [], floors: ['first'] })).toMatchObject({
      checked: true,
      changes: []
    })
    expect(ids(scope(plan, next, { rooms: ['g_room'] })).sort()).toEqual(['f_room', 'f_s', 'first'])
  })

  it('allows a new room, and the walls it brought, when it is named', () => {
    const house = sixRoomHouse()
    const next = edit(house, (copy) => {
      copy.walls.push(
        wall('n_s', [20, 0], [24, 0]),
        wall('n_e', [24, 0], [24, 4]),
        wall('n_n', [24, 4], [20, 4]),
        wall('n_w', [20, 4], [20, 0])
      )
      copy.rooms.push(room('r_new', 'Annex', ['n_s', 'n_e', 'n_n', 'n_w']))
    })
    expect(scope(house, next, { rooms: ['r_new'] }).changes).toEqual([])
    expect(scope(house, next, { rooms: ['r00'] }).changes).toHaveLength(5)
  })

  it('says so when a named room is in neither plan, and keeps checking the others', () => {
    const house = sixRoomHouse()
    const next = moveWall(house, 'v2_1', 0.3, 0)
    const result = scope(house, next, { rooms: ['r00', 'ghost'] })
    expect(result.checked).toBe(true)
    expect(result.issues).toContainEqual({
      code: 'unknown_target',
      message: expect.stringContaining('ghost'),
      entities: [{ type: 'room', id: 'ghost' }]
    })
    expect(ids(result)).toContain('v2_1')
  })
})

describe('naming more never finds more', () => {
  const house = sixRoomHouse()
  const edits: [string, FloorPlan][] = [
    ['a divider moved', moveWall(moveWall(house, 'v1_0', 0.5, 0), 'v1_1', 0.5, 0)],
    ['a far wall moved', moveWall(house, 'v2_1', 0.4, 0)],
    ['two rooms renamed', withRoom(withRoom(house, 'r00', { name: 'A' }), 'r21', { name: 'B' })],
    [
      'a wall thickened',
      withWall(house, 'h1_1', { thickness: 0.2 })
    ]
  ]
  const nested: ScopeTargets[] = [
    { rooms: ['r00'] },
    { rooms: ['r00', 'r10'] },
    { rooms: ['r00', 'r10', 'r20', 'r01'] },
    { rooms: ['r00', 'r10', 'r20', 'r01', 'r11', 'r21'] }
  ]

  it.each(edits)('for %s', (_name, next) => {
    let previous = Number.POSITIVE_INFINITY
    let previousIds = new Set<string>()
    for (const targets of nested) {
      const found = new Set(scope(house, next, targets).changes.map((c) => c.id))
      expect(found.size).toBeLessThanOrEqual(previous)
      for (const id of found) if (previousIds.size > 0) expect(previousIds.has(id)).toBe(true)
      previous = found.size
      previousIds = found
    }
  })
})

describe('an id that changed and nothing else', () => {
  /** h2_1 (with win1 on it) comes back as h2_1x; the room and the window follow the new id. */
  function renamed(house: FloorPlan, reverse = false): FloorPlan {
    return edit(house, (copy) => {
      const top = copy.walls.find((w) => w.id === 'h2_2')!
      top.id = 'h2_2x'
      if (reverse) [top.start, top.end] = [top.end, top.start]
      const middle = copy.walls.find((w) => w.id === 'h2_1')!
      middle.id = 'h2_1x'
      copy.openings.find((o) => o.id === 'win1')!.wall = 'h2_1x'
      for (const id of ['r11', 'r21']) {
        const r = copy.rooms.find((x) => x.id === id)!
        r.boundary = r.boundary.map((w) => (w === 'h2_2' ? 'h2_2x' : w === 'h2_1' ? 'h2_1x' : w))
      }
    })
  }

  it('returns no change, only the suspicion, so the id can be logged and fixed', () => {
    const house = sixRoomHouse()
    const result = scope(house, renamed(house), { rooms: ['r00'] })
    expect(result.changes).toEqual([])
    expect(result.issues.map((i) => i.code)).toEqual(['suspected_id_churn', 'suspected_id_churn'])
  })

  it('treats a wall listed end to start the same way', () => {
    const house = sixRoomHouse()
    const result = scope(house, renamed(house, true), { rooms: ['r00'] })
    expect(result.changes).toEqual([])
  })

  it('still returns a real edit made beside the id change', () => {
    const house = sixRoomHouse()
    const next = withRoom(renamed(house), 'r21', { name: 'Garage' })
    expect(ids(scope(house, next, { rooms: ['r00'] }))).toEqual(['r21'])
  })
})

describe('something the edit broke outside the named room', () => {
  it('returns a wall that was fine before and cannot be drawn now', () => {
    const house = sixRoomHouse()
    const result = scope(house, withWall(house, 'v3_1', { thickness: 0 }), { rooms: ['r00'] })
    const invalid = result.issues.filter((i) => i.code === 'invalid_head')
    expect(invalid.map((i) => i.entities)).toEqual([[{ type: 'wall', id: 'v3_1' }]])
  })

  it('returns a door left on a wall that does not exist', () => {
    const house = sixRoomHouse()
    const next = edit(house, (copy) => {
      copy.openings.find((o) => o.id === 'win1')!.wall = 'gone'
    })
    const result = scope(house, next, { rooms: ['r00'] })
    expect(result.issues.filter((i) => i.code === 'dangling_host').map((i) => i.entities)).toEqual([
      [{ type: 'opening', id: 'win1' }]
    ])
  })

  it('is quiet about a fault the earlier plan already had', () => {
    const broken = withWall(sixRoomHouse(), 'v3_1', { thickness: 0 })
    const result = scope(broken, broken, { rooms: ['r00'] })
    expect(result.issues).toEqual([])
  })

  it('is quiet about a wall broken inside the named room', () => {
    const house = sixRoomHouse()
    const result = scope(house, withWall(house, 'v1_0', { thickness: 0 }), { rooms: ['r00'] })
    expect(result.issues.filter((i) => i.code === 'invalid_head')).toEqual([])
  })
})

describe('a neighbour of the named room', () => {
  // r10 shares v1_0 with r00.
  it('may not disappear', () => {
    const house = sixRoomHouse()
    const next = edit(house, (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'r10')
    })
    expect(ids(scope(house, next, { rooms: ['r00'] }))).toEqual(['r10'])
  })

  it('may not be renamed', () => {
    const house = sixRoomHouse()
    const next = withRoom(house, 'r10', { name: 'Lounge' })
    expect(ids(scope(house, next, { rooms: ['r00'] }))).toEqual(['r10'])
  })

  it('is fine when it is named too', () => {
    const house = sixRoomHouse()
    const next = withRoom(house, 'r10', { name: 'Lounge' })
    expect(ids(scope(house, next, { rooms: ['r00', 'r10'] }))).toEqual([])
  })
})

describe('the order of what is returned', () => {
  it('does not depend on the order the targets were named in', () => {
    const house = sixRoomHouse()
    const next = withWall(moveWall(house, 'v3_1', 0.3, 0), 'h2_2', { thickness: 0 })
    const one = scope(house, next, { rooms: ['zz', 'r00', 'aa'] })
    const other = scope(house, next, { rooms: ['aa', 'r00', 'zz'] })
    expect(JSON.stringify(one)).toBe(JSON.stringify(other))
  })
})
