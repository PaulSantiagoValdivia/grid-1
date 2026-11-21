/**
 * How Grid prints a number (ARE-7): one rule, stated here, used by the drawing, the checks and
 * the reports alike.
 *
 * - **The arithmetic's noise is taken off first.** A double holds a figure to about 16
 *   significant digits, and the last of them depend on the order the sums were done in: the
 *   same 1.875 m width comes out as 1.875 in one room and 1.8749999999999982 in its mirror
 *   image. A number is read to 12 significant digits before it is rounded, so the two print
 *   the same.
 * - **Halves round away from zero**, as people round by hand: 1.875 is 1.88, -1.875 is -1.88.
 *   No figure prints as -0.00.
 * - **A length goes to the millimetre first**, then to the digits shown, so a length printed
 *   to the centimetre agrees with the same length printed to the millimetre.
 * - **A value checked against a figure is compared as it is**, a tiny tolerance apart
 *   (`lengthEqual`, `areaEqual`), never rounded first. It is printed with the digits shown,
 *   plus as many more as it takes to set it apart from the figure when, at those digits, the
 *   two would read the same: 6.4951 m² against 6.5 m² prints 6.495, so a shortfall is never
 *   hidden and a note never says "6.50 is under 6.5".
 * - **A figure the person or a lookup gave is printed as it was given**: 0.775 is 0.775.
 * - **A sum adds up by eye**: its parts and its total are printed with the fewest digits at
 *   which the printed parts add up to the printed total.
 */

import { tolerance } from './tolerances'

/** Significant digits a printed figure keeps from a double; past them is the arithmetic's noise. */
const SIGNIFICANT = 12
/** Decimals of a length taken to the millimetre. */
const MILLIMETRE = 3
/** The most decimals a figure set apart from another, or a sum, is printed with. */
const MOST_DECIMALS = 9

/** The kind of figure a value is compared with: a length or an area. */
export type FigureUnit = 'm' | 'm²'

/** The number without the noise past 12 significant digits. */
function denoised(value: number): number {
  return value === 0 || !Number.isFinite(value) ? value : Number(value.toPrecision(SIGNIFICANT))
}

/** `value` rounded at `decimals`, halves away from zero, after the noise is taken off. Never -0. */
export function rounded(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value
  const scale = 10 ** decimals
  const magnitude = Math.round(denoised(Math.abs(denoised(value)) * scale)) / scale
  return magnitude === 0 ? 0 : value < 0 ? -magnitude : magnitude
}

/** `value` printed with `decimals` decimals, rounded as `rounded` does. */
export function fixedText(value: number, decimals: number): string {
  return rounded(value, decimals).toFixed(decimals)
}

/** A length taken to the millimetre and then to `decimals`. */
function lengthRounded(value: number, decimals: number): number {
  return decimals < MILLIMETRE ? rounded(rounded(value, MILLIMETRE), decimals) : rounded(value, decimals)
}

const roundedAs = (unit: FigureUnit) => (unit === 'm' ? lengthRounded : rounded)

/** How far apart a value and a figure may be and still be the same. */
const sameWithin = (unit: FigureUnit): number => tolerance(unit === 'm' ? 'lengthEqual' : 'areaEqual')

/** Whether `value` is the figure itself, to within the arithmetic's noise. */
export function atFigure(value: number, figure: number, unit: FigureUnit): boolean {
  return Math.abs(value - figure) <= sameWithin(unit)
}

/** Whether `value` is under `figure`: compared as it is, never rounded first. */
export function underFigure(value: number, figure: number, unit: FigureUnit): boolean {
  return value < figure && !atFigure(value, figure, unit)
}

/** Whether `value` is over `figure`: compared as it is, never rounded first. */
export function overFigure(value: number, figure: number, unit: FigureUnit): boolean {
  return value > figure && !atFigure(value, figure, unit)
}

/**
 * How many decimals `value` is printed with next to `figure`: `decimals`, or more when at
 * `decimals` the two would read the same while they are not the same.
 */
export function decimalsAgainst(value: number, figure: number, decimals: number, unit: FigureUnit = 'm²'): number {
  if (atFigure(value, figure, unit)) return decimals
  const round = roundedAs(unit)
  let d = decimals
  while (d < MOST_DECIMALS) {
    const shown = round(value, d)
    const sameSide = value < figure ? shown < figure : shown > figure
    if (sameSide && shown !== round(figure, d)) break
    d++
  }
  return d
}

/**
 * `value` rounded as it is printed next to `figure` (`decimalsAgainst`), so the number a
 * finding carries is the one its note prints, and on the same side of the figure as the value.
 */
export function shownAgainst(value: number, figure: number, decimals: number, unit: FigureUnit = 'm²'): number {
  return roundedAs(unit)(value, decimalsAgainst(value, figure, decimals, unit))
}

/**
 * A length in metres, without the unit: to the millimetre, then to `decimals` (2 by default).
 * With `against`, the figure it is checked against, it keeps the digits that set it apart.
 */
export function metresText(value: number, decimals = 2, against?: number): string {
  const d = against === undefined ? decimals : decimalsAgainst(value, against, decimals, 'm')
  return lengthRounded(value, d).toFixed(d)
}

/**
 * An area in square metres, without the unit, to `decimals` (2 by default). With `against`,
 * the figure it is checked against, it keeps the digits that set it apart.
 */
export function areaText(value: number, decimals = 2, against?: number): string {
  const d = against === undefined ? decimals : decimalsAgainst(value, against, decimals, 'm²')
  return fixedText(value, d)
}

/** A figure as the person or a lookup gave it: every digit they typed, and no noise. */
export function figureText(value: number): string {
  return String(denoised(value))
}

/**
 * Parts and their total, printed so the parts add up to the total by eye: at `decimals` (2 by
 * default) when they do, or with as many more as it takes. `total` is the total as measured;
 * when no number of digits makes the parts add up to it, the printed total is the sum of the
 * printed parts.
 */
export function sumText(parts: readonly number[], total: number, decimals = 2): { parts: string[]; total: string } {
  for (let d = decimals; d <= MOST_DECIMALS; d++) {
    const scale = 10 ** d
    const shown = parts.map((p) => rounded(p, d))
    const added = shown.reduce((sum, p) => sum + Math.round(p * scale), 0)
    if (added === Math.round(rounded(total, d) * scale) || d === MOST_DECIMALS) {
      return { parts: shown.map((p) => p.toFixed(d)), total: (added / scale).toFixed(d) }
    }
  }
  throw new Error('sumText: no number of decimals was tried')
}
