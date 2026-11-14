import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import type { BuildStep } from '../build'
import { buildSteps, planAfter, traceWall } from '../build'
import { buildFloorPlan } from '../floorplan'
import { validatePlan } from '../validate'
import { area, dot, signedArea, sub } from '../vec2'

/**
 * A 6×4 house split in two by an inner wall, with a door in the front and one
 * between the rooms.
 */
function house(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [6, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w2', start: [6, 0], end: [6, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w3', start: [6, 4], end: [0, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w5', start: [3, 0], end: [3, 4], thickness: 0.1, height: 2.7, kind: 'interior' }
    ],
    rooms: [
      { id: 'r1', name: 'Living', boundary: ['w1', 'w5', 'w3', 'w4'] },
      { id: 'r2', name: 'Kitchen', boundary: ['w1', 'w2', 'w3', 'w5'] }
    ],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 },
      { id: 'o2', wall: 'w5', type: 'door', offset: 1.5, width: 0.8, height: 2.1, sill: 0 }
    ]
  }
}

const EMPTY: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }

const copy = (plan: FloorPlan): FloorPlan => JSON.parse(JSON.stringify(plan))

function edit(mutate: (plan: FloorPlan) => void): FloorPlan {
  const plan = copy(house())
  mutate(plan)
  return plan
}

const wall = (plan: FloorPlan, id: string) => plan.walls.find((w) => w.id === id)!

const summary = (steps: readonly BuildStep[]): string[] =>
  steps.map((step) => `${step.group}:${step.kind}:${step.id}`)

