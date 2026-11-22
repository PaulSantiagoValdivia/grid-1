/**
 * VEW-1: how long a picture of a lab plan takes, as SVG and as PNG, through `drawFile`, the
 * function `grid draw` calls once the plan is read (the record's lines, the drawing, and for a
 * PNG the rasterising). The card asks for under a second each on a quiet machine.
 *
 * The time is printed, not held to a second: these tests run beside many others, on machines
 * that are often busy. The guard is ten times that, to catch a picture that has become far
 * slower, not a busy machine.
 *
 * By default it times the lab's eight buildings (`packages/floorplan/fixtures/`). With
 * `GRID_TIME_ALL=1` it times every plan the lab wrote (`scoreboard/data/lab-plans.ndjson.gz`)
 * that reads as a plan and has at most `GRID_TIME_MAX_ROOMS` rooms (600 when unset; the lab's
 * size tests go to 5,000), prints the slowest, and holds none to the guard: the figures in
 * `reviews/VEW-1.md` come from that.
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { drawFile } from '../../command/draw'

const repo = resolve(__dirname, '../../../../..')
const GUARD_MS = 10_000
const ALL = process.env.GRID_TIME_ALL === '1'
const MAX_ROOMS = Number(process.env.GRID_TIME_MAX_ROOMS ?? 600)

interface Named {
  readonly name: string
  readonly plan: FloorPlan
}

function readable(name: string, text: string): Named[] {
  try {
    const parsed = FloorPlanSchema.safeParse(JSON.parse(text))
    return parsed.success ? [{ name, plan: parsed.data }] : []
  } catch {
    return []
  }
}

function buildings(): Named[] {
  const dir = resolve(repo, 'packages/floorplan/fixtures')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => readable(name, readFileSync(resolve(dir, name), 'utf8')))
}

function labPlans(): { plans: Named[]; rows: number; larger: number } {
  const rows = gunzipSync(readFileSync(resolve(repo, 'scoreboard/data/lab-plans.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { name: string; text: string })
  const read = rows.flatMap((row) => readable(row.name, row.text))
  const plans = read.filter(({ plan }) => plan.rooms.length <= MAX_ROOMS)
  return { plans, rows: rows.length, larger: read.length - plans.length }
}

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

describe('a picture of a lab plan', () => {
  it(
    'is drawn as SVG and as PNG, each timed',
    async () => {
      const lab = ALL ? labPlans() : null
      const plans = lab ? lab.plans : buildings()
      expect(plans.length).toBeGreaterThanOrEqual(ALL ? 100 : 8)
      const times = { svg: [] as { name: string; ms: number }[], png: [] as { name: string; ms: number }[] }
      for (const { name, plan } of plans) {
        const loaded = { file: name, plan, issues: [], broken: new Set<string>() }
        for (const format of ['svg', 'png'] as const) {
          const start = performance.now()
          const { file } = await drawFile(loaded, { png: format === 'png' }, 1)
          const ms = performance.now() - start
          expect(typeof file === 'string' ? file.length : file.byteLength, `${name} as ${format}`).toBeGreaterThan(0)
          if (!ALL) expect(ms, `${name} as ${format}`).toBeLessThan(GUARD_MS)
          times[format].push({ name, ms })
        }
      }
      const rooms = new Map(plans.map(({ name, plan }) => [name, plan.rooms.length]))
      const line = (format: 'svg' | 'png') => {
        const ms = times[format].map((t) => t.ms)
        const slowest = [...times[format]].sort((a, b) => b.ms - a.ms).slice(0, 5)
        return [
          `${format.toUpperCase()}: median ${quantile(ms, 0.5).toFixed(0)} ms, 95th percentile ${quantile(ms, 0.95).toFixed(0)} ms, max ${Math.max(...ms).toFixed(0)} ms, ${ms.filter((v) => v >= 1000).length} of ${ms.length} at or over 1 s`,
          ...slowest.map((t) => `  ${t.ms.toFixed(0)} ms  ${t.name} (${rooms.get(t.name)} rooms)`)
        ].join('\n')
      }
      const scope = lab
        ? `${plans.length} lab plans (of ${lab.rows}; ${lab.larger} with more than ${MAX_ROOMS} rooms left out, the rest do not read as a plan)`
        : `the ${plans.length} buildings`
      console.log(`VEW-1 picture times over ${scope}:\n${line('svg')}\n${line('png')}`)
    },
    ALL ? 7_200_000 : 300_000
  )
})
