// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { buildSteps } from '@ongrid/floorplan/geometry'
import { createPlayback } from '../../preview/playback'
import type { PlanBuild } from '../../preview/useBuildFrame'
import { fakeScheduler } from '../../preview/__tests__/fakeScheduler'
import { Canvas2D } from '../Canvas2D'
import { EMPTY, edit, house } from './fixtures'

/**
 * Task 4.2: during a live run the 2D view holds still. It never reframes on a
 * plan update; it frames a first plan once before it draws, and only zooms out
 * (smoothly) when the plan grows past the edge.
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
  // jsdom lays nothing out; the wheel zoom needs the element's real size.
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

const viewBox = (container: HTMLElement) =>
  container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number)

/** The view a plan gets on its own, outside any build. */
function framedAlone(plan: FloorPlan): number[] {
  const { container, unmount } = render(<Canvas2D floorPlan={plan} />)
  const box = viewBox(container)
  unmount()
  return box
}

/**
 * A canvas showing `prev`, then a live build to `next`. With `zoomFirst` the
 * user zooms in before the build, so a reframe would visibly undo it.
 */
function liveUpdate(prev: FloorPlan, next: FloorPlan, zoomFirst = false) {
  const time = fakeScheduler(act)
  const clock = createPlayback<PlanBuild>(time.scheduler)
  const view = render(<Canvas2D floorPlan={prev} />)
  if (zoomFirst) {
    fireEvent.wheel(view.container.querySelector('svg')!, { deltaY: -200, clientX: 300, clientY: 250 })
  }
  const before = viewBox(view.container)
  act(() => clock.play({ prev, next, steps: buildSteps(prev, next) }))
  view.rerender(<Canvas2D floorPlan={next} build={clock} />)
  return { ...view, clock, time, before }
}

describe('Canvas2D holds its frame during a live run', () => {
  it('does not move when inner walls are added inside the outline', () => {
    const next = edit((plan) => {
      plan.walls.push({
        id: 'w6',
        start: [3, 2],
        end: [6, 2],
        thickness: 0.1,
        height: 2.7,
        kind: 'partition'
      })
    })
    const { container, clock, time, before, rerender } = liveUpdate(house(), next, true)
    expect(before).not.toEqual(framedAlone(house()))

    time.frame(100)
    expect(viewBox(container)).toEqual(before)
    act(() => clock.finish())
    expect(viewBox(container)).toEqual(before)

    // The run ends and the build goes away: the frame stays where it is.
    rerender(<Canvas2D floorPlan={next} />)
    expect(viewBox(container)).toEqual(before)
  })

  it('frames a first plan before it draws', () => {
    const { container } = liveUpdate(EMPTY, house())
    expect(viewBox(container)).toEqual(framedAlone(house()))
  })

  it('zooms out smoothly when a new wing lands past the edge, and never back in', () => {
    const bigger = edit((plan) => {
      plan.walls.push(
        { id: 'w7', start: [6, 0], end: [12, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
        { id: 'w8', start: [12, 0], end: [12, 4], thickness: 0.2, height: 2.7, kind: 'exterior' },
        { id: 'w9', start: [12, 4], end: [6, 4], thickness: 0.2, height: 2.7, kind: 'exterior' }
      )
    })
    const { container, before } = liveUpdate(house(), bigger)

    act(() => vi.advanceTimersByTime(16))
    const early = viewBox(container)
    act(() => vi.advanceTimersByTime(150))
    const halfway = viewBox(container)
    act(() => vi.advanceTimersByTime(400))
    const settled = viewBox(container)

    // Wider at every point, never narrower than before.
    expect(early[2]).toBeGreaterThanOrEqual(before[2])
    expect(halfway[2]).toBeGreaterThan(early[2])
    expect(settled[2]).toBeGreaterThan(halfway[2])
    // Settled, the whole new wing is in sight.
    const [x, , width] = settled
    expect(x).toBeLessThanOrEqual(0)
    expect(x + width).toBeGreaterThanOrEqual(12)

    act(() => vi.advanceTimersByTime(1000))
    expect(viewBox(container)).toEqual(settled)
  })

  it('still reframes on an update outside a live run', () => {
    const bigger = edit((plan) => {
      plan.walls[0].end = [12, 0]
    })
    const { container, rerender } = render(<Canvas2D floorPlan={house()} />)
    const before = viewBox(container)
    rerender(<Canvas2D floorPlan={bigger} />)
    expect(viewBox(container)).not.toEqual(before)
    expect(viewBox(container)).toEqual(framedAlone(bigger))
  })
})
