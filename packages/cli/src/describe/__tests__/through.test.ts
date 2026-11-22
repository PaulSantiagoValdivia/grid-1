/**
 * LVL-5: a plan whose north wall rises through both floors (the lab's hx3, VE-9), described. An
 * opening in such a wall is said with its sill above the floor its foot is on.
 */
import { describe, expect, it } from 'vitest'
import { stairWindowThrough } from '@ongrid/floorplan/test-support/through'
import { describeText } from '../card'
import { planFacts } from '../facts'

describe('a wall through two floors, described', () => {
  it('gives each window its sill above its own floor, and the stair window on both floors', () => {
    const text = describeText(planFacts(stairWindowThrough()), 'rooms', 'person')
    // The first floor's north window is stated 3.85 m above the ground floor: 0.90 m above its own.
    expect(text).toContain('Heights: walls 2.7 m high; window sills 0.9 m; door sills at the floor.')
    const stairs = text.split('\n').filter((line) => line.startsWith('Stair: '))
    expect(stairs).toHaveLength(2)
  })
})
