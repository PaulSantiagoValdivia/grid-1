/**
 * Parking bays and ramps (CNT-19, C29; lab EL-11): where each bay lies, how many each floor holds
 * and by which numbers, and each ramp's two levels, its run and its slope, worked out once for
 * every view, measure and check that reads them.
 *
 * A bay is a thing of its own: never a room (it closes no outline and takes nothing off a room's
 * area) and never a wall. A ramp is a way for vehicles between two floors, stated once across them
 * as a stair is (LVL-3): the two levels it joins are its floors' levels in metres (LVL-1,
 * `floorElevations`), its length runs along its middle line, and its slope is the rise over that
 * length, in percent. A slope the plan states is kept beside the worked one and never replaces it.
 * Whether a car can turn into a bay or up a ramp is a swept-path check: these make one possible,
 * and nothing here makes it.
 *
 * Pure: a plan in, shapes, counts, figures and issues out. Never throws on a plan the schema reads.
 */

import type { Bay, Ramp } from '../types/floorplan'
import type { FloorPlan } from './plan'
import { floorOf, planFloors, wholePlan } from './floors'
import { floorElevations } from './elevations'
import { intersectionArea, ringOf } from './polygons'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { add, distance, fromTuple, normalize, perp, scale, sub } from './vec2'
import { areaText, fixedText, metresText } from './rounding'
import { english, name, num, said, type Said } from '../messages/say'
import { withSaid } from './issueWords'
import { likelyId } from '../types/nearest'
import type { Issue } from './validate'

export type { Bay, Ramp } from '../types/floorplan'

// ── Bays ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The floor a bay covers, counter-clockwise: its width across its own x and its length along its
 * own y, turned `turn` degrees counter-clockwise about its middle.
 */
export function bayFootprint(bay: Pick<Bay, 'at' | 'width' | 'length' | 'turn'>): Vec2[] {
  const [x, y] = bay.at
  const turn = ((bay.turn ?? 0) * Math.PI) / 180
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const w = bay.width / 2
  const l = bay.length / 2
  const corner = (u: number, v: number): Vec2 => ({ x: x + c * u - s * v, y: y + s * u + c * v })
  return [corner(-w, -l), corner(w, -l), corner(w, l), corner(-w, l)]
}

/** A bay whose numbers Grid can build: every one finite and within `largest`. */
export function soundBay(bay: Bay): boolean {
  const numbers = [bay.at[0], bay.at[1], bay.width, bay.length, bay.turn ?? 0]
  return numbers.every((value) => Number.isFinite(value) && Math.abs(value) <= tolerance('largest'))
}

/** A bay named in a sentence: by its number when it states one, else by its id. */
export function baySaid(bay: Pick<Bay, 'id' | 'number'>): Said {
  return bay.number === undefined
    ? said('issue.part.bay', { id: name(bay.id) })
    : said('issue.part.bay.numbered', { id: name(bay.id), number: name(bay.number) })
}

type BayFault = 'too-large' | 'duplicate-id' | 'unknown-floor'

/** The ids of every part a bay's or a ramp's id may not share. */
function otherIds(plan: FloorPlan): Set<string> {
  return new Set<string>([
    ...plan.walls.map((w) => w.id),
    ...plan.rooms.map((r) => r.id),
    ...plan.openings.map((o) => o.id),
    ...(plan.items ?? []).map((i) => i.id),
    ...(plan.columns ?? []).map((c) => c.id),
    ...(plan.stairs ?? []).map((s) => s.id),
  ])
}

function bayFaults(plan: FloorPlan): Map<Bay, BayFault> {
  const bays = plan.bays ?? []
  const faults = new Map<Bay, BayFault>()
  if (bays.length === 0) return faults
  const others = otherIds(plan)
  for (const ramp of plan.ramps ?? []) others.add(ramp.id)
  const counts = new Map<string, number>()
  for (const bay of bays) counts.set(bay.id, (counts.get(bay.id) ?? 0) + 1)
  const floorIds = new Set(planFloors(plan).map((floor) => floor.id))
  for (const bay of bays) {
    if (!soundBay(bay)) faults.set(bay, 'too-large')
    else if ((counts.get(bay.id) ?? 0) > 1 || others.has(bay.id)) faults.set(bay, 'duplicate-id')
    else if (!floorIds.has(floorOf(bay))) faults.set(bay, 'unknown-floor')
  }
  return faults
}

