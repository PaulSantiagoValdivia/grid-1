/**
 * CNT-9: facts of the person's own on walls, openings, rooms and floors, and a room's number.
 * `fixtures/facts-office.json` stands in for the lab's S-10 plan, which is not in the
 * repository: a two-floor office with 59 facts over its walls, doors, windows, rooms and floors.
 */
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema, parseFloorPlan } from '../floorplan'
import { factKey, factOf } from '../facts'
import { readingNotes } from '../reading'
import { readPlanParts } from '../readParts'
import { validatePlan } from '../../geometry'
import { factCount, factsOffice } from '../../test-support/facts'

const raw = factsOffice

describe('the stand-in for S-10 (CNT-9)', () => {
  it('holds 59 facts over walls, doors, windows, rooms and floors, and reads them all', () => {
    const plan = parseFloorPlan(raw())
    expect(factCount(plan)).toBe(59)
    const doors = plan.openings.filter((o) => o.type === 'door')
    expect(doors.filter((d) => factOf(d, 'fire rating') !== undefined)).toHaveLength(3)
    expect(plan.rooms.every((r) => r.number !== undefined && factOf(r, 'department') !== undefined)).toBe(true)
    expect(plan.floors!.every((f) => f.properties !== undefined)).toBe(true)
  })

  it('is a sound plan, with nothing to name about its facts', () => {
    const plan = parseFloorPlan(raw())
    expect(validatePlan(plan).issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(readingNotes(raw())).toEqual([])
    const read = readPlanParts(raw())
    expect(read.plan).not.toBeNull()
    expect(read.plan === null ? [] : read.faults).toEqual([])
    expect(read.plan === null ? 0 : factCount(read.plan)).toBe(59)
  })
})

describe('the facts format (CNT-9)', () => {
  const wall = { id: 'w', start: [0, 0], end: [4, 0] }

  it('takes text, a number, or true or false, and adds no key to a plan that states none', () => {
    const plan = parseFloorPlan({ walls: [{ ...wall, properties: { 'fire rating': 'EI 30', 'acoustic rating': 45, 'load bearing': true } }] })
    expect(plan.walls[0]!.properties).toEqual({ 'fire rating': 'EI 30', 'acoustic rating': 45, 'load bearing': true })
    expect(parseFloorPlan({ walls: [wall] }).walls[0]).not.toHaveProperty('properties')
  })

  it('refuses a blank name, an empty text, a list, a line break and two names that differ only in capitals', () => {
    const refused = (properties: unknown): boolean => !FloorPlanSchema.safeParse({ walls: [{ ...wall, properties }] }).success
    expect(refused({ ' ': 'x' })).toBe(true)
    expect(refused({ rating: '' })).toBe(true)
    expect(refused({ rating: ['a'] })).toBe(true)
    expect(refused({ rating: 'a\nb' })).toBe(true)
    expect(refused({ 'Fire rating': 'EI 30', 'fire_rating': 'EI 60' })).toBe(true)
    expect(refused({ rating: 'EI 30' })).toBe(false)
  })

  it('takes a room number as text, and refuses a blank one', () => {
    const room = { id: 'r', name: 'Office', boundary: [] }
    expect(parseFloorPlan({ rooms: [{ ...room, number: 'G.04' }] }).rooms[0]!.number).toBe('G.04')
    expect(FloorPlanSchema.safeParse({ rooms: [{ ...room, number: ' ' }] }).success).toBe(false)
  })

  it('matches a fact whatever its capitals, spaces, dashes or underscores', () => {
    expect(factKey('Fire-rating')).toBe(factKey('fire rating'))
    expect(factOf({ properties: { 'Fire rating': 'EI 30' } }, 'fire_rating')).toBe('EI 30')
    expect(factOf({}, 'fire rating')).toBeUndefined()
  })

  it('is no unknown field: the facts sit in their own object, and a misspelt field beside them is still named', () => {
    const notes = readingNotes({ walls: [{ ...wall, properties: { anything: 'at all' }, thicknes: 0.2 }] })
    expect(notes.map((n) => (n.kind === 'unknown-field' ? n.field : n.kind))).toEqual(['thicknes'])
  })

  it('leaves out one fact it cannot read, and keeps the others on the part (MSG-6)', () => {
    const read = readPlanParts({ walls: [{ ...wall, properties: { good: 'EI 30', bad: null, also: 2 } }] })
    expect(read.plan).not.toBeNull()
    if (read.plan === null) return
    expect(read.plan.walls[0]!.properties).toEqual({ good: 'EI 30', also: 2 })
    expect(read.faults.map((f) => [f.kind, 'path' in f ? f.path.join('.') : ''])).toEqual([['value-left-out', 'walls.0.properties.bad']])
  })
})
