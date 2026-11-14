import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { diffPlans } from '../diff'
import type { WallMotion } from '../diff'
import { plan, twoRoomBox, wall, withWall } from './diff-fixtures'

type Point = [number, number]

function rotateAbout(p: Point, pivot: Point, degrees: number): Point {
  const a = (degrees * Math.PI) / 180
  const dx = p[0] - pivot[0]
  const dy = p[1] - pivot[1]
  return [
    pivot[0] + dx * Math.cos(a) - dy * Math.sin(a),
    pivot[1] + dx * Math.sin(a) + dy * Math.cos(a)
  ]
}

function single(start: Point, end: Point): FloorPlan {
  return plan({ walls: [wall('a', start, end)] })
}

function motionOf(before: FloorPlan, after: FloorPlan): WallMotion | undefined {
  const [change] = diffPlans(before, after).changes
  return change?.motion
}

function asKind<K extends WallMotion['kind']>(
  motion: WallMotion | undefined,
  kind: K
): Extract<WallMotion, { kind: K }> {
  expect(motion?.kind).toBe(kind)
  return motion as Extract<WallMotion, { kind: K }>
}

describe('a wall that translated', () => {
  it('reports the vector and how far across and along the wall it went', () => {
    // A wall along +y: across is x, along is y.
    const before = single([4, 0], [4, 4])
    const after = single([4.5, 1], [4.5, 5])
    const motion = asKind(motionOf(before, after), 'translated')
    expect(motion.vector).toEqual([0.5, 1])
    expect(Math.abs(motion.normalDistance)).toBeCloseTo(0.5, 9)
    expect(motion.axialDistance).toBeCloseTo(1, 9)
  })

  it('has across and along parts that recompose to the vector, whatever the wall’s direction', () => {
    for (const angle of [0, 17, 90, 133, 200, 311]) {
      const start = rotateAbout([0, 0], [0, 0], angle)
      const end = rotateAbout([5, 0], [0, 0], angle)
      const v: Point = [0.3, -0.4]
      const motion = asKind(
        motionOf(single(start, end), single([start[0] + v[0], start[1] + v[1]], [end[0] + v[0], end[1] + v[1]])),
        'translated'
      )
      expect(Math.hypot(motion.normalDistance, motion.axialDistance)).toBeCloseTo(0.5, 9)
    }
  })

  it('does not depend on how the whole plan is turned', () => {
    const base = twoRoomBox()
    const moved = withWall(base, 'w_mid', { start: [4.5, 0], end: [4.5, 4] })
    const reference = asKind(motionOf(base, moved), 'translated')
    for (const angle of [25, 90, 180, 250]) {
      const turn = (p: FloorPlan): FloorPlan => ({
        ...p,
        walls: p.walls.map((w) => ({
          ...w,
          start: rotateAbout(w.start as Point, [0, 0], angle),
          end: rotateAbout(w.end as Point, [0, 0], angle)
        }))
      })
      const [change] = diffPlans(turn(base), turn(moved)).changes
      const motion = asKind(change!.motion, 'translated')
      expect(Math.abs(motion.normalDistance)).toBeCloseTo(Math.abs(reference.normalDistance), 9)
      expect(Math.abs(motion.axialDistance)).toBeCloseTo(Math.abs(reference.axialDistance), 9)
    }
  })
})

describe('a wall that was resized', () => {
  it('reports an extended end and says the start stayed', () => {
    const motion = asKind(motionOf(single([0, 0], [8, 0]), single([0, 0], [8.3, 0])), 'resized')
    expect(motion.fixedEnd).toBe('start')
    expect(motion.lengthDelta).toBeCloseTo(0.3, 9)
  })

  it('reports a shortened start and says the end stayed', () => {
    const motion = asKind(motionOf(single([0, 0], [8, 0]), single([0.5, 0], [8, 0])), 'resized')
    expect(motion.fixedEnd).toBe('end')
    expect(motion.lengthDelta).toBeCloseTo(-0.5, 9)
  })

  it('is not resized when the free end is carried across the fixed one', () => {
    const motion = motionOf(single([0, 0], [8, 0]), single([0, 0], [-3, 0]))
    expect(motion?.kind).not.toBe('resized')
  })
})

describe('a wall that rotated', () => {
  it.each([
    [10, [1, 2]],
    [-35, [6, -3]],
    [90, [0, 0]],
    [170, [2, 7]]
  ] as const)('reports %d° about the point it turned on', (degrees, pivot) => {
    for (const [start, end] of [
      [
        [0, 0],
        [4, 0]
      ],
      [
        [1, 1],
        [1, 6]
      ],
      [
        [5, 5],
        [2, 9]
      ]
    ] as [Point, Point][]) {
      const turned = single(
        rotateAbout(start, [...pivot] as Point, degrees),
        rotateAbout(end, [...pivot] as Point, degrees)
      )
      const motion = asKind(motionOf(single(start, end), turned), 'rotated')
      expect(motion.angleDeg).toBeCloseTo(degrees, 6)
      expect(motion.pivot[0]).toBeCloseTo(pivot[0], 6)
      expect(motion.pivot[1]).toBeCloseTo(pivot[1], 6)
    }
  })

  it('keeps the wall’s length', () => {
    const turned = single(rotateAbout([0, 0], [1, 1], 20), rotateAbout([4, 0], [1, 1], 20))
    const [a, b] = [turned.walls[0]!.start, turned.walls[0]!.end]
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(4, 9)
  })

  it('takes the end that did not move as the pivot', () => {
    const turned = single([0, 0], rotateAbout([4, 0], [0, 0], 30))
    const motion = asKind(motionOf(single([0, 0], [4, 0]), turned), 'rotated')
    expect(motion.pivot[0]).toBeCloseTo(0, 9)
    expect(motion.pivot[1]).toBeCloseTo(0, 9)
    expect(motion.angleDeg).toBeCloseTo(30, 6)
  })

  it('reads swapped ends as a half turn about the middle', () => {
    const motion = asKind(motionOf(single([0, 0], [4, 0]), single([4, 0], [0, 0])), 'rotated')
    expect(motion.angleDeg).toBeCloseTo(180, 6)
    expect(motion.pivot[0]).toBeCloseTo(2, 9)
    expect(motion.pivot[1]).toBeCloseTo(0, 9)
  })
})

describe('a wall that was reshaped', () => {
  it('is what is left when the ends move differently and the length changes', () => {
    const motion = motionOf(single([0, 0], [4, 0]), single([0.5, 0.5], [6, -1]))
    expect(motion).toEqual({ kind: 'reshaped' })
  })
})

describe('a wall that did not move', () => {
  it('has no motion when only its thickness, height, kind or floor changed', () => {
    const base = twoRoomBox()
    for (const patch of [
      { thickness: 0.15 },
      { height: 3 },
      { kind: 'partition' as const },
      { floor: 'first' }
    ]) {
      const [change] = diffPlans(base, withWall(base, 'w_mid', patch)).changes.filter(
        (c) => c.entity.id === 'w_mid'
      )
      expect(change).toBeDefined()
      expect('motion' in change!).toBe(false)
    }
  })

  it('has no motion when it was added or removed', () => {
    const base = twoRoomBox()
    const without = { ...base, walls: base.walls.filter((w) => w.id !== 'w_mid'), rooms: [], openings: [] }
    for (const diff of [diffPlans(base, without), diffPlans(without, base)]) {
      for (const change of diff.changes.filter((c) => c.entity.type === 'wall')) {
        expect('motion' in change).toBe(false)
      }
    }
  })
})