/** The bays the drawing's checks leave out of every view, count and export (`parkingIssues`). */
export function leftOutBays(plan: FloorPlan): ReadonlySet<Bay> {
  return new Set(bayFaults(plan).keys())
}

/** The bays that are drawn, counted and exported: every one the checks do not leave out. */
export function soundBays(plan: FloorPlan): Bay[] {
  const out = leftOutBays(plan)
  return (plan.bays ?? []).filter((bay) => !out.has(bay))
}

/** The bays drawn and counted on a floor, in the plan's order. */
export function baysOnFloor(plan: FloorPlan, floorId: string): Bay[] {
  return soundBays(plan).filter((bay) => floorOf(bay) === floorId)
}

/** One floor's bays, counted. */
export interface FloorBays {
  readonly floor: string
  /** Every bay drawn on the floor, numbered or not. */
  readonly count: number
  /** The numbers its bays state, each once, in number order (2 before 10). */
  readonly numbers: readonly string[]
  /** How many of its bays state no number. */
  readonly unnumbered: number
}

const byNumber = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Each floor's bays counted, in the floors' order, only floors that hold a bay. Empty for a plan with none. */
export function planBayCounts(plan: FloorPlan): FloorBays[] {
  const bays = soundBays(plan)
  if (bays.length === 0) return []
  const out: FloorBays[] = []
  for (const floor of planFloors(plan)) {
    const here = bays.filter((bay) => floorOf(bay) === floor.id)
    if (here.length === 0) continue
    const numbers = [...new Set(here.flatMap((bay) => (bay.number === undefined ? [] : [bay.number])))].sort(byNumber.compare)
    out.push({ floor: floor.id, count: here.length, numbers, unnumbered: here.filter((bay) => bay.number === undefined).length })
  }
  return out
}

// ── Ramps ────────────────────────────────────────────────────────────────────────────────────

/** Where a ramp starts or ends: the floor, the end of its middle line there, and its level. */
export interface RampEnd {
  readonly floor: string
  readonly at: Vec2
  /** The floor's level, in metres from the ground floor's (LVL-1). */
  readonly level: number
}

export interface RampLayout {
  readonly id: string
  /** Its name, else its id. */
  readonly name: string
  /** As stated: the floor its middle line starts on, and the one it ends on. */
  readonly from: string
  readonly to: string
  /** The lower and the upper end, whichever of `from` and `to` each is. */
  readonly lower: RampEnd
  readonly upper: RampEnd
  readonly width: number
  /** Its middle line, from the lower end to the upper end. */
  readonly line: readonly Vec2[]
  /** Its length along its middle line, on plan, in metres. */
  readonly length: number
  /** How far it climbs, in metres: the upper level less the lower. */
  readonly rise: number
  /** Its slope worked out from the levels and the run: metres of rise per 100 metres along it. */
  readonly slope: number
  /** The same slope as "1 in n": metres along it per metre of rise. */
  readonly oneIn: number
  /** The slope the plan states, in percent; null when it states none. */
  readonly statedSlope: number | null
  /** On plan: a band as wide as the ramp along each stretch of its line, then a square at each turn, counter-clockwise. */
  readonly pieces: readonly (readonly Vec2[])[]
}

type RampFault = 'too-large' | 'duplicate-id' | 'unknown-floor' | 'same-floor' | 'no-rise' | 'no-run'

/** A rectangle along `from`→`to`, `half` either side, counter-clockwise. */
function band(from: Vec2, to: Vec2, half: number): Vec2[] {
  const side = scale(perp(normalize(sub(to, from))), half)
  return [sub(from, side), sub(to, side), add(to, side), add(from, side)]
}

