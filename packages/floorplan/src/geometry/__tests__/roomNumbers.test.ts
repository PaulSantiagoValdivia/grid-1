/**
 * ARE-12's room numbers, moved into the library for HND-2 so the room schedule and the IFC file
 * read one rule: floors by level, then by id; rooms by id; 1, 2, 3… across the floors.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Room } from '../plan'
import { roomNumbers, shownRoomNumber } from '../roomNumbers'

const room = (id: string, floor?: string): Room => ({ id, name: id, boundary: [], ...(floor === undefined ? {} : { floor }) })

const plan = (rooms: Room[], floors?: FloorPlan['floors']): FloorPlan => ({
  version: '1',
  units: 'm',
  walls: [],
  openings: [],
  rooms,
  ...(floors === undefined ? {} : { floors })
})

const numbered = (p: FloorPlan, floors?: readonly string[]): string[] =>
  roomNumbers(p, floors).map((n) => `${n.number} ${n.floor}/${n.id}`)

describe('roomNumbers', () => {
  it('numbers the rooms by id, numbers before letters as ids sort (r2 before r10)', () => {
    expect(numbered(plan([room('r10'), room('r2'), room('hall')]))).toEqual(['1 ground/hall', '2 ground/r2', '3 ground/r10'])
  })

  it('counts on across the floors, lowest first, whatever order the floors are listed in', () => {
    const p = plan(
      [room('a', 'first'), room('b', 'ground'), room('c', 'basement'), room('d', 'first')],
      [
        { id: 'first', name: 'First', level: 1 },
        { id: 'ground', name: 'Ground', level: 0 },
        { id: 'basement', name: 'Basement', level: -1 }
      ]
    )
    expect(numbered(p)).toEqual(['1 basement/c', '2 ground/b', '3 first/a', '4 first/d'])
  })

  it('orders floors on one level by id', () => {
    const p = plan([room('x', 'west'), room('y', 'east')], [
      { id: 'west', name: 'West wing', level: 0 },
      { id: 'east', name: 'East wing', level: 0 }
    ])
    expect(numbered(p)).toEqual(['1 east/y', '2 west/x'])
  })

  it('gives a room id used on two floors a number on each, and one used twice on a floor one', () => {
    const p = plan([room('r1', 'ground'), room('r1', 'ground'), room('r1', 'first')], [
      { id: 'ground', name: 'Ground', level: 0 },
      { id: 'first', name: 'First', level: 1 }
    ])
    expect(numbered(p)).toEqual(['1 ground/r1', '2 first/r1'])
  })

  it('puts the rooms that state a number first on their floor, by that number, and keeps it (CNT-9)', () => {
    const p = plan([room('a'), { ...room('b'), number: 'G.10' }, room('c'), { ...room('d'), number: 'G.2' }])
    expect(roomNumbers(p).map((n) => [n.number, n.id, n.stated, shownRoomNumber(n)])).toEqual([
      [1, 'd', 'G.2', 'G.2'],
      [2, 'b', 'G.10', 'G.10'],
      [3, 'a', null, '3'],
      [4, 'c', null, '4']
    ])
  })

  it('numbers only the floors asked for, from 1', () => {
    const p = plan([room('a', 'ground'), room('b', 'first')], [
      { id: 'ground', name: 'Ground', level: 0 },
      { id: 'first', name: 'First', level: 1 }
    ])
    expect(numbered(p, ['first'])).toEqual(['1 first/b'])
  })

  it('numbers nothing in a plan with no rooms', () => {
    expect(roomNumbers(plan([]))).toEqual([])
  })
})
