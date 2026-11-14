import { describe, expect, it } from 'vitest'
import { diffPlans, statusOf } from '../diff'
import type { ChangeKind, PlanDiff } from '../diff'
import { planFloors, planForFloor } from '../floors'
import { buildFloorPlan } from '../floorplan'
import { ghostsOf } from '../ghosts'
import type { FloorPlan } from '../plan'
import {
  edit,
  moveWall,
  room,
  shuffled,
  sixRoomHouse,
  twoFloorPlan,
  twoRoomBox,
  wall,
  withRoom,
  withWall
} from './diff-fixtures'

/**
 * The two-room box with a free-standing wall, and the same box after one turn:
 * the middle wall moved 0.5 m (its door follows, both rooms resize), the
 * free-standing wall removed and a hall added over the outer walls.
 */
function oneTurn(): { base: FloorPlan; head: FloorPlan } {
  const base = edit(twoRoomBox(), (copy) => {
    copy.walls.push(wall('w_extra', [1, 1], [2, 1]))
  })
  const head = edit(moveWall(base, 'w_mid', 0.5, 0), (copy) => {
    copy.walls = copy.walls.filter((w) => w.id !== 'w_extra')
    copy.rooms.push(room('r_hall', 'Hall', ['w_s', 'w_e', 'w_n', 'w_w']))
  })
  return { base, head }
}

/** Every floor either plan has, so a check over floors misses none. */
function floorsOf(diff: PlanDiff, ...plans: FloorPlan[]): string[] {
  const ids = new Set(plans.flatMap((p) => planFloors(p).map((f) => f.id)))
  for (const c of diff.changes) ids.add(c.floor)
  return [...ids].sort()
}

const swap: Record<ChangeKind, ChangeKind> = {
  added: 'removed',
  removed: 'added',
  modified: 'modified'
}