/** A square of side `2·half` centred on `at`, its sides along `dir`, counter-clockwise. */
function square(at: Vec2, dir: Vec2, half: number): Vec2[] {
  const along = scale(dir, half)
  return band(sub(at, along), add(at, along), half)
}

/** A ramp named in a sentence: by its name when it states one, else by its id. */
export function rampSaid(ramp: Pick<Ramp, 'id' | 'name'>): Said {
  return ramp.name === undefined || ramp.name.trim() === ''
    ? said('issue.part.ramp', { id: name(ramp.id) })
    : said('issue.part.ramp.named', { id: name(ramp.id), name: name(ramp.name) })
}

function soundRamp(ramp: Ramp): boolean {
  const numbers = [ramp.width, ramp.slope ?? 1, ...ramp.run.flat()]
  return numbers.every((value) => Number.isFinite(value) && Math.abs(value) <= tolerance('largest'))
}

/** The plan's ramps laid out, and why each one that could not be is left out. */
export interface PlanRamps {
  /** Every ramp that could be laid out, in the plan's order. */
  readonly ramps: readonly RampLayout[]
  readonly faults: ReadonlyMap<Ramp, RampFault>
}

const NO_RAMPS: PlanRamps = { ramps: [], faults: new Map() }
const laidOut = new WeakMap<FloorPlan, PlanRamps>()

/**
 * The plan's ramps, each laid out from the whole plan (a floor's slice keeps every ramp and reads
 * the levels of the plan it was cut from), or left out with its fault.
 */
export function planRamps(plan: FloorPlan): PlanRamps {
  const { whole } = wholePlan(plan)
  const ramps = whole.ramps ?? []
  if (ramps.length === 0) return NO_RAMPS
  const found = laidOut.get(whole)
  if (found !== undefined) return found
  const faults = new Map<Ramp, RampFault>()
  const out: RampLayout[] = []
  const others = otherIds(whole)
  for (const bay of whole.bays ?? []) others.add(bay.id)
  const counts = new Map<string, number>()
  for (const ramp of ramps) counts.set(ramp.id, (counts.get(ramp.id) ?? 0) + 1)
  const floorIds = new Set(planFloors(whole).map((floor) => floor.id))
  let levels: ReadonlyMap<string, { readonly floorLevel: number }> = new Map()
  try {
    levels = floorElevations(whole).floors
  } catch {
    // Levels that cannot be worked out leave every ramp with no rise.
  }
  for (const ramp of ramps) {
    const fault = rampFault(ramp, counts, others, floorIds)
    if (fault !== null) {
      faults.set(ramp, fault)
      continue
    }
    const fromLevel = levels.get(ramp.from)?.floorLevel ?? 0
    const toLevel = levels.get(ramp.to)?.floorLevel ?? 0
    const points = ramp.run.map(fromTuple)
    const length = points.slice(1).reduce((sum, p, i) => sum + distance(points[i]!, p), 0)
    const rise = Math.abs(toLevel - fromLevel)
    if (!(rise > tolerance('noLength'))) {
      faults.set(ramp, 'no-rise')
      continue
    }
    if (!(length > tolerance('noLength'))) {
      faults.set(ramp, 'no-run')
      continue
    }
    const up = toLevel >= fromLevel
    const line = up ? points : [...points].reverse()
    const half = ramp.width / 2
    const pieces: Vec2[][] = []
    for (let i = 1; i < line.length; i++) {
      if (distance(line[i - 1]!, line[i]!) > tolerance('noLength')) pieces.push(band(line[i - 1]!, line[i]!, half))
    }
    for (let i = 1; i < line.length - 1; i++) {
      const dir = distance(line[i - 1]!, line[i]!) > tolerance('noLength') ? normalize(sub(line[i]!, line[i - 1]!)) : { x: 1, y: 0 }
      pieces.push(square(line[i]!, dir, half))
    }
    const end = (floor: string, at: Vec2, level: number): RampEnd => ({ floor, at, level })
    const lower = up ? end(ramp.from, points[0]!, fromLevel) : end(ramp.to, points[points.length - 1]!, toLevel)
    const upper = up ? end(ramp.to, points[points.length - 1]!, toLevel) : end(ramp.from, points[0]!, fromLevel)
    out.push({
      id: ramp.id,
      name: ramp.name === undefined || ramp.name.trim() === '' ? ramp.id : ramp.name,
      from: ramp.from,
      to: ramp.to,
      lower,
      upper,
      width: ramp.width,
      line,
      length,
      rise,
      slope: (rise / length) * 100,
      oneIn: length / rise,
      statedSlope: ramp.slope ?? null,
      pieces,
    })
  }
  const result: PlanRamps = { ramps: out, faults }
  laidOut.set(whole, result)
  return result
}

