// The one file of the scoreboard that calls Grid. Everything here is Grid's own library, used the
// way the lab's harnesses used it, so the figures can be set against the lab's. It only uses
// functions that exist both today and at the reference commit (76caeb8), so the same runner
// measures both.
import { createHash } from 'node:crypto'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import {
  floorElevations,
  indexPlan,
  planFloors,
  planForFloor,
  roomArea,
  roomPolygon,
  validateDoorSweeps,
  validatePlan,
} from '@ongrid/floorplan/geometry'
import { EXPORT_FORMATS, exportPlan } from '@ongrid/floorplan/export'
import { checkLocalRules, planNotes } from '@ongrid/rules'

const sha1 = (data: string | Uint8Array): string => createHash('sha1').update(data).digest('hex')
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))
const FIXED_NOW = new Date('2026-01-01T00:00:00Z')

export interface Line {
  readonly code: string
  readonly id: string
  readonly message: string
}

/** Everything Grid says and produces for one plan file. Never throws. */
export interface GridRun {
  readonly parseOk: boolean
  /** Where the schema refused the file, as dotted paths ("walls.3.thickness"). */
  readonly parseProblems: readonly string[]
  readonly issues: readonly Line[]
  readonly sweeps: readonly Line[]
  /** Per country asked ("none" and "ES"): the note titles and the "not checked" lines. */
  readonly reports: Readonly<Record<string, { readonly notes: readonly string[]; readonly details: readonly string[]; readonly notChecked: readonly string[]; readonly sha1: string }>>
  /** The ids of the things the rules report's findings are about (rooms and openings). */
  readonly findingIds: readonly string[]
  /** A stage that threw, by name. */
  readonly thrown: readonly string[]
  /** One short hash per output, to tell "nothing changed" from "something changed". */
  readonly signature: Readonly<Record<string, string>>
}

interface Mutable {
  parseOk: boolean
  parseProblems: string[]
  issues: Line[]
  sweeps: Line[]
  reports: Record<string, { notes: string[]; details: string[]; notChecked: string[]; sha1: string }>
  findingIds: string[]
  thrown: string[]
  signature: Record<string, string>
}

const lines = (list: readonly { code: string; id: string; message: string }[]): Line[] =>
  list.map((i) => ({ code: i.code, id: i.id, message: i.message }))

/**
 * Runs one plan through every stage an agent can reach: reading, the drawing's checks, the door
 * swings, room areas floor by floor, storey heights, the rules report with and without a
 * country, and the four exports. The same stages as the lab's cluster L harness.
 */
