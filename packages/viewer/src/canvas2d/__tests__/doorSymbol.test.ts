import { describe, expect, it } from 'vitest'
import type { DoorHinge, DoorSide, PlanOpening } from '@ongrid/core/geometry'
import { buildFloorPlan } from '@ongrid/core/geometry'
import type { FloorPlan } from '@ongrid/core/types/floorplan'
import { doorSymbolOf } from '../doorSymbol'

/** One wall at `angle` radians from +X, 5 m long, 0.2 m thick, with a 0.9 m door 1 m from its start. */
function doorOn(angle: number): PlanOpening {
  const end: [number, number] = [5 * Math.cos(angle), 5 * Math.sin(angle)]
  const plan: FloorPlan = {
    version: '1',
    units: 'm',
    walls: [{ id: 'w1', start: [0, 0], end, thickness: 0.2, height: 2.7, kind: 'interior' }],
    rooms: [],
    openings: [{ id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 }]
  }
  const [opening] = buildFloorPlan(plan).openings
  return opening
}

/** `M x,y A r,r 0 0 sweep x,y`, read back into numbers. */
function readArc(d: string) {
  const n = String.raw`(-?\d+(?:\.\d+)?)`
  const match = new RegExp(`^M${n},${n}A${n},${n} 0 0 ([01]) ${n},${n}$`).exec(d)
  if (!match) throw new Error(`not a quarter arc: ${d}`)
  const [, x1, y1, rx, ry, sweep, x2, y2] = match
  return {
    start: { x: Number(x1), y: Number(y1) },
    rx: Number(rx),
    ry: Number(ry),
    sweep: Number(sweep),
    end: { x: Number(x2), y: Number(y2) }
  }
}

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 3)
  expect(a.y).toBeCloseTo(b.y, 3)
}

describe('doorSymbolOf', () => {
  it('draws nothing without both a hinge and a swing', () => {
    const door = doorOn(0)
    expect(doorSymbolOf(door, undefined)).toBeNull()
    expect(doorSymbolOf(door, {})).toBeNull()
    expect(doorSymbolOf(door, { hinge: 'start' })).toBeNull()
    expect(doorSymbolOf(door, { swing: 'left' })).toBeNull()
  })

  it('draws the hand-checked case: wall along +X, hinged at its start, opening to the left face', () => {
    // The opening runs from (1, 0) to (1.9, 0); the wall normal is +Y. In SVG
    // the plan's Y is flipped.
    const symbol = doorSymbolOf(doorOn(0), { hinge: 'start', swing: 'left' })!
    close(symbol.leaf[0], { x: 1, y: 0 })
    close(symbol.leaf[1], { x: 1, y: -0.9 })
    // From the leaf tip clockwise on screen (positive angle in SVG) back to the far jamb.
    expect(symbol.arc).toBe('M1.0000,-0.9000A0.9000,0.9000 0 0 1 1.9000,0.0000')
    close(symbol.jambs[0][0], { x: 1, y: -0.1 })
    close(symbol.jambs[0][1], { x: 1, y: 0.1 })
    close(symbol.jambs[1][0], { x: 1.9, y: -0.1 })
    close(symbol.jambs[1][1], { x: 1.9, y: 0.1 })
  })

  // Invariants, so a mirrored basis can't pass: on any wall, either hinge and
  // either face, the arc runs from the leaf tip to the far jamb and bulges into
  // the quarter between the closed and the open leaf.
  const angles = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6 + 0.1)
  const cases: [DoorHinge, DoorSide][] = [
    ['start', 'left'],
    ['start', 'right'],
    ['end', 'left'],
    ['end', 'right']
  ]

  for (const angle of angles) {
    for (const [hinge, swing] of cases) {
      it(`holds at ${angle.toFixed(2)} rad, hinge ${hinge}, swing ${swing}`, () => {
        const door = doorOn(angle)
        const symbol = doorSymbolOf(door, { hinge, swing })!
        const flip = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y })
        const pivot = flip(hinge === 'start' ? door.from : door.to)
        const far = flip(hinge === 'start' ? door.to : door.from)
        const arc = readArc(symbol.arc)

        // The leaf hangs from the hinge jamb, as long as the door is wide.
        close(symbol.leaf[0], pivot)
        const leaf = { x: symbol.leaf[1].x - pivot.x, y: symbol.leaf[1].y - pivot.y }
        expect(Math.hypot(leaf.x, leaf.y)).toBeCloseTo(door.width, 3)

        // Open at 90°, on the face the swing names (in plan coordinates).
        const leafPlan = { x: leaf.x, y: -leaf.y }
        const along = { x: door.to.x - door.from.x, y: door.to.y - door.from.y }
        expect(leafPlan.x * along.x + leafPlan.y * along.y).toBeCloseTo(0, 3)
        const facing = leafPlan.x * door.normal.x + leafPlan.y * door.normal.y
        expect(Math.sign(facing)).toBe(swing === 'left' ? 1 : -1)

        // The arc: from the leaf tip to the far jamb, radius the door's width.
        close(arc.start, symbol.leaf[1])
        close(arc.end, far)
        expect(arc.rx).toBeCloseTo(door.width, 3)
        expect(arc.ry).toBeCloseTo(door.width, 3)

        // Sweep 1 turns toward increasing SVG angle. For a quarter arc that is
        // exactly when start × end (both from the centre) is positive.
        const a = { x: arc.start.x - pivot.x, y: arc.start.y - pivot.y }
        const b = { x: arc.end.x - pivot.x, y: arc.end.y - pivot.y }
        expect(arc.sweep).toBe(a.x * b.y - a.y * b.x > 0 ? 1 : 0)

        // Jambs: across the wall at both ends of the opening, a wall thick.
        for (const [jamb, end] of [
          [symbol.jambs[0], door.from],
          [symbol.jambs[1], door.to]
        ] as const) {
          const mid = { x: (jamb[0].x + jamb[1].x) / 2, y: (jamb[0].y + jamb[1].y) / 2 }
          close(mid, flip(end))
          expect(Math.hypot(jamb[1].x - jamb[0].x, jamb[1].y - jamb[0].y)).toBeCloseTo(door.thickness, 3)
        }
      })
    }
  }

  it('draws nothing for a window, whatever it is told', () => {
    const window_ = { ...doorOn(0), type: 'window' as const }
    expect(doorSymbolOf(window_, { hinge: 'start', swing: 'left' })).toBeNull()
  })

  it('draws nothing for a door with no width', () => {
    const door = { ...doorOn(0), to: doorOn(0).from }
    expect(doorSymbolOf(door, { hinge: 'start', swing: 'left' })).toBeNull()
  })
})
