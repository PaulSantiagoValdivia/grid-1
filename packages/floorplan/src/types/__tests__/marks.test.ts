/**
 * WRT-6 (lab WR-15, AE-4, AU3-6): where a value came from, and a value left out that stays not
 * stated. The marks are one list beside the parts (C7), and a wall's filled-in values are the
 * reading's, never the file's.
 */
import { describe, expect, it } from 'vitest'
import { assumedValues, buildFloorPlan, marksWithNoPart, planMarks, wallSureness } from '../../geometry'
import { flat } from '../../test-support/plans'
import { compileRoomsText } from '../../rooms/compile'
import { readRoomsText } from '../../rooms/read'
import { heightByDefault, heightStated, MarkSchema, parseFloorPlan, safeParseFloorPlan, statedWall } from '../floorplan'
import { readingNotes } from '../reading'

const box = (walls: Record<string, unknown>[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: '1',
  walls,
  rooms: [{ id: 'r', name: 'Room', boundary: walls.map((w) => w['id']) }],
  openings: [],
  ...extra,
})
const four = (more: Record<string, unknown> = {}): Record<string, unknown>[] => [
  { id: 's', start: [0, 0], end: [4, 0], ...more },
  { id: 'e', start: [4, 0], end: [4, 3], ...more },
  { id: 'n', start: [4, 3], end: [0, 3], ...more },
  { id: 'w', start: [0, 3], end: [0, 0], ...more },
]

describe('a value a wall leaves out (AU3-6)', () => {
  it('stays not stated after reading, though the geometry gets 2.7 m', () => {
    const plan = parseFloorPlan(box(four()))
    const wall = plan.walls[0]!
    expect(wall.height).toBe(2.7)
    expect(wall.unstated).toEqual(['thickness', 'height', 'kind'])
    expect(heightStated(wall)).toBe(false)
    expect(heightByDefault(plan, wall)).toBe(true)
    // Written back, it states nothing the file did not.
    expect(statedWall(wall)).toEqual({ id: 's', start: [0, 0], end: [4, 0] })
  })

  it('takes its floor\'s height only in the reading, and still states none of its own', () => {
    const plan = parseFloorPlan(box(four({ floor: 'g' }), { floors: [{ id: 'g', name: 'Ground', height: 3.1 }] }))
    const wall = plan.walls[0]!
    expect(wall.height).toBe(3.1)
    expect(heightStated(wall)).toBe(false)
    // Stated once, on the floor: not Grid's default.
    expect(heightByDefault(plan, wall)).toBe(false)
    expect(statedWall(wall)).not.toHaveProperty('height')
  })

  it('is told apart from a stated 2.7 m', () => {
    const plan = parseFloorPlan(box(four({ height: 2.7, thickness: 0.2, kind: 'interior' })))
    expect(plan.walls[0]!.unstated).toBeUndefined()
    expect(heightByDefault(plan, plan.walls[0]!)).toBe(false)
  })

  it('is the reading\'s own: a file that writes unstated is told it is not read', () => {
    const raw = box(four({ height: 2.4, thickness: 0.2, kind: 'interior', unstated: ['height'] }))
    expect(parseFloorPlan(raw).walls[0]!.unstated).toBeUndefined()
    expect(parseFloorPlan(raw).walls[0]!.height).toBe(2.4)
    expect(readingNotes(raw).filter((n) => n.kind === 'unknown-field').map((n) => (n as { field: string | null }).field)).toContain('unstated')
  })

  it('is written by rooms text with no height, and read back with none (AU3-6)', () => {
    const written = compileRoomsText('walls outside 0.3 inside 0.1\nroom a "A" living 4 x 3\nroom b "B" bedroom 3 x 3 east of a\n')
    expect(written.problems).toEqual([])
    expect(written.plan!.walls.every((w) => !('height' in w))).toBe(true)
    const plan = parseFloorPlan(written.plan)
    expect(plan.walls.every((w) => w.virtual === true || heightByDefault(plan, w))).toBe(true)
    const back = readRoomsText(plan)
    expect(back.text).toMatch(/^walls outside 0\.3 inside 0\.1$/m)
    expect(back.text).not.toMatch(/height/)
    expect(back.rawFloors).toEqual([])
  })

  it('reads back a plan with heights as before', () => {
    const back = readRoomsText(parseFloorPlan(compileRoomsText('walls outside 0.3 inside 0.1 height 2.6\nroom a "A" living 4 x 3\n').plan))
    expect(back.text).toMatch(/^walls outside 0\.3 inside 0\.1 height 2\.6$/m)
    expect(back.rawFloors).toEqual([])
  })
})

