// The five counts, and two guards that keep them honest. README.md beside this folder defines
// each one in words; this file is the definition in code.
import { FILE_UNITS } from '@ongrid/floorplan/types/units'
import { capabilityTable } from './capabilities'
import * as data from './data'
import { basePlans, damageSet, fingerprint, mentions, soundPlans, type Mutation } from './damage'
import { everythingSaid, roomAreas, runGrid, type GridRun } from './grid'

/** Two areas differ when they are more than this apart, in square metres. */
export const AREA_TOLERANCE = 0.01

export type CountId =
  | 'roomsMeasuredWrong'
  | 'damageSilent'
  | 'turnsAnswered'
  | 'mistakesNamed'
  | 'checksFed'
  | 'roomsNotMeasured'
  | 'soundPlansWithAlarm'

/** Which way is better, and whether the count is one of the five or a guard. */
export const COUNTS: Readonly<Record<CountId, { readonly title: string; readonly better: 'lower' | 'higher'; readonly guard: boolean }>> = {
  roomsMeasuredWrong: { title: 'Rooms measured wrong', better: 'lower', guard: false },
  damageSilent: { title: 'Damage that passes in silence', better: 'lower', guard: false },
  turnsAnswered: { title: 'Turns answered', better: 'higher', guard: false },
  mistakesNamed: { title: 'Design mistakes named', better: 'higher', guard: false },
  checksFed: { title: 'Checks the plan can feed', better: 'higher', guard: false },
  roomsNotMeasured: { title: 'Guard: rooms Grid does not measure', better: 'lower', guard: true },
  soundPlansWithAlarm: { title: 'Guard: sound plans with a warning', better: 'lower', guard: true },
}

export type Counts = Record<CountId, number>

export interface Detail {
  /** Per count: the parts it is made of and what it is out of. */
  readonly [id: string]: Readonly<Record<string, number | string>>
}

export interface Scoreboard {
  readonly counts: Counts
  readonly detail: Detail
  /** Plans in the data with no referee figure, and why. */
  readonly noRefereeFigure: readonly { readonly name: string; readonly why: string }[]
}

interface AreaTally {
  plans: number
  plansGridCannotRead: number
  compared: number
  wrong: number
  notMeasured: number
}

/** Grid's room areas against the expected ones: the referee's, or the construction's. */
function tallyAreas(t: AreaTally, raw: unknown, expected: ReadonlyMap<string, number | null>): void {
  t.plans++
  const got = roomAreas(raw)
  if (got === null) {
    t.plansGridCannotRead++
    return
  }
  // WRT-7: the referee measures a file in its own numbers; Grid reads one that states its unit
  // (`"units": "mm"`) in metres, so the referee's area is put in square metres to compare.
  const stated = typeof raw === 'object' && raw !== null ? (raw as { units?: unknown }).units : undefined
  const unit = typeof stated === 'string' ? FILE_UNITS[stated.trim().toLowerCase()] : undefined
  const k = unit === undefined ? 1 : unit.metres * unit.metres
  for (const [key, given] of expected) {
    if (given === null) continue
    const want = given * k
    const area = got.get(key)
    if (area === undefined || area === null) {
      t.notMeasured++
      continue
    }
    t.compared++
    if (Math.abs(area - want) > AREA_TOLERANCE) t.wrong++
  }
}

const newTally = (): AreaTally => ({ plans: 0, plansGridCannotRead: 0, compared: 0, wrong: 0, notMeasured: 0 })

/** How the lab's cluster L sorted what Grid did with one damaged plan. */
export type DamageOutcome =
  | 'threw'
  | 'refused: schema names the place'
  | 'refused: schema names another place'
  | 'caught: names the damaged part'
  | 'caught vaguely: names something else'
  | 'no effect at all'
  | 'silent: result changed, nothing said'

const lineKey = (i: { code: string; id: string; message: string }): string => `${i.code}|${i.id}|${i.message}`

