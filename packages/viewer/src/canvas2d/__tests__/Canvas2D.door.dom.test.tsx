// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { buildSteps } from '@ongrid/core/geometry'
import { createPlayback } from '../../preview/playback'
import type { PlanBuild } from '../../preview/useBuildFrame'
import { fakeScheduler } from '../../preview/__tests__/fakeScheduler'
import { Canvas2D } from '../Canvas2D'
import { EMPTY, edit } from './fixtures'

/**
 * The door symbol, read from the plan: the front door
 * `o1` is hinged at its start and opens to the left face, the inner door `o2`
 * states neither.
 */
const house = () =>
  edit((plan) => {
    Object.assign(plan.openings.find((o) => o.id === 'o1')!, { hinge: 'start', swing: 'left' })
  })

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

const symbolOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-part="door-symbol"][data-opening="${id}"]`)

describe('Canvas2D: the door symbol', () => {
  it('draws the leaf, the arc and both jambs for a door whose hinge and swing are known', () => {
    const { container } = render(<Canvas2D floorPlan={house()} />)
    const symbol = symbolOf(container, 'o1')!
    expect(symbol).not.toBeNull()
    expect(symbol.querySelectorAll('[data-part="door-leaf"]')).toHaveLength(1)
    expect(symbol.querySelectorAll('[data-part="door-arc"]')).toHaveLength(1)
    expect(symbol.querySelectorAll('[data-part="jamb"]')).toHaveLength(2)

    // Front door on w1 (along +X), 1 m from its start, 0.9 m wide: the leaf
    // stands on the start jamb and opens into the house (+Y, so up in SVG).
    const leaf = symbol.querySelector('[data-part="door-leaf"]')!
    expect(Number(leaf.getAttribute('x1'))).toBeCloseTo(1, 4)
    expect(Number(leaf.getAttribute('y1'))).toBeCloseTo(0, 4)
    expect(Number(leaf.getAttribute('x2'))).toBeCloseTo(1, 4)
    expect(Number(leaf.getAttribute('y2'))).toBeCloseTo(-0.9, 4)
    expect(symbol.querySelector('[data-part="door-arc"]')!.getAttribute('d')).toBe(
      'M1.0000,-0.9000A0.9000,0.9000 0 0 1 1.9000,0.0000'
    )

    // Its gap drops the outline along the wall faces.
    const gap = container.querySelector('[data-part="opening"][data-id="o1"]')!
    expect(gap.getAttribute('data-swing')).toBe('true')
  })

  it('draws a door that states only its hinge as a plain gap, with no guessed swing', () => {
    const plan = edit((p) => {
      Object.assign(p.openings.find((o) => o.id === 'o1')!, { hinge: 'start' })
    })
    const { container } = render(<Canvas2D floorPlan={plan} />)
    expect(symbolOf(container, 'o1')).toBeNull()
    expect(container.querySelector('[data-part="opening"][data-id="o1"]')!.hasAttribute('data-swing')).toBe(false)
  })

  it('draws a door with no known swing as a plain gap', () => {
    const { container } = render(<Canvas2D floorPlan={house()} />)
    expect(symbolOf(container, 'o2')).toBeNull()
    const gap = container.querySelector('[data-part="opening"][data-id="o2"]')!
    expect(gap.hasAttribute('data-swing')).toBe(false)
  })

  it('is drawing, not a target: no clicks, no selection id, hidden from assistive technology', () => {
    const { container } = render(<Canvas2D floorPlan={house()} />)
    const symbol = symbolOf(container, 'o1')!
    expect(symbol.getAttribute('pointer-events')).toBe('none')
    expect(symbol.getAttribute('aria-hidden')).toBe('true')
    expect(symbol.hasAttribute('data-id')).toBe(false)
    expect(symbol.querySelector('[data-id]')).toBeNull()
  })

  it('appears with its door during a live build, faded by the same progress', () => {
    const time = fakeScheduler(act)
    const clock = createPlayback<PlanBuild>(time.scheduler)
    const next = house()
    const { container } = render(<Canvas2D floorPlan={next} build={clock} />)
    act(() => clock.play({ prev: EMPTY, next, steps: buildSteps(EMPTY, next) }))

    // Walls first: no door yet, so no symbol.
    time.until(() => clock.getSnapshot().inFlight.some((f) => f.step.kind === 'wall'))
    expect(symbolOf(container, 'o1')).toBeNull()

    // Half way through cutting the door, half faded in.
    time.until(() => clock.getSnapshot().inFlight.some((f) => f.step.id === 'o1' && f.t >= 0.5))
    const opacity = Number(symbolOf(container, 'o1')!.getAttribute('opacity'))
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThan(1)

    // Once it's cut, drawn whole.
    act(() => clock.finish())
    expect(symbolOf(container, 'o1')!.hasAttribute('opacity')).toBe(false)
  })
})
