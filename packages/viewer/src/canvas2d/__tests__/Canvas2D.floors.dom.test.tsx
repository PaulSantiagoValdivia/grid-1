// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/core/types/floorplan'
import { Canvas2D } from '../Canvas2D'

/**
 * Task 9.1 — the canvas really draws one floor at a time.
 *
 * This is the assertion the SSR test next door had to weaken to
 * `aria-label="Floor plan"`: Canvas2D fills its <svg> from a useLayoutEffect, so
 * server rendering produces an empty element and says nothing about which walls
 * came out. jsdom can run that effect.
 *
 * The effect measures the container through ResizeObserver, which jsdom does not
 * implement, and nothing is drawn until a real size lands (drawing earlier would
 * frame against a made-up 1:1 ratio). Hence the stub below — without it the svg
 * stays empty and every assertion here would pass for the wrong reason.
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

const wall = (
  id: string,
  floor: string,
  start: [number, number],
  end: [number, number]
): FloorPlan['walls'][number] => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 2.5,
  kind: 'exterior',
  floor
})

/** A 4x4 room on the ground floor, and a single wall on the first. */
const twoFloors: FloorPlan = {
  version: '1',
  units: 'm',
  floors: [
    { id: 'ground', name: 'Ground floor', level: 0 },
    { id: 'first', name: 'First floor', level: 1 }
  ],
  walls: [
    wall('g-w1', 'ground', [0, 0], [4, 0]),
    wall('g-w2', 'ground', [4, 0], [4, 4]),
    wall('g-w3', 'ground', [4, 4], [0, 4]),
    wall('g-w4', 'ground', [0, 4], [0, 0]),
    wall('f-w1', 'first', [0, 0], [4, 0])
  ],
  rooms: [
    { id: 'g-r1', name: 'Living room', boundary: ['g-w1', 'g-w2', 'g-w3', 'g-w4'], floor: 'ground' }
  ],
  openings: [
    { id: 'g-o1', wall: 'g-w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 }
  ]
}

const drawnIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('[data-id]')).map((el) => el.getAttribute('data-id')!)

describe('Canvas2D draws one floor at a time', () => {
  it('draws the ground floor and nothing from the first', () => {
    const { container } = render(<Canvas2D floorPlan={twoFloors} floor="ground" />)
    const ids = drawnIds(container)

    // Guard: an empty svg would make every "not drawn" assertion below vacuous.
    expect(ids.length).toBeGreaterThan(0)

    expect(ids).toContain('g-w1')
    expect(ids).toContain('g-r1')
    expect(ids).toContain('g-o1')
    expect(ids).not.toContain('f-w1')
  })

  it('draws the first floor and nothing from the ground', () => {
    const { container } = render(<Canvas2D floorPlan={twoFloors} floor="first" />)
    const ids = drawnIds(container)

    expect(ids).toContain('f-w1')
    expect(ids).not.toContain('g-w1')
    expect(ids).not.toContain('g-r1')
    // The opening belongs to a ground-floor wall, so it goes with it (C5).
    expect(ids).not.toContain('g-o1')
  })

  it('falls back to the lowest floor when asked for one the plan lacks', () => {
    const { container } = render(<Canvas2D floorPlan={twoFloors} floor="demolished" />)

    // The agent deleting the active floor must not leave a blank canvas.
    expect(drawnIds(container)).toContain('g-w1')
  })

  it('draws the lowest floor when no floor is given at all', () => {
    const { container } = render(<Canvas2D floorPlan={twoFloors} />)

    expect(drawnIds(container)).toContain('g-w1')
    expect(drawnIds(container)).not.toContain('f-w1')
  })

  it('draws a plan that never mentions floors exactly as before', () => {
    const stripFloor = <T extends { floor?: string }>(entity: T): T => {
      const copy = { ...entity }
      delete copy.floor
      return copy
    }
    const flat: FloorPlan = {
      ...twoFloors,
      floors: undefined,
      walls: twoFloors.walls.slice(0, 4).map(stripFloor),
      rooms: twoFloors.rooms.map(stripFloor)
    }

    const ids = drawnIds(render(<Canvas2D floorPlan={flat} />).container)

    expect(ids).toContain('g-w1')
    expect(ids).toContain('g-r1')
  })
})
