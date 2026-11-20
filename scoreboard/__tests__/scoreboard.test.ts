import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAPABILITIES } from '../src/capabilities'
import { compareCounts, COUNTS, type Counts } from '../src/counts'
import { basePlans, damageSet, fingerprint, soundPlans } from '../src/damage'
import * as data from '../src/data'

const HERE = fileURLToPath(new URL('..', import.meta.url))
const stored = (name: string): { counts: Counts } => JSON.parse(readFileSync(join(HERE, name), 'utf8')) as { counts: Counts }
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

describe('the stored data', () => {
  it('stays under 25 MB', () => {
    const bytes = readdirSync(join(HERE, 'data')).reduce((sum, name) => sum + statSync(join(HERE, 'data', name)).size, 0)
    expect(bytes).toBeLessThan(25 * 1024 * 1024)
  })

  it('rebuilds the 42 sound bases exactly as the lab built them', () => {
    const examples = data.benchExamples()
    const bases = basePlans(examples.twoBedFlat, examples.minimal)
    expect(bases).toHaveLength(42)
    // The SHA-256 of the lab's own stored bases (cluster L, experiment 3).
    expect(sha256(JSON.stringify(bases))).toBe('aeb70df9851f27ec97dce7d6fa136743aff024719d76709380fd2193f6d5ba93')
  })

  it("rebuilds every one of the 3,000 damaged plans from the seed, the lab's change for the lab's change", () => {
    const examples = data.benchExamples()
    const rebuilt = [...damageSet(basePlans(examples.twoBedFlat, examples.minimal))].map((d) =>
      fingerprint({ n: d.n, base: d.base.name, mutation: d.mutation }),
    )
    expect(rebuilt).toEqual(data.labDamage().map((row) => row.fingerprint))
  })

  it('has the 442 sound plans, 400 of them with their true room areas', () => {
    const examples = data.benchExamples()
    const sound = soundPlans(basePlans(examples.twoBedFlat, examples.minimal))
    expect(sound).toHaveLength(442)
    expect(sound.filter((p) => p.truth)).toHaveLength(400)
  })

  it("has the lab's 67 turns, 42 checks and 9 mistakes, with the lab's own totals", () => {
    const tally = <T extends string>(list: readonly { lab: T }[]): Record<string, number> =>
      list.reduce<Record<string, number>>((t, x) => ({ ...t, [x.lab]: (t[x.lab] ?? 0) + 1 }), {})
    expect(tally(data.turns())).toEqual({ F: 15, S: 29, P: 3, N: 20 })
    expect(tally(data.checks())).toEqual({ yes: 5, partly: 20, no: 17 })
    expect(data.mistakes()).toHaveLength(9)
    const names = new Set(data.labPlans().map((p) => p.name))
    for (const m of data.mistakes()) expect(names, m.plan).toContain(m.plan)
  })

  it('names only capabilities that exist', () => {
    const known = new Set(Object.keys(CAPABILITIES))
    for (const need of [...data.turns(), ...data.checks()].flatMap((x) => x.needs)) expect(known, need).toContain(need)
  })

  it('stores every count, for the baseline and for now', () => {
    for (const file of ['baseline.json', 'current.json']) {
      expect(Object.keys(stored(file).counts).sort()).toEqual(Object.keys(COUNTS).sort())
    }
  })
})

describe('comparing with the stored figures', () => {
  const now = stored('current.json').counts

  it('calls a count worse when it moves the wrong way, and only then', () => {
    expect(compareCounts(now, now).every((c) => c.verdict === 'same')).toBe(true)
    const changes = compareCounts(now, { ...now, roomsMeasuredWrong: now.roomsMeasuredWrong + 1, turnsAnswered: now.turnsAnswered + 1 })
    expect(changes.find((c) => c.id === 'roomsMeasuredWrong')?.verdict).toBe('worse')
    expect(changes.find((c) => c.id === 'turnsAnswered')?.verdict).toBe('better')
    expect(compareCounts(now, { ...now, checksFed: now.checksFed - 1 }).find((c) => c.id === 'checksFed')?.verdict).toBe('worse')
  })

  it('calls a count that was never stored worse', () => {
    const rest: Partial<Counts> = { ...now }
    delete rest.damageSilent
    expect(compareCounts(rest, now).find((c) => c.id === 'damageSilent')?.verdict).toBe('worse')
  })
})

// The whole run, as CI runs it: the bundled runner, as a child process.
describe('npm run scoreboard', () => {
  let folder: string
  const bundle = join(HERE, 'dist', 'scoreboard.mjs')
  beforeAll(() => {
    execFileSync(process.execPath, [join(HERE, 'build.mjs')])
    folder = mkdtempSync(join(tmpdir(), 'grid-scoreboard-'))
  })
  afterAll(() => rmSync(folder, { recursive: true, force: true }))

  const run = (against: Counts): { status: number | null; stdout: string } => {
    const file = join(folder, 'stored.json')
    writeFileSync(file, JSON.stringify({ what: 'test', counts: against }))
    const result = spawnSync(process.execPath, [bundle, '--against', file], { encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout }
  }

  it('passes on the stored figures and fails when one count is worse than stored', () => {
    const now = stored('current.json').counts
    const same = run(now)
    expect(same.stdout).toContain('Same as the stored figures.')
    expect(same.status).toBe(0)

    // Stored figures one room better than today's Grid: today's run is one room worse.
    const worse = run({ ...now, roomsMeasuredWrong: now.roomsMeasuredWrong - 1 })
    expect(worse.stdout).toMatch(/Rooms measured wrong\s+\d+\s+\d+\s+\d+\s+WORSE/)
    expect(worse.status).toBe(1)

    const fewerTurns = run({ ...now, turnsAnswered: now.turnsAnswered + 1 })
    expect(fewerTurns.status).toBe(1)
  }, 120_000)
})
