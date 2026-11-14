import { describe, expect, it } from 'vitest'
import type { BuildStep } from '@ongrid/floorplan/geometry'
import type { FrameScheduler } from '../playback'
import { createPlayback } from '../playback'

/** Time that only moves when the test says so, with frames every 16 ms. */
function fakeScheduler() {
  let now = 0
  let nextId = 1
  const pending = new Map<number, () => void>()

  const scheduler: FrameScheduler = {
    now: () => now,
    request(callback) {
      const id = nextId++
      pending.set(id, callback)
      return id
    },
    cancel(id) {
      pending.delete(id)
    }
  }

  /** Moves time forward to `until`, running a frame every 16 ms. */
  function advanceTo(until: number, each?: (time: number) => void) {
    while (now < until) {
      now = Math.min(until, now + 16)
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback()
      each?.(now)
    }
  }

  return { scheduler, advanceTo, pendingFrames: () => pending.size, time: () => now }
}

let wallCount = 0

function walls(n: number): BuildStep[] {
  return Array.from({ length: n }, () => {
    const i = wallCount++
    return { kind: 'wall', id: `w${i}`, group: 1, at: { x: i, y: 0 } } as BuildStep
  })
}

const withDimensions = (steps: BuildStep[]): BuildStep[] => [
  ...steps,
  { kind: 'dimensions', id: 'dimensions', group: 5 }
]

const build = (steps: BuildStep[]) => ({ steps })

