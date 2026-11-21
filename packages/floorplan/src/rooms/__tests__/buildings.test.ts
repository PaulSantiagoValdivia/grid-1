/**
 * WRT-2, first done-when: the lab's eight buildings, written rooms first, are the same buildings
 * as their originals in walls, areas and checks, and the two-storey house keeps all five of its
 * comparable openings (the lab's rooms file left two faulty ones out and matched 3 of 5).
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { sameBuilding } from '../../test-support/sameBuilding'
import { compileRoomsText } from '../compile'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')

export const BUILDINGS = ['flat', 'l-house', 'two-storey', 'office', 'odd-house', 'courtyard', 'hotel', 'four-flats'] as const

describe('the lab buildings written rooms first', () => {
  for (const name of BUILDINGS) {
    it(`${name} is the same building as its original`, () => {
      const written = compileRoomsText(read(`${name}.rooms`))
      expect(written.problems).toEqual([])
      const plan = parseFloorPlan(written.plan)
      const original = parseFloorPlan(JSON.parse(read(`${name}.plan.json`)))
      const match = sameBuilding(original, plan)
      for (const floor of match.floors) {
        expect(floor.walls, `${floor.floor}: wall footprint`).toBeLessThan(0.001)
        expect(floor.outsideWalls, `${floor.floor}: outside walls`).toBeLessThan(0.001)
        expect(floor.heights, `${floor.floor}: wall heights`).toBeLessThan(0.001)
      }
      expect(match.openings.onlyFirst).toEqual([])
      expect(match.openings.same).toBe(match.openings.of)
      expect(match.areas.unmatched).toEqual([])
      expect(match.areas.worst).toBeLessThan(0.005)
      expect(match.checks.second).toEqual(match.checks.first)
    })
  }

  it('keeps 5 of 5 comparable openings in the two-storey house, the faulty ones included', () => {
    const plan = parseFloorPlan(compileRoomsText(read('two-storey.rooms')).plan)
    const original = parseFloorPlan(JSON.parse(read('two-storey.plan.json')))
    const match = sameBuilding(original, plan)
    expect(match.openings).toMatchObject({ same: 5, of: 5 })
    // The window that names no wall is not comparable, but it is kept, and checked as before.
    expect(plan.openings.map((o) => o.id)).toContain('ghost')
  })

  it('tells a different building apart: the lab\'s own two-storey file, a lower wall, a missing room', () => {
    const original = parseFloorPlan(JSON.parse(read('two-storey.plan.json')))
    // The lab's file left out the two faulty windows and decided the door's swing: 3 of 5.
    const lab = read('two-storey.rooms')
      .replace(', no-swing', '')
      .split('\n')
      .filter((line) => !line.startsWith('raw '))
      .join('\n')
    const labMatch = sameBuilding(original, parseFloorPlan(compileRoomsText(lab).plan))
    expect(labMatch.openings).toMatchObject({ same: 3, of: 5 })
    expect(labMatch.checks.second).not.toEqual(labMatch.checks.first)

    const lower = { ...original, walls: original.walls.map((w, i) => (i === 0 ? { ...w, height: 2.4 } : w)) }
    expect(sameBuilding(original, lower).floors.some((f) => f.heights > 1)).toBe(true)
    const fewer = { ...original, rooms: original.rooms.slice(1) }
    expect(sameBuilding(original, fewer).areas.unmatched.length).toBe(1)
  })
})
