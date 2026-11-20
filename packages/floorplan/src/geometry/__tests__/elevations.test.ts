import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STOREY_HEIGHT,
  SLAB_THICKNESS,
  floorElevations,
  isDrawnWall,
  stackLevels,
  type Floor,
  type FloorPlan,
  type StoreyLevel,
  type Wall
} from '..'
import { validatePlan } from '../validate'
import { parseFloorPlan } from '../../types/floorplan'
import { outline } from '../../test-support/outline'

/**
 * Storey stacking: where each level stands, derived from its walls because the
 * plan carries no z (C5). The values are the spec's ("Storeys stack on slabs,
 * at heights derived from their walls"); the invariants hold for any plan.
 */

const levels = (entries: Array<[number, number]>): Map<number, number> => new Map(entries)

/** `{ level: floorLevel }`, rounded to the millimetre so sums read cleanly. */
function floorLevels(stack: ReadonlyMap<number, StoreyLevel>): Record<number, number> {
  return Object.fromEntries(
    [...stack].map(([level, s]) => [level, Math.round(s.floorLevel * 1000) / 1000])
  )
}

describe('stackLevels with no slab (the rule IFC used before slabs)', () => {
  it('stands each storey on the tallest wall below it, and sinks basements by their own', () => {
    const stack = stackLevels(levels([[-1, 2.5], [0, 3], [1, 2.8], [2, 2.8]]), 0)
    expect(floorLevels(stack)).toEqual({ [-1]: -2.5, 0: 0, 1: 3, 2: 5.8 })
  })

  it('keeps each storey clear height', () => {
    const stack = stackLevels(levels([[0, 3], [1, 2.8]]), 0)
    expect(stack.get(0)!.clearHeight).toBe(3)
    expect(stack.get(1)!.clearHeight).toBe(2.8)
  })
})

describe('stackLevels with 0.25 m slabs', () => {
  it('gives the spec values for levels -1, 0, 1 and 2', () => {
    const stack = stackLevels(levels([[-1, 2.5], [0, 3], [1, 2.8], [2, 2.8]]), 0.25)
    expect(floorLevels(stack)).toEqual({ [-1]: -2.75, 0: 0, 1: 3.25, 2: 6.3 })
  })

  it('keeps a one-storey plan at ±0.00', () => {
    const stack = stackLevels(levels([[0, 2.7]]), 0.25)
    expect(stack.get(0)).toEqual({ floorLevel: 0, clearHeight: 2.7 })
  })

  it('steps 2.95 m over a storey with no walls', () => {
    const stack = stackLevels(levels([[0, 3], [1, 0], [2, 2.8]]), 0.25)
    expect(stack.get(1)!.clearHeight).toBe(DEFAULT_STOREY_HEIGHT)
    expect(stack.get(2)!.floorLevel - stack.get(1)!.floorLevel).toBeCloseTo(2.95, 9)
  })

  it('stacks several basements downward, each under the slab of the one above', () => {
    const stack = stackLevels(levels([[-2, 2], [-1, 2.5], [0, 3]]), 0.25)
    expect(floorLevels(stack)).toEqual({ [-2]: -5, [-1]: -2.75, 0: 0 })
  })
})