describe('the playback clock', () => {
  it('starts each step when the one before is 70% done', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)
    clock.play(build(walls(4)))
    const u = clock.getSnapshot().unit

    advanceTo(Math.round(0.7 * u) + 1)
    const snapshot = clock.getSnapshot()
    expect(snapshot.k).toBe(2)
    expect(snapshot.inFlight.map((f) => f.step.id)).toEqual([
      expect.any(String),
      expect.any(String)
    ])
    expect(snapshot.inFlight[0].t).toBeCloseTo(0.7, 1)
    expect(snapshot.inFlight[1].t).toBeLessThan(0.05)
  })

  it('fades every removal at once, as one short block', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)
    const removals: BuildStep[] = [
      { kind: 'remove', id: 'r1', group: 0 },
      { kind: 'remove', id: 'o1', group: 0 },
      { kind: 'remove', id: 'w1', group: 0 }
    ]
    clock.play(build([...removals, ...walls(1)]))
    const u = clock.getSnapshot().unit

    advanceTo(16)
    expect(clock.getSnapshot().inFlight.map((f) => f.step.kind)).toEqual([
      'remove',
      'remove',
      'remove'
    ])
    // The wall starts when the removals are 70% done.
    advanceTo(Math.round(0.55 * 0.7 * u) + 2)
    expect(clock.getSnapshot().k).toBe(4)
  })

  it('draws about 0.1 s walls for an assistant saving ten walls a second, ending near each save', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)

    const saves = [0, 1000, 2000, 3000, 4000, 5000, 6000]
    const ends: number[] = []
    let current: object | null = null
    let ended = false

    for (const [i, at] of saves.entries()) {
      advanceTo(at, (time) => {
        if (!ended && clock.getSnapshot().idle) {
          ended = true
          ends.push(time)
        }
      })
      if (i > 0 && !ended) ends.push(at)
      current = build(withDimensions(walls(10)))
      clock.catchUp(current as { steps: BuildStep[] })
      ended = false
      if (i >= 2) {
        const u = clock.getSnapshot().unit
        expect(u).toBeGreaterThan(90)
        expect(u).toBeLessThan(140)
      }
    }

    // From the third save on, each drawing ends within 150 ms of the next save.
    for (let i = 2; i < saves.length - 1; i++) {
      expect(Math.abs(ends[i] - saves[i + 1])).toBeLessThanOrEqual(150)
    }
  })

  it('never stretches a wall past 0.45 s for a slow assistant, and then waits', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)

    clock.play(build(withDimensions(walls(4))))
    expect(clock.getSnapshot().unit).toBe(450)
    advanceTo(10_000)
    expect(clock.getSnapshot().idle).toBe(true)

    clock.catchUp(build(withDimensions(walls(4))))
    expect(clock.getSnapshot().unit).toBe(450)
    // 4 walls and the dimensions at 450 ms, overlapping: well under 2 s.
    advanceTo(12_000)
    expect(clock.getSnapshot().idle).toBe(true)
  })

  it('never goes below 0.08 s a wall for a very large save', () => {
    const { scheduler } = fakeScheduler()
    const clock = createPlayback(scheduler)
    clock.play(build(withDimensions(walls(80))))
    expect(clock.getSnapshot().unit).toBe(80)
  })

  it('finishes what is left within a second when a newer save arrives, then draws it', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)
    const first = build(withDimensions(walls(20)))
    const second = build(withDimensions(walls(3)))

    clock.play(first)
    advanceTo(500)
    clock.catchUp(second)
    expect(clock.getSnapshot().build).toBe(first)

    advanceTo(1500)
    expect(clock.getSnapshot().build).toBe(second)
  })

  it('keeps every queued save when several arrive during a catch-up', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)
    const builds = [0, 1, 2].map(() => build(withDimensions(walls(5))))
    const seen: object[] = []
    clock.subscribe(() => {
      const current = clock.getSnapshot().build
      if (current && seen[seen.length - 1] !== current) seen.push(current)
    })

    // Saves 300 ms apart: the file watcher never delivers them closer than 80 ms.
    clock.play(builds[0])
    advanceTo(300)
    clock.catchUp(builds[1])
    advanceTo(600)
    clock.catchUp(builds[2])
    advanceTo(5000)
    // Each one drawn, in order, none skipped.
    expect(seen).toHaveLength(3)
    seen.forEach((b, i) => expect(b).toBe(builds[i]))
    expect(clock.getSnapshot().k).toBe(builds[2].steps.length)
  })

  it('finishes within a second when the run ends, and the pulse goes', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)
    const only = build(withDimensions(walls(20)))

    clock.play(only)
    advanceTo(500)
    clock.runEnded()
    advanceTo(1500)
    const snapshot = clock.getSnapshot()
    expect(snapshot.idle).toBe(true)
    expect(snapshot.k).toBe(only.steps.length)
    expect(snapshot.lastPoint).toBeNull()
  })

  it('jumps to the end on finish', () => {
    const { scheduler } = fakeScheduler()
    const clock = createPlayback(scheduler)
    const first = build(withDimensions(walls(6)))
    const second = build(withDimensions(walls(6)))

    clock.play(first)
    clock.catchUp(second)
    clock.finish()
    const snapshot = clock.getSnapshot()
    expect(snapshot.idle).toBe(true)
    expect(snapshot.build).toBe(second)
    expect(snapshot.k).toBe(second.steps.length)
    expect(snapshot.inFlight).toEqual([])
  })

  it('points the pulse at the end of the last part drawn', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)
    const steps = withDimensions(walls(3))

    clock.play(build(steps))
    // Nothing drawn yet, so no pulse.
    expect(clock.getSnapshot().lastPoint).toBeNull()

    advanceTo(5000)
    // The dimensions step draws no part, so the pulse stays on the last wall.
    expect(clock.getSnapshot().lastPoint).toEqual(steps[2].at)
  })

  it('keeps the pulse on the last part when a newer save only removes things', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)
    const steps = withDimensions(walls(2))

    clock.play(build(steps))
    advanceTo(5000)
    clock.catchUp(build([{ kind: 'remove', id: 'x', group: 0 }]))
    advanceTo(10_000)
    expect(clock.getSnapshot().lastPoint).toEqual(steps[1].at)
  })

  it('tells subscribers while it plays and stops asking for frames once idle', () => {
    const { scheduler, advanceTo, pendingFrames } = fakeScheduler()
    const clock = createPlayback(scheduler)
    let calls = 0
    const unsubscribe = clock.subscribe(() => calls++)

    clock.play(build(withDimensions(walls(2))))
    advanceTo(200)
    expect(calls).toBeGreaterThan(3)

    advanceTo(5000)
    expect(clock.getSnapshot().idle).toBe(true)
    expect(pendingFrames()).toBe(0)

    const before = calls
    advanceTo(6000)
    expect(calls).toBe(before)
    unsubscribe()
  })

  it('returns the same snapshot until something changes', () => {
    const { scheduler } = fakeScheduler()
    const clock = createPlayback(scheduler)
    expect(clock.getSnapshot()).toBe(clock.getSnapshot())
    expect(clock.getSnapshot()).toMatchObject({ build: null, k: 0, idle: true, lastPoint: null })
  })

  it('starts a new run fresh after the last one ended', () => {
    const { scheduler, advanceTo } = fakeScheduler()
    const clock = createPlayback(scheduler)

    clock.play(build(withDimensions(walls(2))))
    advanceTo(5000)
    clock.runEnded()

    // A long pause before the next run is not a gap between saves.
    advanceTo(60_000)
    clock.play(build(withDimensions(walls(80))))
    expect(clock.getSnapshot().unit).toBe(80)
    expect(clock.getSnapshot().lastPoint).toBeNull()
  })
})
