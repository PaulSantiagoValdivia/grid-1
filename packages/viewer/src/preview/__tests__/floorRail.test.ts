import { describe, expect, it } from 'vitest'
import type { Floor } from '@ongrid/floorplan/types/floorplan'
import {
  RAIL_SIZE,
  TYPE_RESET_MS,
  matchTyped,
  railRows,
  railWindow,
  stepRow,
  typed,
  typeToJump,
  type RailRow
} from '../floorRail'

const floor = (id: string, level: number, name = id): Floor => ({ id, name, level })

const BASEMENT = floor('basement', -1, 'Basement')
const GROUND = floor('ground', 0, 'Ground floor')
const FIRST = floor('first', 1, 'First floor')
const SECOND = floor('second', 2, 'Second floor')

/** Floors as `planFloors` gives them: lowest level first. */
const house = [BASEMENT, GROUND, FIRST, SECOND]

/** A tower of `n` floors above the ground, levels 0 to n - 1. */
const tower = (n: number): Floor[] =>
  Array.from({ length: n }, (_, level) => floor(`f${level}`, level, level === 0 ? 'Ground' : `Floor ${level}`))

const labels = (rows: readonly RailRow[]): string[] => rows.map((row) => row.label)
const ids = (rows: readonly RailRow[]): (string | null)[] => rows.map((row) => row.id)

describe('railRows', () => {
  it('lists the top floor first, whatever order the floors come in', () => {
    expect(ids(railRows(house, { building: false }))).toEqual(['second', 'first', 'ground', 'basement'])
    expect(ids(railRows([FIRST, BASEMENT, SECOND, GROUND], { building: false }))).toEqual([
      'second',
      'first',
      'ground',
      'basement'
    ])
  })

  it('labels levels G, 1, 2 and B1', () => {
    expect(labels(railRows(house, { building: false }))).toEqual(['2', '1', 'G', 'B1'])
    expect(labels(railRows([floor('deep', -3)], { building: false }))).toEqual(['B3'])
  })

  it('names floors that share a level instead of labelling them twice', () => {
    const ground = floor('ground', 0, 'Ground')
    const mezzanine = floor('mezz', 0, 'Mezzanine')
    const rows = railRows([ground, mezzanine, FIRST], { building: false })

    expect(labels(rows)).toEqual(['1', 'Ground', 'Mezzanine'])
  })

  it('keeps the plan order for floors that share a level', () => {
    const a = floor('a', 0, 'A')
    const b = floor('b', 0, 'B')
    expect(ids(railRows([a, b], { building: false }))).toEqual(['a', 'b'])
    expect(ids(railRows([b, a], { building: false }))).toEqual(['b', 'a'])
  })

  it('starts with a Whole building row only when asked to', () => {
    const rows = railRows(house, { building: true })
    expect(rows[0]).toMatchObject({ kind: 'building', id: null, name: 'Whole building' })
    expect(ids(rows.slice(1))).toEqual(['second', 'first', 'ground', 'basement'])

    expect(railRows(house, { building: false }).some((row) => row.kind === 'building')).toBe(false)
  })

  it('carries the full floor name on every row', () => {
    expect(railRows(house, { building: false }).map((row) => row.name)).toEqual([
      'Second floor',
      'First floor',
      'Ground floor',
      'Basement'
    ])
  })
})

describe('railWindow', () => {
  it('shows nine rows', () => {
    expect(RAIL_SIZE).toBe(9)
  })

  it('shows everything, with no counts, for nine rows or fewer', () => {
    for (const n of [1, 5, 9]) {
      const rows = railRows(tower(n), { building: false })
      expect(railWindow(rows, 0)).toEqual({ start: 0, end: n, above: 0, below: 0 })
    }
  })

  it('shows nine rows around floor 45 of 100, with the counts beyond each end', () => {
    const rows = railRows(tower(100), { building: false })
    const active = rows.findIndex((row) => row.label === '45')
    const window = railWindow(rows, active)

    expect(window.end - window.start).toBe(9)
    expect(labels(rows.slice(window.start, window.end))).toContain('45')
    expect(window.above + (window.end - window.start) + window.below).toBe(100)
    expect(window.above).toBe(window.start)
    expect(window.below).toBe(100 - window.end)
  })

  it('clamps at both ends', () => {
    const rows = railRows(tower(100), { building: false })
    expect(railWindow(rows, 0)).toEqual({ start: 0, end: 9, above: 0, below: 91 })
    expect(railWindow(rows, 99)).toEqual({ start: 91, end: 100, above: 91, below: 0 })
  })

  it('starts at the top when no floor row is active', () => {
    const rows = railRows(tower(100), { building: false })
    expect(railWindow(rows, -1)).toEqual({ start: 0, end: 9, above: 0, below: 91 })
  })

  it('always keeps the active row inside the window', () => {
    for (const n of [1, 2, 9, 10, 11, 37, 100]) {
      const rows = railRows(tower(n), { building: false })
      for (let active = 0; active < n; active++) {
        const { start, end, above, below } = railWindow(rows, active)
        expect(active, `${active} of ${n}`).toBeGreaterThanOrEqual(start)
        expect(active, `${active} of ${n}`).toBeLessThan(end)
        expect(end - start).toBe(Math.min(n, 9))
        expect(above + (end - start) + below).toBe(n)
      }
    }
  })
})

