// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/core/geometry'
import { Canvas2D } from '../Canvas2D'
import type { SharedViewport } from '../viewport'
import { sharedFrom, unproject, viewportFrom } from '../viewport'
import type { ResizeController } from './canvas-test-utils'
import { installResizeObserver, mixedPlan } from './canvas-test-utils'

/**
 * The shared viewport. Given a viewport the canvas shows it, whatever its
 * own shape, and only reports gestures; without one it frames and moves itself.
 */

let sizes: ResizeController

beforeAll(() => {
  sizes = installResizeObserver()
  // jsdom has no PointerEvent, and the canvas pans on pointer events.
  if (typeof window.PointerEvent === 'undefined') {
    class StubPointerEvent extends MouseEvent {
      readonly pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    window.PointerEvent = StubPointerEvent as unknown as typeof PointerEvent
  }
})

afterEach(cleanup)

const svgOf = (root: ParentNode): SVGSVGElement => root.querySelector('svg[role="img"]')!

/** jsdom lays nothing out: give the svg the box the stubbed ResizeObserver reports. */
function layOut(svg: SVGSVGElement, width: number, height: number): void {
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect
}

const viewBoxOf = (root: ParentNode): [number, number, number, number] =>
  svgOf(root).getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number]

/** The shared form of whatever a canvas is showing. */
function shownBy(root: ParentNode): SharedViewport {
  const [x, y, width, height] = viewBoxOf(root)
  return sharedFrom({ x, y, width, height })
}

const given: SharedViewport = { center: { x: 3, y: 2 }, width: 10 }

describe('a canvas that is given a viewport', () => {
  it('shows that centre and width, and works the height out from its own shape', () => {
    sizes.set(800, 600)
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} viewport={given} />)

    const [x, y, width, height] = viewBoxOf(container)
    expect(width).toBeCloseTo(10, 9)
    expect(height).toBeCloseTo(7.5, 9) // 10 / (800 / 600)
    expect(x).toBeCloseTo(-2, 9)
    // The plan's Y is up and the screen's down: centre y 2 sits at screen -2.
    expect(y).toBeCloseTo(-2 - 3.75, 9)
  })

  it('shows two canvases of different shapes the same centre and width', () => {
    sizes.set(800, 600)
    const wide = render(<Canvas2D floorPlan={mixedPlan()} viewport={given} />)
    sizes.set(300, 600)
    const tall = render(<Canvas2D floorPlan={mixedPlan()} viewport={given} />)

    expect(shownBy(wide.container).center.x).toBeCloseTo(shownBy(tall.container).center.x, 9)
    expect(shownBy(wide.container).center.y).toBeCloseTo(shownBy(tall.container).center.y, 9)
    expect(shownBy(wide.container).width).toBeCloseTo(shownBy(tall.container).width, 9)
    expect(viewBoxOf(wide.container)[3]).not.toBeCloseTo(viewBoxOf(tall.container)[3], 3)
  })

  it('stays where it was put when the plan changes and when the canvas is resized', () => {
    sizes.set(800, 600)
    const { container, rerender } = render(<Canvas2D floorPlan={mixedPlan()} viewport={given} />)

    const other: FloorPlan = { ...mixedPlan(), walls: mixedPlan().walls.slice(0, 4), rooms: [] }
    rerender(<Canvas2D floorPlan={other} viewport={given} />)
    expect(shownBy(container).center.x).toBeCloseTo(3, 9)
    expect(shownBy(container).width).toBeCloseTo(10, 9)

    sizes.fire(1000, 500)
    // Re-render so the new size is read; the viewport is still the one given.
    rerender(<Canvas2D floorPlan={other} viewport={given} />)
    expect(shownBy(container).center.x).toBeCloseTo(3, 9)
    expect(shownBy(container).center.y).toBeCloseTo(2, 9)
    expect(shownBy(container).width).toBeCloseTo(10, 9)
    expect(viewBoxOf(container)[3]).toBeCloseTo(5, 9) // 10 / (1000 / 500)
  })

  it('reports a wheel zoom without moving, and keeps the point under the pointer fixed', () => {
    sizes.set(800, 600)
    const onViewportChange = vi.fn()
    const { container } = render(
      <Canvas2D floorPlan={mixedPlan()} viewport={given} onViewportChange={onViewportChange} />
    )
    layOut(svgOf(container), 800, 600)
    const before = viewBoxOf(container)

    fireEvent.wheel(svgOf(container), { deltaY: -200, clientX: 600, clientY: 150 })

    expect(onViewportChange).toHaveBeenCalledTimes(1)
    const next = onViewportChange.mock.calls[0]![0] as SharedViewport
    expect(next.width).toBeLessThan(given.width)
    // The canvas keeps showing the viewport it was given.
    expect(viewBoxOf(container)).toEqual(before)

    // The world point under the pointer is the same in the old view and the new one.
    const rect = { left: 0, top: 0, width: 800, height: 600 }
    const [x, y, width, height] = before
    const anchor = unproject({ x, y, width, height }, 600, 150, rect)
    const again = unproject(viewportFrom(next, 800 / 600), 600, 150, rect)
    expect(again.x).toBeCloseTo(anchor.x, 9)
    expect(again.y).toBeCloseTo(anchor.y, 9)
  })

  it('reports a drag as a move of the centre by the pointer distance in metres', () => {
    sizes.set(800, 600)
    const onViewportChange = vi.fn()
    const { container } = render(
      <Canvas2D floorPlan={mixedPlan()} viewport={given} onViewportChange={onViewportChange} />
    )
    const svg = svgOf(container)
    layOut(svg, 800, 600)

    fireEvent.pointerDown(svg, { button: 0, clientX: 400, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 300, pointerId: 1 })

    expect(onViewportChange).toHaveBeenCalled()
    const next = onViewportChange.mock.calls.at(-1)![0] as SharedViewport
    // 100 px of 800 px across a 10 m wide view is 1.25 m, and dragging right moves the view left.
    expect(next.center.x).toBeCloseTo(3 - 1.25, 9)
    expect(next.center.y).toBeCloseTo(2, 9)
    expect(next.width).toBeCloseTo(10, 9)
  })

  it('reports the viewport that frames the plan on a double click and on the f key, without moving', () => {
    sizes.set(800, 600)
    const onViewportChange = vi.fn()
    const far: SharedViewport = { center: { x: 100, y: 100 }, width: 5 }
    const { container } = render(
      <Canvas2D floorPlan={mixedPlan()} viewport={far} onViewportChange={onViewportChange} />
    )
    const before = viewBoxOf(container)

    fireEvent.doubleClick(svgOf(container))
    fireEvent.keyDown(svgOf(container), { key: 'f' })

    expect(onViewportChange).toHaveBeenCalledTimes(2)
    for (const [reported] of onViewportChange.mock.calls as [SharedViewport][]) {
      const view = viewportFrom(reported, 800 / 600)
      // The plan runs 0..10 across and 0..3 up (screen y -3..0).
      expect(view.x).toBeLessThanOrEqual(0)
      expect(view.x + view.width).toBeGreaterThanOrEqual(10)
      expect(view.y).toBeLessThanOrEqual(-3)
      expect(view.y + view.height).toBeGreaterThanOrEqual(0)
    }
    expect(viewBoxOf(container)).toEqual(before)
  })
})

