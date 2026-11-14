/**
 * A stored rules sheet as the figures the check reads. Structural on purpose: the
 * check does not import the sheet type, only the fields it needs. Only kept figures carry
 * over; dropped and not-found keys give nothing, so the check uses its baseline for them.
 */

import { FIGURE_KEYS, type FigureKey } from './figures'
import type { RuleFigures } from './types'

interface SheetFigure {
  readonly value: number
  readonly sourceUrl: string
  readonly quote: string
  readonly retrievedAt: string
}

export function figuresFromSheet(sheet: { readonly figures: { readonly [K in FigureKey]?: SheetFigure } }): RuleFigures {
  const figures: { [K in FigureKey]?: RuleFigures[K] } = {}
  for (const key of FIGURE_KEYS) {
    const kept = sheet.figures[key]
    if (kept === undefined) continue
    figures[key] = { value: kept.value, source: { url: kept.sourceUrl, quote: kept.quote, retrievedAt: kept.retrievedAt } }
  }
  return figures
}
