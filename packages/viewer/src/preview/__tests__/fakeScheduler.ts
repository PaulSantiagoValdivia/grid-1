import type { FrameScheduler } from '../playback'

/**
 * Time that only moves when a test says so. `frame()` advances it and runs the
 * frames the clock asked for; pass `wrap` (React's `act`) when components
 * re-render from them.
 */
export function fakeScheduler(wrap: (run: () => void) => void = (run) => run()) {
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

  function frame(ms = 16) {
    now += ms
    const callbacks = [...pending.values()]
    pending.clear()
    wrap(() => callbacks.forEach((callback) => callback()))
  }

  /** Runs frames until `done` holds, or fails after `limit` of them. */
  function until(done: () => boolean, limit = 1000) {
    for (let i = 0; i < limit; i++) {
      if (done()) return
      frame()
    }
    throw new Error('the condition never held')
  }

  return { scheduler, frame, until, time: () => now, pendingFrames: () => pending.size }
}
