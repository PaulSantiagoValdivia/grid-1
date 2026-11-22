/**
 * CNT-10: the plan that stands in for the lab's EL-10 case, in Grid's own words: a flat whose
 * kitchen and dining room are knocked into one, whose living room gets a new partition for a
 * study, whose bathroom door is widened (the old opening demolished, a new one in its place) and
 * whose south window is blocked up for a new one along the wall. `fixtures/refurbishment.json`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFloorPlan, type FloorPlan } from '../types/floorplan'

export const REFURBISHMENT = resolve(__dirname, '../../fixtures/refurbishment.json')

/** The refurbishment as its file holds it. */
export function refurbishmentRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(REFURBISHMENT, 'utf8')) as Record<string, unknown>
}

/** The refurbishment, read. */
export function refurbishment(): FloorPlan {
  return parseFloorPlan(refurbishmentRaw())
}
