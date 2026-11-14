import { describe, expect, it } from 'vitest'
import { diffPlans } from '../diff'
import type { PlanDiff } from '../diff'
import {
  moveWall,
  sixRoomHouse,
  twoFloorPlan,
  twoRoomBox,
  withOpening,
  withWall
} from './diff-fixtures'

function changeOf(diff: PlanDiff, id: string) {
  return diff.changes.find((c) => c.entity.id === id)
}

/** Every change a change depends on is in the diff. */
function dependenciesExist(diff: PlanDiff): boolean {
  const ids = new Set(diff.changes.map((c) => c.id))
  return diff.changes.every((c) => c.dependsOn.every((id) => ids.has(id)))
}

describe('an opening that follows its wall', () => {
  it('is a derived change that depends on the wall’s change', () => {
    const plan = twoRoomBox()
    const diff = diffPlans(plan, moveWall(plan, 'w_mid', 0.5, 0))
    const door = changeOf(diff, 'o_door')!
    expect(door).toMatchObject({
      entity: { type: 'opening', id: 'o_door' },
      kind: 'modified',
      derived: true,
      floor: 'ground',
      props: [],
      dependsOn: ['wall:w_mid:modified']
    })
    expect(changeOf(diff, 'w_mid')!.derived).toBe(false)
    expect(dependenciesExist(diff)).toBe(true)
  })

  it('does not touch an opening on a wall that did not move', () => {
    const plan = twoRoomBox()
    const diff = diffPlans(plan, moveWall(plan, 'w_mid', 0.5, 0))
    expect(changeOf(diff, 'o_win')).toBeUndefined()
  })

  it('follows the openings of the wall that moved and no others', () => {
    const plan = sixRoomHouse()
    const next = withWall(plan, 'h1_0', { start: [0, 4.5], end: [4, 4.5] })
    const derived = diffPlans(plan, next).changes.filter(
      (c) => c.derived && c.entity.type === 'opening'
    )
    expect(derived.map((c) => c.entity.id)).toEqual(['d2'])
  })

  it('moves with a wall that was shifted along its own line', () => {
    const plan = twoRoomBox()
    // w_mid runs 0 → 4 in y; sliding it 1 m along y moves its door by 1 m.
    const diff = diffPlans(plan, moveWall(plan, 'w_mid', 0, 1))
    expect(changeOf(diff, 'o_door')?.derived).toBe(true)
  })
})

describe('a wall that changes without moving its openings', () => {
  it('leaves a window alone when the wall is extended at the far end', () => {
    const plan = twoRoomBox()
    // w_n runs from (8, 4) to (0, 4); the window is measured from (8, 4).
    const next = withWall(plan, 'w_n', { end: [-1, 4] })
    const diff = diffPlans(plan, next)
    expect(changeOf(diff, 'w_n')).toBeDefined()
    expect(changeOf(diff, 'o_win')).toBeUndefined()
  })

  it('moves the window when the same wall is extended at the start instead', () => {
    const plan = twoRoomBox()
    const diff = diffPlans(plan, withWall(plan, 'w_n', { start: [9, 4] }))
    expect(changeOf(diff, 'o_win')).toMatchObject({ derived: true })
  })

  it('leaves openings alone when only thickness, height or kind changed', () => {
    const plan = twoRoomBox()
    for (const patch of [{ thickness: 0.3 }, { height: 3 }, { kind: 'partition' as const }]) {
      const diff = diffPlans(plan, withWall(plan, 'w_mid', patch))
      expect(changeOf(diff, 'o_door')).toBeUndefined()
    }
  })

  it('leaves openings alone when their wall changes floor', () => {
    const plan = twoFloorPlan()
    const diff = diffPlans(plan, withWall(plan, 'g_s', { floor: 'first' }))
    expect(changeOf(diff, 'g_door')).toBeUndefined()
  })
})

describe('an opening with changes of its own', () => {
  it('is not derived, even when its wall moved as well', () => {
    const plan = twoRoomBox()
    const next = withOpening(moveWall(plan, 'w_mid', 0.5, 0), 'o_door', { width: 1.1 })
    const door = changeOf(diffPlans(plan, next), 'o_door')!
    expect(door.derived).toBe(false)
    expect(door.props.map((p) => p.key)).toEqual(['width'])
    expect(door.dependsOn).toEqual([])
  })
})

describe('the other direction', () => {
  it('derives the same opening when the move is undone', () => {
    const plan = twoRoomBox()
    const moved = moveWall(plan, 'w_mid', 0.5, 0)
    const forward = diffPlans(plan, moved)
    const back = diffPlans(moved, plan)
    expect(changeOf(back, 'o_door')).toMatchObject({ derived: true, dependsOn: ['wall:w_mid:modified'] })
    expect(forward.changes.filter((c) => c.derived).map((c) => c.entity.id)).toEqual(
      back.changes.filter((c) => c.derived).map((c) => c.entity.id)
    )
    expect(dependenciesExist(back)).toBe(true)
  })

  it('has no derived change when the wall comes back within the tolerance', () => {
    const plan = twoRoomBox()
    const diff = diffPlans(plan, moveWall(plan, 'w_mid', 0.0004, 0))
    expect(diff.changes).toEqual([])
  })
})
