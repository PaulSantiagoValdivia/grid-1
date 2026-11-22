/**
 * CNT-7 (C26, lab EL-8, R-8): what `grid check` says of a plan with outdoor space. The house is the
 * lab's G series house with its 15 × 30 m plot drawn round it as rooms bounded by dividing lines
 * (`s01c-plot-virtual.json`, lab EL-8), and the infill house round a courtyard
 * (`s08a-infill-courtyard.json`). The garden fenced in with no gate, told it has no door drawn as a
 * room, is in `packages/floorplan/src/geometry/__tests__/outdoor.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { inspectPlan } from '../inspect'

const GARDENS: Record<string, string> = { 'front-garden': 'garden', driveway: 'other', 'front-east': 'garden', 'side-w': 'other', 'side-e': 'other', 'back-garden': 'garden' }

function houseInGarden(outdoor: boolean): unknown {
  const plan = JSON.parse(labPlanText('G/scenarios/s01c-plot-virtual.json')) as { rooms: Record<string, unknown>[] }
  if (outdoor) for (const room of plan.rooms) if (GARDENS[String(room['id'])] !== undefined) room['outdoor'] = GARDENS[String(room['id'])]
  return plan
}

describe('outdoor space in grid check (CNT-7)', () => {
  it('drops the outside walls\' kind notes once the garden is outdoor space, and says nothing of the garden', () => {
    const drawn = inspectPlan(houseInGarden(false)).lines.map((line) => line.code)
    expect(drawn).toEqual(['wall/kind-differs', 'wall/kind-differs', 'wall/kind-differs', 'wall/kind-differs'])
    const outdoor = inspectPlan(houseInGarden(true))
    expect(outdoor.lines.map((line) => line.code)).toEqual([])
    expect(outdoor.lines.some((line) => /garden/i.test(line.message))).toBe(false)
  })

  it('tells a courtyard marked as outdoor space nothing, and checks the house round it as before', () => {
    const plan = JSON.parse(labPlanText('G/scenarios/s08a-infill-courtyard.json')) as { rooms: Record<string, unknown>[] }
    const before = inspectPlan(plan).lines.map((line) => line.code)
    for (const room of plan.rooms) if (room['id'] === 'court') room['outdoor'] = 'courtyard'
    const after = inspectPlan(plan).lines
    expect(after.filter((line) => line.thing.id === 'court')).toEqual([])
    // The courtyard's west wall now faces outside, as it is stated: its kind note goes.
    expect(before.filter((code) => code === 'wall/kind-differs')).toHaveLength(3)
    expect(after.filter((line) => line.code === 'wall/kind-differs').map((line) => line.thing.id)).toEqual(['mid-s', 'mid-n'])
  })
})