describe('a canvas that is not given a viewport', () => {
  it('frames the plan on its own, as before', () => {
    sizes.set(800, 600)
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    const [x, y, width, height] = viewBoxOf(container)
    expect(x).toBeLessThanOrEqual(0)
    expect(x + width).toBeGreaterThanOrEqual(10)
    expect(y).toBeLessThanOrEqual(-3)
    expect(y + height).toBeGreaterThanOrEqual(0)
  })

  it('moves itself and also reports what it shows after a gesture', () => {
    sizes.set(800, 600)
    const onViewportChange = vi.fn()
    const { container } = render(
      <Canvas2D floorPlan={mixedPlan()} onViewportChange={onViewportChange} />
    )
    layOut(svgOf(container), 800, 600)
    const before = viewBoxOf(container)

    fireEvent.wheel(svgOf(container), { deltaY: -200, clientX: 400, clientY: 300 })

    expect(viewBoxOf(container)[2]).toBeLessThan(before[2])
    expect(onViewportChange).toHaveBeenCalledTimes(1)
    const reported = onViewportChange.mock.calls[0]![0] as SharedViewport
    expect(reported.width).toBeCloseTo(shownBy(container).width, 9)
    expect(reported.center.x).toBeCloseTo(shownBy(container).center.x, 9)
    expect(reported.center.y).toBeCloseTo(shownBy(container).center.y, 9)
  })

  it('frames the plan again when a viewport that was given is taken away', () => {
    sizes.set(800, 600)
    const far: SharedViewport = { center: { x: 100, y: 100 }, width: 5 }
    const { container, rerender } = render(<Canvas2D floorPlan={mixedPlan()} viewport={far} />)
    expect(shownBy(container).center.x).toBeCloseTo(100, 9)

    rerender(<Canvas2D floorPlan={mixedPlan()} />)
    const [x, , width] = viewBoxOf(container)
    expect(x).toBeLessThanOrEqual(0)
    expect(x + width).toBeGreaterThanOrEqual(10)
  })
})
