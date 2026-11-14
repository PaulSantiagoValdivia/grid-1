// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Canvas2D } from '../Canvas2D'
import { installResizeObserver, mixedPlan } from './canvas-test-utils'
import { house } from './fixtures'

/**
 * The canvas restyle moves the canvas's own look from a CSS
 * Module to Tailwind and a plain stylesheet. It must not move a single line of the plan.
 *
 * The snapshots below were recorded before the restyle, with every `class` stripped, so
 * they hold what the canvas draws (shapes, coordinates, `data-*`) and nothing about how
 * it is styled.
 */

beforeAll(() => {
  installResizeObserver().set(800, 600)
})

afterEach(cleanup)

function geometryOf(container: HTMLElement): string {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no canvas drawn')
  const copy = svg.cloneNode(true) as SVGSVGElement
  for (const node of [copy, ...copy.querySelectorAll('*')]) node.removeAttribute('class')
  return copy.outerHTML
}

describe('the canvas restyle', () => {
  it('draws the same geometry for the mixed fixture plan', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    expect(geometryOf(container)).toMatchSnapshot()
  })

  it('draws the same geometry for the house fixture plan', () => {
    const { container } = render(<Canvas2D floorPlan={house()} />)
    expect(geometryOf(container)).toMatchSnapshot()
  })

  it('gives the canvas its look in Tailwind, on the plan tokens', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    const svg = container.querySelector('svg')!
    for (const name of ['block', 'size-full', 'touch-none', 'bg-plan-paper', 'cursor-grab']) {
      expect(svg.classList).toContain(name)
    }
  })

  it('draws its focus and drop outlines in the focus-ring grey, not the near-white accent', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    const svg = container.querySelector('svg')!
    expect(svg.classList).toContain('focus-visible:outline-ring')
    expect(svg.classList).toContain('data-[drag-over=true]:outline-ring')
    expect(svg.getAttribute('class')).not.toMatch(/outline-accent/)
  })

  it('keeps the plain `canvas` class the plan finish stylesheet hangs off', () => {
    const { container } = render(<Canvas2D floorPlan={mixedPlan()} />)
    expect(container.querySelector('svg')!.classList).toContain('canvas')
  })

  it('styles the empty canvas the same way', () => {
    const { container } = render(<Canvas2D floorPlan={{ version: '1', units: 'm', walls: [], rooms: [], openings: [] }} />)
    const svg = container.querySelector('svg')!
    expect(svg.classList).toContain('canvas')
    expect(svg.classList).toContain('bg-plan-paper')
  })
})