export function damageOutcome(before: GridRun, after: GridRun, mutation: Mutation): DamageOutcome {
  if (after.thrown.length > 0) return 'threw'
  if (!after.parseOk) {
    const exact = after.parseProblems.some((p) => p === mutation.path || mutation.path.startsWith(`${p}.`) || p.startsWith(mutation.path))
    return exact ? 'refused: schema names the place' : 'refused: schema names another place'
  }
  const hadIssues = new Set(before.issues.map(lineKey))
  const hadSweeps = new Set(before.sweeps.map(lineKey))
  const said = [
    ...after.issues.filter((i) => !hadIssues.has(lineKey(i))),
    ...after.sweeps.filter((i) => !hadSweeps.has(lineKey(i))),
  ].map((i) => `${i.id} ${i.message}`)
  let newNotes = 0
  for (const [key, report] of Object.entries(after.reports)) {
    const had = before.reports[key]
    const notes = new Set(had?.notes ?? [])
    const notChecked = new Set(had?.notChecked ?? [])
    newNotes += report.notes.filter((n) => !notes.has(n)).length + report.notChecked.filter((n) => !notChecked.has(n)).length
  }
  if (said.some((text) => mentions(text, mutation.target))) return 'caught: names the damaged part'
  if (said.length > 0 || newNotes > 0) return 'caught vaguely: names something else'
  const changed = Object.keys({ ...before.signature, ...after.signature }).some((k) => before.signature[k] !== after.signature[k])
  return changed ? 'silent: result changed, nothing said' : 'no effect at all'
}

export interface RunOptions {
  /** Only every n-th damaged plan and generated plan, for a quicker run. 1 runs everything. */
  readonly every?: number
  readonly log?: (line: string) => void
}

