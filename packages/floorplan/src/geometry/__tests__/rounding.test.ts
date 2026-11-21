/**
 * ARE-7: rounding stated once. Every figure Grid prints is rounded one way, a value checked
 * against a figure is compared as it is and printed with the digits that keep it on its side,
 * the person's own figures come back as they were typed, and a sum adds up by eye.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { buildDimensions } from '../dimensions'
import { buildFloorPlan } from '../floorplan'
import { areaText, figureText, metresText, rounded, shownAgainst, sumText } from '../rounding'

const DATA = resolve(__dirname, '../../../../../scoreboard/data')

function labPlan(name: string): unknown {
  const line = gunzipSync(readFileSync(resolve(DATA, 'lab-plans.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { name: string; text: string })
    .find((p) => p.name === name)
  if (line === undefined) throw new Error(`no lab plan named ${name}`)
  return JSON.parse(line.text)
}

describe('ARE-7 one way of rounding', () => {
  it('AR-11 prints all ten 1.875 m widths of the hotel floor the same', () => {
    const plan = parseFloorPlan(labPlan('C/scenarios/hotel-floor.json'))
    const widths = buildDimensions(buildFloorPlan(plan)).filter((d) => Math.abs(d.value - 1.875) < 1e-6)
    expect(widths).toHaveLength(10)
    // Six are held a hair under 1.875 (1.8749999999999982 and the like), four exactly.
    expect(widths.filter((d) => d.value < 1.875)).toHaveLength(6)
    expect([...new Set(widths.map((d) => metresText(d.value)))]).toEqual(['1.88'])
  })

  it('rounds half away from zero, after the noise of the arithmetic is taken off', () => {
    expect(rounded(1.875, 2)).toBe(1.88)
    expect(rounded(1.8749999999999982, 2)).toBe(1.88)
    expect(rounded(1.005, 2)).toBe(1.01)
    expect(rounded(-1.875, 2)).toBe(-1.88)
    expect(rounded(7.0200000000000005, 2)).toBe(7.02)
    expect(rounded(7.019999999999998, 2)).toBe(7.02)
    expect(rounded(2.5, 0)).toBe(3)
    expect(rounded(0.1 + 0.2, 1)).toBe(0.3)
  })

  it('takes lengths to the millimetre before the centimetre, so a length and its millimetre figure agree', () => {
    expect(metresText(1.875)).toBe('1.88')
    expect(metresText(1.8745)).toBe('1.88')
    expect(metresText(1.8744)).toBe('1.87')
    expect(metresText(1.8745, 3)).toBe('1.875')
    expect(metresText(0.004)).toBe('0.00')
  })

  it('never prints a negative zero', () => {
    expect(metresText(-0.001)).toBe('0.00')
    expect(areaText(-0.0001)).toBe('0.00')
    expect(metresText(-0.006)).toBe('-0.01')
  })

  it('prints areas to two decimals, or to fewer when asked', () => {
    expect(areaText(6.500000000000001)).toBe('6.50')
    expect(areaText(4.2249999999999996)).toBe('4.23')
    expect(areaText(13.93, 0)).toBe('14')
    expect(areaText(13.95, 1)).toBe('14.0')
  })
})

describe('ARE-7 a value checked against a figure', () => {
  it('CH-11 keeps a small shortfall visible: 6.4951 m² against 6.5 m² prints 6.495', () => {
    expect(shownAgainst(6.4951, 6.5, 2)).toBe(6.495)
    expect(areaText(6.4951, 2, 6.5)).toBe('6.495')
  })

  it('CH-11 does the same at the other figures the audit tried', () => {
    // A window of 0.4575 m² against 0.46, one of 0.5252 against 0.53, a sill 1.1184 m against 1.118.
    expect(shownAgainst(0.4575, 0.46, 2)).toBeLessThan(0.46)
    expect(shownAgainst(0.5252, 0.53, 2)).toBeLessThan(0.53)
    expect(shownAgainst(1.1184, 1.118, 3)).toBe(1.1184)
  })

  it('prints the usual digits when they already show which side the value is on', () => {
    expect(shownAgainst(5.8, 6.5, 2)).toBe(5.8)
    expect(shownAgainst(6.494, 6.5, 2)).toBe(6.49)
    expect(areaText(0.30988, 2, 0.46)).toBe('0.31')
  })

  it('reads a value a hair from the figure as the figure itself', () => {
    expect(shownAgainst(6.499999999999999, 6.5, 2)).toBe(6.5)
    expect(shownAgainst(6.500000000000001, 6.5, 2)).toBe(6.5)
  })

  it('never prints a value on the wrong side of its figure', () => {
    const figures = [6.5, 0.46, 0.53, 1.118, 0.508, 0.61, 0.775, 1.875]
    let seed = 7
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (const figure of figures) {
      for (let i = 0; i < 2000; i++) {
        const value = figure + (next() - 0.5) * 0.02
        for (const decimals of [2, 3]) {
          const shown = shownAgainst(value, figure, decimals)
          if (value < figure - 1e-6) expect(shown, `${value} against ${figure}`).toBeLessThan(figure)
          if (value > figure + 1e-6) expect(shown, `${value} against ${figure}`).toBeGreaterThan(figure)
        }
      }
    }
  })
})

describe('ARE-7 the person’s own figures', () => {
  it('AB-17 echoes 0.775 as 0.775, and every figure as it was typed', () => {
    expect(figureText(0.775)).toBe('0.775')
    expect(figureText(6.5)).toBe('6.5')
    expect(figureText(0.4575)).toBe('0.4575')
    expect(figureText(1.118)).toBe('1.118')
    expect(figureText(2)).toBe('2')
  })
})

describe('ARE-7 sums that add up by eye', () => {
  const addsUp = ({ parts, total }: { parts: readonly string[]; total: string }): boolean => {
    const decimals = (total.split('.')[1] ?? '').length
    const sum = parts.reduce((s, p) => s + Math.round(Number(p) * 10 ** decimals), 0)
    return sum === Math.round(Number(total) * 10 ** decimals)
  }

  it('AU7-3 never prints 54.00 + 54.00 + 1.12 = 109.13', () => {
    // The floor under the removed wall: 7.5 × 0.15 m, held as 1.1249999999999998.
    const under = 7.5 * 0.15
    const sum = sumText([54, 54, under], 54 + 54 + under)
    expect(`${sum.parts.join(' + ')} = ${sum.total}`).not.toBe('54.00 + 54.00 + 1.12 = 109.13')
    expect(addsUp(sum)).toBe(true)
    expect(sum).toEqual({ parts: ['54.00', '54.00', '1.13'], total: '109.13' })
  })

  it('shows three decimals when the parts at two would not add up to the total', () => {
    const sum = sumText([1.004, 1.004, 1.004], 3.012)
    expect(sum).toEqual({ parts: ['1.004', '1.004', '1.004'], total: '3.012' })
  })

  it('adds up for any parts', () => {
    let seed = 11
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let i = 0; i < 3000; i++) {
      const parts = Array.from({ length: 1 + Math.floor(next() * 6) }, () => Math.round(next() * 1e7) / 1e5)
      const sum = sumText(parts, parts.reduce((s, p) => s + p, 0))
      expect(addsUp(sum), parts.join(' + ')).toBe(true)
    }
  })
})