describe('statusOf', () => {
  it('gives the canvas added, modified and removed by id, a derived change as modified', () => {
    const { base, head } = oneTurn()
    const diff = diffPlans(base, head)
    // The door only followed its wall, and the rooms only resized: both are derived.
    expect(diff.changes.find((c) => c.entity.id === 'o_door')?.derived).toBe(true)
    expect(diff.changes.find((c) => c.entity.id === 'r_left')?.derived).toBe(true)

    expect(statusOf(diff, 'ground')).toEqual({
      r_hall: 'added',
      w_mid: 'modified',
      o_door: 'modified',
      r_left: 'modified',
      r_right: 'modified',
      w_extra: 'removed'
    })
  })

  it('marks a room modified when only one of its walls moved (7.1)', () => {
    const plan = sixRoomHouse()
    const next = withWall(plan, 'v1_0', { start: [4.3, 0], end: [4.3, 4] })
    const status = statusOf(diffPlans(plan, next), 'ground')
    expect(status['r00']).toBe('modified')
    expect(status['r10']).toBe('modified')
    expect(status['r20']).toBeUndefined()
  })

  it('is empty for a floor with no changes', () => {
    const plan = twoFloorPlan()
    const diff = diffPlans(plan, moveWall(plan, 'g_s', 0, -0.5))
    expect(Object.keys(statusOf(diff, 'ground')).length).toBeGreaterThan(0)
    expect(statusOf(diff, 'first')).toEqual({})
    expect(statusOf(diff, 'nowhere')).toEqual({})
  })

  it('is empty for two equal plans, written in any order', () => {
    const plan = sixRoomHouse()
    const diff = diffPlans(plan, shuffled(plan, 7))
    for (const floor of floorsOf(diff, plan)) expect(statusOf(diff, floor)).toEqual({})
  })

  it('leaves floors out: a floor id is not in the canvas’s id namespace', () => {
    const plan = twoFloorPlan()
    const renamed = edit(plan, (copy) => {
      copy.floors = copy.floors!.map((f) => (f.id === 'first' ? { ...f, name: 'Upstairs' } : f))
    })
    const diff = diffPlans(plan, renamed)
    expect(diff.changes.map((c) => c.entity.type)).toEqual(['floor'])
    expect(statusOf(diff, 'first')).toEqual({})
  })

  it('puts a wall that changed floor on the later floor only', () => {
    const plan = twoFloorPlan()
    const moved = withWall(plan, 'g_s', { floor: 'first' })
    const diff = diffPlans(plan, moved)
    expect(statusOf(diff, 'first')['g_s']).toBe('modified')
    expect(statusOf(diff, 'ground')['g_s']).toBeUndefined()
  })

  // Invariants: whatever the edit, these hold.
  const turns: Array<[string, () => { base: FloorPlan; head: FloorPlan }]> = [
    ['one turn on the box', oneTurn],
    [
      'a wall moved on the house',
      () => {
        const base = sixRoomHouse()
        return { base, head: moveWall(base, 'h1_1', 0, 0.4) }
      }
    ],
    [
      'a renamed room downstairs and a wall moved upstairs',
      () => {
        const base = twoFloorPlan()
        return { base, head: moveWall(withRoom(base, 'g_room', { name: 'Lobby' }), 'f_n', 0, 0.3) }
      }
    ]
  ]

  for (const [name, make] of turns) {
    describe(`for ${name}`, () => {
      it('names each changed wall, opening and room once, on its change’s floor, with its kind', () => {
        const { base, head } = make()
        const diff = diffPlans(base, head)
        const seen = new Map<string, ChangeKind>()
        for (const floor of floorsOf(diff, base, head)) {
          for (const [id, kind] of Object.entries(statusOf(diff, floor))) {
            expect(seen.has(id)).toBe(false)
            seen.set(id, kind)
            const c = diff.changes.find((x) => x.entity.id === id && x.entity.type !== 'floor')!
            expect(c.floor).toBe(floor)
            expect(c.kind).toBe(kind)
          }
        }
        const drawn = diff.changes.filter((c) => c.entity.type !== 'floor')
        expect([...seen.keys()].sort()).toEqual(drawn.map((c) => c.entity.id).sort())
      })

      it('swaps added and removed and keeps modified in the inverse diff', () => {
        const { base, head } = make()
        const forward = diffPlans(base, head)
        const backward = diffPlans(head, base)
        // The inverse diff reports a floor move on the earlier floor, so compare across all floors.
        const all = (diff: PlanDiff): Record<string, ChangeKind> =>
          Object.assign({}, ...floorsOf(diff, base, head).map((f) => statusOf(diff, f)))
        const swapped = Object.fromEntries(
          Object.entries(all(forward)).map(([id, kind]) => [id, swap[kind]])
        )
        expect(all(backward)).toEqual(swapped)
      })

      it('does not depend on how either plan is written', () => {
        const { base, head } = make()
        const diff = diffPlans(base, head)
        const again = diffPlans(shuffled(base, 3), shuffled(head, 11))
        for (const floor of floorsOf(diff, base, head)) {
          expect(JSON.stringify(statusOf(again, floor))).toBe(JSON.stringify(statusOf(diff, floor)))
        }
      })

      it('is plain data that survives JSON', () => {
        const { base, head } = make()
        const status = statusOf(diffPlans(base, head), 'ground')
        expect(JSON.parse(JSON.stringify(status))).toEqual(status)
      })
    })
  }
  describe('feeding the canvas’s ghosts (5.1)', () => {
    /** What the canvas does with a diff: the base drawn for the floor, and its ghosts. */
    const ghostIds = (base: FloorPlan, diff: PlanDiff, floor: string): string[] => {
      const ghosts = ghostsOf(buildFloorPlan(planForFloor(base, floor)), statusOf(diff, floor))
      return [...ghosts.walls, ...ghosts.rooms, ...ghosts.openings].map((e) => e.id).sort()
    }
    /** The removed and modified ids on `floor` that the base drew there. */
    const expected = (base: FloorPlan, diff: PlanDiff, floor: string): string[] => {
      const drawn = buildFloorPlan(planForFloor(base, floor))
      const ids = new Set([...drawn.walls, ...drawn.rooms, ...drawn.openings].map((e) => e.id))
      return Object.entries(statusOf(diff, floor))
        .filter(([id, kind]) => kind !== 'added' && ids.has(id))
        .map(([id]) => id)
        .sort()
    }

    it('gives ghosts for exactly the removed and modified entities', () => {
      const { base, head } = oneTurn()
      const diff = diffPlans(base, head)
      expect(ghostIds(base, diff, 'ground')).toEqual(['o_door', 'r_left', 'r_right', 'w_extra', 'w_mid'])
    })

    for (const [name, make] of turns) {
      it(`matches the statuses on every floor for ${name}`, () => {
        const { base, head } = make()
        const diff = diffPlans(base, head)
        for (const floor of floorsOf(diff, base, head)) {
          expect(ghostIds(base, diff, floor)).toEqual(expected(base, diff, floor))
        }
      })
    }
  })
})
