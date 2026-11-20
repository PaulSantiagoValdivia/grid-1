import { describe, expect, it } from 'vitest'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { flat, longWallStrip, madeVirtual, twoFloorHouse } from './fixtures'

// Lab Z-5: the plans these tests are built on are plans someone can write.
const problems = (raw: unknown): string[] =>
  FloorPlanSchema.safeParse(raw).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []

describe('Z-5 the rules fixtures pass the schema', () => {
  it.each(Object.entries({ flat, twoFloorHouse, longWallStrip }))('%s', (_, build) => {
    expect(problems(build())).toEqual([])
  })

  it('the flat with any one wall made a dividing line', () => {
    for (const wall of flat().walls) expect(problems(madeVirtual(flat(), wall.id))).toEqual([])
  })
})
