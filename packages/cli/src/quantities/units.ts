/**
 * How a figure is written: metres, or feet and inches, and CSV for a spreadsheet. Grid's
 * figures are always metres; feet are only a way of writing them.
 */

export const DISPLAY_UNITS = ['m', 'ft'] as const
export type DisplayUnits = (typeof DISPLAY_UNITS)[number]

const FOOT_M = 0.3048
const SQ_FT_PER_M2 = 1 / (FOOT_M * FOOT_M)

export function sqFt(m2: number): number {
  return m2 * SQ_FT_PER_M2
}

/** A length as feet and whole inches, as 15' 1". */
export function feetAndInches(metres: number): string {
  const inches = Math.round(Math.abs(metres) / 0.0254)
  const sign = metres < 0 ? '-' : ''
  return `${sign}${Math.floor(inches / 12)}' ${inches % 12}"`
}

export function lengthText(metres: number, units: DisplayUnits): string {
  return units === 'ft' ? feetAndInches(metres) : `${metres.toFixed(2)} m`
}

export function areaText(m2: number, units: DisplayUnits): string {
  return units === 'ft' ? `${Math.round(sqFt(m2))} sq ft (${m2.toFixed(2)} m²)` : `${m2.toFixed(2)} m²`
}

/** One CSV field. A field that a spreadsheet would read as a formula is written as text. */
function csvField(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : ''
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function csv(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n'
}
