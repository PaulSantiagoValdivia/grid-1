/**
 * SHT-11, lab DR-5: a stair drawn as a room on each of three floors is counted once in the
 * measuring tools, on the floor it rises from: in the net total, the areas by use and
 * circulation. The rooms over it keep their own area and say which room they are counted with.
 */
import { describe, expect, it } from 'vitest'
import { stairRoomHouse } from '@ongrid/floorplan/test-support/plans'
import { planAreas } from '../areas'
import { planEstimate } from '../estimate'
import { surveyPlan } from '../survey'

const STAIR = 1.85 * 3.8
const HALL = 3.85 * 3.8

describe('a stair counted once in grid_areas (SHT-11)', () => {
  it('counts the stair on the ground floor only, in net, by use and in circulation', () => {
    const areas = planAreas(surveyPlan(stairRoomHouse()))
    expect(areas.byUse['stair']).toBeCloseTo(STAIR, 9)
    // The halls and rooms are corridors: three of them, and the stair once.
    expect(areas.circulation).toBeCloseTo(3 * HALL + STAIR, 9)
    expect(areas.net).toBeCloseTo(3 * HALL + STAIR, 9)
    const first = areas.floors.find((f) => f.floor === 'first')!
    expect(first.overStairs).toBeCloseTo(STAIR, 9)
    const over = first.rooms.find((room) => room.id === 'first-stair')!
    expect(over.net).toBeCloseTo(STAIR, 9)
    expect(over.countedWith).toEqual({ floor: 'ground', room: 'ground-stair' })
    expect(areas.notes.some((note) => note.includes('its floor is counted once, there'))).toBe(true)
  })

  it('counts the stair once in the estimate\'s floor finish, as in the net area (SHT-11 with ARE-13)', () => {
    const survey = surveyPlan(stairRoomHouse())
    const floor = planEstimate(survey).lines.find((line) => line.key === 'floor:stair')!
    expect(floor.quantity).toBeCloseTo(planAreas(survey).byUse['stair']!, 9)
    expect(floor.quantity).toBeCloseTo(STAIR, 9)
  })
})
