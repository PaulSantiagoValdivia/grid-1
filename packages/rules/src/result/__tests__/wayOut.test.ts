/**
 * MSG-17 in the record: a let reached only through another let is named with the country set or
 * not (lab AB-1: before, two escape notes about the lost window with no country, and nothing with
 * the country set to GB), a door onto a closed courtyard is named beside "no door to the outside"
 * (lab CH-6), and a door to the outside above the ground is listed as not checked.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Room } from '@ongrid/floorplan/geometry'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { edit, flat, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { inspectPlan } from '../inspect'

/** The core's test flat as a house of rooms to let: the hall common, the bathroom's only door into the bedroom. */
function letHouse(): FloorPlan {
  const tenure: Record<string, Room['tenure']> = { hall: 'common', kitchen: 'private', bedroom: 'private', bathroom: 'private' }
  const names: Record<string, string> = { hall: 'Hall', kitchen: 'Room 1', bedroom: 'Room 2', bathroom: 'Room 3' }
  return edit(flat(), (copy) => {
    copy.rooms = copy.rooms.map((r) => ({ ...r, name: names[r.id]!, use: r.id === 'hall' ? 'corridor' : 'bedroom', tenure: tenure[r.id] }))
  })
}

describe('MSG-17 in grid check', () => {
  it('names a let reached only through another let, with the country set or not (AB-1)', () => {
    for (const country of [undefined, 'GB', 'US', 'ES']) {
      const result = inspectPlan(JSON.stringify(letHouse()), country === undefined ? {} : { country })
      const lets = result.lines.filter((l) => l.code === 'room/through-another-let')
      expect(lets.map((l) => [l.kind, l.thing, l.also, l.message]), String(country)).toEqual([
        ['finding', { kind: 'room', id: 'bathroom' }, ['bedroom'], 'The only way out of "Room 3" goes through "Room 2", private to another let']
      ])
      expect(lets[0]!.needed).toBe('a way out through its own rooms and the common parts only')
    }
  })

  it('names the door onto the closed courtyard beside no door to the outside (CH-6)', () => {
    const result = inspectPlan(labPlanText('G/scenarios/s08g-infill-no-street-door-court-not-room.json'))
    const lines = result.lines.filter((l) => l.code === 'opening/into-closed-court' || l.code === 'floor/no-exit')
    expect(lines.map((l) => [l.code, l.kind, l.thing])).toEqual([
      ['opening/into-closed-court', 'finding', { kind: 'opening', id: 'd-court' }],
      ['floor/no-exit', 'finding', { kind: 'floor', id: 'ground' }]
    ])
    expect(lines[0]!.message).toBe('A door from "Living and kitchen" opens onto an outside space closed in on every side, so it is not a way out')
  })

  it('lists a door to the outside above the ground as not checked', () => {
    const result = inspectPlan(JSON.stringify(twoFloorHouse()))
    const door = result.lines.filter((l) => l.code === 'opening/door-out-above-ground')
    expect(door.map((l) => [l.kind, l.thing, l.message])).toEqual([
      ['not-checked', { kind: 'opening', id: 'balcony' }, 'Where a door from "Study" leads, 2.95 m above the ground, was not checked: it is not taken as a way out']
    ])
  })
})
