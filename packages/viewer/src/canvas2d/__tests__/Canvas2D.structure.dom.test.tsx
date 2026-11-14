// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/core/geometry'
import { Canvas2D } from '../Canvas2D'
import type { SharedViewport } from '../viewport'
import { installResizeObserver, mixedPlan } from './canvas-test-utils'

/**
 * What other layers rely on. The marker layer finds the single
 * `svg[role="img"]`, reads its `viewBox` and watches it, and his stylesheet
 * selects on the `data-*` attributes. The diff layer must add to that, never
 * move it.
 */

beforeAll(() => {
  installResizeObserver().set(800, 600)
})

afterEach(cleanup)

const movedWall = (): FloorPlan => {
  const plan = mixedPlan()
  plan.walls = plan.walls.map((w) => (w.id === 'w1' ? { ...w, start: [0, -1], end: [4, -1] } : w))
  return plan
}

const viewport: SharedViewport = { center: { x: 5, y: 1.5 }, width: 14 }
const diff = { base: mixedPlan(), status: { w1: 'modified' as const }, focus: ['w1'] }

const variants: [string, JSX.Element][] = [
  ['plain', <Canvas2D key="a" floorPlan={movedWall()} />],
  ['with a diff', <Canvas2D key="b" floorPlan={movedWall()} diff={diff} />],
  ['with a viewport', <Canvas2D key="c" floorPlan={movedWall()} viewport={viewport} />],
  ['with both', <Canvas2D key="d" floorPlan={movedWall()} diff={diff} viewport={viewport} />]
]

/** The names of every `data-*` attribute in the canvas. */
function dataAttributes(root: ParentNode): Set<string> {
  const names = new Set<string>()
  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.getAttributeNames()) if (attr.startsWith('data-')) names.add(attr)
  }
  return names
}

describe('the structure other layers rely on', () => {
  it.each(variants)('has one svg[role="img"] with a viewBox of four numbers: %s', (_label, element) => {
    const { container } = render(element)

    expect(container.querySelectorAll('[role="img"]')).toHaveLength(1)
    const svg = container.querySelector('svg[role="img"]')!
    const parts = svg.getAttribute('viewBox')!.split(' ').map(Number)
    expect(parts).toHaveLength(4)
    for (const n of parts) expect(Number.isFinite(n)).toBe(true)
    expect(parts[2]!).toBeGreaterThan(0)
    expect(parts[3]!).toBeGreaterThan(0)
  })

  it('keeps every data attribute the plain canvas has, and every part, when a diff is added', () => {
    const plain = render(<Canvas2D floorPlan={movedWall()} />)
    const before = dataAttributes(plain.container)
    const parts = new Set(
      [...plain.container.querySelectorAll('[data-part]')].map((el) => el.getAttribute('data-part'))
    )
    cleanup()

    const withDiff = render(<Canvas2D floorPlan={movedWall()} diff={diff} />)
    const after = dataAttributes(withDiff.container)
    for (const name of before) expect(after.has(name)).toBe(true)
    for (const part of parts) {
      expect(withDiff.container.querySelector(`[data-part="${part}"]`)).not.toBeNull()
    }
    // The diff adds attributes; these are the only new ones.
    expect([...after].filter((name) => !before.has(name)).sort()).toEqual([
      'data-diff',
      'data-focus',
      'data-ghost-of'
    ])
  })

  it('draws the same number of current elements with and without a diff', () => {
    const count = (root: ParentNode) => root.querySelectorAll('[data-id]').length
    const plain = render(<Canvas2D floorPlan={movedWall()} />)
    const n = count(plain.container)
    cleanup()
    expect(count(render(<Canvas2D floorPlan={movedWall()} diff={diff} />).container)).toBe(n)
  })
})
