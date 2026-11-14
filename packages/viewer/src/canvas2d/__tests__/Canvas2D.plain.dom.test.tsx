// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Canvas2D } from '../Canvas2D'
import { installResizeObserver, mixedPlan } from './canvas-test-utils'

/**
 * The canvas without the diff and viewport inputs.
 *
 * The snapshot below was recorded before the shapes moved into shared
 * components, and again guards every later change: without the new inputs the
 * canvas must draw exactly the DOM it drew before, attribute for attribute.
 */

beforeAll(() => {
  installResizeObserver().set(800, 600)
})

afterEach(cleanup)

describe('the plain canvas', () => {
  it('draws the same DOM as before the diff layer existed', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('has no diff attribute anywhere', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    expect(container.querySelector('[data-diff]')).toBeNull()
    expect(container.querySelector('[data-focus]')).toBeNull()
    expect(container.querySelector('[data-ghost-of]')).toBeNull()
  })
})