export function runScoreboard(options: RunOptions = {}): Scoreboard {
  const every = options.every ?? 1
  const log = options.log ?? (() => undefined)
  const detail: Record<string, Record<string, number | string>> = {}
  const noRefereeFigure: { name: string; why: string }[] = []
  const ref = data.referee()

  // 1. Rooms measured wrong.
  let start = performance.now()
  const areas = { lab: newTally(), generated: newTally(), sound: newTally() }
  const refereeSets = [
    ['lab', data.labPlans(), ref.lab],
    ['generated', data.generatedPlans().filter((_, i) => i % every === 0), ref.generated],
  ] as const
  for (const [set, plans, figures] of refereeSets) {
    for (const plan of plans) {
      const figure = figures[plan.name]
      if (figure === undefined || 'error' in figure) {
        noRefereeFigure.push({ name: plan.name, why: figure === undefined ? 'not measured by the referee' : figure.error })
        continue
      }
      const expected = new Map(Object.entries(figure.rooms).map(([key, room]) => [key, room.area]))
      tallyAreas(areas[set], plan.text, expected)
    }
  }
  const examples = data.benchExamples()
  const bases = basePlans(examples.twoBedFlat, examples.minimal)
  const sound = soundPlans(bases)
  for (const plan of sound) if (plan.truth) tallyAreas(areas.sound, plan.plan, plan.truth)
  for (const [set, t] of Object.entries(areas)) {
    detail[`areas:${set}`] = { ...t }
  }
  log(`areas: ${((performance.now() - start) / 1000).toFixed(1)} s`)

  // 2. Damage that passes in silence, and the guard on sound plans.
  start = performance.now()
  const labRows = data.labDamage()
  const baseRuns = new Map(bases.map((b) => [b.name, runGrid(b.plan)]))
  const outcomes: Record<string, number> = {}
  const labOutcomes: Record<string, number> = {}
  let rebuilt = 0
  let differFromLab = 0
  for (const damaged of damageSet(bases)) {
    const lab = labRows[rebuilt]
    const print = fingerprint({ n: damaged.n, base: damaged.base.name, mutation: damaged.mutation })
    if (lab?.fingerprint !== print) throw new Error(`The damage set no longer rebuilds the lab's plan ${rebuilt}: ${print}`)
    rebuilt++
    if (damaged.n % every !== 0) continue
    const outcome = damageOutcome(baseRuns.get(damaged.base.name)!, runGrid(damaged.plan), damaged.mutation)
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
    labOutcomes[lab.outcome] = (labOutcomes[lab.outcome] ?? 0) + 1
    if (outcome !== lab.outcome) differFromLab++
  }
  if (rebuilt !== labRows.length) throw new Error(`The damage set rebuilt ${rebuilt} plans; the lab stored ${labRows.length}`)
  detail.damage = { plans: Object.values(outcomes).reduce((a, b) => a + b, 0), ...outcomes }
  detail['damage:lab'] = { ...labOutcomes, plansWhoseOutcomeDiffersNow: differFromLab }
  let alarmed = 0
  let alarms = 0
  for (const plan of sound) {
    const run = runGrid(plan.plan, { exports: false })
    const lines = [...run.issues, ...run.sweeps].length + (run.parseOk ? 0 : 1)
    if (lines > 0) alarmed++
    alarms += lines
  }
  detail.sound = { plans: sound.length, plansWithAWarning: alarmed, warnings: alarms }
  log(`damage and sound plans: ${((performance.now() - start) / 1000).toFixed(1)} s`)

  // 3 and 5. Turns answered and checks the plan can feed.
  const table = capabilityTable(examples.twoBedFlat)
  const ready = (needs: readonly string[]): boolean => needs.every((id) => table.get(id as never) === true)
  const allTurns = data.turns()
  const answered = allTurns.filter((t) => ready(t.needs))
  detail.turns = { turns: allTurns.length, answered: answered.length, labAnsweredFully: allTurns.filter((t) => t.lab === 'F').length }
  const allChecks = data.checks()
  const fed = allChecks.filter((c) => ready(c.needs))
  detail.checks = { checks: allChecks.length, fed: fed.length, labYes: allChecks.filter((c) => c.lab === 'yes').length }
  detail.capabilities = Object.fromEntries([...table].map(([id, ok]) => [id, ok ? 'yes' : 'no']))

  // 4. Design mistakes named.
  const labByName = new Map(data.labPlans().map((p) => [p.name, p]))
  let named = 0
  const each: Record<string, string> = {}
  for (const m of data.mistakes()) {
    const plan = labByName.get(m.plan)
    if (!plan) throw new Error(`Mistake ${m.n}: the plan ${m.plan} is not in the data`)
    const run = runGrid(plan.text, { exports: false })
    const ids = new Set([...run.issues, ...run.sweeps].map((i) => i.id).concat(run.findingIds))
    const said = everythingSaid(run)
    const hit = m.ids.some((id) => ids.has(id) || said.some((text) => mentions(text, id)))
    if (hit) named++
    each[`mistake ${m.n}`] = hit ? 'named' : 'not named'
  }
  detail.mistakes = { mistakes: data.mistakes().length, named, ...each }

  const counts: Counts = {
    roomsMeasuredWrong: areas.lab.wrong + areas.generated.wrong + areas.sound.wrong,
    damageSilent: outcomes['silent: result changed, nothing said'] ?? 0,
    turnsAnswered: answered.length,
    mistakesNamed: named,
    checksFed: fed.length,
    roomsNotMeasured: areas.lab.notMeasured + areas.generated.notMeasured + areas.sound.notMeasured,
    soundPlansWithAlarm: alarmed,
  }
  return { counts, detail, noRefereeFigure }
}

export interface Change {
  readonly id: CountId
  readonly stored: number
  readonly now: number
  readonly verdict: 'worse' | 'better' | 'same'
}

/** Each count against the stored one. A count missing from the stored figures is "worse". */
export function compareCounts(stored: Partial<Counts>, now: Counts): Change[] {
  return (Object.keys(COUNTS) as CountId[]).map((id) => {
    const was = stored[id]
    const is = now[id]
    if (typeof was !== 'number') return { id, stored: Number.NaN, now: is, verdict: 'worse' as const }
    const better = COUNTS[id].better === 'lower' ? is < was : is > was
    const worse = COUNTS[id].better === 'lower' ? is > was : is < was
    return { id, stored: was, now: is, verdict: worse ? 'worse' : better ? 'better' : 'same' }
  })
}
