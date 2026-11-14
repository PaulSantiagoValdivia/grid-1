// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Canvas2D } from '../Canvas2D'
import { house } from './fixtures'

/**
 * Live drawing must not change how a plan draws outside a live run. The
 * snapshot was recorded from the canvas before the `build` prop existed.
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
})

afterEach(cleanup)

describe('Canvas2D without a build', () => {
  it('draws exactly as it did before live drawing', () => {
    const { container } = render(<Canvas2D floorPlan={house()} />)
    expect(container.innerHTML).toMatchSnapshot()
  })
})
