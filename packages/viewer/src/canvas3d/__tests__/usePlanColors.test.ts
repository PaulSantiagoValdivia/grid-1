import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readPlanColors } from '../usePlanColors'

function fakeStyle(values: Record<string, string>): Pick<CSSStyleDeclaration, 'getPropertyValue'> {
  return {
    getPropertyValue: (name: string) => values[name] ?? ''
  }
}

const LIGHT_VALUES: Record<string, string> = {
  '--plan-background-3d': '#ddd8cc',
  '--plan-grid': '#e6e2d6',
  '--plan-grid-section': '#cfc9b8',
  '--plan-wall-exterior-3d': '#476651',
  '--plan-wall-interior-3d': '#9c8654',
  '--plan-wall-detached-3d': '#9f5138',
  '--plan-floor-3d': '#a99870',
  '--plan-note': '#c2410c',
  '--plan-muted-wash-3d': '0.3'
}

const DARK_VALUES: Record<string, string> = {
  '--plan-background-3d': '#15150f',
  '--plan-grid': '#3d3a2e',
  '--plan-grid-section': '#57533f',
  '--plan-wall-exterior-3d': '#7d8f83',
  '--plan-wall-interior-3d': '#ddd8cc',
  '--plan-wall-detached-3d': '#b3654a',
  '--plan-floor-3d': '#b9ae95',
  '--plan-note': '#fb923c',
  '--plan-muted-wash-3d': '0'
}

describe('readPlanColors', () => {
  it('reads the scene colors and the muted wash from the given style', () => {
    const colors = readPlanColors(fakeStyle(LIGHT_VALUES))
    expect(colors).toEqual({
      background: '#ddd8cc',
      grid: '#e6e2d6',
      gridSection: '#cfc9b8',
      wallExterior: '#476651',
      wallInterior: '#9c8654',
      wallDetached: '#9f5138',
      floor: '#a99870',
      note: '#c2410c',
      mutedWash: 0.3
    })
  })

  it('produces different values for light vs dark tokens', () => {
    const light = readPlanColors(fakeStyle(LIGHT_VALUES))
    const dark = readPlanColors(fakeStyle(DARK_VALUES))

    for (const key of Object.keys(light) as (keyof typeof light)[]) {
      expect(light[key]).not.toBe(dark[key])
    }
  })

  it('trims whitespace CSS custom properties commonly have', () => {
    const colors = readPlanColors(fakeStyle({ '--plan-background-3d': '  #ddd8cc  ' }))
    expect(colors.background).toBe('#ddd8cc')
  })
})

describe('the muted wash', () => {
  it('reads as 0 when the token is missing or not a number, and stays between 0 and 1', () => {
    expect(readPlanColors(fakeStyle({})).mutedWash).toBe(0)
    expect(readPlanColors(fakeStyle({ '--plan-muted-wash-3d': 'strong' })).mutedWash).toBe(0)
    expect(readPlanColors(fakeStyle({ '--plan-muted-wash-3d': ' 2 ' })).mutedWash).toBe(1)
    expect(readPlanColors(fakeStyle({ '--plan-muted-wash-3d': '-1' })).mutedWash).toBe(0)
  })

  // Light walls are already close to the light background, so mixing alone barely shows a
  // muted storey: the lighting darkens it back. Dark theme mutes clearly without it.
  it('washes muted storeys out in light theme only', () => {
    const css = readFileSync(new URL('../../plan-tokens.css', import.meta.url), 'utf8')
    const wash = (block: string): number => Number(/--plan-muted-wash-3d:\s*([^;]+);/.exec(block)?.[1])
    const dark = css.indexOf('.dark {')
    expect(dark).toBeGreaterThan(0)
    expect(wash(css.slice(0, dark))).toBeGreaterThan(0)
    expect(wash(css.slice(dark))).toBe(0)
  })
})
