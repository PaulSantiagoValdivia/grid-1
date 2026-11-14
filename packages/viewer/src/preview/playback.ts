/**
 * The playback clock: plays build schedules at the assistant's pace.
 *
 * The assistant saves the plan in bursts. Drawing each burst instantly reads as
 * a pop, and drawing it at a fixed pace either pads a quick edit or falls
 * behind a fast assistant. Like chat apps smoothing bursty text, the clock
 * spreads each save over the time until the next save is expected, within a
 * readable range per wall (`MIN_UNIT`..`MAX_UNIT`). A newer save, or the run
 * ending, finishes what is left within a second.
 *
 * It is an external store, not React state: 2D reads it through
 * `useSyncExternalStore`, 3D samples it inside the render loop. Time comes from
 * an injected scheduler so tests can drive it without real frames.
 */

import type { BuildStep, StepKind, Vec2 } from '@ongrid/floorplan/geometry'

/** The shortest a wall step gets, so a big save stays readable. */
export const MIN_UNIT = 80
/** The longest a wall step gets ("Steady"), so a slow assistant never makes a wall crawl. */
export const MAX_UNIT = 450
/** Expected gap before a run's first save, when there is no gap to measure yet. */
export const FIRST_GAP = 3000
/** A newer save or the run ending finishes what is left within this. */
export const CATCH_UP = 1000
/** Each step starts when the one before is this far along. */
const OVERLAP = 0.7
/** How much a newly measured gap moves the expected one. */
const ALPHA = 0.5

/** How long each step takes, relative to a wall. Removals fade together as one block. */
const WEIGHT: Record<StepKind, number> = {
  wall: 1,
  move: 1,
  raise: 1,
  opening: 0.66,
  room: 0.9,
  remove: 0.55,
  dimensions: 0.9
}

export interface FrameScheduler {
  now(): number
  request(callback: () => void): number
  cancel(id: number): void
}

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id)
}

/** What gets played. Callers attach whatever they need to draw it (the plans). */
export interface Playable {
  readonly steps: readonly BuildStep[]
}

export interface InFlight {
  readonly step: BuildStep
  /** 0 → 1. */
  readonly t: number
}

export interface PlaybackSnapshot<B extends Playable> {
  /** The build being drawn, or the last one drawn. */
  readonly build: B | null
  /** How many of its steps have started: the plan to show is `planAfter(k)`. */
  readonly k: number
  readonly inFlight: readonly InFlight[]
  /** Where the last part drawn in this run ends, for the pulse. Null once the run ended. */
  readonly lastPoint: Vec2 | null
  /** Caught up: nothing left to draw. */
  readonly idle: boolean
  /** How long a wall step takes in the current build, in ms. */
  readonly unit: number
}

export interface PlaybackClock<B extends Playable> {
  /** Plays a build. If one is still playing, same as `catchUp`. */
  play(build: B): void
  /** Finishes what is left within a second, then plays `build`. */
  catchUp(build: B): void
  /** Finishes what is left within a second, and clears the pulse. */
  runEnded(): void
  /** Jumps to the end at once. */
  finish(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): PlaybackSnapshot<B>
  /** A fresh snapshot for this instant, for render loops that run on their own frames. */
  sample(): PlaybackSnapshot<B>
}

interface Timing {
  readonly start: number
  readonly end: number
}

interface Laid<B> {
  readonly build: B
  /** Virtual time the build starts at; timings are relative to it. */
  readonly startV: number
  readonly endV: number
  readonly timings: readonly Timing[]
  readonly unit: number
}

/** Steps on a timeline at `unit` ms per wall. */
function layout(steps: readonly BuildStep[], unit: number): Timing[] {
  const timings: Timing[] = []
  let start = 0
  let previous: Timing | null = null
  let removalBlock: Timing | null = null

  for (const step of steps) {
    if (step.kind === 'remove' && removalBlock) {
      timings.push(removalBlock)
      continue
    }
    if (previous) start = previous.start + OVERLAP * (previous.end - previous.start)
    const timing = { start, end: start + WEIGHT[step.kind] * unit }
    if (step.kind === 'remove') removalBlock = timing
    timings.push(timing)
    previous = timing
  }
  return timings
}

/** The wall step that makes `steps` fill `window` ms, within the readable range. */
function unitFor(steps: readonly BuildStep[], window: number): number {
  let total = 0
  let last = 0
  let sawRemoval = false
  for (const step of steps) {
    if (step.kind === 'remove') {
      if (sawRemoval) continue
      sawRemoval = true
    }
    total += WEIGHT[step.kind]
    last = WEIGHT[step.kind]
  }
  const span = OVERLAP * total + (1 - OVERLAP) * last
  if (span <= 0) return MAX_UNIT
  return Math.min(MAX_UNIT, Math.max(MIN_UNIT, window / span))
}