describe('stackLevels defaults and numbering', () => {
  it('counts a level with no drawn wall as 2.7 m', () => {
    expect(DEFAULT_STOREY_HEIGHT).toBe(2.7)
    const stack = stackLevels(levels([[0, 0]]), 0.25)
    expect(stack.get(0)!.clearHeight).toBe(2.7)
  })

  it('treats a missing, negative or non-finite height as no wall', () => {
    const stack = stackLevels(levels([[0, -1], [1, Number.NaN], [2, Infinity]]), 0)
    expect([...stack.values()].map((s) => s.clearHeight)).toEqual([2.7, 2.7, 2.7])
  })

  it('ignores gaps in the level numbering', () => {
    const gappy = stackLevels(levels([[-4, 2], [0, 3], [5, 2.8]]), 0.25)
    const dense = stackLevels(levels([[-1, 2], [0, 3], [1, 2.8]]), 0.25)
    expect(Object.values(floorLevels(gappy))).toEqual(Object.values(floorLevels(dense)))
  })

  it('starts the stack at 0 when the lowest level at or above 0 is not 0', () => {
    expect(floorLevels(stackLevels(levels([[3, 2.9], [4, 2.7]]), 0.25))).toEqual({ 3: 0, 4: 3.15 })
  })

  it('gives nothing for no levels', () => {
    expect(stackLevels(new Map(), 0.25).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Invariants over generated stacks
// ---------------------------------------------------------------------------

/** mulberry32: seeded, so a failing case replays from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generated(seed: number): Map<number, number> {
  const random = mulberry32(seed)
  const out = new Map<number, number>()
  const count = 1 + Math.floor(random() * 12)
  for (let i = 0; i < count; i++) {
    const level = Math.floor(random() * 21) - 8
    // Some levels have no drawn wall (0), the rest something between 2 and 5 m.
    out.set(level, random() < 0.2 ? 0 : 2 + random() * 3)
  }
  return out
}

describe('stackLevels invariants', () => {
  const EPS = 1e-9

  for (const slab of [0, 0.25]) {
    it(`holds for 500 generated stacks with slab ${slab}`, () => {
      for (let seed = 1; seed <= 500; seed++) {
        const input = generated(seed)
        const stack = stackLevels(input, slab)
        const ordered = [...stack].sort(([a], [b]) => a - b)

        expect(stack.size, `seed ${seed}`).toBe(input.size)
        for (const [, s] of ordered) {
          expect(Number.isFinite(s.floorLevel), `seed ${seed}`).toBe(true)
          expect(s.clearHeight, `seed ${seed}`).toBeGreaterThan(0)
        }

        for (let i = 1; i < ordered.length; i++) {
          const lower = ordered[i - 1]![1]
          const higher = ordered[i]![1]
          const wallTop = lower.floorLevel + lower.clearHeight
          // The higher storey's slab lies on the lower one's walls: never into
          // them (no wall overlaps a slab), and exactly one slab between them.
          expect(higher.floorLevel - slab, `seed ${seed}`).toBeGreaterThanOrEqual(wallTop - EPS)
          expect(Math.abs(higher.floorLevel - wallTop - slab), `seed ${seed}`).toBeLessThan(EPS)
        }

        const lowestAboveGround = ordered.find(([level]) => level >= 0)
        if (lowestAboveGround) expect(lowestAboveGround[1].floorLevel, `seed ${seed}`).toBe(0)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Drawn walls and floor elevations
// ---------------------------------------------------------------------------

function wallOn(id: string, floor: string | undefined, height: number, extra: Partial<Wall> = {}): Wall {
  return {
    id,
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    height,
    kind: 'interior',
    ...(floor === undefined ? {} : { floor }),
    ...extra
  }
}

function planOf(floors: Floor[] | undefined, walls: Wall[]): FloorPlan {
  return { version: '1', units: 'm', walls, rooms: [], openings: [], ...(floors ? { floors } : {}) }
}

const GROUND: Floor = { id: 'ground', name: 'Ground', level: 0 }
const FIRST: Floor = { id: 'first', name: 'First', level: 1 }
const SECOND: Floor = { id: 'second', name: 'Second', level: 2 }
const CELLAR: Floor = { id: 'cellar', name: 'Cellar', level: -1 }

const round = (n: number): number => Math.round(n * 1000) / 1000

describe('isDrawnWall', () => {
  const none = new Set<string>()

  it('accepts a plain wall', () => {
    expect(isDrawnWall(wallOn('a', undefined, 2.7), none)).toBe(true)
  })

  it('rejects a virtual wall', () => {
    expect(isDrawnWall(wallOn('a', undefined, 2.7, { virtual: true }), none)).toBe(false)
  })

  it('rejects a wall validation reported broken', () => {
    expect(isDrawnWall(wallOn('a', undefined, 2.7), new Set(['a']))).toBe(false)
  })

  it('rejects a wall with a number that is not finite', () => {
    const bad: Partial<Wall>[] = [
      { height: Number.NaN },
      { height: Infinity },
      { thickness: Number.NaN },
      { start: [Number.NaN, 0] },
      { end: [0, Infinity] }
    ]
    for (const extra of bad) expect(isDrawnWall(wallOn('a', undefined, 2.7, extra), none)).toBe(false)
  })
})

describe('SLAB_THICKNESS', () => {
  it('is 0.25 m until a plan can state its own', () => {
    expect(SLAB_THICKNESS).toBe(0.25)
  })
})

describe('floorElevations', () => {
  it('maps every floor id to its floor level and clear height', () => {
    const plan = planOf(
      [CELLAR, GROUND, FIRST, SECOND],
      [
        wallOn('c', 'cellar', 2.5),
        wallOn('g', 'ground', 3),
        wallOn('f', 'first', 2.8),
        wallOn('s', 'second', 2.8)
      ]
    )
    const { floors } = floorElevations(plan)

    expect(Object.fromEntries([...floors].map(([id, s]) => [id, round(s.floorLevel)]))).toEqual({
      cellar: -2.75,
      ground: 0,
      first: 3.25,
      second: 6.3
    })
    expect(floors.get('ground')!.clearHeight).toBe(3)
  })

  it('puts the roof on the top storey walls, one slab thick', () => {
    const plan = planOf(
      [CELLAR, GROUND, FIRST, SECOND],
      [
        wallOn('c', 'cellar', 2.5),
        wallOn('g', 'ground', 3),
        wallOn('f', 'first', 2.8),
        wallOn('s', 'second', 2.8)
      ]
    )
    const { roof } = floorElevations(plan)
    expect(round(roof.bottom)).toBe(9.1)
    expect(round(roof.top)).toBe(9.35)
  })

  it('gives a one-storey plan its slab below ±0.00 and its roof on its walls', () => {
    const { floors, roof } = floorElevations(planOf(undefined, [wallOn('a', undefined, 2.7)]))
    expect(floors.get('ground')).toEqual({ floorLevel: 0, clearHeight: 2.7 })
    expect(roof).toEqual({ bottom: 2.7, top: 2.95 })
  })

  it('lets floors that share a level share one storey, as tall as the taller walls', () => {
    const wing: Floor = { id: 'wing', name: 'Wing', level: 0 }
    const plan = planOf(
      [GROUND, wing, FIRST],
      [wallOn('a', 'ground', 2.5), wallOn('b', 'wing', 3.2), wallOn('c', 'first', 2.7)]
    )
    const { floors } = floorElevations(plan)

    expect(floors.get('ground')).toEqual(floors.get('wing'))
    expect(floors.get('wing')!.clearHeight).toBe(3.2)
    expect(round(floors.get('first')!.floorLevel)).toBe(3.45)
  })

  it('does not let a virtual or broken tallest wall raise its storey', () => {
    const plan = planOf(
      [GROUND, FIRST],
      [
        wallOn('a', 'ground', 2.7),
        wallOn('virtual', 'ground', 9, { virtual: true }),
        // Zero length: validation reports it broken.
        wallOn('zero', 'ground', 8, { start: [1, 1], end: [1, 1] }),
        wallOn('nan', 'ground', Number.NaN),
        wallOn('b', 'first', 2.7)
      ]
    )
    const { floors } = floorElevations(plan)

    expect(floors.get('ground')!.clearHeight).toBe(2.7)
    expect(round(floors.get('first')!.floorLevel)).toBe(2.95)
  })

  it('counts a declared floor with no walls as 2.7 m', () => {
    const { floors } = floorElevations(planOf([GROUND, FIRST, SECOND], [wallOn('g', 'ground', 3)]))
    expect(floors.get('first')!.clearHeight).toBe(2.7)
    expect(round(floors.get('second')!.floorLevel - floors.get('first')!.floorLevel)).toBe(2.95)
  })

  it('covers a floor only a wall names', () => {
    const { floors } = floorElevations(planOf([GROUND], [wallOn('a', 'attic', 2.4)]))
    expect([...floors.keys()].sort()).toEqual(['attic', 'ground'])
  })

  it('never throws, whatever the plan contains', () => {
    const garbage: unknown[] = [
      { version: '1', units: 'm', walls: [], rooms: [], openings: [] },
      planOf([GROUND, GROUND], [wallOn('a', 'ground', 2.7), wallOn('a', 'ground', 3)]),
      planOf(undefined, [wallOn('a', undefined, 2.7, { start: [Number.NaN, Number.NaN] })]),
      {
        version: '1',
        units: 'm',
        walls: [wallOn('a', 'ground', 2.7)],
        rooms: [{ id: 'r', name: 'R', boundary: ['missing', 'a'] }],
        openings: [{ id: 'o', wall: 'missing', type: 'door', offset: -5, width: 99, sill: 0, height: 2 }]
      },
      { version: '1', units: 'm', walls: [{ id: 'x' }], rooms: [], openings: [] },
      { version: '1', units: 'm', walls: [null], rooms: [], openings: [] },
      planOf([{ id: 'nan', name: 'NaN', level: Number.NaN }, GROUND], [wallOn('a', 'nan', 2.7)])
    ]

    for (const plan of garbage) {
      const result = floorElevations(plan as FloorPlan)
      expect(result.floors.size).toBeGreaterThan(0)
      for (const s of result.floors.values()) expect(Number.isFinite(s?.floorLevel)).toBe(true)
      expect(Number.isFinite(result.roof.top)).toBe(true)
    }
  })
})

/**
 * Known failures from the lab (entry Z-4), as expected failures. Each states the right
 * behaviour and fails today; when its fix lands, vitest reports it, and `it.fails` becomes
 * `it`. Each title starts with its lab entry ID.
 */
describe('known failures (expected to fail until fixed)', () => {
  // Lab VE-2. 'stands each storey on the tallest wall below it' pins the rule this probe
  // questions; a warning would satisfy both (see test-support/pinned-tests.md).
  it.fails('VE-2 one partition typed 27 instead of 2.7 does not make a 27 m storey in silence', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const tall = { id: 'p', start: [2.5, 0], end: [2.5, 2], thickness: 0.1, height: 27, kind: 'partition' }
    const plan: FloorPlan = parseFloorPlan({ walls: [...walls, tall], rooms: [room] })
    const storey = [...floorElevations(plan).floors.values()][0]!
    // A line about the height. The partition also stands inside the room without being in its
    // wall list, which ARE-4 reports as a room that does not match its space; that line says
    // nothing about 27 m, so it does not count here.
    const quiet = !validatePlan(plan).issues.some((i) => /\b27\b|high|tall/.test(i.message))
    expect(quiet && JSON.stringify(storey).includes('27')).toBe(false)
  })
})