function rampFault(ramp: Ramp, counts: ReadonlyMap<string, number>, others: ReadonlySet<string>, floorIds: ReadonlySet<string>): RampFault | null {
  if (!soundRamp(ramp)) return 'too-large'
  if ((counts.get(ramp.id) ?? 0) > 1 || others.has(ramp.id)) return 'duplicate-id'
  if (!floorIds.has(ramp.from) || !floorIds.has(ramp.to)) return 'unknown-floor'
  if (ramp.from === ramp.to) return 'same-floor'
  return null
}

/** The ramps that start or end on a floor, laid out. */
export function rampsOnFloor(plan: FloorPlan, floorId: string): RampLayout[] {
  return planRamps(plan).ramps.filter((ramp) => ramp.lower.floor === floorId || ramp.upper.floor === floorId)
}

/** A ramp's slope in percent, to one decimal, as text without the unit. */
export const slopeText = (percent: number): string => fixedText(percent, 1)

/** A ramp's slope as "1 in n", the n to one decimal, as text. */
export const oneInText = (oneIn: number): string => fixedText(oneIn, 1)

// ── What is worth a look ─────────────────────────────────────────────────────────────────────

const issueOf = (id: string, code: string, sentence: Said, severity: Issue['severity']): Issue =>
  withSaid({ entity: 'plan', id, code, message: english(sentence), severity }, sentence)

/**
 * The drawing's checks on the plan's bays and ramps (CNT-19). Errors leave the bay or the ramp out
 * of every view, count and export (its id is not put in `broken`, which an id shared with another
 * part would leave out too): a number Grid cannot build, an id another part has, a floor the plan
 * does not have, and for a ramp the same floor at both ends, two floors at one level, or a middle
 * line with no length. Warnings keep it: two bays of one floor with one number, two bays that
 * overlap, and a ramp whose stated slope is not the one its levels and its run give.
 */
export function parkingIssues(plan: FloorPlan, options: { readonly ramps?: boolean } = {}): Issue[] {
  const issues: Issue[] = []
  if ((plan.bays ?? []).length > 0) issues.push(...bayIssues(plan))
  // A ramp is laid out from the floors' levels, which `floorElevations` works out with the
  // drawing's checks run without spaces: those leave the ramps out (`ramps: false`).
  if ((plan.ramps ?? []).length > 0 && options.ramps !== false) issues.push(...rampIssues(plan))
  return issues
}

