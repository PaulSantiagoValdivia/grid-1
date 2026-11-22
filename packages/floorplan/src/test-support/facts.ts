/**
 * CNT-9: the plan that stands in for the lab's S-10, which is not in the repository: a two-floor
 * office, `fixtures/facts-office.json`, with 59 facts over its walls, doors, windows, rooms and
 * floors. The tests of the format, the exports, the schedules, the edits and the tools read it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FloorPlan } from '../types/floorplan'

export const FACTS_OFFICE = resolve(__dirname, '../../fixtures/facts-office.json')

/** The stand-in for S-10, as its file holds it. */
export function factsOffice(): Record<string, unknown> {
  return JSON.parse(readFileSync(FACTS_OFFICE, 'utf8')) as Record<string, unknown>
}

/** Every fact a plan states: each property of each wall, opening, room and floor, and each room's number. */
export function factCount(plan: Pick<FloorPlan, 'walls' | 'openings' | 'rooms' | 'floors'>): number {
  const parts = [...plan.walls, ...plan.openings, ...plan.rooms, ...(plan.floors ?? [])] as { properties?: object; number?: string }[]
  return parts.reduce((n, part) => n + Object.keys(part.properties ?? {}).length + (part.number === undefined ? 0 : 1), 0)
}
