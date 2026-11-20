// Reads the scoreboard's stored data from scoreboard/data/. Nothing here calls Grid.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { Raw } from './gen'
import type { CapabilityId } from './capabilities'

/** scoreboard/data/, found from this file: src/ in the tests, dist/ once bundled. */
const DATA = new URL('../data/', import.meta.url)

const text = (name: string): string => {
  const bytes = readFileSync(new URL(name, DATA))
  return (name.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8')
}
const json = <T>(name: string): T => JSON.parse(text(name)) as T

export interface StoredPlan {
  /** Where the plan sat in the lab, relative to the lab folder: its name, not a path on disk. */
  readonly name: string
  /** The file as written; some are broken on purpose and are not valid JSON. */
  readonly text: string
}

const ndjson = (name: string): StoredPlan[] =>
  text(name)
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as StoredPlan)

/** 1,131 plans written by the lab's groups, as they were when the referee measured them. */
export const labPlans = (): StoredPlan[] => ndjson('lab-plans.ndjson.gz')
/** 2,300 generated plans of awkward shapes (L, T, U, Z, courtyards, turned, rows, tight rooms). */
export const generatedPlans = (): StoredPlan[] => ndjson('generated-plans.ndjson.gz')

export interface RefereeRoom {
  readonly area: number | null
  /** How the referee closed the room: exact, partial, not-enclosed or shared. */
  readonly status: string
}
export type RefereePlan = { readonly rooms: Readonly<Record<string, RefereeRoom>> } | { readonly error: string }

/** The referee's area for every room it measured, keyed "floor|room id", by plan name. */
export const referee = (): { readonly lab: Readonly<Record<string, RefereePlan>>; readonly generated: Readonly<Record<string, RefereePlan>> } =>
  json('referee.json.gz')

/** The lab bench's two example plans, the first two bases of the damage set. */
export const benchExamples = (): { readonly twoBedFlat: Raw; readonly minimal: Raw } => json('bench-examples.json')

/** One line per damaged plan of the lab's experiment 3: its fingerprint and the lab's outcome. */
export const labDamage = (): { readonly fingerprint: string; readonly outcome: string }[] =>
  text('damage-lab.tsv.gz')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [fingerprint, outcome] = line.split('\t') as [string, string]
      return { fingerprint, outcome }
    })

export interface Turn {
  readonly who: string
  readonly n: number
  readonly ask: string
  readonly lab: 'F' | 'S' | 'P' | 'N'
  readonly needs: readonly CapabilityId[]
}
export const turns = (): readonly Turn[] => json<{ turns: Turn[] }>('turns.json').turns

export interface Check {
  readonly n: number
  readonly check: string
  readonly lab: 'yes' | 'partly' | 'no'
  readonly needs: readonly CapabilityId[]
}
export const checks = (): readonly Check[] => json<{ checks: Check[] }>('checks.json').checks

export interface Mistake {
  readonly n: number
  readonly plan: string
  readonly mistake: string
  readonly ids: readonly string[]
}
export const mistakes = (): readonly Mistake[] => json<{ mistakes: Mistake[] }>('mistakes.json').mistakes
