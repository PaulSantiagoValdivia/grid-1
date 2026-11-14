// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { buildSteps } from '@ongrid/core/geometry'
import { createPlayback } from '../../preview/playback'
import type { PlanBuild } from '../../preview/useBuildFrame'
import { fakeScheduler } from '../../preview/__tests__/fakeScheduler'
import { Canvas2D } from '../Canvas2D'
import { EMPTY, house } from './fixtures'

/** Task 4.5: the pulse that says the assistant is still working. */

beforeAll(() => {
  class ImmediateResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width: 800, height: 600 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver
      )
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ImmediateResizeObserver as unknown as typeof ResizeObserver
})

const originalMatchMedia = window.matchMedia
afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
})

function live() {
  const time = fakeScheduler(act)
  const clock = createPlayback<PlanBuild>(time.scheduler)
  const next = house()
  const steps = buildSteps(EMPTY, next)
  const view = render(<Canvas2D floorPlan={next} build={clock} />)
  act(() => clock.play({ prev: EMPTY, next, steps }))
  const pulse = () => view.container.querySelector('[data-part="pulse"]')
  const viewBox = () => view.container.querySelector('svg')!.getAttribute('viewBox')
  return { ...view, clock, time, steps, pulse, viewBox }
}

describe('Canvas2D pulse', () => {
  it('stays hidden while the build plays', () => {
    const { time, pulse, clock } = live()
    time.frame(200)
    expect(clock.getSnapshot().idle).toBe(false)
    expect(pulse()).toBeNull()
  })

  it('shows at the end of the last part drawn once the drawing caught up', () => {
    const { time, pulse, clock } = live()
    time.until(() => clock.getSnapshot().idle)
    const at = clock.getSnapshot().lastPoint!
    expect(pulse()).not.toBeNull()
    expect(Number(pulse()!.getAttribute('cx'))).toBeCloseTo(at.x)
    expect(Number(pulse()!.getAttribute('cy'))).toBeCloseTo(-at.y)
  })

  it('goes when the run ends', () => {
    const { time, pulse, clock } = live()
    time.until(() => clock.getSnapshot().idle)
    act(() => clock.runEnded())
    expect(pulse()).toBeNull()
  })

  it('never shows outside a live run', () => {
    const { container } = render(<Canvas2D floorPlan={house()} />)
    expect(container.querySelector('[data-part="pulse"]')).toBeNull()
  })

  it('never shows under reduce motion', () => {
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {}
    })) as unknown as typeof window.matchMedia
    const { time, pulse, clock } = live()
    time.until(() => clock.getSnapshot().idle)
    expect(pulse()).toBeNull()
  })

  it('lets clicks through to what is under it', () => {
    const { time, pulse, clock } = live()
    time.until(() => clock.getSnapshot().idle)
    const dot = pulse()!
    expect(dot.getAttribute('pointer-events')).toBe('none')
    expect(dot.hasAttribute('data-id')).toBe(false)
    expect(dot.hasAttribute('data-selectable')).toBe(false)
    expect(dot.getAttribute('aria-hidden')).toBe('true')
  })

  it('does not move the frame when it appears', () => {
    const { time, pulse, clock, viewBox } = live()
    time.frame(100)
    const before = viewBox()
    time.until(() => clock.getSnapshot().idle)
    expect(pulse()).not.toBeNull()
    expect(viewBox()).toBe(before)
  })
})