describe('the house fixture', () => {
  it('is a sound plan, so every pair below starts and ends valid', () => {
    expect(validatePlan(house()).issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('buildSteps: the order a change is drawn in', () => {
  it('draws a new house outer walls first, then inner walls, openings, rooms and dimensions', () => {
    expect(summary(buildSteps(EMPTY, house()))).toEqual([
      '1:wall:w1',
      '1:wall:w2',
      '1:wall:w3',
      '1:wall:w4',
      '2:wall:w5',
      '3:opening:o1',
      '3:opening:o2',
      '4:room:r1',
      '4:room:r2',
      '5:dimensions:dimensions'
    ])
  })

  it('redraws only the wall whose length changed, with what rests on it', () => {
    const next = edit((plan) => {
      wall(plan, 'w5').end = [3, 3]
    })
    // Its rooms and its door go first and come back once it has traced again.
    expect(summary(buildSteps(house(), next))).toEqual([
      '0:remove:r1',
      '0:remove:r2',
      '0:remove:o2',
      '0:remove:w5',
      '2:wall:w5',
      '3:opening:o2',
      '4:room:r1',
      '4:room:r2',
      '5:dimensions:dimensions'
    ])
  })

  it('gives no step to a wall that did not change', () => {
    const next = edit((plan) => {
      wall(plan, 'w5').end = [3, 3]
    })
    const touched = new Set(buildSteps(house(), next).map((step) => step.id))
    for (const id of ['w1', 'w2', 'w3', 'w4', 'o1']) expect(touched.has(id)).toBe(false)
  })

  it('removes a wall together with the room it bordered', () => {
    const next = edit((plan) => {
      plan.walls = plan.walls.filter((w) => w.id !== 'w5')
      plan.openings = plan.openings.filter((o) => o.wall !== 'w5')
      plan.rooms = [{ id: 'r1', name: 'Living', boundary: ['w1', 'w2', 'w3', 'w4'] }]
    })
    expect(summary(buildSteps(house(), next))).toEqual([
      '0:remove:r1',
      '0:remove:r2',
      '0:remove:o2',
      '0:remove:w5',
      '4:room:r1',
      '5:dimensions:dimensions'
    ])
  })

  it('slides a wall that only moved, keeping its door', () => {
    const next = edit((plan) => {
      const w5 = wall(plan, 'w5')
      w5.start = [4, 0]
      w5.end = [4, 4]
    })
    expect(summary(buildSteps(house(), next))).toEqual([
      '0:remove:r1',
      '0:remove:r2',
      '2:move:w5',
      '4:room:r1',
      '4:room:r2',
      '5:dimensions:dimensions'
    ])
  })

  it('raises a wall whose only change is its height, with nothing else to redraw', () => {
    const next = edit((plan) => {
      wall(plan, 'w1').height = 3
    })
    expect(summary(buildSteps(house(), next))).toEqual(['1:raise:w1'])
  })

  it('has nothing to draw when nothing changed', () => {
    expect(buildSteps(house(), copy(house()))).toEqual([])
  })

  it('has nothing to draw for a change that does not change a shape', () => {
    // `kind` only changes the line weight, and the order walls are listed in
    // means nothing.
    const next = edit((plan) => {
      wall(plan, 'w5').kind = 'partition'
      plan.walls.reverse()
    })
    expect(buildSteps(house(), next)).toEqual([])
  })

  it('cuts a new window in after the walls, without touching the rooms', () => {
    const next = edit((plan) => {
      plan.openings.push({
        id: 'o3',
        wall: 'w2',
        type: 'window',
        offset: 1,
        width: 1.2,
        height: 1.2,
        sill: 0.9
      })
    })
    expect(summary(buildSteps(house(), next))).toEqual([
      '3:opening:o3',
      '5:dimensions:dimensions'
    ])
  })

  it('says where each drawn part ends, for the pulse', () => {
    const steps = buildSteps(EMPTY, house())
    const at = (id: string) => steps.find((step) => step.id === id)?.at
    expect(at('w1')).toEqual({ x: 6, y: 0 })
    // An opening's centre along its wall.
    expect(at('o1')?.x).toBeCloseTo(1.45)
    expect(at('o1')?.y).toBeCloseTo(0)
    // A room's label point lies inside it.
    const r1 = at('r1')!
    expect(r1.x).toBeGreaterThan(0)
    expect(r1.x).toBeLessThan(3)
    expect(at('dimensions')).toBeUndefined()
  })
})

/**
 * Plans the assistant could plausibly save one after another. Every ordered
 * pair of them is a change the build must be able to play.
 */
function variants(): FloorPlan[] {
  return [
    EMPTY,
    house(),
    // Outer walls only, the first pass.
    edit((plan) => {
      plan.walls = plan.walls.filter((w) => w.kind === 'exterior')
      plan.rooms = []
      plan.openings = []
    }),
    // All walls, no openings or rooms yet.
    edit((plan) => {
      plan.rooms = []
      plan.openings = []
    }),
    // Walls and openings, no rooms yet.
    edit((plan) => {
      plan.rooms = []
    }),
    // The inner wall gone, one room.
    edit((plan) => {
      plan.walls = plan.walls.filter((w) => w.id !== 'w5')
      plan.openings = plan.openings.filter((o) => o.wall !== 'w5')
      plan.rooms = [{ id: 'r1', name: 'Living', boundary: ['w1', 'w2', 'w3', 'w4'] }]
    }),
    // The inner wall moved.
    edit((plan) => {
      const w5 = wall(plan, 'w5')
      w5.start = [4, 0]
      w5.end = [4, 4]
    }),
    // The inner wall shortened and its door gone (the rooms can no longer close).
    edit((plan) => {
      wall(plan, 'w5').end = [3, 3]
      plan.openings = plan.openings.filter((o) => o.id !== 'o2')
    }),
    // Taller outer walls and a room renamed.
    edit((plan) => {
      for (const w of plan.walls) if (w.kind === 'exterior') w.height = 3.2
      plan.rooms[0].name = 'Lounge'
    }),
    // The front door moved and widened, a window added.
    edit((plan) => {
      plan.openings[0] = { ...plan.openings[0], offset: 2, width: 1.2 }
      plan.openings.push({
        id: 'o3',
        wall: 'w3',
        type: 'window',
        offset: 1,
        width: 1.5,
        height: 1.2,
        sill: 0.9
      })
    }),
    // A bigger house: the right side pushed out, new ids for the changed walls.
    {
      version: '1',
      units: 'm',
      walls: [
        { id: 'w1', start: [0, 0], end: [8, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
        { id: 'w2b', start: [8, 0], end: [8, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
        { id: 'w3', start: [8, 4], end: [0, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
        { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
        { id: 'w5', start: [3, 0], end: [3, 4], thickness: 0.1, height: 2.7, kind: 'interior' }
      ],
      rooms: [
        { id: 'r1', name: 'Living', boundary: ['w1', 'w5', 'w3', 'w4'] },
        { id: 'r2', name: 'Kitchen', boundary: ['w1', 'w2b', 'w3', 'w5'] }
      ],
      openings: [
        { id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 },
        { id: 'o2', wall: 'w5', type: 'door', offset: 1.5, width: 0.8, height: 2.1, sill: 0 }
      ]
    }
  ]
}

const errorKeys = (plan: FloorPlan): Set<string> =>
  new Set(
    validatePlan(plan)
      .issues.filter((i) => i.severity === 'error')
      .map((i) => `${i.code}:${i.id}`)
  )

describe('planAfter: every in-between plan is a plan', () => {
  const plans = variants()
  const pairs = plans.flatMap((prev, i) => plans.map((next, j) => ({ prev, next, i, j })))

  it.each(pairs)('plays $i → $j to exactly the new plan', ({ prev, next }) => {
    const steps = buildSteps(prev, next)
    expect(planAfter(prev, next, steps, steps.length)).toEqual(next)
  })

  it.each(pairs)('keeps $i → $j valid at every step', ({ prev, next }) => {
    const steps = buildSteps(prev, next)
    const allowed = new Set([...errorKeys(prev), ...errorKeys(next)])

    for (let count = 0; count <= steps.length; count++) {
      const plan = planAfter(prev, next, steps, count)

      for (const key of errorKeys(plan)) {
        expect(allowed, `step ${count}: ${key}`).toContain(key)
      }

      const wallIds = new Set(plan.walls.map((w) => w.id))
      for (const room of plan.rooms) {
        for (const id of room.boundary) {
          // A room may name a wall that is missing from the file itself, but
          // never one the build has not drawn yet.
          if (next.walls.some((w) => w.id === id)) {
            expect(wallIds, `step ${count}: room ${room.id}`).toContain(id)
          }
        }
      }
      for (const opening of plan.openings) {
        expect(wallIds, `step ${count}: opening ${opening.id}`).toContain(opening.wall)
      }
    }
  })

  it('starts from the old plan', () => {
    const next = edit((plan) => {
      wall(plan, 'w5').end = [3, 3]
    })
    const steps = buildSteps(house(), next)
    expect(planAfter(house(), next, steps, 0)).toEqual(house())
  })

  it('shows a moved wall where it was until its step, and where it is after', () => {
    const next = edit((plan) => {
      const w5 = wall(plan, 'w5')
      w5.start = [4, 0]
      w5.end = [4, 4]
    })
    const steps = buildSteps(house(), next)
    const moveAt = steps.findIndex((step) => step.kind === 'move')
    expect(wall(planAfter(house(), next, steps, moveAt), 'w5').start).toEqual([3, 0])
    expect(wall(planAfter(house(), next, steps, moveAt + 1), 'w5').start).toEqual([4, 0])
  })
})

describe('traceWall: a wall drawn from its start to its end', () => {
  function drawnWalls() {
    const plan = edit((p) => {
      // A diagonal wall, so the invariants are not only checked on the axes.
      p.walls.push({
        id: 'd1',
        start: [1, 1],
        end: [2.5, 3.2],
        thickness: 0.15,
        height: 2.7,
        kind: 'partition'
      })
    })
    return buildFloorPlan(plan).walls.filter((w) => !w.virtual)
  }

  const totalArea = (polygons: readonly (readonly { x: number; y: number }[])[]) =>
    polygons.reduce((sum, polygon) => sum + area(polygon), 0)

  const ts = Array.from({ length: 21 }, (_, i) => i / 20)

  it('draws nothing at the start and the whole wall at the end', () => {
    for (const w of drawnWalls()) {
      expect(totalArea(traceWall(w, 0))).toBe(0)
      expect(traceWall(w, 1)).toEqual(w.slices)
    }
  })

  it('only ever grows', () => {
    for (const w of drawnWalls()) {
      let last = 0
      for (const t of ts) {
        const now = totalArea(traceWall(w, t))
        expect(now).toBeGreaterThanOrEqual(last - 1e-9)
        last = now
      }
    }
  })

  it('never reaches past the traced point, so the end never comes before the start', () => {
    for (const w of drawnWalls()) {
      const [start, end] = w.centerline
      const axis = sub(end, start)
      const len2 = dot(axis, axis)
      for (const t of ts) {
        for (const polygon of traceWall(w, t)) {
          for (const p of polygon) {
            expect(dot(sub(p, start), axis) / len2).toBeLessThanOrEqual(t + 1e-9)
          }
        }
      }
    }
  })

  it('keeps the orientation of the slices it clips', () => {
    for (const w of drawnWalls()) {
      const sign = Math.sign(signedArea(w.slices[0]))
      for (const t of ts) {
        for (const polygon of traceWall(w, t)) {
          expect(Math.sign(signedArea(polygon))).toBe(sign)
        }
      }
    }
  })

  it('draws nothing for a virtual wall', () => {
    const plan = edit((p) => {
      p.walls.push({
        id: 'v1',
        start: [0, 2],
        end: [3, 2],
        thickness: 0,
        height: 0,
        kind: 'partition',
        virtual: true
      })
    })
    const virtual = buildFloorPlan(plan).walls.find((w) => w.id === 'v1')!
    expect(traceWall(virtual, 0.5)).toEqual([])
  })
})