describe('marks (C7)', () => {
  const marked = (marks: unknown[]): ReturnType<typeof parseFloorPlan> => parseFloorPlan({ ...flat(), marks })

  it('leaves a plan with none exactly as it was', () => {
    expect(parseFloorPlan(flat())).not.toHaveProperty('marks')
    expect(planMarks(parseFloorPlan(flat())).all).toEqual([])
  })

  it('takes a mark on a value, or on a whole part, with a tolerance on a length', () => {
    expect(MarkSchema.safeParse({ part: 'wall', id: 's1', source: 'scanned', tolerance: 0.02 }).success).toBe(true)
    expect(MarkSchema.safeParse({ part: 'room', id: 'kitchen', value: 'use', source: 'assumed' }).success).toBe(true)
  })

  it('refuses a value the part has no such thing as, a tolerance on a word, and a source Grid does not know', () => {
    expect(MarkSchema.safeParse({ part: 'wall', id: 's1', value: 'colour', source: 'given' }).success).toBe(false)
    expect(MarkSchema.safeParse({ part: 'wall', id: 's1', value: 'kind', source: 'measured', tolerance: 0.01 }).success).toBe(false)
    expect(MarkSchema.safeParse({ part: 'wall', id: 's1', source: 'guessed' }).success).toBe(false)
    expect(safeParseFloorPlan({ ...flat(), marks: [{ part: 'wall', id: 's1', source: 'guessed' }] })).toBeNull()
  })

  it('reads a mark on a value over a mark on its part, and the first of two on one value', () => {
    const marks = planMarks(marked([
      { part: 'wall', id: 's1', source: 'scanned', tolerance: 0.02 },
      { part: 'wall', id: 's1', value: 'height', source: 'assumed' },
      { part: 'wall', id: 's1', value: 'height', source: 'given' },
    ]))
    expect(marks.of('wall', 's1', 'height')?.source).toBe('assumed')
    expect(marks.of('wall', 's1', 'thickness')?.source).toBe('scanned')
    expect(marks.of('wall', 's2')).toBeNull()
    expect(marks.assumed('wall', 's1')).toBe(true)
    expect(marks.assumed('wall', 's2')).toBe(false)
    expect(wallSureness(marks, 's1')).toEqual({ source: 'scanned', tolerance: 0.02 })
  })

  it('lists what was assumed to confirm, and names a mark on a part the plan does not have', () => {
    const plan = marked([
      { part: 'wall', id: 's1', value: 'height', source: 'assumed' },
      { part: 'room', id: 'kitchen', source: 'assumed', tolerance: 0.05 },
      { part: 'room', id: 'study', source: 'assumed' },
      { part: 'opening', id: 'front', source: 'given' },
    ])
    expect(assumedValues(plan)).toEqual([
      { part: 'wall', id: 's1', value: 'height', tolerance: null },
      { part: 'room', id: 'kitchen', value: null, tolerance: 0.05 },
    ])
    expect(marksWithNoPart(plan).map((m) => m.id)).toEqual(['study'])
  })

  it('flags what is assumed in the drawing, and nothing else', () => {
    const drawing = buildFloorPlan(marked([
      { part: 'wall', id: 's1', value: 'height', source: 'assumed' },
      { part: 'room', id: 'kitchen', source: 'assumed' },
      { part: 'wall', id: 's2', source: 'given' },
    ]))
    expect(drawing.walls.filter((w) => w.assumed).map((w) => w.id)).toEqual(['s1'])
    expect(drawing.rooms.filter((r) => r.assumed).map((r) => r.id)).toEqual(['kitchen'])
    expect(buildFloorPlan(parseFloorPlan(flat())).walls.some((w) => 'assumed' in w)).toBe(false)
  })
})
