// The one file of the scoreboard that calls Grid. Everything here is Grid's own library, used the
// way the lab's harnesses used it, so the figures can be set against the lab's. It uses functions
// that exist both today and at the reference commit (76caeb8), so the same runner measures both,
// with one exception: since MSG-6 a plan is read part by part (`readPlanParts`), as Grid's own
// commands and front door read it. At the reference commit, read it with `parseFloorPlan`.
import { createHash } from 'node:crypto'
import { type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { readPlanText } from '@ongrid/floorplan/types/jsonText'
import { readPlanParts, type ReadFault } from '@ongrid/floorplan/types/readParts'
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
/**
 * For the calls that only read which rooms are broken. Since ARE-4 `validatePlan` also works out
 * the spaces the walls enclose, which adds warnings and never changes `broken`; this leaves that
 * out where nothing reads it. The reference commit ignores the argument.
 */
const BROKEN_ONLY = { spaces: false } as const

export interface Line {
  readonly code: string
  readonly id: string
  readonly message: string
}

/** Everything Grid says and produces for one plan file (as JSON, or its text). Never throws. */
export interface GridRun {
  readonly parseOk: boolean
  /** Where the schema refused the file, as dotted paths ("walls.3.thickness"). */
  readonly parseProblems: readonly string[]
  readonly issues: readonly Line[]
  readonly sweeps: readonly Line[]
  /** Per country asked ("US" and "ES", COD-3): the note titles and the "not checked" lines. */
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

/** What the reader did with a part or value it could not read as written (MSG-6), as a line. */
function faultLine(fault: ReadFault): Line {
  const at = `${fault.part === null ? '' : `${fault.part.list}[${fault.part.index}]`}`
  if (fault.kind === 'id-clash') return { code: 'plan/id-clash', id: fault.part.id, message: `${at}.id is the id of ${fault.kept.list}[${fault.kept.index}] ${fault.kept.id} too` }
  return { code: `plan/${fault.kind}`, id: fault.part?.id ?? '', message: `${fault.path.join('.')} is ${fault.found}; the format takes ${fault.wants}` }
}

/**
 * A plan read part by part, or why it was refused, as dotted paths ("walls.3.thickness"). A plan
 * given as text is read as Grid reads a file: NaN and a decimal comma named, a merge refused.
 */
function read(raw: unknown): { plan: FloorPlan; faults: readonly ReadFault[]; leftOutWalls: ReadonlySet<string> } | { problems: string[] } {
  let value = raw
  let marks: Parameters<typeof readPlanParts>[1] = []
  if (typeof raw === 'string') {
    const text = readPlanText(raw)
    if (!text.ok) return { problems: [''] }
    value = text.value
    marks = text.marks
  }
  const result = readPlanParts(value, marks)
  if (result.plan !== null) return result
  return { problems: result.refusal.kind === 'schema' ? result.refusal.issues.map((i) => i.path.join('.')) : [''] }
}

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
  let found: ReturnType<typeof read>
  try {
    found = read(raw)
  } catch (error) {
    run.thrown.push(`parse: ${message(error)}`)
    run.signature = { parse: `false${message(error)}` }
    return run
  }
  if (!('plan' in found)) {
    run.parseProblems = found.problems
    run.signature = { parse: `false${found.problems.join(',')}` }
    return run
  }
  const { plan, faults, leftOutWalls } = found
  run.parseOk = true
  const floors = stage('floors', () => planFloors(plan)) ?? []
  stage('validate', () => {
    run.issues = [...faults.map(faultLine), ...lines(validatePlan(plan, undefined, { leftOutWalls }).issues)]
  })
  stage('sweeps', () => {
    run.sweeps = lines(validateDoorSweeps(plan, (o) => ({ hinge: o.hinge, swing: o.swing })))
  })
  const areas: string[] = []
  stage('areas', () => {
    for (const floor of floors) {
      const slice = planForFloor(plan, floor.id)
      const index = indexPlan(slice)
      const broken = validatePlan(slice, index, { ...BROKEN_ONLY, leftOutWalls }).broken
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
  // COD-3: with no place stated no figure applies, so the place is stated: the US, whose figures
  // the scoreboard measures, and Spain, for which Grid carries none.
  for (const country of ['US', 'ES'] as const) {
    const key = country
    stage(`report-${key}`, () => {
      const report = checkLocalRules(plan, { country })
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
  let found: ReturnType<typeof read>
  try {
    found = read(raw)
  } catch {
    return null
  }
  if (!('plan' in found)) return null
  const { plan, leftOutWalls } = found
  const out = new Map<string, number | null>()
  let index: ReturnType<typeof indexPlan>
  let broken: ReadonlySet<string>
  try {
    index = indexPlan(plan)
    broken = validatePlan(plan, index, { ...BROKEN_ONLY, leftOutWalls }).broken
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
