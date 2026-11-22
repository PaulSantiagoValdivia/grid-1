/**
 * SHT-10: how far each colour a look draws text or a symbol in stands apart from what it is drawn
 * on, as a contrast ratio of relative luminance, from 1 (the same) to 21 (black on white).
 *
 * The ratio and the two figures it is held to are those of the Web Content Accessibility
 * Guidelines (WCAG 2.2, success criteria 1.4.3 for text and 1.4.11 for symbols): text at least
 * 4.5 to 1, the lines and marks that carry meaning at least 3 to 1. A test holds every named look
 * to them (`__tests__/contrast.test.ts`), so a colour that drifts below fails.
 *
 * Pure: colours in, numbers out.
 */
import type { Look } from './look'

/** The least contrast ratio text and symbols are held to. */
export const CONTRAST_LEAST = { text: 4.5, symbol: 3 } as const

/** A colour as `#rrggbb`, its relative luminance: 0 for black, 1 for white. */
export function relativeLuminance(colour: string): number {
  const value = /^#([0-9a-f]{6})$/i.exec(colour)
  if (value === null) throw new RangeError(`Not #rrggbb: ${JSON.stringify(colour)}`)
  const n = Number.parseInt(value[1]!, 16)
  const channel = (byte: number): number => {
    const c = byte / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** The contrast ratio of two colours, lighter over darker: 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** One colour a look draws text or a symbol in, and one colour it is drawn on. */
export interface ColourPair {
  /** What is drawn, and on what, by the look's own names: `colors.labelSoft on colors.room`. */
  readonly name: string
  readonly role: keyof typeof CONTRAST_LEAST
  readonly colour: string
  readonly on: string
}

/**
 * Every pair of a colour a look draws text or a symbol in and a colour it can stand on: the paper,
 * a room's fill and every tint a room may be filled with (by use or by floor finish). The site's
 * lines stand on the paper and on their own fills. A fill that is only a ground under other lines
 * (a room, a window's tint, a path) is not itself held to a ratio; in a look that outlines its
 * walls, the outline is the wall's symbol, and its tone inside is a ground too.
 */
export function lookPairs(look: Look): ColourPair[] {
  const c = look.colors
  const grounds: [string, string][] = [
    ['colors.paper', c.paper],
    ['colors.room', c.room],
    ...Object.entries(look.tints.uses).map(([use, fill]): [string, string] => [`tints.uses.${use}`, fill]),
    ...look.tints.finishes.map((fill, i): [string, string] => [`tints.finishes[${i}]`, fill])
  ]
  const text: [string, string][] = [
    ['colors.label', c.label],
    ['colors.labelSoft', c.labelSoft],
    ['colors.dimensionText', c.dimensionText],
    ['colors.dimensionSoftText', c.dimensionSoftText],
    ['colors.warning', c.warning]
  ]
  const own = (name: string, colour: string | null): [string, string][] => (colour === null ? [] : [[name, colour]])
  const walls: [string, string][] =
    look.wallOutline === null
      ? [
          ['walls.fill.outside', look.walls.fill.outside],
          ['walls.fill.inside', look.walls.fill.inside],
          ['walls.fill.partition', look.walls.fill.partition],
          ...own('phases.existing', look.phases.existing),
          ...own('phases.new', look.phases.new)
        ]
      : [['wallOutline', look.wallOutline], ...own('phases.new', look.phases.new)]
  const symbols: [string, string][] = [
    ['ink', look.ink],
    ...walls,
    ['colors.virtual', c.virtual],
    ['colors.dimension', c.dimension],
    ['colors.dimensionSoft', c.dimensionSoft],
    ['colors.warning', c.warning],
    ['phases.demolished', look.phases.demolished]
  ]
  const pairs: ColourPair[] = []
  for (const [ground, on] of grounds) {
    for (const [name, colour] of text) pairs.push({ name: `${name} on ${ground}`, role: 'text', colour, on })
    for (const [name, colour] of symbols) pairs.push({ name: `${name} on ${ground}`, role: 'symbol', colour, on })
  }
  const site = look.site
  const siteLines: [keyof typeof site, keyof typeof site | null][] = [
    ['boundary', null],
    ['street', null],
    ['fence', null],
    ['gate', null],
    ['pathEdge', 'pathFill'],
    ['pavingEdge', 'pavingFill'],
    ['poolEdge', 'poolFill'],
    ['treeEdge', 'treeFill']
  ]
  for (const [line, fill] of siteLines) {
    pairs.push({ name: `site.${line} on colors.paper`, role: 'symbol', colour: site[line], on: c.paper })
    if (fill !== null && site[fill] !== 'none') pairs.push({ name: `site.${line} on site.${fill}`, role: 'symbol', colour: site[line], on: site[fill] })
  }
  return pairs
}
