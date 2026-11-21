/**
 * WRT-2: sizes with their basis, refusals in plain words naming both rooms, the read-back that
 * loses nothing, and a hand edit to a derived part refused with its own code.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffPlans } from '../../geometry/diff'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { roomsAnswer } from '../answer'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { stampFor } from '../stamp'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')
const BUILDINGS = ['flat', 'l-house', 'two-storey', 'office', 'odd-house', 'courtyard', 'hotel', 'four-flats'] as const

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

/** The outside faces of the walls: the box their bodies cover. */
function outsideBox(walls: readonly Wall[]): [number, number] {
  const xs: number[] = []
  const ys: number[] = []
  for (const w of walls) {
    const vertical = w.start[0] === w.end[0]
    for (const p of [w.start, w.end]) {
      xs.push(p[0] + (vertical ? w.thickness / 2 : 0), p[0] - (vertical ? w.thickness / 2 : 0))
      ys.push(p[1] + (vertical ? 0 : w.thickness / 2), p[1] - (vertical ? 0 : w.thickness / 2))
    }
  }
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
}

describe('sizes and what they measure to', () => {
  it('makes a "3 x 4 inside" room 3.00 x 4.00 m between its faces, and says so', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.7\nroom ext "Extension" living 3 x 4 inside\n')
    expect(result.problems).toEqual([])
    expect(result.rooms[0]).toMatchObject({ width: 3, depth: 4, basis: 'inside' })
    expect(result.rooms[0]!.area).toBeCloseTo(12, 9)
    const answer = roomsAnswer(result).join('\n')
    expect(answer).toContain('3.00 x 4.00 m, 12.00 m² inside (written 3.00 x 4.00 to the inside faces)')
    expect(answer).toContain('Sizes are to the inside faces unless a room says otherwise (the default).')
  })

  it('makes an "8 x 10 outside" footprint 8.00 x 10.00 m to its outside faces, and says so', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.7\nroom house "House" living 8 x 10 outside\n')
    expect(result.problems).toEqual([])
    const [w, d] = outsideBox(parseFloorPlan(result.plan).walls)
    expect(w).toBeCloseTo(8, 9)
    expect(d).toBeCloseTo(10, 9)
    expect(result.rooms[0]).toMatchObject({ basis: 'outside' })
    expect(result.rooms[0]!.width).toBeCloseTo(7.4, 9)
    expect(roomsAnswer(result).join('\n')).toContain('7.40 x 9.40 m, 69.56 m² inside (written 8.00 x 10.00 to the outside faces)')
  })

  it('measures a size to the centre lines from the walls the room ends up with', () => {
    const plan = written('walls outside 0.3 inside 0.1 height 2.7\nsizes centre\nroom a "A" living 3 x 4\nroom b "B" bedroom 3 x 4 east of a\n')
    const xs = plan.walls.filter((w) => w.start[0] === w.end[0]).map((w) => w.start[0]).sort((p, q) => p - q)
    // Centre lines 3 m apart: the outside wall, the wall between the rooms, the outside wall.
    expect(xs).toHaveLength(3)
    expect(xs[1]! - xs[0]!).toBeCloseTo(3, 9)
    expect(xs[2]! - xs[1]!).toBeCloseTo(3, 9)
  })
})

describe('refusals in plain words', () => {
  const base = 'walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 4 x 4\n'

  it('refuses overlapping rooms, naming both and how far', () => {
    const result = compileRoomsText(`${base}room bed "Bed" bedroom 3 x 4 at 3.6,0\n`)
    expect(result.plan).toBeNull()
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatchObject({ code: 'rooms/overlap', line: 3 })
    expect(result.problems[0]!.message).toMatch(/^Rooms 'living' \(line 2\) and 'bed' \(line 3\) overlap: they share an area about 0\.40 m east-west by 4\.00 m north-south/)
  })

  it('refuses a gap that is neither a wall nor a room, naming both', () => {
    const result = compileRoomsText(`${base}room bed "Bed" bedroom 3 x 4 at 4.8,0\n`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]).toMatchObject({ code: 'rooms/gap' })
    expect(result.problems[0]!.message).toMatch(/^Rooms 'living' \(line 2\) and 'bed' \(line 3\) leave a gap of 0\.80 m between them/)
  })

  it('refuses rooms that touch with no wall, unless they are open to each other', () => {
    const touching = compileRoomsText(`${base}room bed "Bed" bedroom 3 x 4 at 4,0\n`)
    expect(touching.problems[0]).toMatchObject({ code: 'rooms/touching' })
    expect(touching.problems[0]!.message).toContain("Rooms 'living' (line 2) and 'bed' (line 3) touch")
    const open = written(`${base}room dining "Dining" dining 3 x 4 east of living open\n`)
    expect(open.walls.filter((w) => w.virtual === true)).toHaveLength(1)
  })
})

