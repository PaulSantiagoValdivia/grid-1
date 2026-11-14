import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { diffPlans } from '../diff'
import {
  edit,
  moveWall,
  shuffled,
  sixRoomHouse,
  twoFloorPlan,
  twoRoomBox,
  withOpening,
  withWall
} from './diff-fixtures'

const fixtures = [
  ['the two-room box', twoRoomBox],
  ['the six-room house', sixRoomHouse],
  ['the two-floor plan', twoFloorPlan]
] as const

/** Adds or subtracts up to `amount` to every number in the plan, deterministically. */
function perturbed(plan: FloorPlan, amount: number): FloorPlan {
  let n = 0
  const nudge = (value: number): number => {
    n += 1
    const sign = n % 2 === 0 ? 1 : -1
    return value + sign * amount * (0.5 + (n % 3) / 6)
  }
  return edit(plan, (copy) => {
    for (const wall of copy.walls) {
      wall.start = [nudge(wall.start[0]), nudge(wall.start[1])]
      wall.end = [nudge(wall.end[0]), nudge(wall.end[1])]
      wall.thickness = nudge(wall.thickness)
      wall.height = nudge(wall.height)
    }
    for (const opening of copy.openings) {
      opening.offset = nudge(opening.offset)
      opening.width = nudge(opening.width)
      opening.sill = Math.max(0, nudge(opening.sill))
      opening.height = nudge(opening.height)
    }
  })
}

describe.each(fixtures)('comparing %s with itself written another way', (_name, build) => {
  it('finds nothing when it is compared with itself', () => {
    const plan = build()
    expect(diffPlans(plan, plan).changes).toEqual([])
  })

  it('finds nothing when every list and key is in another order', () => {
    const plan = build()
    for (const seed of [1, 2, 3]) {
      expect(diffPlans(plan, shuffled(plan, seed)).changes).toEqual([])
      expect(diffPlans(shuffled(plan, seed), plan).changes).toEqual([])
    }
  })

  it('finds nothing when every number moves by less than the tolerance', () => {
    const plan = build()
    const noisy = perturbed(plan, 0.0009)
    expect(JSON.stringify(noisy)).not.toBe(JSON.stringify(plan))
    expect(diffPlans(plan, noisy).changes).toEqual([])
    expect(diffPlans(noisy, plan).changes).toEqual([])
  })
})

describe('the tolerance', () => {
  it('does not report 0.0009 m and reports 0.0011 m', () => {
    const plan = twoRoomBox()
    expect(diffPlans(plan, moveWall(plan, 'w_mid', 0.0009, 0)).changes).toEqual([])
    const moved = diffPlans(plan, moveWall(plan, 'w_mid', 0.0011, 0)).changes
    expect(moved.map((c) => c.entity.id)).toContain('w_mid')
  })

  it('takes the tolerance from the options', () => {
    const plan = twoRoomBox()
    const moved = moveWall(plan, 'w_mid', 0.05, 0)
    expect(diffPlans(plan, moved, { epsilon: 0.1 }).changes).toEqual([])
    expect(diffPlans(plan, moved, { epsilon: 0.01 }).changes.length).toBeGreaterThan(0)
  })
})

