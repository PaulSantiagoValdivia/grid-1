import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { buildFloorPlan } from '../floorplan'
import type { PlanOpening } from '../floorplan'
import { doorSwing } from '../door'
import { distance, dot, sub, vec, type Vec2 } from '../vec2'

/**
 * Door swing geometry.
 *
 * This is the geometry alone: given the two values (stored on the opening,
 * but passed in here), where
 * the leaf and its arc land. The tests are invariants rather than coordinates,
 * because a swing symbol built on a mirrored basis passes every length test and
 * still draws the door opening into the wrong room.
 */

/** One wall of length `len`, rotated by `theta`, with a door centred on it. */
function wallPlan(len: number, theta: number, doorWidth = 0.9): FloorPlan {
  const end: [number, number] = [len * Math.cos(theta), len * Math.sin(theta)]
  return {
    version: '1',
    units: 'm',
    walls: [{ id: 'w1', start: [0, 0], end, thickness: 0.2, height: 2.5, kind: 'interior' }],
    rooms: [],
    openings: [
      {
        id: 'o1',
        wall: 'w1',
        type: 'door',
        offset: (len - doorWidth) / 2,
        width: doorWidth,
        sill: 0,
        height: 2.1
      }
    ]
  }
}

function openingOf(plan: FloorPlan): PlanOpening {
  const drawing = buildFloorPlan(plan)
  expect(drawing.openings).toHaveLength(1)
  return drawing.openings[0]!
}

const rot = (p: Vec2, t: number): Vec2 =>
  vec(p.x * Math.cos(t) - p.y * Math.sin(t), p.x * Math.sin(t) + p.y * Math.cos(t))

/** Signed angle between two vectors, in (-pi, pi]. */
function angleBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)
}

const DOOR = 0.9

describe('no hinge or swing recorded', () => {
  it('draws no arc at all, rather than guessing a side', () => {
    // A default would draw a swing the architect never specified, and a wrong
    // swing in a construction drawing is a worse error than a missing symbol.
    const opening = openingOf(wallPlan(3, 0))

    expect(doorSwing(opening, undefined, undefined)).toBeNull()
    expect(doorSwing(opening, 'start', undefined)).toBeNull()
    expect(doorSwing(opening, undefined, 'left')).toBeNull()
    expect(doorSwing(opening, null, null)).toBeNull()
  })
})

describe('the leaf', () => {
  it('is exactly as long as the opening is wide', () => {
    const swing = doorSwing(openingOf(wallPlan(3, 0)), 'start', 'left')!

    expect(distance(swing.leaf[0], swing.leaf[1])).toBeCloseTo(DOOR, 9)
    expect(swing.arc.radius).toBeCloseTo(DOOR, 9)
  })

  it('stands perpendicular to the wall when open', () => {
    const opening = openingOf(wallPlan(3, 0.7))
    const swing = doorSwing(opening, 'start', 'left')!

    const along = sub(opening.to, opening.from)
    const leaf = sub(swing.leaf[1], swing.leaf[0])

    expect(dot(along, leaf)).toBeCloseTo(0, 9)
  })

  it('hangs from the jamb the hinge names', () => {
    const opening = openingOf(wallPlan(3, 0))

    expect(doorSwing(opening, 'start', 'left')!.hinge).toEqual(opening.from)
    expect(doorSwing(opening, 'end', 'left')!.hinge).toEqual(opening.to)
  })
})

describe('which side it opens to', () => {
  it('follows the wall normal for left, and away from it for right', () => {
    // `left` is the face the normal points at — the same left/right wall.ts
    // already uses for faces. Inventing a second meaning here is how the plan
    // and the 3D end up disagreeing about which room the door opens into.
    const opening = openingOf(wallPlan(3, 0))

    const left = doorSwing(opening, 'start', 'left')!
    const right = doorSwing(opening, 'start', 'right')!

    expect(dot(sub(left.leaf[1], left.leaf[0]), opening.normal)).toBeGreaterThan(0)
    expect(dot(sub(right.leaf[1], right.leaf[0]), opening.normal)).toBeLessThan(0)
  })

  it('mirrors across the wall when the side flips', () => {
    const opening = openingOf(wallPlan(3, 1.1))
    const left = doorSwing(opening, 'end', 'left')!
    const right = doorSwing(opening, 'end', 'right')!

    expect(left.hinge).toEqual(right.hinge)
    // Reflected across the axis: the two open tips are equidistant from it and
    // their midpoint sits back on the wall.
    const mid = {
      x: (left.leaf[1].x + right.leaf[1].x) / 2,
      y: (left.leaf[1].y + right.leaf[1].y) / 2
    }
    expect(distance(mid, left.hinge)).toBeCloseTo(0, 9)
  })
})

