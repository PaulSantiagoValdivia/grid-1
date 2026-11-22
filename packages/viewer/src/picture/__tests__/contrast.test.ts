import { describe, expect, it } from 'vitest'
import { CONTRAST_LEAST, contrastRatio, lookPairs, relativeLuminance } from '../contrast'
import { LOOK_NAMES, LOOKS } from '../look'

/**
 * SHT-10: every named look's text stands at least 4.5 to 1 from what it is drawn on, and its
 * symbols at least 3 to 1, by relative luminance, on the paper, a room and every tint.
 */
describe('contrast', () => {
  it('measures relative luminance and the ratio as the guidelines define them', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 12)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 9)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 9)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
    // Grey #767676 on white is the darkest grey to pass 4.5 to 1 for text.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5)
    expect(() => relativeLuminance('red')).toThrow(/#rrggbb/)
  })

  it.each(LOOK_NAMES)('holds the %s look: text at least 4.5 to 1, symbols at least 3 to 1', (name) => {
    const pairs = lookPairs(LOOKS[name])
    expect(pairs.length).toBeGreaterThan(100)
    const low = pairs
      .filter((pair) => contrastRatio(pair.colour, pair.on) < CONTRAST_LEAST[pair.role])
      .map((pair) => `${pair.name}: ${pair.colour} on ${pair.on} is ${contrastRatio(pair.colour, pair.on).toFixed(2)}`)
    expect(low).toEqual([])
  })

  it('checks text and symbols on every tint a room may take', () => {
    const pairs = lookPairs(LOOKS.working)
    expect(pairs.some((pair) => pair.name === 'colors.labelSoft on tints.uses.stair' && pair.role === 'text')).toBe(true)
    expect(pairs.some((pair) => pair.name === 'walls.fill.partition on tints.finishes[0]' && pair.role === 'symbol')).toBe(true)
    expect(pairs.some((pair) => pair.name === 'site.poolEdge on site.poolFill')).toBe(true)
  })
})
