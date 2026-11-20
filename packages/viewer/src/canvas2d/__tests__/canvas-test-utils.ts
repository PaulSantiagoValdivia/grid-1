import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { PAINT_ATTRIBUTES } from '../../picture/scene'

/**
 * Shared set-up for the Canvas2D jsdom tests.
 *
 * Canvas2D measures its container through ResizeObserver, which jsdom does not
 * implement, and draws nothing until a real size lands. The stub reports the
 * current size as soon as a canvas starts observing, so a test chooses the size
 * of the next canvas it renders; `fire` reports a new size to every canvas already
 * mounted, as a resize would.
 */
export interface ResizeController {
  /** The size the next canvas to start observing will be told. */
  set(width: number, height: number): void
  /** Tell every canvas that is observing a new size. */
  fire(width: number, height: number): void
}

export function installResizeObserver(): ResizeController {
  let current = { width: 800, height: 600 }
  const live = new Set<{ target: Element; callback: ResizeObserverCallback }>()

  class StubResizeObserver {
    private entry: { target: Element; callback: ResizeObserverCallback } | null = null
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      this.entry = { target, callback: this.callback }
      live.add(this.entry)
      this.callback(
        [{ target, contentRect: { ...current } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver
      )
    }
    unobserve(): void {}
    disconnect(): void {
      if (this.entry) live.delete(this.entry)
    }
  }
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver

  return {
    set(width, height) {
      current = { width, height }
    },
    fire(width, height) {
      current = { width, height }
      for (const { target, callback } of live) {
        callback(
          [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
          undefined as unknown as ResizeObserver
        )
      }
    }
  }
}

type Wall = FloorPlan['walls'][number]

export const wall = (
  id: string,
  start: [number, number],
  end: [number, number],
  extra: Partial<Wall> = {}
): Wall => ({ id, start, end, thickness: 0.2, height: 2.5, kind: 'exterior', ...extra })

/** Two rooms, a door, a window, a virtual wall: a bit of everything the canvas draws. */
export function mixedPlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('w1', [0, 0], [4, 0]),
      wall('w2', [4, 0], [4, 3]),
      wall('w3', [4, 3], [0, 3]),
      wall('w4', [0, 3], [0, 0]),
      wall('w5', [6, 0], [10, 0]),
      wall('w6', [10, 0], [10, 3]),
      wall('w7', [10, 3], [6, 3]),
      wall('w8', [6, 3], [6, 0]),
      wall('v1', [4, 1], [4, 2], { kind: 'interior', virtual: true })
    ],
    rooms: [
      { id: 'r1', name: 'Living room', boundary: ['w1', 'w2', 'w3', 'w4'] },
      { id: 'r2', name: 'Study', boundary: ['w5', 'w6', 'w7', 'w8'] }
    ],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
      { id: 'o2', wall: 'w3', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 }
    ]
  }
}

/**
 * A copy of a drawn element without the paint the picture writes on every element (`fill`,
 * `stroke`, `font-size`, …). What is left is what the canvas drew before it had any: shapes,
 * coordinates and `data-*`. The snapshots recorded before then compare against this.
 */
export function withoutPaint<T extends Element>(element: T): T {
  const copy = element.cloneNode(true) as T
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    for (const name of PAINT_ATTRIBUTES) node.removeAttribute(name)
  }
  return copy
}
