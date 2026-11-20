import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { checkLocalRules } from '../check'

/**
 * Lab R-7: in the Madrid flat the salón could not be drawn until ARE-1, so the bedroom whose
 * only door opens into it was said to have no door. The plans are the core's fixtures.
 */
const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures', name), 'utf8')))

describe('R-7 flats whose walls in a row change thickness', () => {
  it('the Madrid flat: no false "no door" note, and no room left out', () => {
    const report = checkLocalRules(fixture('madrid-flat.json'))
    const withoutDoor = report.findings.filter((f) => f.code === 'room_without_door').flatMap((f) => f.rooms)
    // The light well has no door, and says so: it is outdoor space (lab R-8).
    expect(withoutDoor).toEqual(['patio'])
    expect(report.notChecked.flatMap((n) => n.rooms)).toEqual([])
  })

  it('the Berlin flat: the Berliner Zimmer is checked like any other room', () => {
    const report = checkLocalRules(fixture('berlin-flat.json'))
    expect(report.findings.flatMap((f) => f.rooms)).not.toContain('berliner')
    expect(report.notChecked.flatMap((n) => n.rooms)).not.toContain('berliner')
  })
})
