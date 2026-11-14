// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { buildSteps } from '@ongrid/floorplan/geometry'
import { createPlayback } from '../../preview/playback'
import type { PlanBuild } from '../../preview/useBuildFrame'
import { fakeScheduler } from '../../preview/__tests__/fakeScheduler'
import { Canvas2D } from '../Canvas2D'
import { EMPTY, house } from './fixtures'

/**
 * Task 4.3: a click never waits for the drawing. Moving around the plan lets
 * it keep drawing, the way scrolling never stops code being written.
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
  // jsdom has no PointerEvent; MouseEvent carries clientX the same way, so a pan can be told from a click.
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent ??= window.MouseEvent
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }) as DOMRect
})

afterEach(cleanup)

/** A canvas a few walls into drawing a new house. */
function midBuild() {
  const time = fakeScheduler(act)
  const clock = createPlayback<PlanBuild>(time.scheduler)
  const next = house()
  const view = render(<Canvas2D floorPlan={next} build={clock} />)
  act(() => clock.play({ prev: EMPTY, next, steps: buildSteps(EMPTY, next) }))
  time.until(() => clock.getSnapshot().inFlight.some((f) => f.step.id === 'w2'))
  expect(clock.getSnapshot().idle).toBe(false)
  const svg = view.container.querySelector('svg')!
  return { ...view, clock, svg }
}

describe('Canvas2D: only a click finishes the build', () => {
  it('finishes on a click, which selects what is under the pointer in the finished plan', () => {
    const { container, clock, svg } = midBuild()
    // The kitchen isn't drawn yet.
    expect(container.querySelector('[data-id="r2"]')).toBeNull()
    // What a real hit test finds at the pointer once the plan is finished.
    const elementFromPoint = vi.fn(() => container.querySelector('[data-part="room"][data-id="r2"]'))
    document.elementFromPoint = elementFromPoint

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 600, clientY: 300 })
    expect(clock.getSnapshot().idle).toBe(false)
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1 })
    fireEvent.click(svg, { clientX: 600, clientY: 300 })

    expect(clock.getSnapshot().idle).toBe(true)
    expect(elementFromPoint).toHaveBeenCalledWith(600, 300)
    const kitchen = container.querySelector('[data-part="room"][data-id="r2"]')!
    expect(kitchen.getAttribute('data-selected')).toBe('true')
  })

  it('keeps drawing while the user pans', () => {
    const { clock, svg } = midBuild()
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 400, clientY: 300 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 480, clientY: 340 })
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1 })
    fireEvent.click(svg, { clientX: 480, clientY: 340 })
    expect(clock.getSnapshot().idle).toBe(false)
  })

  it('keeps drawing while the user zooms', () => {
    const { clock, svg } = midBuild()
    fireEvent.wheel(svg, { deltaY: 100, clientX: 400, clientY: 300 })
    expect(clock.getSnapshot().idle).toBe(false)
  })

  it('keeps drawing on a key press', () => {
    const { clock, svg } = midBuild()
    fireEvent.keyDown(svg, { key: 'f' })
    expect(clock.getSnapshot().idle).toBe(false)
  })
})
