/**
 * One schedule of the doors, windows and doorless openings, grouped by type and size, each
 * listed once with the two rooms it joins. Sizes are the hole in the wall: the plan holds no
 * frame, leaf or clear width.
 */
import { tolerance } from '@ongrid/floorplan/geometry'
import { sideNames, type Survey } from './survey'

export const SCHEDULE_RULE =
  'Sizes are the opening in the wall, width by height, in metres, with the sill above the floor. The plan holds no frames or leaves, so a clear width is not known.'

export interface ScheduleItem {
  readonly id: string
  readonly floor: string
  readonly between: readonly [string, string]
}

export interface ScheduleRow {
  readonly type: 'door' | 'window' | 'opening'
  readonly width: number
  readonly height: number
  readonly sill: number
  readonly count: number
  readonly items: readonly ScheduleItem[]
}

export interface Schedule {
  readonly rows: readonly ScheduleRow[]
  readonly counts: Readonly<Record<'door' | 'window' | 'opening', number>>
  readonly rule: string
}

const ORDER = { door: 0, window: 1, opening: 2 } as const

export function planSchedule(
  survey: Survey,
  options: { floors?: readonly string[]; types?: readonly ('door' | 'window' | 'opening')[]; narrowerThan?: number } = {},
): Schedule {
  const groups = new Map<string, { type: ScheduleRow['type']; width: number; height: number; sill: number; items: ScheduleItem[] }>()
  for (const floor of survey.facts.floors) {
    if (options.floors !== undefined && !options.floors.includes(floor.id)) continue
    for (const opening of floor.openings) {
      if (options.types !== undefined && !options.types.includes(opening.type)) continue
      if (options.narrowerThan !== undefined && !(opening.width < options.narrowerThan - tolerance('noLength'))) continue
      const key = [opening.type, opening.width.toFixed(3), opening.height.toFixed(3), opening.sill.toFixed(3)].join('|')
      const group = groups.get(key) ?? { type: opening.type, width: opening.width, height: opening.height, sill: opening.sill, items: [] }
      group.items.push({ id: opening.id, floor: floor.id, between: sideNames(opening) })
      groups.set(key, group)
    }
  }
  const rows = [...groups.values()]
    .map((group) => ({ ...group, count: group.items.length }))
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.width - b.width || a.height - b.height || a.sill - b.sill)
  const counts = { door: 0, window: 0, opening: 0 }
  for (const row of rows) counts[row.type] += row.count
  return { rows, counts, rule: SCHEDULE_RULE }
}
