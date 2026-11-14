// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { validateDoorSweeps } from '@ongrid/core/geometry'
import { Canvas2D } from '../Canvas2D'
import { edit } from './fixtures'

/**
 * The sweep-warning mark, read from the plan:
 * the front door `o1` hangs on its start jamb and opens into the house; `o2`
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

/** The house with a short wall standing where the front door swings. */
const blocked = () =>
  edit((plan) => {
    Object.assign(plan.openings.find((o) => o.id === 'o1')!, { hinge: 'start', swing: 'left' })
    plan.walls.push({ id: 'w6', start: [1.5, 0.1], end: [1.5, 1], thickness: 0.1, height: 2.7, kind: 'partition' })
  })

const markOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-part="door-warning"][data-opening="${id}"]`)

describe('Canvas2D: the door-sweep warning mark', () => {
  it('the fixture really is blocked by w6', () => {
    const issues = validateDoorSweeps(blocked(), (opening) => opening)
    expect(issues).toContainEqual(expect.objectContaining({ id: 'o1', code: 'opening/door-blocked', hits: ['w6'] }))
  })

  it('shows no mark on a door that swings free', () => {
    const { container } = render(<Canvas2D floorPlan={house()} />)
    expect(container.querySelector('[data-part="door-warning"]')).toBeNull()
  })

  it('marks a blocked door, labelled with what is wrong', () => {
    const { container } = render(<Canvas2D floorPlan={blocked()} />)
    const mark = markOf(container, 'o1')!
    expect(mark).not.toBeNull()
    expect(mark.getAttribute('aria-label')).toBe('This door hits a wall when it opens.')
    expect(markOf(container, 'o2')).toBeNull()
    // Quiet until hovered.
    expect(container.querySelector('[data-hit]')).toBeNull()
    expect(container.querySelector('[data-part="door-warning-text"]')).toBeNull()
  })

  it('on hover, lights what the door hits and says why', () => {
    const { container } = render(<Canvas2D floorPlan={blocked()} />)
    fireEvent.pointerEnter(markOf(container, 'o1')!)

    const lit = Array.from(container.querySelectorAll('[data-hit="true"]'))
    expect(lit.length).toBeGreaterThan(0)
    expect(lit.every((el) => el.getAttribute('data-id') === 'w6')).toBe(true)
    expect(container.querySelector('[data-part="door-warning-text"]')!.textContent).toBe(
      'This door hits a wall when it opens.'
    )

    fireEvent.pointerLeave(markOf(container, 'o1')!)
    expect(container.querySelector('[data-hit]')).toBeNull()
    expect(container.querySelector('[data-part="door-warning-text"]')).toBeNull()
  })
})