export function createPlayback<B extends Playable>(
  scheduler: FrameScheduler = browserScheduler
): PlaybackClock<B> {
  const listeners = new Set<() => void>()

  let builds: Laid<B>[] = []
  // Virtual time runs at `rate` until `fastUntil`, then at 1. A catch-up is a
  // stretch at a higher rate, which keeps every part's progress continuous.
  let anchorReal = scheduler.now()
  let anchorV = 0
  let rate = 1
  let fastUntil = 0

  let ended = false
  let lastSave: number | null = null
  let gap: number | null = null
  /** The pulse point carried over from builds already dropped. */
  let carried: Vec2 | null = null

  let frame: number | null = null
  let snapshot: PlaybackSnapshot<B> = {
    build: null,
    k: 0,
    inFlight: [],
    lastPoint: null,
    idle: true,
    unit: MAX_UNIT
  }

  function virtual(now: number): number {
    const elapsed = now - anchorReal
    const fastSpan = Math.max(0, fastUntil - anchorV) / rate
    if (elapsed <= fastSpan) return anchorV + elapsed * rate
    return anchorV + fastSpan * rate + (elapsed - fastSpan)
  }

  const endOfAll = (): number => (builds.length ? builds[builds.length - 1].endV : 0)

  function setPace(now: number, v: number, nextRate: number, until: number) {
    anchorReal = now
    anchorV = v
    rate = nextRate
    fastUntil = until
  }

  function lastPointOf(laid: Laid<B>, v: number): Vec2 | null {
    for (let i = laid.build.steps.length - 1; i >= 0; i--) {
      const step = laid.build.steps[i]
      if (step.at && laid.startV + laid.timings[i].end <= v) return step.at
    }
    return null
  }

  function compute(now: number): PlaybackSnapshot<B> {
    if (builds.length === 0) {
      return { build: null, k: 0, inFlight: [], lastPoint: null, idle: true, unit: snapshot.unit }
    }
    const v = virtual(now)

    // Drop builds that are over and have a successor.
    while (builds.length > 1 && builds[1].startV <= v) {
      carried = lastPointOf(builds[0], Infinity) ?? carried
      builds = builds.slice(1)
    }

    const current = builds[0]
    const local = v - current.startV
    let k = 0
    const inFlight: InFlight[] = []
    current.timings.forEach((timing, i) => {
      if (timing.start <= local) k = i + 1
      if (timing.start <= local && local < timing.end) {
        inFlight.push({
          step: current.build.steps[i],
          t: (local - timing.start) / (timing.end - timing.start)
        })
      }
    })

    return {
      build: current.build,
      k,
      inFlight,
      lastPoint: ended ? null : (lastPointOf(current, v) ?? carried),
      idle: v >= endOfAll(),
      unit: current.unit
    }
  }

  function same(a: PlaybackSnapshot<B>, b: PlaybackSnapshot<B>): boolean {
    return (
      a.build === b.build &&
      a.k === b.k &&
      a.idle === b.idle &&
      a.unit === b.unit &&
      a.lastPoint === b.lastPoint &&
      a.inFlight.length === b.inFlight.length &&
      a.inFlight.every((f, i) => f.step === b.inFlight[i].step && f.t === b.inFlight[i].t)
    )
  }

  function refresh() {
    const next = compute(scheduler.now())
    if (!same(next, snapshot)) {
      snapshot = next
      for (const listener of listeners) listener()
    }
    if (snapshot.idle) {
      if (frame !== null) scheduler.cancel(frame)
      frame = null
    } else if (frame === null) {
      frame = scheduler.request(onFrame)
    }
  }

  function onFrame() {
    frame = null
    refresh()
  }

  /** Measures the gap since the last save and returns the one expected next. */
  function noteSave(now: number): number {
    if (lastSave !== null) {
      const measured = now - lastSave
      gap = gap === null ? measured : ALPHA * measured + (1 - ALPHA) * gap
    }
    lastSave = now
    return gap ?? FIRST_GAP
  }

  function append(build: B, startV: number, window: number) {
    const unit = unitFor(build.steps, window)
    const timings = layout(build.steps, unit)
    const length = timings.reduce((max, t) => Math.max(max, t.end), 0)
    builds = [...builds, { build, startV, endV: startV + length, timings, unit }]
  }

  /** Compresses whatever is left into at most `limit` ms; returns how long that takes. */
  function compress(now: number, limit: number): number {
    const v = virtual(now)
    const remaining = endOfAll() - v
    if (remaining <= 0) return 0
    const duration = Math.min(remaining, limit)
    setPace(now, v, remaining / duration, endOfAll())
    return duration
  }

  function start(build: B) {
    const now = scheduler.now()
    if (ended) {
      ended = false
      carried = null
      builds = []
    }
    const expected = noteSave(now)
    const v = virtual(now)
    if (builds.length) carried = lastPointOf(builds[builds.length - 1], Infinity) ?? carried
    builds = []
    setPace(now, v, 1, v)
    append(build, v, expected)
    refresh()
  }

  function catchUp(build: B) {
    const now = scheduler.now()
    if (ended || builds.length === 0 || virtual(now) >= endOfAll()) {
      start(build)
      return
    }
    const expected = noteSave(now)
    // A quarter of the expected gap at most, so a fast assistant's next save
    // still has time to be drawn and the preview doesn't fall a save behind.
    const duration = compress(now, Math.min(CATCH_UP, expected / 4))
    append(build, endOfAll(), expected - duration)
    refresh()
  }

  return {
    play(build) {
      if (!ended && builds.length && virtual(scheduler.now()) < endOfAll()) catchUp(build)
      else start(build)
    },

    catchUp,

    runEnded() {
      compress(scheduler.now(), CATCH_UP)
      ended = true
      lastSave = null
      gap = null
      refresh()
    },

    finish() {
      const now = scheduler.now()
      const end = endOfAll()
      setPace(now, end, 1, end)
      refresh()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot: () => snapshot,

    sample: () => compute(scheduler.now())
  }
}
