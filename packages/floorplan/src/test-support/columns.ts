/**
 * Plans with columns and a structural grid (CNT-16, lab EL-6), made for the tests. Test code only.
 *
 * - `openOffice`: one room 10.01 m by 9.00 m between the faces of its walls (90.09 m²), with three
 *   columns 0.37 m square standing in it: 0.4107 m² of floor, so the room measures 89.68 m², as
 *   the lab measured it by hand.
 * - `warehouse`: a shed 30 m by 20 m on the walls' centre lines, its one room 29.8 m by 19.8 m,
 *   with eight columns 0.4 m square on a structural grid of four bays by two, lines 1 to 5 and A
 *   to C.
 */
import { parseFloorPlan, type FloorPlan } from '../types/floorplan'
import { outline, type Point } from './outline'

/** The office's inside size and its columns' side, in metres. */
export const OFFICE = { width: 10.01, depth: 9, column: 0.37 } as const

export function openOffice(extra: Record<string, unknown> = {}): FloorPlan {
  const t = 0.2
  const x1 = OFFICE.width + t
  const y1 = OFFICE.depth + t
  const points: Point[] = [[0, 0], [x1, 0], [x1, y1], [0, y1]]
  const { walls, room } = outline(points)
  return parseFloorPlan({
    walls,
    rooms: [{ ...room, name: 'Open office', use: 'office' }],
    openings: [{ id: 'd1', wall: 'w1', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }],
    columns: [
      { id: 'c1', shape: 'square', width: OFFICE.column, at: [3.4, 4.6] },
      { id: 'c2', shape: 'square', width: OFFICE.column, at: [6.8, 4.6] },
      { id: 'c3', shape: 'square', width: OFFICE.column, at: [5.1, 7.2], label: 'C3' },
    ],
    ...extra,
  })
}

/** The warehouse's grid: four bays of 7.5 m one way, two of 10 m the other, from (0, 0). */
export const WAREHOUSE_GRID = { id: 'main', name: 'Main grid', origin: [0, 0], x: { spacing: [7.5, 7.5, 7.5, 7.5] }, y: { spacing: [10, 10] } } as const

export function warehouse(extra: Record<string, unknown> = {}): FloorPlan {
  const points: Point[] = [[0, 0], [30, 0], [30, 20], [0, 20]]
  const { walls, room } = outline(points)
  // The eight columns inside the shed, where the inner grid lines cross the walls' lines and the middle line.
  const at: [number, number][] = [
    [7.5, 0.4], [15, 0.4], [22.5, 0.4],
    [7.5, 10], [15, 10], [22.5, 10],
    [7.5, 19.6], [15, 19.6],
  ]
  return parseFloorPlan({
    walls: walls.map((wall) => ({ ...wall, height: 6 })),
    rooms: [{ ...room, name: 'Warehouse', use: 'storage' }],
    openings: [{ id: 'd1', wall: 'w1', type: 'door', offset: 2, width: 1, height: 2.1, sill: 0 }],
    columns: at.map(([x, y], i) => ({ id: `c${i + 1}`, shape: 'square', width: 0.4, at: [x, y], height: 6 })),
    grids: [WAREHOUSE_GRID],
    ...extra,
  })
}
