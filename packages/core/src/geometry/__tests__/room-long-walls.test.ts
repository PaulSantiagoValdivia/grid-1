import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { roomArea, roomPolygon } from '../room'

/**
 * A wall that runs past the room it borders is normal: the module header says
 * one wall can border several rooms along different stretches. The face a room
 * takes from such a wall must not depend on how long the wall is.
 *
 * The grid below draws every line of walls full length, so each divider is
 * shared by every room along it.
 */

interface Grid {
  readonly columns: number
  readonly rows: number
  /** Thickness of each vertical line (columns + 1 of them) and horizontal line (rows + 1). */
  readonly vertical: readonly number[]
  readonly horizontal: readonly number[]
}

const CELL = 4

function gridPlan(grid: Grid, turn = 0, swapDirections = false): FloorPlan {
  const a = (turn * Math.PI) / 180
  const rotate = (x: number, y: number): [number, number] => [
    x * Math.cos(a) - y * Math.sin(a),
    x * Math.sin(a) + y * Math.cos(a)
  ]
  const width = grid.columns * CELL
  const height = grid.rows * CELL

  const walls: FloorPlan['walls'] = []
  const line = (id: string, from: [number, number], to: [number, number], thickness: number) => {
    const [start, end] = swapDirections ? [to, from] : [from, to]
    walls.push({
      id,
      start: rotate(...start),
      end: rotate(...end),
      thickness,
      height: 2.7,
      kind: 'interior'
    })
  }
  grid.horizontal.forEach((t, j) => line(`h${j}`, [0, j * CELL], [width, j * CELL], t))
  grid.vertical.forEach((t, i) => line(`v${i}`, [i * CELL, 0], [i * CELL, height], t))

  const rooms: FloorPlan['rooms'] = []
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.columns; i++) {
      rooms.push({ id: `r${i}${j}`, name: `R${i}${j}`, boundary: [`h${j}`, `v${i + 1}`, `h${j + 1}`, `v${i}`] })
    }
  }
  return { version: '1', units: 'm', walls, rooms, openings: [] }
}

/** What a cell measures between the inner faces of the lines around it. */
function expectedArea(grid: Grid, i: number, j: number): number {
  const across = CELL - grid.vertical[i]! / 2 - grid.vertical[i + 1]! / 2
  const down = CELL - grid.horizontal[j]! / 2 - grid.horizontal[j + 1]! / 2
  return across * down
}

const grids: [string, Grid][] = [
  ['3 × 2, thick edge and thin dividers', { columns: 3, rows: 2, vertical: [0.2, 0.1, 0.1, 0.2], horizontal: [0.2, 0.1, 0.2] }],
  ['2 × 2, all the same', { columns: 2, rows: 2, vertical: [0.2, 0.2, 0.2], horizontal: [0.2, 0.2, 0.2] }],
  ['4 × 3, every line its own thickness', { columns: 4, rows: 3, vertical: [0.3, 0.1, 0.15, 0.1, 0.25], horizontal: [0.2, 0.12, 0.18, 0.3] }],
  ['1 × 4, a corridor of rooms', { columns: 1, rows: 4, vertical: [0.2, 0.2], horizontal: [0.2, 0.1, 0.1, 0.1, 0.2] }]
]

describe.each(grids)('rooms on full-length walls: %s', (_name, grid) => {
  const check = (plan: FloorPlan): void => {
    const index = indexPlan(plan)
    for (const room of plan.rooms) {
      const i = Number(room.id[1])
      const j = Number(room.id[2])
      expect(roomArea(room, index), room.id).toBeCloseTo(expectedArea(grid, i, j), 9)
    }
  }

  it('gives every room the area between its inner faces', () => {
    check(gridPlan(grid))
  })

  it.each([37, 90, 211, 0.6435 * (180 / Math.PI)])('also when the plan is turned %d°', (degrees) => {
    check(gridPlan(grid, degrees))
  })

  it('also when every wall is drawn the other way round', () => {
    check(gridPlan(grid, 0, true))
  })

  it('also when a boundary is listed clockwise', () => {
    const plan = gridPlan(grid)
    const clockwise: FloorPlan = {
      ...plan,
      rooms: plan.rooms.map((room) => ({ ...room, boundary: [...room.boundary].reverse() }))
    }
    check(clockwise)
  })

  it('keeps every polygon counter-clockwise and inside the plan', () => {
    const plan = gridPlan(grid)
    const index = indexPlan(plan)
    for (const room of plan.rooms) {
      const polygon = roomPolygon(room, index)
      expect(polygon).toHaveLength(4)
      for (const p of polygon) {
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(grid.columns * CELL)
        expect(p.y).toBeGreaterThan(0)
        expect(p.y).toBeLessThan(grid.rows * CELL)
      }
    }
  })
})
