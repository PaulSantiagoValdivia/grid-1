import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { diffPlans } from '../diff'
import {
  edit,
  moveWall,
  plan,
  room,
  twoFloorPlan,
  twoRoomBox,
  withRoom,
  wall,
  withWall
} from './diff-fixtures'

describe('rooms', () => {
  it('reports an added room and a removed room, each on its own floor', () => {
    const plan = twoFloorPlan()
    const next = edit(plan, (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'f_room')
      copy.rooms.push(room('g_study', 'Study', ['g_s', 'g_e', 'g_n', 'g_w']))
    })
    const changes = diffPlans(plan, next).changes
    // Ordered by storey, so the ground floor comes before the first.
    expect(changes).toMatchObject([
      { entity: { type: 'room', id: 'g_study' }, kind: 'added', floor: 'ground' },
      { entity: { type: 'room', id: 'f_room' }, kind: 'removed', floor: 'first' }
    ])
  })

  it('lists only the name of a renamed room, and no area changes', () => {
    const plan = twoRoomBox()
    const diff = diffPlans(plan, withRoom(plan, 'r_left', { name: 'Kitchen' }))
    expect(diff.changes).toHaveLength(1)
    expect(diff.changes[0]).toMatchObject({
      entity: { type: 'room', id: 'r_left' },
      kind: 'modified',
      props: [{ key: 'name', before: 'Left room', after: 'Kitchen' }]
    })
    expect(diff.areas).toEqual([])
  })

  it('lists the boundary when the walls of a room change', () => {
    const plan = twoRoomBox()
    const next = withRoom(plan, 'r_left', { boundary: ['w_s', 'w_mid', 'w_n', 'w_w', 'w_s'] })
    const change = diffPlans(plan, next).changes[0]!
    expect(change.props).toEqual([
      {
        key: 'boundary',
        before: ['w_s', 'w_mid', 'w_n', 'w_w'],
        after: ['w_s', 'w_mid', 'w_n', 'w_w', 'w_s']
      }
    ])
  })

  it('reads the same boundary in another order as a change, because C3 gives it meaning', () => {
    const plan = twoRoomBox()
    const next = withRoom(plan, 'r_left', { boundary: ['w_mid', 'w_n', 'w_w', 'w_s'] })
    expect(diffPlans(plan, next).changes[0]!.props.map((p) => p.key)).toEqual(['boundary'])
  })
})

describe('floors are entities', () => {
  it('reports a renamed floor as one change and touches none of its walls', () => {
    const plan = twoFloorPlan()
    const next = edit(plan, (copy) => {
      copy.floors = copy.floors!.map((f) => (f.id === 'first' ? { ...f, name: 'Upper floor' } : f))
    })
    const changes = diffPlans(plan, next).changes
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      entity: { type: 'floor', id: 'first' },
      kind: 'modified',
      floor: 'first',
      props: [{ key: 'name', before: 'First floor', after: 'Upper floor' }]
    })
  })

  it('reports a changed level', () => {
    const plan = twoFloorPlan()
    const next = edit(plan, (copy) => {
      copy.floors = copy.floors!.map((f) => (f.id === 'first' ? { ...f, level: 2 } : f))
    })
    expect(diffPlans(plan, next).changes[0]!.props).toEqual([
      { key: 'level', before: 1, after: 2 }
    ])
  })

  it('reports a floor that was added and a floor that was removed', () => {
    const plan = twoFloorPlan()
    const without = edit(plan, (copy) => {
      copy.walls = copy.walls.filter((w) => w.floor !== 'first')
      copy.rooms = copy.rooms.filter((r) => r.floor !== 'first')
      copy.openings = copy.openings.filter((o) => o.id !== 'f_win')
      copy.floors = copy.floors!.filter((f) => f.id !== 'first')
    })
    const removed = diffPlans(plan, without).changes.filter((c) => c.entity.type === 'floor')
    expect(removed).toMatchObject([{ entity: { id: 'first' }, kind: 'removed', floor: 'first' }])
    const added = diffPlans(without, plan).changes.filter((c) => c.entity.type === 'floor')
    expect(added).toMatchObject([{ entity: { id: 'first' }, kind: 'added', floor: 'first' }])
  })

  it('counts a floor that only an entity names as a floor', () => {
    const plan = twoRoomBox()
    const next = withWall(plan, 'w_mid', { floor: 'attic' })
    const types = diffPlans(plan, next).changes.map((c) => `${c.entity.type}:${c.entity.id}`)
    expect(types).toContain('floor:attic')
    expect(types).toContain('wall:w_mid')
  })
})

