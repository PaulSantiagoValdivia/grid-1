import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type { PlanLook } from '../look'
import { DARK_LOOK, LIGHT_LOOK, LINE_PX, TEXT_PX, UNDRAWN_TINT } from '../look'

/**
 * The picture's look and the app's stylesheets say the same thing twice: once as final
 * values for a file with no stylesheet, once as CSS. These tests read the sheets so the two
 * cannot drift apart.
 */
const tokens = readFileSync(resolve(__dirname, '../../plan-tokens.css'), 'utf8')
const sheet = readFileSync(resolve(__dirname, '../../canvas2d/plan.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function tokensOf(selector: ':root' | '.dark'): Map<string, string> {
  const start = tokens.indexOf(`${selector} {`)
  const block = tokens.slice(start, tokens.indexOf('}', start))
  return new Map([...block.matchAll(/(--plan-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

/** The declarations of one rule in plan.css. */
function rule(selector: string): Map<string, string> {
  const start = sheet.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`plan.css has no rule for ${selector}`)
  const body = sheet.slice(sheet.indexOf('{', start) + 1, sheet.indexOf('}', start))
  return new Map(
    body
      .split(';')
      .map((part) => part.split(':').map((s) => s.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== '')
  )
}

const TOKEN_OF: Record<Exclude<keyof PlanLook, 'font'>, string> = {
  paper: '--plan-paper',
  room: '--plan-room',
  wall: '--plan-wall',
  wallExterior: '--plan-wall-exterior',
  virtual: '--plan-virtual',
  window: '--plan-window',
  label: '--plan-label',
  labelSoft: '--plan-label-soft',
  dimension: '--plan-dimension',
  dimensionSoft: '--plan-dimension-soft',
  dimensionText: '--plan-dimension-text',
  dimensionSoftText: '--plan-dimension-soft-text',
  warning: '--plan-warning'
}

const number = (value: string | undefined): number => Number.parseFloat(value ?? 'NaN')

describe('the picture look', () => {
  it.each([
    ['light', ':root', LIGHT_LOOK],
    ['dark', '.dark', DARK_LOOK]
  ] as const)('has the %s colours of plan-tokens.css', (_name, selector, look) => {
    const values = tokensOf(selector)
    for (const [key, token] of Object.entries(TOKEN_OF)) {
      expect(look[key as keyof typeof TOKEN_OF], token).toBe(values.get(token))
    }
  })

  it('has the line widths and dashes of plan.css', () => {
    const at = (part: string, extra = '') => rule(`.canvas ${extra}[data-part='${part}']`)
    expect(number(at('virtual').get('stroke-width'))).toBe(LINE_PX.virtual)
    expect(at('virtual').get('stroke-dasharray')).toBe(LINE_PX.virtualDash.join(' '))
    expect(number(at('opening').get('stroke-width'))).toBe(LINE_PX.opening)
    expect(number(at('jamb').get('stroke-width'))).toBe(LINE_PX.jamb)
    expect(number(at('step').get('stroke-width'))).toBe(LINE_PX.step)
    expect(number(at('door-leaf').get('stroke-width'))).toBe(LINE_PX.doorLeaf)
    expect(number(at('door-arc').get('stroke-width'))).toBe(LINE_PX.doorArc)
    expect(number(at('dimension-line').get('stroke-width'))).toBe(LINE_PX.dimension)
    expect(number(at('extension').get('stroke-width'))).toBe(LINE_PX.extension)
    expect(number(at('label-leader').get('stroke-width'))).toBe(LINE_PX.leader)
    expect(at('dimension-line', "[data-kind='room'] ").get('stroke-dasharray')).toBe(LINE_PX.roomDimensionDash.join(' '))
    expect(number(at('door-warning-dot').get('stroke-width'))).toBe(LINE_PX.warningRing)
    expect(number(at('door-warning-text').get('stroke-width'))).toBe(LINE_PX.warningHalo)
    expect(number(at('undrawn-room').get('stroke-width'))).toBe(LINE_PX.undrawn)
    expect(at('undrawn-room').get('stroke-dasharray')).toBe(LINE_PX.undrawnDash.join(' '))
    expect(number(at('undrawn-room').get('fill-opacity'))).toBe(UNDRAWN_TINT)
    expect(number(at('fault-mark-dot').get('stroke-width'))).toBe(LINE_PX.warningRing)
  })

  it('has the font sizes of plan.css', () => {
    const size = (part: string, extra = '') => number(rule(`.canvas ${extra}[data-part='${part}']`).get('font-size'))
    expect(size('label')).toBe(TEXT_PX.roomName)
    expect(size('area')).toBe(TEXT_PX.roomArea)
    expect(size('dimension-text')).toBe(TEXT_PX.dimension)
    expect(size('dimension-text', "[data-kind='room'] ")).toBe(TEXT_PX.roomDimension)
    expect(size('door-warning-text')).toBe(TEXT_PX.warning)
    expect(size('undrawn-name')).toBe(TEXT_PX.roomName)
    expect(size('undrawn-reason')).toBe(TEXT_PX.warning)
    expect(size('fault-mark-number')).toBe(TEXT_PX.faultNumber)
    expect(size('fault-mark-text')).toBe(TEXT_PX.warning)
  })

  it('draws every line in plan.css at a fixed screen width, which the picture turns into metres', () => {
    for (const part of ['virtual', 'opening', 'jamb', 'door-leaf', 'door-arc', 'dimension-line', 'extension', 'label-leader', 'undrawn-room']) {
      expect(rule(`.canvas [data-part='${part}']`).get('vector-effect'), part).toBe('non-scaling-stroke')
    }
  })
})
