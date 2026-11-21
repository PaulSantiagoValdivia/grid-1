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
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { indexPlan, planSpaces, roomArea, roomOverlaps, spacesKnown, validatePlan } from '@ongrid/floorplan/geometry'

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

// ARE-4. The sound plans are the scoreboard's rectangular control plans: the 42 bases and the
// 400 seeded buildings of rectangles (lab entry W-4), on one or two floors, their walls drawn
// whole or in pieces.
describe('the spaces the walls enclose, on every sound plan', () => {
  const examples = data.benchExamples()
  const sound = soundPlans(basePlans(examples.twoBedFlat, examples.minimal))

  it('balance floor by floor: net room area + wall area + unclaimed floor = the outline, within 1e-6 m²', () => {
    let floors = 0
    const off: string[] = []
    for (const { name, plan: raw } of sound) {
      const plan = parseFloorPlan(raw)
      const index = indexPlan(plan)
      for (const result of planSpaces(plan, { index, broken: validatePlan(plan, index, { spaces: false }).broken })) {
        if (!spacesKnown(result)) {
          off.push(`${name} ${result.floor}: ${result.reason}`)
          continue
        }
        floors++
        const gap = result.roomArea + result.wallArea + result.unclaimedArea - result.outlineArea
        if (Math.abs(gap) > 1e-6) off.push(`${name} ${result.floor}: ${gap}`)
        if (result.unclaimed.length > 0 || result.mismatches.length > 0) off.push(`${name} ${result.floor}: reports something`)
      }
    }
    expect(off).toEqual([])
    expect(floors).toBeGreaterThan(sound.length)
  }, 60_000)
})

