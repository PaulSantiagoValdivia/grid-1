/**
 * CMD-7 (lab OT-6): the plan's JSON Schema is worked out from the schema plans are read with, so
 * every lab plan Grid reads today must validate against it, and it must still refuse what is not
 * a plan. The validator is Ajv (MIT), the one most programs use, at draft-07.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { FloorPlanFieldsSchema, safeParseFloorPlan } from '../floorplan'
import { PLAN_FORMAT_VERSION, planJsonSchema } from '../planSchema'

const STORE = resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')

function labPlans(): { name: string; raw: unknown }[] {
  return gunzipSync(readFileSync(STORE))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const { name, text } = JSON.parse(line) as { name: string; text: string }
      try {
        return [{ name, raw: JSON.parse(text) as unknown }]
      } catch {
        return []
      }
    })
}

const schema = planJsonSchema()
const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(schema)

describe("the plan's JSON Schema", () => {
  it('carries the format version, the one a plan file states', () => {
    expect(PLAN_FORMAT_VERSION).toBe('1')
    expect(schema['$id']).toBe(`urn:ongrid:plan:${PLAN_FORMAT_VERSION}`)
    expect(schema['title']).toContain(`format version ${PLAN_FORMAT_VERSION}`)
    expect((schema['properties'] as Record<string, { const?: unknown }>)['version']?.const).toBe(PLAN_FORMAT_VERSION)
  })

  it('names every field a plan may hold at its top', () => {
    expect(Object.keys(schema['properties'] as object).sort()).toEqual(Object.keys(FloorPlanFieldsSchema.shape).sort())
  })

  it('is the same every time', () => {
    expect(JSON.stringify(planJsonSchema())).toBe(JSON.stringify(schema))
  })

  it('validates every lab plan that Grid reads today, at least 200 of them', () => {
    const read = labPlans().filter(({ raw }) => safeParseFloorPlan(raw) !== null)
    expect(read.length).toBeGreaterThanOrEqual(200)
    const refused = read.filter(({ raw }) => !validate(raw)).map(({ name }) => `${name}: ${ajv.errorsText(validate.errors)}`)
    expect(refused).toEqual([])
  })

  it('refuses what is not a plan', () => {
    const wall = { id: 'w1', start: [0, 0], end: [4, 0] }
    expect(validate({ walls: [wall] })).toBe(true)
    expect(validate({ walls: [{ id: 'w1', start: [0, 0] }] })).toBe(false)
    expect(validate({ walls: [{ ...wall, start: [0, 0, 0] }] })).toBe(false)
    expect(validate({ version: '2' })).toBe(false)
    expect(validate({ units: 'ft' })).toBe(false)
    expect(validate({ walls: [wall], openings: [{ id: 'd1', wall: 'w1', type: 'hatch', offset: 0.5, width: 0.9, height: 2.1 }] })).toBe(false)
    expect(validate({ walls: [{ ...wall, kind: 'load-bearing' }] })).toBe(false)
    expect(validate({ rooms: [{ id: 'r1', name: 'Hall', boundary: 'w1' }] })).toBe(false)
  })

  it('takes a wall without the thickness and height the reading fills in, and a stair by its two ends', () => {
    expect(validate({ walls: [{ id: 'w1', start: [0, 0], end: [4, 0] }] })).toBe(true)
    const stair = { id: 's1', from: 'ground', to: 'first', width: 0.9 }
    expect(validate({ stairs: [{ ...stair, run: [[0, 0], [0, 3]] }] })).toBe(true)
    expect(validate({ stairs: [{ ...stair, start: [0, 0], end: [0, 3] }] })).toBe(true)
    expect(validate({ stairs: [stair] })).toBe(false)
  })

  it('lists the room uses, and allows a word the reading names', () => {
    const use = (schema['definitions'] as Record<string, { properties: { use: { anyOf: { enum?: string[] }[] } } }>)['Room']?.properties.use
    expect(use?.anyOf[0]?.enum).toContain('toilet')
    expect(use?.anyOf[1]?.enum).toContain('wc')
    expect(validate({ rooms: [{ id: 'r1', name: 'Snug', boundary: [], use: 'snug' }] })).toBe(true)
  })
})
