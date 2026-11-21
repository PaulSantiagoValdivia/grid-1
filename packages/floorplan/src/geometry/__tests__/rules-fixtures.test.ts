import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { planFloors, planForFloor } from '../floors'
import { tryRoomPolygon } from '../room'
import { validatePlan } from '../validate'
import { flat, longWallStrip, madeVirtual, twoFloorHouse } from '../../test-support/plans'

const fixtures: [string, FloorPlan][] = [
  ['the flat', flat()],
  ['the two-floor house', twoFloorHouse()],
  ['the long-wall strip', longWallStrip()],
  ['the flat with an open kitchen', madeVirtual(flat(), 'hk')]
]

describe.each(fixtures)('%s', (_name, plan) => {
  it('validates with no error, floor by floor, and every room closes', () => {
    for (const floor of planFloors(plan)) {
      const storey = planForFloor(plan, floor.id)
      const index = indexPlan(storey)
      const errors = validatePlan(storey, index).issues.filter((i) => i.severity === 'error')
      expect(errors).toEqual([])
      for (const room of storey.rooms) expect(tryRoomPolygon(room, index), room.id).not.toBeNull()
    }
  })
})
