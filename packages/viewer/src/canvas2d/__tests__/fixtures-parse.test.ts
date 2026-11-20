import { describe, expect, it } from 'vitest'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { EMPTY, house } from './fixtures'
import { mixedPlan } from './canvas-test-utils'

// Lab Z-5: the plans these tests are built on are plans someone can write.
const problems = (raw: unknown): string[] =>
  FloorPlanSchema.safeParse(raw).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []

describe('Z-5 the viewer fixtures pass the schema', () => {
  it.each(Object.entries({ empty: () => EMPTY, house, mixedPlan }))('%s', (_, build) => {
    expect(problems(build())).toEqual([])
  })
})
