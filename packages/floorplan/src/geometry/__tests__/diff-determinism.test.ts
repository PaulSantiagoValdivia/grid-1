import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { diffPlans } from '../diff'
import {
  edit,
  moveWall,
  room,
  shuffled,
  sixRoomHouse,
  twoFloorPlan,
  twoRoomBox,
  withOpening,
  withRoom,
  withWall
} from './diff-fixtures'

/** Pairs of plans that differ in every way the diff knows about. */
const scenarios: [string, () => [FloorPlan, FloorPlan]][] = [
  [
    'a divider that moved',
    () => {
      const plan = sixRoomHouse()
      return [plan, moveWall(moveWall(plan, 'v1_0', 0.5, 0), 'v1_1', 0.5, 0)]
    }
  ],
  [
    'a window that widened and a room that was renamed',
    () => {
      const plan = twoRoomBox()
      return [plan, withRoom(withOpening(plan, 'o_win', { width: 1.5 }), 'r_left', { name: 'Kitchen' })]
    }
  ],
  [
    'a wall on another floor and a renamed floor',
    () => {
      const plan = twoFloorPlan()
      return [
        plan,
        edit(withWall(plan, 'g_s', { floor: 'first' }), (copy) => {
          copy.floors = copy.floors!.map((f) => (f.id === 'first' ? { ...f, name: 'Upper' } : f))
        })
      ]
    }
  ],
  [
    'rooms that stopped closing',
    () => {
      const plan = twoRoomBox()
      return [plan, withWall(plan, 'w_mid', { start: [4, 0], end: [7, 0] })]
    }
  ],
  [
    'a room added and a wall removed',
    () => {
      const plan = twoRoomBox()
      return [
        plan,
        edit(plan, (copy) => {
          copy.rooms.push(room('r_new', 'Pantry', ['w_s', 'w_mid', 'w_n', 'w_w']))
          copy.walls = copy.walls.filter((w) => w.id !== 'w_e')
          copy.rooms = copy.rooms.filter((r) => r.id !== 'r_right')
        })
      ]
    }
  ]
]

describe.each(scenarios)('for %s', (_name, build) => {
  it('gives byte-identical results however the entities are ordered', () => {
    const [a, b] = build()
    const reference = JSON.stringify(diffPlans(a, b))
    for (const seed of [1, 2, 3, 4]) {
      expect(JSON.stringify(diffPlans(shuffled(a, seed), shuffled(b, seed + 10)))).toBe(reference)
    }
  })

  it('gives the same result when it is run again', () => {
    const [a, b] = build()
    expect(JSON.stringify(diffPlans(a, b))).toBe(JSON.stringify(diffPlans(a, b)))
  })

  it('orders changes by floor, then kind of entity, then id', () => {
    const [a, b] = build()
    const order = { floor: 0, wall: 1, opening: 2, room: 3 }
    const keys = diffPlans(a, b).changes.map(
      (c) => [c.floor, order[c.entity.type], c.entity.id] as const
    )
    const sorted = [...keys].sort(
      (x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0) || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0)
    )
    expect(keys).toEqual(sorted)
  })

  it('gives every change its own id, made of the entity and the kind', () => {
    const [a, b] = build()
    const changes = diffPlans(a, b).changes
    expect(new Set(changes.map((c) => c.id)).size).toBe(changes.length)
    for (const c of changes) expect(c.id).toBe(`${c.entity.type}:${c.entity.id}:${c.kind}`)
  })

  it('has an inverse for every change when the plans are swapped', () => {
    const [a, b] = build()
    const forward = diffPlans(a, b)
    const back = diffPlans(b, a)
    expect(back.changes).toHaveLength(forward.changes.length)

    const inverseKind = { added: 'removed', removed: 'added', modified: 'modified' } as const
    for (const change of forward.changes) {
      const other = back.changes.find(
        (c) => c.entity.type === change.entity.type && c.entity.id === change.entity.id
      )
      expect(other, `${change.id} has no inverse`).toBeDefined()
      expect(other!.kind).toBe(inverseKind[change.kind])
      expect(other!.derived).toBe(change.derived)
      expect(other!.props.map((p) => p.key)).toEqual(change.props.map((p) => p.key))
      for (const [i, prop] of change.props.entries()) {
        expect(other!.props[i]!.before).toEqual(prop.after)
        expect(other!.props[i]!.after).toEqual(prop.before)
      }
    }
  })
})
