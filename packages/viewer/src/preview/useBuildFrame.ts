/**
 * The frame a canvas draws while a build plays.
 *
 * Geometry changes once per step, not per animation frame: the plan is
 * `planAfter(k)`, memoised for each `k`, so the views rebuild their drawing a
 * handful of times a second at most. Between steps only `inFlight` moves, and
 * each canvas maps its `t` to something cheap (a clip, a scale, an opacity).
 */

import { useMemo, useSyncExternalStore } from 'react'
import type { BuildStep, FloorPlan, Vec2 } from '@ongrid/core/geometry'
import { planAfter } from '@ongrid/core/geometry'
import type { InFlight, PlaybackClock, PlaybackSnapshot } from './playback'

/** One save to draw: the plan before, the plan after, and the steps between. */
export interface PlanBuild {
  readonly prev: FloorPlan
  readonly next: FloorPlan
  readonly steps: readonly BuildStep[]
}

export interface BuildFrame {
  /** What's settled, plus the parts in flight. */
  readonly plan: FloorPlan
  readonly inFlight: readonly InFlight[]
  /** For old positions and heights (move, raise) and for parts fading out. */
  readonly prev: FloorPlan
  /** Where the build ends: what the view frames and dimensions. */
  readonly next: FloorPlan
  readonly steps: readonly BuildStep[]
  readonly k: number
  readonly idle: boolean
  readonly lastPoint: Vec2 | null
}

const noSubscribe = () => () => {}
const noSnapshot = () => null

export function useBuildFrame(clock: PlaybackClock<PlanBuild> | null): BuildFrame | null {
  const getSnapshot = clock ? clock.getSnapshot : noSnapshot
  // Server rendering (tests) sees the same snapshot: there is no clock there.
  const snapshot: PlaybackSnapshot<PlanBuild> | null = useSyncExternalStore(
    clock ? clock.subscribe : noSubscribe,
    getSnapshot,
    getSnapshot
  )

  const build = snapshot?.build ?? null
  const k = snapshot?.k ?? 0
  const plan = useMemo(
    () => (build ? planAfter(build.prev, build.next, build.steps, k) : null),
    [build, k]
  )

  if (!snapshot || !build || !plan) return null
  return {
    plan,
    inFlight: snapshot.inFlight,
    prev: build.prev,
    next: build.next,
    steps: build.steps,
    k,
    idle: snapshot.idle,
    lastPoint: snapshot.lastPoint
  }
}

export interface BuildAtStep {
  readonly build: PlanBuild
  readonly k: number
  /** `planAfter(k)`, the same object until another step starts. */
  readonly plan: FloorPlan
}

/**
 * The build and its plan, changing only when a step starts. For views that
 * move parts in flight on their own render loop (3D) and must not re-render
 * React on every animation frame.
 */
export function useBuildStep(clock: PlaybackClock<PlanBuild> | null): BuildAtStep | null {
  const subscribe = clock ? clock.subscribe : noSubscribe
  const readBuild = () => clock?.getSnapshot().build ?? null
  const readK = () => clock?.getSnapshot().k ?? 0
  const build = useSyncExternalStore(subscribe, readBuild, readBuild)
  const k = useSyncExternalStore(subscribe, readK, readK)
  const plan = useMemo(
    () => (build ? planAfter(build.prev, build.next, build.steps, k) : null),
    [build, k]
  )
  return build && plan ? { build, k, plan } : null
}
