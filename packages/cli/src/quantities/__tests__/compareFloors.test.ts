import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { comparePlans } from '../compare'
import { surveyPlan } from '../survey'

/**
 * A window in the same place on another floor is another window. Found by WRT-3: moving the
 * north wall of one flat of the lab's block by 0.10 m paired its windows with the ones above
 * them, and the comparison said "openings: 6 out, 6 new".
 */
describe('comparing a plan of several floors', () => {
  it('pairs an opening only with one on its own floor', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/edits/block-588.json'), 'utf8')) as { walls: Array<{ id: string; start: [number, number]; end: [number, number] }> }
    const before = parseFloorPlan(raw)
    const moved = structuredClone(raw)
    for (const wall of moved.walls) {
      if (wall.id !== 'L1-ext-n') continue
      wall.start = [wall.start[0], wall.start[1] - 0.1]
      wall.end = [wall.end[0], wall.end[1] - 0.1]
    }
    const verdict = comparePlans(surveyPlan(before), surveyPlan(parseFloorPlan(moved)), ['before', 'after']).verdict
    expect(verdict).not.toMatch(/openings: \d+ out/)
  })
})