export function runGrid(raw: unknown, options: { exports?: boolean } = {}): GridRun {
  const run: Mutable = { parseOk: false, parseProblems: [], issues: [], sweeps: [], reports: {}, findingIds: [], thrown: [], signature: {} }
  const stage = <T>(name: string, body: () => T): T | undefined => {
    try {
      return body()
    } catch (error) {
      run.thrown.push(`${name}: ${message(error)}`)
      return undefined
    }
  }
  let plan: FloorPlan
  try {
    plan = parseFloorPlan(raw)
  } catch (error) {
    const issues = (error as { issues?: { path?: unknown[] }[] }).issues
    if (Array.isArray(issues)) run.parseProblems = issues.map((i) => (i.path ?? []).join('.'))
    else run.thrown.push(`parse: ${message(error)}`)
    run.signature = { parse: `false${message(error)}` }
    return run
  }
  run.parseOk = true
  const floors = stage('floors', () => planFloors(plan)) ?? []
  stage('validate', () => {
    run.issues = lines(validatePlan(plan).issues)
  })
  stage('sweeps', () => {
    run.sweeps = lines(validateDoorSweeps(plan, (o) => ({ hinge: o.hinge, swing: o.swing })))
  })
  const areas: string[] = []
  stage('areas', () => {
    for (const floor of floors) {
      const slice = planForFloor(plan, floor.id)
      const index = indexPlan(slice)
      const broken = validatePlan(slice, index).broken
      for (const room of slice.rooms) {
        if (broken.has(room.id)) {
          areas.push(`${room.id}:null`)
          continue
        }
        try {
          roomPolygon(room, index)
          areas.push(`${room.id}:${roomArea(room, index).toFixed(9)}`)
        } catch {
          areas.push(`${room.id}:null`)
        }
      }
    }
  })
  const storeys = stage('storeys', () => {
    const e = floorElevations(plan)
    return { floors: Object.fromEntries(e.floors), roof: e.roof }
  })
  for (const country of [null, 'ES'] as const) {
    const key = country ?? 'none'
    stage(`report-${key}`, () => {
      const report = country === null ? checkLocalRules(plan) : checkLocalRules(plan, { country })
      const view = planNotes(plan, report)
      for (const finding of report.findings) run.findingIds.push(...finding.rooms, ...finding.openings)
      run.reports[key] = {
        notes: view.notes.map((n) => `[${n.tag}] ${n.title.map((p) => p.text).join('')}`),
        details: view.notes.map((n) => `${n.tag}|${n.title.map((p) => p.text).join('')}|${n.detail.map((p) => p.text).join('')}`),
        notChecked: [...view.notChecked],
        sha1: sha1(JSON.stringify(report)),
      }
    })
  }
  const exportsSig: Record<string, string> = {}
  if (options.exports !== false) {
    for (const format of EXPORT_FORMATS) {
      const targets: (string | null)[] = format === 'ifc' ? [null] : floors.map((f) => f.id)
      for (const floorId of targets) {
        stage(`export-${format}`, () => {
          const result = exportPlan(plan, format, { projectId: 'p', projectName: 'p', floorId, now: FIXED_NOW })
          exportsSig[`export-${format}-${floorId ?? 'all'}`] = sha1(result.data)
        })
      }
    }
  }
  const sorted = (list: readonly Line[]): string => sha1(JSON.stringify(list.map((i) => `${i.code}|${i.id}|${i.message}`).sort()))
  run.signature = {
    parse: 'true',
    issues: sorted(run.issues),
    sweeps: sorted(run.sweeps),
    areas: sha1(JSON.stringify(areas)),
    storeys: sha1(JSON.stringify(storeys ?? null)),
    ...Object.fromEntries(Object.entries(run.reports).map(([k, r]) => [`report-${k}`, r.sha1])),
    ...Object.fromEntries(Object.entries(run.reports).map(([k, r]) => [`notes-${k}`, sha1(JSON.stringify([...r.details].sort()))])),
    ...exportsSig,
    thrown: sha1(JSON.stringify(run.thrown)),
  }
  return run
}

/** A room's area as Grid gives it, keyed "floor|room id"; null where Grid will not measure it. */
export type RoomAreas = ReadonlyMap<string, number | null>

/**
 * Grid's area for every room of a plan, or null when Grid cannot read the plan at all. A room the
 * drawing's checks mark as broken, or whose outline cannot be closed, has no area.
 */
export function roomAreas(raw: unknown): RoomAreas | null {
  let plan: FloorPlan
  try {
    plan = parseFloorPlan(raw)
  } catch {
    return null
  }
  const out = new Map<string, number | null>()
  let index: ReturnType<typeof indexPlan>
  let broken: ReadonlySet<string>
  try {
    index = indexPlan(plan)
    broken = validatePlan(plan, index).broken
  } catch {
    for (const room of plan.rooms) out.set(`${room.floor ?? 'ground'}|${room.id}`, null)
    return out
  }
  for (const room of plan.rooms) {
    const key = `${room.floor ?? 'ground'}|${room.id}`
    if (broken.has(room.id)) {
      out.set(key, null)
      continue
    }
    try {
      out.set(key, Math.abs(roomArea(room, index)))
    } catch {
      out.set(key, null)
    }
  }
  return out
}

/** Every line Grid prints about a plan: issues, door swings and rules notes, as text. */
export function everythingSaid(run: GridRun): string[] {
  return [
    ...run.issues.map((i) => `${i.code} ${i.id} ${i.message}`),
    ...run.sweeps.map((i) => `${i.code} ${i.id} ${i.message}`),
    ...Object.values(run.reports).flatMap((r) => r.details),
  ]
}
