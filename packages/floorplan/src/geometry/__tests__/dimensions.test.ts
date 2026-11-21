import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { buildFloorPlan } from '../floorplan'
import {
  boundsWithDimensions,
  buildDimensions,
  dimensionAxes,
  openingDimensions,
  overallDimensions,
  roomDimensions
} from '../dimensions'

const plan: FloorPlan = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/floor-plan.json'), 'utf8')
)
const drawing = buildFloorPlan(plan)

describe('overall dimensions', () => {
  const dims = overallDimensions(drawing.bounds)

  it('measures the full width and height of the plan', () => {
    const values = dims.map((d) => d.value).sort((a, b) => a - b)
    // The envelope includes half a wall on each side: 8 + 0.25 and 5 + 0.25.
    expect(values[0]).toBeCloseTo(5.25)
    expect(values[1]).toBeCloseTo(8.25)
  })

  it('places them outside the envelope, not on top of it', () => {
    for (const dim of dims) {
      const line = {
        x: dim.labelAt.x,
        y: dim.labelAt.y
      }
      const outsideBelow = line.y < drawing.bounds.min.y
      const outsideLeft = line.x < drawing.bounds.min.x
      expect(outsideBelow || outsideLeft).toBe(true)
    }
  })
})

describe('room dimensions', () => {
  it('measures each room inside its own outline', () => {
    const dining = drawing.rooms.find((r) => r.name === 'Dining')!
    const values = roomDimensions(dining)
      .map((d) => d.value)
      .sort((a, b) => a - b)
    // 4.80 × 2.375 between inner faces — the same numbers the area comes from.
    expect(values[0]).toBeCloseTo(2.375)
    expect(values[1]).toBeCloseTo(4.8)
  })

  it('agrees with the area: width × depth is the room area', () => {
    for (const room of drawing.rooms) {
      const [a, b] = roomDimensions(room)
      expect(a!.value * b!.value).toBeCloseTo(room.area, 4)
    }
  })

  it('keeps its lines clear of the room label at the centroid', () => {
    // Three labels stacked on the same point is unreadable, and it is exactly
    // what happens if the dimensions run through the middle.
    for (const room of drawing.rooms) {
      for (const dim of roomDimensions(room)) {
        const away = Math.hypot(
          dim.labelAt.x - room.labelAt.x,
          dim.labelAt.y - room.labelAt.y
        )
        expect(away).toBeGreaterThan(0.3)
      }
    }
  })

  it('skips rooms too narrow to fit a label', () => {
    const sliver = {
      id: 'r9',
      name: 'Closet',
      polygon: [
        { x: 0, y: 0 },
        { x: 0.4, y: 0 },
        { x: 0.4, y: 3 },
        { x: 0, y: 3 }
      ],
      holes: [],
      area: 1.2,
      labelAt: { x: 0.2, y: 1.5 }
    }
    expect(roomDimensions(sliver)).toEqual([])
  })
})

describe('opening dimensions', () => {
  it('measures the width of every door and window', () => {
    const dims = openingDimensions(drawing)
    expect(dims).toHaveLength(3)
    for (const dim of dims) {
      const opening = drawing.openings.find((o) => dim.id.startsWith(o.id))!
      expect(dim.value).toBeCloseTo(opening.width)
    }
  })

  it('pushes the line clear of the wall body', () => {
    for (const dim of openingDimensions(drawing)) {
      const opening = drawing.openings.find((o) => dim.id.startsWith(o.id))!
      expect(dim.offset).toBeGreaterThan(opening.thickness / 2)
    }
  })
})

describe('layers', () => {
  it('defaults to overall plus rooms, without openings', () => {
    const kinds = new Set(buildDimensions(drawing).map((d) => d.kind))
    expect(kinds).toEqual(new Set(['overall', 'room']))
  })

  it('can be asked for openings too', () => {
    const kinds = new Set(buildDimensions(drawing, { openings: true }).map((d) => d.kind))
    expect(kinds.has('opening')).toBe(true)
  })

  it('can be turned off entirely', () => {
    expect(buildDimensions(drawing, { overall: false, rooms: false })).toEqual([])
  })
})

describe('framing', () => {
  it('grows the bounds so the dimensions are not clipped', () => {
    const dims = buildDimensions(drawing)
    const framed = boundsWithDimensions(drawing, dims)
    expect(framed.min.x).toBeLessThan(drawing.bounds.min.x)
    expect(framed.min.y).toBeLessThan(drawing.bounds.min.y)
    expect(framed.width).toBeGreaterThan(drawing.bounds.width)
  })
})

describe('axes', () => {
  it('gives a unit direction along the dimension and one across it', () => {
    for (const dim of buildDimensions(drawing, { openings: true })) {
      const { along, across } = dimensionAxes(dim)
      expect(Math.hypot(along.x, along.y)).toBeCloseTo(1)
      expect(Math.hypot(across.x, across.y)).toBeCloseTo(1)
      expect(along.x * across.x + along.y * across.y).toBeCloseTo(0)
    }
  })
})
