import { describe, expect, it } from 'vitest'
import type { WallExposure } from '@ongrid/core/geometry'
import { hoverColor, mutedColor, mutedGlow, wallExposureColor } from '../convert'

const EXPOSURES: WallExposure[] = ['exterior', 'interior', 'detached']

const LIGHT_PALETTE = {
  wallExterior: '#476651',
  wallInterior: '#9c8654',
  wallDetached: '#9f5138'
}

const DARK_PALETTE = {
  wallExterior: '#7d8f83',
  wallInterior: '#ddd8cc',
  wallDetached: '#b3654a'
}

describe('wallExposureColor', () => {
  it('returns the palette color for every valid exposure', () => {
    for (const exposure of EXPOSURES) {
      expect(wallExposureColor(exposure, LIGHT_PALETTE)).toEqual(expect.any(String))
    }
  })

  it('returns a distinct color for each exposure, per palette', () => {
    const lightColors = EXPOSURES.map((exposure) => wallExposureColor(exposure, LIGHT_PALETTE))
    expect(new Set(lightColors).size).toBe(EXPOSURES.length)

    const darkColors = EXPOSURES.map((exposure) => wallExposureColor(exposure, DARK_PALETTE))
    expect(new Set(darkColors).size).toBe(EXPOSURES.length)
  })

  it('reads the color from the given palette instead of a fixed value', () => {
    expect(wallExposureColor('exterior', LIGHT_PALETTE)).toBe(LIGHT_PALETTE.wallExterior)
    expect(wallExposureColor('interior', LIGHT_PALETTE)).toBe(LIGHT_PALETTE.wallInterior)
    expect(wallExposureColor('detached', LIGHT_PALETTE)).toBe(LIGHT_PALETTE.wallDetached)

    expect(wallExposureColor('exterior', DARK_PALETTE)).toBe(DARK_PALETTE.wallExterior)
    expect(wallExposureColor('interior', DARK_PALETTE)).toBe(DARK_PALETTE.wallInterior)
    expect(wallExposureColor('detached', DARK_PALETTE)).toBe(DARK_PALETTE.wallDetached)
  })
})

/** The tokens' real values (plan-tokens.css): light and dark. */
const THEMES = [
  { background: '#f1eee8', wall: '#e6e1d7', floor: '#fbfaf7', note: '#c2410c' },
  { background: '#15150f', wall: '#cbc6bb', floor: '#b9ae95', note: '#fb923c' }
]

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const distance = (a: string, b: string): number => {
  const [x, y] = [rgb(a), rgb(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
const HEX6 = /^#[0-9a-f]{6}$/

describe('mutedColor', () => {
  it('moves a colour toward the background, in light and dark', () => {
    for (const theme of THEMES) {
      for (const color of [theme.wall, theme.floor, '#476651', '#9f5138']) {
        const muted = mutedColor(color, theme.background)
        expect(distance(muted, theme.background)).toBeLessThan(distance(color, theme.background))
      }
    }
  })

  it('keeps some of the colour, so muted storeys still read', () => {
    const muted = mutedColor('#000000', '#ffffff')
    expect(muted).not.toBe('#ffffff')
    expect(muted).not.toBe('#000000')
  })
})

describe('hoverColor', () => {
  it('moves a colour toward the note colour, in light and dark', () => {
    for (const theme of THEMES) {
      for (const color of [theme.wall, theme.floor]) {
        const hovered = hoverColor(color, theme.note)
        expect(distance(hovered, theme.note)).toBeLessThan(distance(color, theme.note))
      }
    }
  })

  it('tints less than muting greys out, so the storey is still itself', () => {
    const [color, other] = ['#000000', '#ffffff']
    expect(distance(hoverColor(color, other), color)).toBeLessThan(distance(mutedColor(color, other), color))
  })
})

describe('mutedColor and hoverColor on any hex', () => {
  it('give a #rrggbb colour for #rgb, #rrggbb and #rrggbbaa, in any case', () => {
    for (const [a, b] of [
      ['#abc', '#DEF'],
      ['#ABCDEF', '#123456'],
      ['#11223344', '#fff'],
      ['#000', '#ffffffff']
    ] as const) {
      expect(mutedColor(a, b)).toMatch(HEX6)
      expect(hoverColor(a, b)).toMatch(HEX6)
    }
  })

  it('read #rgb as its long form', () => {
    expect(mutedColor('#abc', '#123')).toBe(mutedColor('#aabbcc', '#112233'))
  })

  it('never throw, and give back a colour they cannot read unchanged', () => {
    for (const odd of ['', 'red', '#12', '#ggg', 'rgb(1, 2, 3)', '#1234567']) {
      expect(mutedColor(odd, '#ffffff')).toBe(odd)
      expect(hoverColor(odd, '#ffffff')).toBe(odd)
      expect(mutedColor('#abcdef', odd)).toBe('#abcdef')
      expect(hoverColor('#abcdef', odd)).toBe('#abcdef')
    }
  })

  it('stay in range for 1,000 random colours', () => {
    let seed = 7
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const hex = (): string => '#' + Math.floor(random() * 0xffffff).toString(16).padStart(6, '0')
    for (let i = 0; i < 1000; i++) {
      const [a, b] = [hex(), hex()]
      expect(mutedColor(a, b)).toMatch(HEX6)
      expect(hoverColor(a, b)).toMatch(HEX6)
      expect(distance(mutedColor(a, b), b)).toBeLessThanOrEqual(distance(a, b) + 1)
    }
  })
})

describe('mutedGlow', () => {
  it('lights a muted storey by the theme\'s wash, and nothing else', () => {
    expect(mutedGlow('muted', 0.3)).toBe(0.3)
    expect(mutedGlow('solid', 0.3)).toBe(0)
    expect(mutedGlow('hidden', 0.3)).toBe(0)
    expect(mutedGlow('muted', 0)).toBe(0)
  })
})
