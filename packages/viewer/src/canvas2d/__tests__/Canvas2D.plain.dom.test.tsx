// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Canvas2D } from '../Canvas2D'
import { installResizeObserver, mixedPlan, withoutPaint } from './canvas-test-utils'

/**
 * The canvas without the diff and viewport inputs.
 *
 * The snapshot below was recorded before the shapes moved into shared
 * components, and again guards every later change: without the new inputs the
 * canvas must draw exactly the DOM it drew before, attribute for attribute.
 *
 * Since the canvas draws through the picture's scene (VEW-1) every element also carries its
 * paint as presentation attributes. Those are taken off before comparing, so the snapshot is
 * still the one recorded then; the paint itself is checked in `picture.dom.test.tsx`.
 */

beforeAll(() => {
  installResizeObserver().set(800, 600)
})

afterEach(cleanup)

describe('the plain canvas', () => {
  it('draws the same DOM as before the diff layer existed', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    expect(withoutPaint(container.firstChild as Element)).toMatchSnapshot()
  })

  it('has no diff attribute anywhere', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    expect(container.querySelector('[data-diff]')).toBeNull()
    expect(container.querySelector('[data-focus]')).toBeNull()
    expect(container.querySelector('[data-ghost-of]')).toBeNull()
  })
})