describe('stepRow', () => {
  const in3d = railRows(house, { building: true })
  const in2d = railRows(house, { building: false })

  it('steps down from the Whole building to the top floor in 3D', () => {
    expect(stepRow(in3d, null, 1)?.id).toBe('second')
  })

  it('steps up from the top floor to the Whole building in 3D, and nowhere in 2D', () => {
    const up = stepRow(in3d, 'second', -1)
    expect(up?.kind).toBe('building')
    expect(stepRow(in2d, 'second', -1)).toBeNull()
  })

  it('steps one row up and down', () => {
    expect(stepRow(in2d, 'ground', -1)?.id).toBe('first')
    expect(stepRow(in2d, 'ground', 1)?.id).toBe('basement')
  })

  it('clamps at the bottom', () => {
    expect(stepRow(in2d, 'basement', 1)).toBeNull()
    expect(stepRow(in3d, 'basement', 1)).toBeNull()
  })

  it('clamps at the top of the 3D rail', () => {
    expect(stepRow(in3d, null, -1)).toBeNull()
  })

  it('steps from the top floor down when the active floor is not on the rail', () => {
    expect(stepRow(in2d, 'gone', 1)?.id).toBe('second')
  })
})

describe('typed and matchTyped', () => {
  const rows = railRows([floor('cellar', -1, 'Cellar'), ...tower(100)], { building: true })

  it('reads characters typed within a second together', () => {
    const four = typed(null, '4', 1000)
    const fortyFive = typed(four, '5', 1500)
    expect(fortyFive.text).toBe('45')
    expect(matchTyped(rows, fortyFive.text)?.label).toBe('45')
  })

  it('starts again once the buffer is more than a second old', () => {
    expect(TYPE_RESET_MS).toBe(1000)
    const four = typed(null, '4', 1000)
    expect(typed(four, '5', 2001).text).toBe('5')
    expect(typed(four, '5', 2000).text).toBe('45')
  })

  it('jumps to the exact label first, then to a label that starts with it', () => {
    expect(matchTyped(rows, '4')?.label).toBe('4')
    expect(matchTyped(rows, '9')?.label).toBe('9')
    const noFour = railRows(tower(100).filter((f) => f.level !== 4), { building: false })
    expect(matchTyped(noFour, '4')?.label).toMatch(/^4/)
  })

  it('matches labels without regard to case', () => {
    expect(matchTyped(rows, 'b1')?.id).toBe('cellar')
    expect(matchTyped(rows, 'g')?.id).toBe('f0')
  })

  it('falls back to the start of a floor name', () => {
    expect(matchTyped(rows, 'cel')?.id).toBe('cellar')
  })

  it('starts the buffer again from a key when what came before matches nothing', () => {
    const small = railRows([floor('f0', 0, 'Ground'), floor('f1', 1, 'First'), floor('f2', 2, 'Second')], {
      building: false
    })
    const three = typeToJump(small, null, '3', 1000)
    expect(three.match).toBeNull()
    const two = typeToJump(small, three.buffer, '2', 1200)
    expect(two.match?.id).toBe('f2')
    expect(two.buffer.text).toBe('2')
  })

  it('keeps reading characters together while they still match', () => {
    const first = typeToJump(rows, null, '4', 1000)
    const second = typeToJump(rows, first.buffer, '5', 1500)
    expect(second.match?.label).toBe('45')
    expect(second.buffer.text).toBe('45')
  })

  it('matches nothing for something no row has', () => {
    expect(matchTyped(rows, 'zz')).toBeNull()
    expect(matchTyped(rows, '')).toBeNull()
    expect(matchTyped(rows, '450')).toBeNull()
  })
})
