/**
 * The lab's plans, as the scoreboard stores them (`scoreboard/data/lab-plans.ndjson.gz`), read by
 * name for a test: `labPlan('F/scenarios/odd-house.json')`. The name is where the plan sat in the
 * lab, relative to the lab folder: a name, never a path on any machine.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parseFloorPlan, type FloorPlan } from '../types/floorplan'

const STORE = resolve(__dirname, '../../../../scoreboard/data/lab-plans.ndjson.gz')

let texts: Map<string, string> | null = null

/** The plan's text, as written. */
export function labPlanText(name: string): string {
  texts ??= new Map(
    gunzipSync(readFileSync(STORE))
      .toString('utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const { name: key, text } = JSON.parse(line) as { name: string; text: string }
        return [key, text] as const
      })
  )
  const text = texts.get(name)
  if (text === undefined) throw new Error(`no lab plan named ${name}`)
  return text
}

/** The plan, read by the schema. */
export function labPlan(name: string): FloorPlan {
  return parseFloorPlan(JSON.parse(labPlanText(name)))
}
