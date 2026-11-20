import { describe, expect, it } from 'vitest'
import type { FloorPlan, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { validatePlan } from '../validate'
import { enclosedArea } from '../../test-support/referee'
import { insideArea, outline, turn, type Point } from '../../test-support/outline'

/**
 * Generated rooms shaped L, T, U, Z and cross, with random sizes and wall thicknesses, from a
 * fixed seed. Each room is measured three ways: by Grid, by the independent referee in
 * `test-support/referee.ts`, and, where all its walls have one thickness, by the hand
 * formula `insideArea`. Then Grid measures it again turned, with some walls drawn from their
 * other end, and with its wall list reversed or started elsewhere. None of that may change
 * the area.
 */

/** A small seeded generator (mulberry32), so every run builds the same rooms. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Shape = 'L' | 'T' | 'U' | 'Z' | 'cross'
const SHAPES: readonly Shape[] = ['L', 'T', 'U', 'Z', 'cross']

interface Generated {
  /** Counter-clockwise, on the wall centre lines. */
  readonly points: Point[]
  /** A point well inside the floor. */
  readonly seed: Point
}

/**
 * One room of the given shape. Every arm is at least 1.2 m wide on the centre lines and every
 * wall at most 0.4 m thick, so no arm closes up.
 */
function shape(kind: Shape, next: () => number): Generated {
  const size = (min: number, max: number) => Math.round((min + next() * (max - min)) * 100) / 100
  switch (kind) {
    case 'L': {
      const w = size(4, 9)
      const h = size(4, 9)
      const x = size(1.2, w - 1.2)
      const y = size(1.2, h - 1.2)
      return { points: [[0, 0], [w, 0], [w, y], [x, y], [x, h], [0, h]], seed: [x / 2, y / 2] }
    }
    case 'T': {
      const w = size(5, 10)
      const h = size(4, 9)
      const x0 = size(1.2, w / 2 - 0.6)
      const x1 = size(w / 2 + 0.6, w - 1.2)
      const y = size(1.2, h - 1.2)
      return {
        points: [[x0, 0], [x1, 0], [x1, y], [w, y], [w, h], [0, h], [0, y], [x0, y]],
        seed: [(x0 + x1) / 2, y / 2]
      }
    }
    case 'U': {
      const w = size(5, 10)
      const h = size(4, 9)
      const x0 = size(1.2, w / 2 - 0.6)
      const x1 = size(w / 2 + 0.6, w - 1.2)
      const y = size(1.2, h - 1.2)
      return {
        points: [[0, 0], [w, 0], [w, h], [x1, h], [x1, y], [x0, y], [x0, h], [0, h]],
        seed: [w / 2, y / 2]
      }
    }
    case 'Z': {
      const w = size(5, 10)
      const h = size(5, 10)
      const xa = size(2.4, w - 1.2)
      const xc = size(1.2, xa - 1.2)
      const yb = size(1.2, h - 2.4)
      const yd = size(yb + 1.2, h - 1.2)
      return {
        points: [[0, 0], [xa, 0], [xa, yb], [w, yb], [w, h], [xc, h], [xc, yd], [0, yd]],
        seed: [xa / 2, yb / 2]
      }
    }
    case 'cross': {
      const w = size(5, 10)
      const h = size(5, 10)
      const x1 = size(1.2, w / 2 - 0.6)
      const x2 = size(w / 2 + 0.6, w - 1.2)
      const y1 = size(1.2, h / 2 - 0.6)
      const y2 = size(h / 2 + 0.6, h - 1.2)
      return {
        points: [[x1, 0], [x2, 0], [x2, y1], [w, y1], [w, y2], [x2, y2], [x2, h], [x1, h], [x1, y2], [0, y2], [0, y1], [x1, y1]],
        seed: [(x1 + x2) / 2, h / 2]
      }
    }
  }
}

const areaOf = (walls: Wall[], room: Room): number => {
  const plan: FloorPlan = { version: '1', units: 'm', walls, rooms: [room], openings: [] }
  return roomArea(room, indexPlan(plan))
}

/** Turns from barely at all to half a turn, and some in between. */
const TURNS = [0.001, 1, 15, 33.3, 45, 90, 137.5, 180] as const
const ROOMS_PER_SHAPE = 60

describe.each(SHAPES)('generated %s rooms', (kind) => {
  const next = random(SHAPES.indexOf(kind) + 1)
  const rooms = Array.from({ length: ROOMS_PER_SHAPE }, (_, n) => {
    const generated = shape(kind, next)
    // Every second room has one thickness, so the hand formula applies; the rest mix them.
    const one = Math.round((0.1 + next() * 0.3) * 100) / 100
    const thickness = generated.points.map(() => (n % 2 === 0 ? one : Math.round((0.1 + next() * 0.3) * 100) / 100))
    const reverse = generated.points.map((_, i) => i).filter(() => next() < 0.5)
    const start = Math.floor(next() * generated.points.length)
    return { n, ...generated, thickness, uniform: n % 2 === 0, reverse, start }
  })

  it.each(rooms)('room $n: Grid agrees with the referee and the hand figure', ({ points, seed, thickness, uniform }) => {
    const { walls, room } = outline(points, { thickness })
    const referee = enclosedArea(walls, seed)
    expect(validatePlan({ version: '1', units: 'm', walls, rooms: [room], openings: [] }).issues).toEqual([])
    expect(areaOf(walls, room)).toBeCloseTo(referee, 6)
    if (uniform) expect(referee).toBeCloseTo(insideArea(points, thickness[0]), 6)
  })

  it.each(rooms)('room $n: turning it, redrawing walls and reordering the list change nothing', ({ points, thickness, reverse, start }) => {
    const { walls, room } = outline(points, { thickness })
    const area = areaOf(walls, room)
    for (const deg of TURNS) {
      const turned = outline(points, { thickness, rotate: deg, reverse })
      expect(Math.abs(areaOf(turned.walls, turned.room) - area)).toBeLessThan(1e-6)
    }
    const listed = [...room.boundary.slice(start), ...room.boundary.slice(0, start)]
    expect(Math.abs(areaOf(walls, { ...room, boundary: listed }) - area)).toBeLessThan(1e-6)
    expect(Math.abs(areaOf(walls, { ...room, boundary: [...listed].reverse() }) - area)).toBeLessThan(1e-6)
    // Turned about a point far from the room, as in a site plan.
    const far = walls.map((wall) => ({ ...wall, start: shift(turn(wall.start, 71), 2500), end: shift(turn(wall.end, 71), 2500) }))
    expect(Math.abs(areaOf(far, room) - area)).toBeLessThan(1e-6)
  })
})

const shift = ([x, y]: Point, by: number): Point => [x + by, y - by]