describe('defaults', () => {
  const raw = (wall: Record<string, unknown>): FloorPlan =>
    parseFloorPlan({
      walls: [{ id: 'a', start: [0, 0], end: [4, 0], ...wall }],
      rooms: [],
      openings: [{ id: 'o', wall: 'a', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
    })

  it('treats a field left out and its default as the same plan', () => {
    const implicit = raw({})
    const explicit = parseFloorPlan({
      walls: [
        { id: 'a', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'interior' }
      ],
      rooms: [],
      openings: [
        { id: 'o', wall: 'a', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }
      ]
    })
    expect(diffPlans(implicit, explicit).changes).toEqual([])
  })

  it('treats an unstated virtual flag and virtual: false as the same wall', () => {
    expect(diffPlans(raw({}), raw({ virtual: false })).changes).toEqual([])
  })
})

describe('what changed on a wall', () => {
  it('lists start and end, with their earlier and later values, for a moved wall', () => {
    const plan = twoRoomBox()
    const changes = diffPlans(plan, moveWall(plan, 'w_mid', 0.5, 0)).changes
    const change = changes.find((c) => c.entity.id === 'w_mid')!
    expect(change.kind).toBe('modified')
    expect(change.entity.type).toBe('wall')
    expect(change.props).toEqual([
      { key: 'start', before: [4, 0], after: [4.5, 0] },
      { key: 'end', before: [4, 4], after: [4.5, 4] }
    ])
  })

  it('lists only the properties that differ', () => {
    const plan = twoRoomBox()
    const next = withWall(plan, 'w_mid', { thickness: 0.15, kind: 'partition' })
    const change = diffPlans(plan, next).changes.find((c) => c.entity.id === 'w_mid')!
    expect(change.props.map((p) => p.key)).toEqual(['thickness', 'kind'])
    expect(change.props[0]).toEqual({ key: 'thickness', before: 0.1, after: 0.15 })
    expect(change.props[1]).toEqual({ key: 'kind', before: 'interior', after: 'partition' })
  })

  it('lists height and virtual', () => {
    const plan = twoRoomBox()
    const next = withWall(plan, 'w_mid', { height: 3, virtual: true })
    const change = diffPlans(plan, next).changes.find((c) => c.entity.id === 'w_mid')!
    expect(change.props).toEqual([
      { key: 'height', before: 2.7, after: 3 },
      { key: 'virtual', before: false, after: true }
    ])
  })

  it('reports an added and a removed wall with no properties', () => {
    const plan = twoRoomBox()
    const without = edit(plan, (copy) => {
      copy.walls = copy.walls.filter((w) => w.id !== 'w_mid')
      copy.rooms = []
      copy.openings = copy.openings.filter((o) => o.wall !== 'w_mid')
    })
    const removed = diffPlans(plan, without).changes.filter((c) => c.entity.type === 'wall')
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({ kind: 'removed', props: [] })
    expect(removed[0]!.entity).toEqual({ type: 'wall', id: 'w_mid' })

    const added = diffPlans(without, plan).changes.filter((c) => c.entity.type === 'wall')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ kind: 'added', props: [] })
  })
})

describe('what changed on an opening', () => {
  it('lists only the width of a widened window', () => {
    const plan = twoRoomBox()
    const next = withOpening(plan, 'o_win', { width: 1.5 })
    const changes = diffPlans(plan, next).changes
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      entity: { type: 'opening', id: 'o_win' },
      kind: 'modified',
      derived: false,
      props: [{ key: 'width', before: 1.2, after: 1.5 }]
    })
  })

  it('lists the wall, type, offset, sill and height when they change', () => {
    const plan = twoRoomBox()
    const next = withOpening(plan, 'o_win', {
      wall: 'w_s',
      type: 'opening',
      offset: 2,
      sill: 0,
      height: 2
    })
    const change = diffPlans(plan, next).changes.find((c) => c.entity.id === 'o_win')!
    expect(change.props.map((p) => p.key)).toEqual(['wall', 'type', 'offset', 'sill', 'height'])
  })

  it('reports an opening that was added and one that was removed', () => {
    const plan = twoRoomBox()
    const without = edit(plan, (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'o_door')
    })
    expect(diffPlans(plan, without).changes).toMatchObject([
      { entity: { type: 'opening', id: 'o_door' }, kind: 'removed' }
    ])
    expect(diffPlans(without, plan).changes).toMatchObject([
      { entity: { type: 'opening', id: 'o_door' }, kind: 'added' }
    ])
  })

  it('puts an opening on its wall’s floor', () => {
    const plan = twoFloorPlan()
    const next = withOpening(plan, 'f_win', { width: 1.5 })
    expect(diffPlans(plan, next).changes[0]!.floor).toBe('first')
    const ground = withOpening(plan, 'g_door', { width: 1.1 })
    expect(diffPlans(plan, ground).changes[0]!.floor).toBe('ground')
  })
})

describe('the order of the result', () => {
  it('lists walls before openings and keeps ids in order', () => {
    const plan = twoRoomBox()
    const next = withOpening(moveWall(moveWall(plan, 'w_s', 0, 0.5), 'w_e', 0.5, 0), 'o_win', {
      width: 1.5
    })
    const order = diffPlans(plan, next).changes.map((c) => `${c.entity.type}:${c.entity.id}`)
    expect(order).toEqual([
      'wall:w_e',
      'wall:w_s',
      'opening:o_win',
      'room:r_left',
      'room:r_right'
    ])
  })
})
