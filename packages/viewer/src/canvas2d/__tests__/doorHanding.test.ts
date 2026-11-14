import { describe, expect, it } from 'vitest'
import type { Opening } from '@ongrid/core/types/floorplan'
import { doorHandingOf } from '../doorHanding'

const door: Opening = { id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 }

describe('doorHandingOf', () => {
  it('reads the hinge and the swing the plan states for a door', () => {
    expect(doorHandingOf({ ...door, hinge: 'end', swing: 'right' })).toEqual({ hinge: 'end', swing: 'right' })
  })

  // Absent means "not decided": nothing is filled in, so nothing guesses a swing.
  it('knows nothing the plan does not say', () => {
    expect(doorHandingOf(door)).toEqual({ hinge: undefined, swing: undefined })
    expect(doorHandingOf({ ...door, hinge: 'start' })).toEqual({ hinge: 'start', swing: undefined })
  })
})