// ARE-5. The lab's own plans for AR-3 (a room inside a room) and AR-4 (rooms that overlap), as
// stored in data/lab-plans.ndjson.gz, and the referee's figures for them.
describe("the lab's rooms inside rooms and rooms that overlap", () => {
  const plans = new Map(data.labPlans().map((p) => [p.name, p.text]))
  const referee = data.referee().lab
  const read = (name: string) => parseFloorPlan(JSON.parse(plans.get(name)!))
  const marked = (name: string, inner: RegExp) => {
    const plan = read(name)
    return { ...plan, rooms: plan.rooms.map((r) => (inner.test(r.id) ? { ...r, inside: true } : r)) }
  }
  const total = (plan: ReturnType<typeof read>): number => {
    const index = indexPlan(plan)
    return plan.rooms.reduce((sum, room) => sum + roomArea(room, index), 0)
  }
  const refereeTotal = (name: string): number => {
    const entry = referee[name]!
    if ('error' in entry) throw new Error(entry.error)
    return Object.values(entry.rooms).reduce((sum, r) => sum + (r.area ?? 0), 0)
  }
  const refereeArea = (name: string, key: string): number => {
    const entry = referee[name]!
    if ('error' in entry) throw new Error(entry.error)
    return entry.rooms[key]!.area!
  }
  const overlaps = (plan: ReturnType<typeof read>) =>
    validatePlan(plan).issues.filter((i) => i.code === 'room/overlap').map((i) => [i.id, i.message])

  it('AR-3: the student floor, with its en-suite pods marked inside, is no longer 65.0 m² too large', () => {
    const name = 'AU1/scenarios/AR-3/d3-student-inside.json'
    expect(total(read(name)) - refereeTotal(name)).toBeCloseTo(65.0, 1)
    const plan = marked(name, /-pod$/)
    expect(Math.abs(total(plan) - refereeTotal(name))).toBeLessThan(0.01)
    const index = indexPlan(plan)
    for (const room of plan.rooms) {
      expect(Math.abs(roomArea(room, index) - refereeArea(name, `ground|${room.id}`)), room.id).toBeLessThan(0.01)
    }
    expect(validatePlan(plan).issues).toEqual([])
    // Unmarked, each of the 20 pods is reported, on its bedroom.
    expect(overlaps(read(name))).toHaveLength(20)
  })

  it('AR-3: the bedroom with a wardrobe pod is no longer 19.7% too large, nor the hall with a lift 18.2%', () => {
    const name = 'AU1/scenarios/AR-3/s09-room-in-room.json'
    const plan = marked(name, /^(ward|lift)$/)
    const index = indexPlan(plan)
    const area = (id: string): number => roomArea(plan.rooms.find((r) => r.id === id)!, index)
    expect(area('bed')).toBeCloseTo(refereeArea(name, 'ground|bed'), 6)
    expect(area('bed')).toBeCloseTo(22.38, 6)
    expect(area('hall')).toBeCloseTo(17.85, 6)
    expect(Math.abs(total(plan) - refereeTotal(name))).toBeLessThan(0.01)
    expect(validatePlan(plan).issues).toEqual([])
  })

  it('AR-4: the flat with a den over three rooms (+21.12 m²) names the den, each room and the floor they share', () => {
    const found = overlaps(read('AU1/scenarios/AR-4/f14-rooms-overlap.json'))
    expect(found.map(([id]) => id)).toEqual(['den', 'den', 'den'])
    const said = found.map(([, message]) => message).join('\n')
    expect(said).toMatch(/Rooms hall \(5\.33 m²\) and den \(21\.12 m²\) overlap: 2\.08 m² of floor/)
    expect(said).toMatch(/Room bed1 \(13\.64 m²\) lies wholly inside room den \(21\.12 m²\)/)
    expect(said).toMatch(/Room bath \(4\.80 m²\) lies wholly inside room den \(21\.12 m²\)/)
  })

  it('AR-4: the villa with one wrong wall (+21.45 m²) names the master bedroom and the en-suite', () => {
    const found = overlaps(read('AU1/scenarios/AR-4/villa-wrong-wall.json'))
    expect(found.map(([id]) => id)).toEqual(['master'])
    expect(found[0]![1]).toMatch(/^Room ensuite \(20\.74 m²\) lies wholly inside room master \(55\.59 m²\)/)
  })

  it('AR-4: the villa with a room listed twice (+34.14 m²) names both copies and the 34.14 m²', () => {
    const found = overlaps(read('AU1/scenarios/AR-4/villa-duplicate-room.json'))
    expect(found).toEqual([['master-dup', expect.stringMatching(/^Rooms master and master-dup cover the same 34\.14 m² of floor and list the same walls/)]])
  })

  it('AR-4: the hotel room that kept its neighbour\'s wall names its own bathroom and the room next door', () => {
    // The lab read 28.83 m² against 20.61; since ARE-1 Grid measures 28.67 against 20.37.
    const found = overlaps(read('AU1/scenarios/AR-4/hotel-mistakes.json'))
    expect(found.map(([id]) => id)).toEqual(['room-309', 'room-309'])
    const said = found.map(([, message]) => message).join('\n')
    expect(said).toMatch(/Rooms room-308 \(20\.37 m²\) and room-309 \(28\.67 m²\) overlap: 3\.32 m² of floor/)
    expect(said).toMatch(/Room bath-309 \(4\.22 m²\) lies wholly inside room room-309 \(28\.67 m²\)/)
  })
})

describe('rooms that meet face to face, on every sound plan', () => {
  it('never overlap: 0 findings on the 442 sound plans', () => {
    const examples = data.benchExamples()
    const sound = soundPlans(basePlans(examples.twoBedFlat, examples.minimal))
    expect(sound).toHaveLength(442)
    const found: string[] = []
    for (const { name, plan: raw } of sound) {
      const result = roomOverlaps(parseFloorPlan(raw))
      for (const o of [...result.overlaps, ...result.uncompared]) found.push(`${name}: ${o.rooms.join(' and ')}`)
    }
    expect(found).toEqual([])
  }, 60_000)
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
