/**
 * CNT-17 (C13): the rooms and routes a plan marks as needing to be accessible. An optional part,
 * never defaulted: a plan without it reads exactly as before, and a mark that cannot be read is
 * read as not stated, with the rest of the plan kept.
 */
import { describe, expect, it } from 'vitest'
import { flat } from '../../test-support/plans'
import { parseFloorPlan, safeParseFloorPlan } from '../floorplan'
import { readPlanParts } from '../readParts'
import { readingNotes } from '../reading'

describe('accessible (C13)', () => {
  it('reads the rooms and routes as written, and adds no key to a plan without it', () => {
    const mark = { rooms: ['bath'], routes: [{ to: 'bath' }, { from: 'bed1', to: 'bath' }] }
    expect(parseFloorPlan({ ...flat(), accessible: mark }).accessible).toEqual(mark)
    expect('accessible' in parseFloorPlan(flat())).toBe(false)
    expect(parseFloorPlan({ ...flat(), accessible: {} }).accessible).toEqual({})
  })

  it('refuses a route with no room to go to, and an id that breaks the text rule (MSG-9)', () => {
    expect(safeParseFloorPlan({ ...flat(), accessible: { routes: [{ from: 'hall' }] } })).toBeNull()
    expect(safeParseFloorPlan({ ...flat(), accessible: { rooms: ['a\nb'] } })).toBeNull()
    expect(safeParseFloorPlan({ ...flat(), accessible: { rooms: [''] } })).toBeNull()
  })

  it('leaves out a mark it cannot read and keeps the rest of the plan (MSG-6)', () => {
    const read = readPlanParts({ ...flat(), accessible: { rooms: 'bath' } })
    expect(read.plan).not.toBeNull()
    expect(read.plan!.accessible).toBeUndefined()
    expect(read.plan!.rooms.length).toBe(flat().rooms.length)
  })

  it('names a misspelt field inside it, with the one meant (MSG-4)', () => {
    const notes = readingNotes({ ...flat(), accessible: { room: ['bath'] } }).filter((n) => n.kind === 'unknown-field')
    expect(notes).toMatchObject([{ field: 'room', at: 'accessible', nearest: 'rooms' }])
  })
})
