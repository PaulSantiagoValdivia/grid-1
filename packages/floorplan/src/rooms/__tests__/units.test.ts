/**
 * WRT-7 in rooms text: a length may carry its unit in one word, and a `display` line records how
 * the person reads lengths, which the read-back writes again. The file stays in metres.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const metric = 'walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 3.6576 x 3.048\nroom bed "Bed" bedroom 3 x 3.048 east of living\ndoor d1 between living and bed, centred, 0.9144 wide\n'

describe('lengths with their unit', () => {
  it('reads feet and inches, centimetres and millimetres as the same plan in metres', () => {
    const imperial = written('walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 12ft x 10ft\nroom bed "Bed" bedroom 300cm x 3048mm east of living\ndoor d1 between living and bed, centred, 36in wide\n')
    const plain = written(metric)
    expect(imperial.walls.map((w) => [w.start, w.end])).toEqual(plain.walls.map((w) => [w.start, w.end]))
    expect(imperial.openings[0]!.width).toBeCloseTo(0.9144, 9)
    expect(imperial.units).toBe('m')
  })

  it("takes the foot and inch marks in one word: 12'6\" and 12'-6\"", () => {
    for (const size of [`12'6"`, `12'-6"`, '12ft6in']) {
      const result = compileRoomsText(`walls outside 0.3 inside 0.1 height 2.7\nroom living "Living's room" living ${size} x 3\n`)
      expect(result.problems).toEqual([])
      expect(result.rooms[0]!.width).toBeCloseTo(3.81, 9)
      expect(result.rooms[0]!.name).toBe("Living's room")
    }
  })

  it('refuses a unit it cannot read, in words, with the forms it takes', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 12ft13in x 3\n')
    expect(result.plan).toBeNull()
    expect(result.problems[0]).toMatchObject({ code: 'rooms/units', line: 2 })
    expect(result.problems[0]!.message).toContain("12'6\"")
  })
})

describe('the display line', () => {
  it('records how the person reads lengths, and changes no length', () => {
    const plan = written(`display ft-in precision 3\n${metric}`)
    expect(plan.display).toEqual({ length: 'ft-in', precision: 3 })
    expect(plan.walls).toEqual(written(metric).walls)
  })

  it('is written again by the read-back, so writing the reading keeps it', () => {
    const plan = written(`display mm decimal comma\n${metric}`)
    const reading = readRoomsText(plan).text
    expect(reading).toContain('display mm decimal comma')
    expect(written(reading).display).toEqual({ length: 'mm', decimal: 'comma' })
  })

  it('refuses a unit Grid has no display for, naming the ones it has', () => {
    const result = compileRoomsText(`display furlongs\n${metric}`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]!.message).toContain('display <m|cm|mm|ft-in>')
  })
})
