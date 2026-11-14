// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/core/geometry'
import { buildSteps, planAfter } from '@ongrid/core/geometry'
import type { FrameScheduler } from '../playback'
import { createPlayback } from '../playback'
import type { PlanBuild } from '../useBuildFrame'
import { useBuildFrame, useBuildStep } from '../useBuildFrame'

const EMPTY: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }

const SQUARE: FloorPlan = {
  version: '1',
  units: 'm',
  walls: [
    { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w2', start: [4, 0], end: [4, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w3', start: [4, 4], end: [0, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }
  ],
  rooms: [{ id: 'r1', name: 'Room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
  openings: []
}

function fakeScheduler() {
  let now = 0
  let id = 1
  const pending = new Map<number, () => void>()
  const scheduler: FrameScheduler = {
    now: () => now,
    request: (callback) => {
      pending.set(id, callback)
      return id++
    },
    cancel: (frame) => {
      pending.delete(frame)
    }
  }
  const frame = (ms = 16) => {
    now += ms
    const callbacks = [...pending.values()]
    pending.clear()
    act(() => callbacks.forEach((callback) => callback()))
  }
  return { scheduler, frame }
}

describe('useBuildFrame', () => {
  it('has no frame without a clock or before anything plays', () => {
    const { scheduler } = fakeScheduler()
    expect(renderHook(() => useBuildFrame(null)).result.current).toBeNull()
    const clock = createPlayback<PlanBuild>(scheduler)
    expect(renderHook(() => useBuildFrame(clock)).result.current).toBeNull()
  })

  it('shows the plan after the steps that have started', () => {
    const { scheduler, frame } = fakeScheduler()
    const clock = createPlayback<PlanBuild>(scheduler)
    const steps = buildSteps(EMPTY, SQUARE)
    const { result } = renderHook(() => useBuildFrame(clock))

    act(() => clock.play({ prev: EMPTY, next: SQUARE, steps }))
    frame()
    const k = clock.getSnapshot().k
    expect(result.current?.plan).toEqual(planAfter(EMPTY, SQUARE, steps, k))
    expect(result.current?.prev).toBe(EMPTY)
    expect(result.current?.inFlight.length).toBeGreaterThan(0)
  })

  it('keeps the same plan object across frames until another step starts', () => {
    const { scheduler, frame } = fakeScheduler()
    const clock = createPlayback<PlanBuild>(scheduler)
    const steps = buildSteps(EMPTY, SQUARE)
    const { result } = renderHook(() => useBuildFrame(clock))

    act(() => clock.play({ prev: EMPTY, next: SQUARE, steps }))
    frame()
    const first = result.current!
    frame(1)
    // Time moved, the step in flight moved, but no new step started.
    expect(clock.getSnapshot().k).toBe(first.k)
    expect(result.current!.inFlight[0].t).toBeGreaterThan(first.inFlight[0].t)
    expect(result.current!.plan).toBe(first.plan)

    for (let i = 0; i < 200 && clock.getSnapshot().k === first.k; i++) frame()
    expect(result.current!.plan).not.toBe(first.plan)
  })

  it('ends on exactly the new plan', () => {
    const { scheduler } = fakeScheduler()
    const clock = createPlayback<PlanBuild>(scheduler)
    const steps = buildSteps(EMPTY, SQUARE)
    const { result } = renderHook(() => useBuildFrame(clock))

    act(() => {
      clock.play({ prev: EMPTY, next: SQUARE, steps })
      clock.finish()
    })
    expect(result.current?.plan).toEqual(SQUARE)
    expect(result.current?.idle).toBe(true)
  })
})

describe('useBuildStep', () => {
  it('re-renders when a step starts, not on every animation frame', () => {
    const { scheduler, frame } = fakeScheduler()
    const clock = createPlayback<PlanBuild>(scheduler)
    const steps = buildSteps(EMPTY, SQUARE)
    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useBuildStep(clock)
    })

    act(() => clock.play({ prev: EMPTY, next: SQUARE, steps }))
    const k = result.current!.k
    const before = renders
    frame(1)
    frame(1)
    frame(1)
    expect(clock.getSnapshot().k).toBe(k)
    expect(renders).toBe(before)

    for (let i = 0; i < 200 && clock.getSnapshot().k === k; i++) frame()
    expect(renders).toBeGreaterThan(before)
    expect(result.current!.plan).toEqual(planAfter(EMPTY, SQUARE, steps, result.current!.k))
  })
})