function bayIssues(plan: FloorPlan): Issue[] {
  const issues: Issue[] = []
  const faults = bayFaults(plan)
  const floorIds = planFloors(plan).map((floor) => floor.id)
  for (const bay of plan.bays ?? []) {
    const fault = faults.get(bay)
    if (fault === undefined) continue
    const noun = baySaid(bay)
    if (fault === 'unknown-floor') {
      const floor = floorOf(bay)
      const meant = likelyId(floor, floorIds)
      const sentence = meant === null
        ? said('issue.plan/bay-unknown-floor', { bay: noun, floor: name(floor) })
        : said('issue.plan/bay-unknown-floor.meant', { bay: noun, floor: name(floor), meant: name(meant) })
      issues.push(issueOf(bay.id, 'plan/bay-unknown-floor', sentence, 'error'))
    } else {
      issues.push(issueOf(bay.id, `plan/bay-${fault}`, said(`issue.plan/bay-${fault}`, { bay: noun }), 'error'))
    }
  }
  const sound = soundBays(plan)
  // Two bays of one floor with one number: each is counted, and the number marks both.
  const seen = new Map<string, Bay>()
  for (const bay of sound) {
    if (bay.number === undefined) continue
    const key = `${floorOf(bay)}\u0000${bay.number.trim()}`
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, bay)
      continue
    }
    issues.push(issueOf(bay.id, 'plan/bay-number-repeated', said('issue.plan/bay-number-repeated', { bay: baySaid(bay), other: baySaid(first), number: name(bay.number), floor: name(floorOf(bay)) }), 'warning'))
  }
  // Two bays that overlap: each is counted, so the floor holds fewer than its count.
  const rings = sound.map((bay) => ringOf(bayFootprint(bay)))
  for (let i = 0; i < sound.length; i++) {
    for (let j = i + 1; j < sound.length; j++) {
      const a = sound[i]!
      const b = sound[j]!
      if (floorOf(a) !== floorOf(b)) continue
      // Far apart: no need to cut them.
      if (distance(fromTuple(a.at), fromTuple(b.at)) > (Math.hypot(a.width, a.length) + Math.hypot(b.width, b.length)) / 2) continue
      let shared = 0
      try {
        shared = intersectionArea([rings[i]!], [rings[j]!])
      } catch {
        continue
      }
      if (!(shared > tolerance('bayOverlap'))) continue
      issues.push(issueOf(b.id, 'plan/bays-overlap', said('issue.plan/bays-overlap', { bay: baySaid(b), other: baySaid(a), area: num(areaText(shared)) }), 'warning'))
    }
  }
  return issues
}

function rampIssues(plan: FloorPlan): Issue[] {
  const issues: Issue[] = []
  const { ramps, faults } = planRamps(plan)
  const floorIds = planFloors(plan).map((floor) => floor.id)
  // A floor's slice keeps every ramp: it says those that start or end on it, the whole plan all.
  const { floor: sliceFloor } = wholePlan(plan)
  const here = (from: string, to: string): boolean => sliceFloor === null || from === sliceFloor || to === sliceFloor
  for (const ramp of plan.ramps ?? []) {
    const fault = faults.get(ramp)
    if (fault === undefined || !here(ramp.from, ramp.to)) continue
    const noun = rampSaid(ramp)
    const code = `plan/ramp-${fault}`
    if (fault === 'unknown-floor') {
      const floor = floorIds.includes(ramp.from) ? ramp.to : ramp.from
      const meant = likelyId(floor, floorIds)
      const sentence = meant === null
        ? said('issue.plan/ramp-unknown-floor', { ramp: noun, floor: name(floor) })
        : said('issue.plan/ramp-unknown-floor.meant', { ramp: noun, floor: name(floor), meant: name(meant) })
      issues.push(issueOf(ramp.id, code, sentence, 'error'))
    } else if (fault === 'same-floor') {
      issues.push(issueOf(ramp.id, code, said('issue.plan/ramp-same-floor', { ramp: noun, floor: name(ramp.from) }), 'error'))
    } else if (fault === 'no-rise') {
      issues.push(issueOf(ramp.id, code, said('issue.plan/ramp-no-rise', { ramp: noun, from: name(ramp.from), to: name(ramp.to) }), 'error'))
    } else {
      issues.push(issueOf(ramp.id, code, said(`issue.plan/ramp-${fault}`, { ramp: noun }), 'error'))
    }
  }
  for (const layout of ramps) {
    if (layout.statedSlope === null || !here(layout.from, layout.to)) continue
    if (!(Math.abs(layout.statedSlope - layout.slope) > tolerance('rampSlopeDiffers'))) continue
    const ramp = (plan.ramps ?? []).find((r) => r.id === layout.id)!
    issues.push(
      issueOf(
        layout.id,
        'plan/ramp-slope-differs',
        said('issue.plan/ramp-slope-differs', {
          ramp: rampSaid(ramp),
          stated: num(slopeText(layout.statedSlope)),
          worked: num(slopeText(layout.slope)),
          rise: num(metresText(layout.rise)),
          length: num(metresText(layout.length)),
        }),
        'warning'
      )
    )
  }
  return issues
}
