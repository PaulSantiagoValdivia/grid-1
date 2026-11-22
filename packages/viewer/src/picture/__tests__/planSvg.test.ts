import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { mixedPlan } from '../../canvas2d/__tests__/canvas-test-utils'
import { house } from '../../canvas2d/__tests__/fixtures'
import { DARK_LOOK, LIGHT_LOOK, LINE_PX, lengthText } from '../look'
import { DEFAULT_WIDTH, pictureView, planPicture, planToSvg } from '../planSvg'

/**
 * A picture of a plan in plain Node: no browser, no DOM, no stylesheet.
 */

/** Every start tag has its end tag, in order: enough to say the file is well formed. */
function wellFormed(svg: string): boolean {
  const open: string[] = []
  for (const match of svg.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = match
    if (selfClosing) continue
    if (!closing) open.push(name!)
    else if (open.pop() !== name) return false
  }
  return open.length === 0
}

const attrsOf = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

describe('planToSvg', () => {
  it('gives the size and view of a picture without drawing it (pictureView)', () => {
    for (const options of [{}, { width: 700, height: 640 }, { showDimensions: false }, { frame: { min: { x: 0, y: 0 }, max: { x: 3, y: 2 }, width: 3, height: 2 } }]) {
      const { width, height, view } = planPicture(house(), options)
      expect(pictureView(house(), options)).toEqual({ width, height, view })
    }
  })

  it('runs without a browser', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
    expect(planToSvg(house())).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /)
  })

  it('writes a well-formed SVG file', () => {
    const svg = planToSvg(house())
    expect(wellFormed(svg)).toBe(true)
    expect(svg.endsWith('</svg>\n')).toBe(true)
  })

  it('needs no stylesheet: final colours, no variables, no browser-only line widths', () => {
    const svg = planToSvg(house())
    expect(svg).not.toMatch(/var\(|vector-effect|<style|class=/)
    for (const tag of attrsOf(svg, 'room')) expect(tag).toContain(`fill="${LIGHT_LOOK.room}"`)
    // SHT-10: each kind of wall in its own fill.
    for (const tag of attrsOf(svg, 'wall')) expect(tag).toMatch(new RegExp(`fill="(${LIGHT_LOOK.wallExterior}|${LIGHT_LOOK.wallInside}|${LIGHT_LOOK.wallPartition})"`))
    for (const tag of attrsOf(svg, 'label')) {
      expect(tag).toContain(`fill="${LIGHT_LOOK.label}"`)
      expect(tag).toContain('font-family="')
      expect(tag).toContain('font-size="13"')
    }
    expect(svg).toContain(`<rect data-part="paper"`)
    expect(svg).toContain(`fill="${LIGHT_LOOK.paper}"`)
  })

  it('writes line widths in metres for the picture’s zoom', () => {
    const picture = planPicture(house())
    const metresPerPixel = picture.view.width / picture.width
    const svg = planToSvg(house())
    const lines = attrsOf(svg, 'dimension-line')
    expect(lines.length).toBeGreaterThan(0)
    for (const tag of lines) expect(tag).toContain(`stroke-width="${lengthText(LINE_PX.dimension * metresPerPixel)}"`)
  })

  it('draws the room names and areas as text', () => {
    const svg = planToSvg(mixedPlan())
    expect(svg).toContain('>Living room</text>')
    expect(svg).toContain('>Study</text>')
    expect(svg).toMatch(/>\d+\.\d\d m²<\/text>/)
  })

  it('is 1200 pixels wide by default, with a height that follows the plan', () => {
    const picture = planPicture(mixedPlan())
    expect(picture.width).toBe(DEFAULT_WIDTH)
    // The mixed plan is wider than it is deep.
    expect(picture.height).toBeLessThan(picture.width)
    expect(planToSvg(mixedPlan())).toContain(`width="${picture.width}" height="${picture.height}"`)
  })

  it('takes a size, and refuses one that is not a whole number of pixels', () => {
    expect(planPicture(mixedPlan(), { width: 640, height: 480 })).toMatchObject({ width: 640, height: 480 })
    expect(() => planToSvg(mixedPlan(), { width: 0 })).toThrow(RangeError)
    expect(() => planToSvg(mixedPlan(), { height: 10.5 })).toThrow(RangeError)
  })

  it('keeps a long thin plan to a sensible shape', () => {
    const corridor: FloorPlan = {
      version: '1',
      units: 'm',
      walls: [{ id: 'w', start: [0, 0], end: [40, 0], thickness: 0.2, height: 2.5, kind: 'exterior' }],
      rooms: [],
      openings: []
    }
    const picture = planPicture(corridor, { width: 1000 })
    expect(picture.height).toBeGreaterThanOrEqual(400)
  })

  it('draws an empty plan as an empty sheet', () => {
    const svg = planToSvg({ version: '1', units: 'm', walls: [], rooms: [], openings: [] })
    expect(wellFormed(svg)).toBe(true)
    expect(svg).toContain('aria-label="Floor plan with 0 rooms"')
  })

  it('draws in the dark look when asked', () => {
    const svg = planToSvg(house(), { look: 'dark' })
    expect(svg).toContain(`fill="${DARK_LOOK.paper}"`)
    expect(svg).toContain(`fill="${DARK_LOOK.room}"`)
    expect(svg).not.toContain(LIGHT_LOOK.room)
  })

  it('gives the same file for the same plan every time', () => {
    expect(planToSvg(house())).toBe(planToSvg(house()))
  })

  it('takes under a second for a typical plan', () => {
    const start = performance.now()
    planToSvg(house())
    expect(performance.now() - start).toBeLessThan(1000)
  })
})

describe('the picture code', () => {
  it('imports no React and touches no DOM', () => {
    const folder = resolve(__dirname, '..')
    const sources = readdirSync(folder).filter((name) => name.endsWith('.ts'))
    expect(sources.length).toBeGreaterThan(0)
    for (const name of sources) {
      const text = readFileSync(join(folder, name), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect(text, name).not.toMatch(/from 'react|from 'three|\bdocument\.|\bwindow\./)
    }
  })
})
