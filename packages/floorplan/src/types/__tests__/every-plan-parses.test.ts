import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema } from '../floorplan'
import { flat, longWallStrip, madeVirtual, twoFloorHouse } from '../../test-support/plans'
import { sixRoomHouse, twoFloorPlan, twoRoomBox } from '../../geometry/__tests__/diff-fixtures'

/**
 * Lab Z-5: the plans the tests are built on must be plans someone can write. A plan typed
 * as a literal never meets the schema, so a test can pass on a plan that `parseFloorPlan`
 * refuses (the shared fixture did, until ARE-2 let a dividing line have thickness 0).
 * Plans that are broken on purpose, in the tests of what Grid does with broken plans, are
 * not here.
 */
const problems = (raw: unknown): string[] =>
  FloorPlanSchema.safeParse(raw).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []

const ROOT = resolve(__dirname, '../../../../..')

const jsonFixtures = readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((pkg) => {
    const dir = resolve(ROOT, 'packages', pkg.name, 'fixtures')
    let files: string[]
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
    return files.map((f) => [`packages/${pkg.name}/fixtures/${f}`, resolve(dir, f)] as const)
  })

describe('Z-5 every plan the tests are built on passes the schema', () => {
  it('finds the JSON fixtures', () => {
    expect(jsonFixtures.map(([name]) => name)).toContain('packages/floorplan/fixtures/floor-plan.json')
  })

  it.each(jsonFixtures)('%s', (_, file) => {
    expect(problems(JSON.parse(readFileSync(file, 'utf8')))).toEqual([])
  })

  it('the bench examples the scoreboard builds its damage set from', () => {
    const examples = JSON.parse(readFileSync(resolve(ROOT, 'scoreboard/data/bench-examples.json'), 'utf8')) as Record<string, unknown>
    for (const plan of Object.values(examples)) expect(problems(plan)).toEqual([])
  })

  const built = { flat, twoFloorHouse, longWallStrip, twoRoomBox, sixRoomHouse, twoFloorPlan }
  it.each(Object.entries(built))('the fixture builder %s', (_, build) => {
    expect(problems(build())).toEqual([])
  })

  it('the flat with any one wall made a dividing line', () => {
    for (const wall of flat().walls) expect(problems(madeVirtual(flat(), wall.id))).toEqual([])
  })
})