describe('reading a plan back as rooms text', () => {
  for (const name of BUILDINGS) {
    it(`${name}: rooms text to plan to rooms text to plan changes nothing`, () => {
      const first = written(read(`${name}.rooms`))
      const reading = readRoomsText(first)
      expect(reading.rawFloors).toEqual([])
      const second = written(reading.text)
      expect(diffPlans(first, second).changes).toEqual([])
      // The read-back says what it was read from.
      expect(reading.text).toContain('based on ')
    })
  }

  it('keeps the school plan\'s walls at 3.00 m, read back and written again (AB-2)', () => {
    const school = parseFloorPlan(JSON.parse(read('school.plan.json')))
    expect(new Set(school.walls.map((w) => w.height))).toEqual(new Set([3]))
    const reading = readRoomsText(school)
    expect(reading.text).toMatch(/^walls outside 0\.3 inside 0\.15 height 3$/m)
    // Written rooms first, not as raw lines.
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toMatch(/^room corr "Corridor" corridor /m)
    const again = written(reading.text)
    expect(new Set(again.walls.map((w) => w.height))).toEqual(new Set([3]))
    expect(diffPlans(school, again).changes).toEqual([])
  })

  it('writes every hand-drawn original back without a change, raw where rooms text cannot say it', () => {
    for (const name of [...BUILDINGS, 'school']) {
      const original = parseFloorPlan(JSON.parse(read(`${name}.plan.json`)))
      const again = written(readRoomsText(original).text)
      expect(diffPlans(original, again).changes, name).toEqual([])
      // The checks the comparison does not look at: a room's use, a door's hinge and swing.
      expect(again.rooms.map((r) => [r.id, r.use]), name).toEqual(original.rooms.map((r) => [r.id, r.use]))
      const hung = (p: FloorPlan) => p.openings.map((o) => [o.id, o.hinge, o.swing]).sort()
      expect(hung(again), name).toEqual(hung(original))
    }
  })

  it('gives a wall height or thickness exception, so a changed wall is never lost', () => {
    const plan = written('walls outside 0.3 inside 0.1 height 2.7\nroom a "A" living 3 x 4\nroom b "B" bedroom 3 x 4 east of a\n')
    const higher = { ...plan, walls: plan.walls.map((w) => (w.id === 'w-a-b' ? { ...w, height: 3.1 } : w)) }
    const reading = readRoomsText(higher)
    expect(reading.text).toContain('wall between a and b height 3.1')
    expect(diffPlans(higher, written(reading.text)).changes).toEqual([])
  })
})

describe('the parts Grid derives', () => {
  it('refuses a room boundary edited by hand, with its own code', () => {
    const plan = written(read('flat.rooms'))
    const stamped = parseFloorPlan({ ...plan, written: stampFor(plan) })
    expect(validatePlan(stamped).issues.filter((i) => i.code === 'room/derived-edited')).toEqual([])
    const edited = { ...stamped, rooms: stamped.rooms.map((r) => (r.id === 'hall' ? { ...r, boundary: [...r.boundary].reverse() } : r)) }
    const issues = validatePlan(edited).issues.filter((i) => i.code === 'room/derived-edited')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ id: 'hall', severity: 'error' })
    expect(issues[0]!.message).toContain('written rooms first')
    // A plan with no stamp is a hand-written one: its boundaries are its own.
    const { written: _stamp, ...unstamped } = edited
    expect(validatePlan(unstamped).issues.filter((i) => i.code === 'room/derived-edited')).toEqual([])
  })

  it('keeps each room\'s id through an edit of its size', () => {
    const before = written(read('flat.rooms'))
    const after = written(read('flat.rooms').replace('room kitchen "Kitchen"     kitchen  4.4 x 3.0', 'room kitchen "Kitchen"     kitchen  4.4 x 3.4'))
    const rooms = diffPlans(before, after).changes.filter((c) => c.entity.type === 'room')
    expect(rooms.length).toBeGreaterThan(0)
    expect(rooms.every((c) => c.kind === 'modified')).toBe(true)
    expect(after.rooms.map((r) => r.id)).toEqual(before.rooms.map((r) => r.id))
  })
})
