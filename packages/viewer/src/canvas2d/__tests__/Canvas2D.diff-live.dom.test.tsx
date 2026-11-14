// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/core/types/floorplan'
import type { DiffStatusMap } from '@ongrid/core/geometry'
import { buildSteps } from '@ongrid/core/geometry'
import { createPlayback } from '../../preview/playback'
import type { PlanBuild } from '../../preview/useBuildFrame'
import { fakeScheduler } from '../../preview/__tests__/fakeScheduler'
import { Canvas2D } from '../Canvas2D'
import type { CanvasDiff } from '../Canvas2D'
import type { SharedViewport } from '../viewport'
import { viewBoxOf, viewportFrom } from '../viewport'
import { edit, house } from './fixtures'

/**
 * The diff layer and live drawing on one canvas. Two rules, set
 * when the two were merged:
 * - a `diff` waits while a live build is drawing, then shows;
 * - a controlled `viewport` wins over the build's automatic zoom-out.
 */

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
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }) as DOMRect
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The inner wall moved from x = 3 to x = 4, and the house grew a wing past its edge. */
const bigger: FloorPlan = edit((plan) => {
  plan.walls[4].start = [4, 0]
  plan.walls[4].end = [4, 4]
  plan.walls.push(
    { id: 'w7', start: [6, 0], end: [12, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w8', start: [12, 0], end: [12, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w9', start: [12, 4], end: [6, 4], thickness: 0.2, height: 2.7, kind: 'exterior' }
  )
})
const status: DiffStatusMap = { w5: 'modified', w7: 'added', w8: 'added', w9: 'added' }
const diff: CanvasDiff = { base: house(), status, focus: ['w5'] }

function liveClock(prev: FloorPlan, next: FloorPlan) {
  const time = fakeScheduler(act)
  const clock = createPlayback<PlanBuild>(time.scheduler)
  act(() => clock.play({ prev, next, steps: buildSteps(prev, next) }))
  return clock
}

describe('a diff during a live build', () => {
  it('draws no ghosts and no diff marks while the build runs', () => {
    const clock = liveClock(house(), bigger)
    const { container } = render(<Canvas2D floorPlan={bigger} build={clock} diff={diff} />)
    act(() => vi.advanceTimersByTime(50))

    expect(container.querySelector('[data-ghost-of]')).toBeNull()
    expect(container.querySelector('[data-diff]')).toBeNull()
    expect(container.querySelector('[data-focus]')).toBeNull()
  })

  it('shows once the build is gone', () => {
    const clock = liveClock(house(), bigger)
    const { container, rerender } = render(
      <Canvas2D floorPlan={bigger} build={clock} diff={diff} />
    )
    rerender(<Canvas2D floorPlan={bigger} diff={diff} />)

    expect(container.querySelector('[data-ghost-of="w5"]')).not.toBeNull()
    expect(container.querySelector('[data-id="w5"]')?.getAttribute('data-diff')).toBe('modified')
    expect(container.querySelector('[data-id="w7"]')?.getAttribute('data-diff')).toBe('added')
  })
})

describe('a controlled viewport during a live build', () => {
  const viewport: SharedViewport = { center: { x: 3, y: 2 }, width: 8 }
  const expected = viewBoxOf(viewportFrom(viewport, 800 / 600))

  it('keeps showing the viewport while the plan grows past its edge', () => {
    const onViewportChange = vi.fn()
    const { container, rerender } = render(
      <Canvas2D floorPlan={house()} viewport={viewport} onViewportChange={onViewportChange} />
    )
    const clock = liveClock(house(), bigger)
    rerender(
      <Canvas2D
        floorPlan={bigger}
        build={clock}
        viewport={viewport}
        onViewportChange={onViewportChange}
      />
    )

    for (const step of [16, 150, 400, 1000]) {
      act(() => vi.advanceTimersByTime(step))
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(expected)
    }
    // The automatic zoom-out is not a gesture: nothing is reported.
    expect(onViewportChange).not.toHaveBeenCalled()
  })
})
