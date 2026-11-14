/**
 * The size guard (5.3): a big plan diffs quickly, and twice the plan does not
 * take four times as long. A quadratic step (a `find` inside a loop over every
 * wall) would pass every other test here and still freeze the review on a
 * real building, so this is the test that catches it.
 *
 * The growth is measured as an exponent over a fourfold step in size, about
 * 1,000 to 4,000 entities: time grows as entities^k, linear is k = 1 and
 * quadratic (doubling quadruples) is k = 2. A ratio over a single doubling sat
 * too close to its bound on both sides to run on a shared CI machine; over four
 * times the size, the engine measured k ≈ 0.8-1.1 and the same engine with
 * `matchById` made quadratic measured k ≈ 1.55-1.9, so the bound of 1.4 sits
 * between them with room on each side. Times are the fastest of nine runs after a warm-up, the two sizes alternating.
 */

import { describe, expect, it } from 'vitest'
import { changesOutsideScope, diffPlans } from '../diff'
import { validatePlan } from '../validate'
import type { FloorPlan } from '../plan'
import { edit, opening, plan, room, wall } from './diff-fixtures'

type Wall = FloorPlan['walls'][number]
type Room = FloorPlan['rooms'][number]
type Opening = FloorPlan['openings'][number]

/**
 * `side` × `side` rooms of 4 × 4 m, drawn like `sixRoomHouse`: one wall per room
 * edge, a door on every room's east wall but the last column's. About
 * 4·side² entities.
 */
function grid(side: number): FloorPlan {
  const walls: Wall[] = []
  for (let line = 0; line <= side; line++) {
    const edge = line === 0 || line === side
    for (let cell = 0; cell < side; cell++) {
      const extra = edge ? { kind: 'exterior' as const } : { thickness: 0.1 }
      walls.push(wall(`h${line}_${cell}`, [cell * 4, line * 4], [cell * 4 + 4, line * 4], extra))
      walls.push(wall(`v${line}_${cell}`, [line * 4, cell * 4], [line * 4, cell * 4 + 4], extra))
    }
  }
  const rooms: Room[] = []
  const openings: Opening[] = []
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      rooms.push(
        room(`r${column}_${row}`, `Room ${column} ${row}`, [
          `h${row}_${column}`,
          `v${column + 1}_${row}`,
          `h${row + 1}_${column}`,
          `v${column}_${row}`
        ])
      )
      if (column < side - 1) openings.push(opening(`d${column}_${row}`, `v${column + 1}_${row}`, 'door', 1.5, 0.9))
    }
  }
  return plan({ walls, rooms, openings })
}

const entities = (p: FloorPlan): number => p.walls.length + p.rooms.length + p.openings.length

/**
 * The kind of turn the assistant makes on a big plan: a few walls moved, a few
 * rooms renamed, a door widened, a wall rebuilt under a new id. The edit's size
 * is fixed, so only the plan grows between the two runs.
 */
function slightlyEdited(source: FloorPlan): FloorPlan {
  return edit(source, (copy) => {
    for (const w of copy.walls.slice(0, 5)) {
      w.start = [w.start[0], w.start[1] + 0.2]
      w.end = [w.end[0], w.end[1] + 0.2]
    }
    for (const r of copy.rooms.slice(-5)) r.name = `${r.name} (renamed)`
    copy.openings[0]!.width = 1.1
    const rebuilt = copy.walls[copy.walls.length - 1]!
    rebuilt.id = `${rebuilt.id}_new`
  })
}

/**
 * The fastest of several runs: noise (a GC pause, a busy CI machine) only ever adds
 * time, so the minimum is the steadiest estimate of what the code itself costs.
 */
function fastestMs(run: () => void, times = 9): number {
  run()
  const samples: number[] = []
  for (let i = 0; i < times; i++) {
    const start = performance.now()
    run()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return samples[0]!
}

/**
 * k in time ∝ entities^k. The small and large runs alternate, so a busy machine
 * slows both alike instead of only whichever happened to run during a spike.
 */
function growth(small: FloorPlan, large: FloorPlan, run: (p: FloorPlan) => () => void): number {
  const runSmall = run(small)
  const runLarge = run(large)
  runSmall()
  runLarge()
  let fastSmall = Infinity
  let fastLarge = Infinity
  for (let i = 0; i < 9; i++) {
    fastSmall = Math.min(fastSmall, fastestMs(runSmall, 1))
    fastLarge = Math.min(fastLarge, fastestMs(runLarge, 1))
  }
  return Math.log(fastLarge / fastSmall) / Math.log(entities(large) / entities(small))
}

/** Twice as many entities would take four times as long at k = 2. */
const MAX_GROWTH = 1.4

describe('the size guard', () => {
  const small = grid(16)
  const large = grid(32)

  it('builds plans of about 1,000 and 4,000 entities that validate', () => {
    expect(entities(small)).toBeGreaterThanOrEqual(1000)
    expect(entities(large)).toBeGreaterThanOrEqual(3.9 * entities(small))
    expect(validatePlan(small).issues).toEqual([])
    expect(validatePlan(large).issues).toEqual([])
  })

  it('diffs 1,000 entities against a slightly edited copy well inside a second', () => {
    const next = slightlyEdited(small)
    const diff = diffPlans(small, next)
    // The edit is really there: moved walls, renames, the door and the rebuilt wall.
    expect(diff.changes.length).toBeGreaterThan(10)
    expect(diff.issues.some((i) => i.code === 'suspected_id_churn')).toBe(true)
    expect(fastestMs(() => diffPlans(small, next))).toBeLessThan(1000)
  })

  // Retried: a timing can still lose to a burst of load on a shared machine, a quadratic step cannot pass.
  it('grows about linearly: twice the entities does not take four times as long', { retry: 4 }, () => {
    const run = (p: FloorPlan) => {
      const next = slightlyEdited(p)
      return () => diffPlans(p, next)
    }
    expect(growth(small, large, run)).toBeLessThan(MAX_GROWTH)
  })

  it('checks the scope of a turn on the same plans about linearly too', { retry: 4 }, () => {
    const run = (p: FloorPlan) => {
      const next = slightlyEdited(p)
      return () => changesOutsideScope(diffPlans(p, next), p, next, { rooms: ['r0_0'] })
    }
    expect(growth(small, large, run)).toBeLessThan(MAX_GROWTH)
  })
})