describe('the ground floor, said or unsaid', () => {
  it('treats an unstated floor and "ground" as the same', () => {
    const plan = twoRoomBox()
    const said = edit(plan, (copy) => {
      for (const wall of copy.walls) wall.floor = 'ground'
      for (const r of copy.rooms) r.floor = 'ground'
    })
    expect(diffPlans(plan, said).changes).toEqual([])
    expect(diffPlans(said, plan).changes).toEqual([])
  })

  it('treats no registry and the default ground registry as the same', () => {
    const plan = twoRoomBox()
    const registered = edit(plan, (copy) => {
      copy.floors = [{ id: 'ground', name: 'Ground floor', level: 0 }]
    })
    expect(diffPlans(plan, registered).changes).toEqual([])
  })
})

describe('a wall that changes floor', () => {
  it('is one change on the later floor, and its openings are not touched', () => {
    const plan = twoFloorPlan()
    const next = withWall(plan, 'g_s', { floor: 'first' })
    const changes = diffPlans(plan, next).changes
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      entity: { type: 'wall', id: 'g_s' },
      kind: 'modified',
      floor: 'first',
      props: [{ key: 'floor', before: 'ground', after: 'first' }]
    })
  })

  it('keeps a change on one floor off every other floor', () => {
    const plan = twoFloorPlan()
    const next = moveWall(plan, 'f_s', 0, 0.5)
    const changes = diffPlans(plan, next).changes
    expect(changes.length).toBeGreaterThan(0)
    expect(new Set(changes.map((c) => c.floor))).toEqual(new Set(['first']))
  })
})

describe('the order of the floors', () => {
  /** Floors listed out of order, with ids whose spelling sorts them wrong. */
  function stacked(): FloorPlan {
    const box = (floor: string): Wall[] => [
      wall(`${floor}_s`, [0, 0], [6, 0], { floor }),
      wall(`${floor}_e`, [6, 0], [6, 4], { floor }),
      wall(`${floor}_n`, [6, 4], [0, 4], { floor }),
      wall(`${floor}_w`, [0, 4], [0, 0], { floor })
    ]
    const floors = ['ground', 'first', 'basement', 'attic']
    return plan({
      floors: [
        { id: 'ground', name: 'Ground', level: 0 },
        { id: 'first', name: 'First', level: 1 },
        { id: 'basement', name: 'Basement', level: -1 },
        { id: 'attic', name: 'Attic', level: 2 }
      ],
      walls: floors.flatMap(box),
      rooms: floors.map((f) => room(`${f}_room`, f, [`${f}_s`, `${f}_e`, `${f}_n`, `${f}_w`], f))
    })
  }

  it('follows the storeys, not the spelling of their ids', () => {
    const before = stacked()
    let after = before
    for (const floor of ['ground', 'first', 'basement', 'attic']) {
      after = moveWall(after, `${floor}_n`, 0, 0.5)
    }
    const diff = diffPlans(before, after)
    const order = (floors: readonly string[]): string[] => floors.filter((f, i) => floors.indexOf(f) === i)
    expect(order(diff.changes.map((c) => c.floor))).toEqual(['basement', 'ground', 'first', 'attic'])
    expect(order(diff.areas.map((a) => a.floor))).toEqual(['basement', 'ground', 'first', 'attic'])
  })

  it('keeps the earlier level of a floor that was removed', () => {
    const before = stacked()
    const after = edit(before, (copy) => {
      copy.floors = copy.floors!.filter((f) => f.id !== 'attic')
      copy.walls = copy.walls.filter((w) => w.floor !== 'attic')
      copy.rooms = copy.rooms.filter((r) => r.floor !== 'attic')
    })
    const moved = moveWall(after, 'basement_n', 0, 0.5)
    const floors = diffPlans(before, moved).changes.map((c) => c.floor)
    expect(floors[0]).toBe('basement')
    expect(floors[floors.length - 1]).toBe('attic')
  })
})