describe('the arc', () => {
  it('sweeps a quarter turn, whatever the wall orientation', () => {
    for (const theta of [0, 0.4, Math.PI / 2, 2.3, Math.PI, -1.2]) {
      const swing = doorSwing(openingOf(wallPlan(3, theta)), 'start', 'left')!
      const sweep = Math.abs(swing.arc.to - swing.arc.from)
      const quarter = Math.min(sweep, Math.abs(2 * Math.PI - sweep))

      expect(quarter).toBeCloseTo(Math.PI / 2, 9)
    }
  })

  it('starts where the closed leaf lies and ends where the open one does', () => {
    const opening = openingOf(wallPlan(3, 0))
    const swing = doorSwing(opening, 'start', 'left')!

    const atAngle = (a: number): Vec2 => ({
      x: swing.arc.center.x + swing.arc.radius * Math.cos(a),
      y: swing.arc.center.y + swing.arc.radius * Math.sin(a)
    })

    // Closed, the leaf lies in the opening, reaching the far jamb.
    expect(distance(atAngle(swing.arc.from), opening.to)).toBeCloseTo(0, 9)
    expect(distance(atAngle(swing.arc.to), swing.leaf[1])).toBeCloseTo(0, 9)
  })

  it('sweeps toward the side the door opens to', () => {
    const opening = openingOf(wallPlan(3, 0))

    expect(doorSwing(opening, 'start', 'left')!.arc.counterClockwise).toBe(true)
    expect(doorSwing(opening, 'start', 'right')!.arc.counterClockwise).toBe(false)
  })
})

describe('rotating the wall rotates the swing with it', () => {
  it('is equivariant under rotation — nothing is pinned to an axis', () => {
    // The strongest guard here. A sin/cos swapped, a hardcoded +X, or a normal
    // taken from the wrong perp all survive an axis-aligned test and fail the
    // moment the wall is not horizontal.
    const base = doorSwing(openingOf(wallPlan(3, 0)), 'start', 'left')!

    for (const theta of [0.3, 1.0, Math.PI / 2, 2.9, -0.8]) {
      const turned = doorSwing(openingOf(wallPlan(3, theta)), 'start', 'left')!

      expect(distance(turned.hinge, rot(base.hinge, theta))).toBeCloseTo(0, 9)
      expect(distance(turned.leaf[1], rot(base.leaf[1], theta))).toBeCloseTo(0, 9)
      expect(turned.arc.radius).toBeCloseTo(base.arc.radius, 9)
      expect(turned.arc.counterClockwise).toBe(base.arc.counterClockwise)

      // The arc turns by exactly theta, measured as a vector so the comparison
      // does not trip over the branch cut at pi.
      const baseDir = sub(
        { x: base.arc.center.x + Math.cos(base.arc.from), y: base.arc.center.y + Math.sin(base.arc.from) },
        base.arc.center
      )
      const turnedDir = sub(
        { x: turned.arc.center.x + Math.cos(turned.arc.from), y: turned.arc.center.y + Math.sin(turned.arc.from) },
        turned.arc.center
      )
      expect(angleBetween(baseDir, turnedDir)).toBeCloseTo(
        angleBetween(vec(1, 0), rot(vec(1, 0), theta)),
        9
      )
    }
  })
})

describe('degenerate input', () => {
  it('returns nothing for an opening with no width, and never throws', () => {
    const opening = openingOf(wallPlan(3, 0))
    const flat: PlanOpening = { ...opening, to: opening.from, width: 0 }

    expect(() => doorSwing(flat, 'start', 'left')).not.toThrow()
    expect(doorSwing(flat, 'start', 'left')).toBeNull()
  })
})

describe('PlanOpening carries the handing the plan states (door-swing-export 1.1)', () => {
  const withHanding = (handing: Record<string, string>): FloorPlan => {
    const plan = wallPlan(4, 0)
    return { ...plan, openings: [{ ...plan.openings[0], ...handing } as FloorPlan['openings'][number]] }
  }

  it('copies both values when both are stated', () => {
    const opening = buildFloorPlan(withHanding({ hinge: 'end', swing: 'right' })).openings[0]
    expect(opening.hinge).toBe('end')
    expect(opening.swing).toBe('right')
  })

  it('copies the one value a half-stated door has', () => {
    const opening = buildFloorPlan(withHanding({ hinge: 'start' })).openings[0]
    expect(opening.hinge).toBe('start')
    expect('swing' in opening).toBe(false)
  })

  it('adds no key when neither is stated', () => {
    const opening = buildFloorPlan(wallPlan(4, 0)).openings[0]
    expect('hinge' in opening).toBe(false)
    expect('swing' in opening).toBe(false)
  })
})
