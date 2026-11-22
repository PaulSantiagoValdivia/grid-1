/**
 * MSG-3: how a figure is said. A figure is always the figure used here, with its basis (where
 * it comes from) and its status (how far a person has checked it), and never what the plan or
 * the reader "needs": Grid applies a figure, it does not say what the reader's rules are.
 * The report, the result record and the notes a person reads all word a figure from here.
 */
import { figureText } from '@ongrid/floorplan/geometry'
import { english, joined, num, said, type MessageKey, type Said, type Value } from '@ongrid/floorplan/messages'
import { buildingKindsSaid, FIGURE_KEYS, VERIFICATION_STATUSES, type FigureKey, type VerificationStatus } from './figures'
import type { AppliedFigure } from './types'

/** How far a figure has been checked, as a reader is told (MSG-11: `check.status.*`), in English. */
export const FIGURE_STATUS_WORDS: Readonly<Record<VerificationStatus, string>> = Object.fromEntries(
  VERIFICATION_STATUSES.map((status) => [status, english(said(`check.status.${status}`))])
) as Record<VerificationStatus, string>

/** What each figure is, in plain words (MSG-11: `check.figure.*`), in English. */
export const FIGURE_NAMES: Readonly<Record<FigureKey, string>> = Object.fromEntries(FIGURE_KEYS.map((key) => [key, english(said(`check.figure.${key}`))])) as Record<
  FigureKey,
  string
>

/** "6.5 m²", by its values. */
export function figureValueSaid(figure: Pick<AppliedFigure, 'value' | 'unit'>): Said {
  return said('line.part.figureValue', { value: num(figureText(figure.value)), unit: figure.unit })
}

/** "6.5 m²". */
export function figureValueText(figure: Pick<AppliedFigure, 'value' | 'unit'>): string {
  return english(figureValueSaid(figure))
}

/** The documents a figure cites, as "IBC 2024 1208.4; IRC 2024 R312.1": their names, as the documents give them. */
const citedText = (figure: { readonly citations: readonly { readonly document: string; readonly edition: string; readonly clause: string }[] }): string => figure.citations.map((c) => `${c.document} ${c.edition} ${c.clause}`).join('; ')

/**
 * "US model codes, IBC 2024 1208.4; IRC 2024 R312.1, read 2026-11-14 for homes (…)", or
 * "looked up for this place, <url>, read for …" (COD-2: the kind of building it was read for).
 */
export function figureBasisSaid(figure: AppliedFigure): Said {
  const kinds = buildingKindsSaid([figure.readFor])
  if (figure.origin === 'lookup') return figure.source ? said('line.part.basis.lookupAt', { url: figure.source.url, kinds }) : said('line.part.basis.lookup', { kinds })
  return said('line.part.basis.code', { jurisdiction: figure.jurisdiction, cited: citedText(figure), day: figure.readOn, kinds })
}

export function figureBasisText(figure: AppliedFigure): string {
  return english(figureBasisSaid(figure))
}

/** "status ai-found: found by an AI and not yet checked by a person". */
export function figureStatusSaid(figure: AppliedFigure, first = false): Said {
  return said(first ? 'check.status.first' : 'check.status', { status: figure.status, words: said(`check.status.${figure.status}`) })
}

export function figureStatusText(figure: AppliedFigure): string {
  return english(figureStatusSaid(figure))
}

/**
 * One figure as a line of a report: "The figure used here for the smallest floor area of a room
 * people live or sleep in is 6.5 m² (habitableRoomMinArea). Basis: US model codes, IBC 2024
 * 1208.4; IRC 2024 R312.1, read 2026-11-14 for homes (…). Status ai-found: found by an AI and not yet checked
 * by a person."
 */
export function figureUsedSaid(figure: AppliedFigure): Said {
  return said('check.figureUsed', {
    what: said(`check.figure.${figure.key}` as MessageKey),
    value: figureValueSaid(figure),
    key: figure.key,
    basis: figureBasisSaid(figure),
    status: figureStatusSaid(figure, true)
  })
}

export function figureUsedText(figure: AppliedFigure): string {
  return english(figureUsedSaid(figure))
}

/**
 * The figures of one finding, short, for what a line "needed": "the figure used here, at least
 * 6.5 m² (US model codes, IBC 2024 1208.4; IRC 2024 R312.1, status ai-found)". `what` is the
 * figure as the finding compares it ("at least 6.5 m²").
 */
export function figureNeededSaid(what: Value, figures: readonly AppliedFigure[]): Value {
  if (figures.length === 0) return what
  const bases: Value[] = []
  const seen = new Set<string>()
  for (const f of figures) {
    const basis: Value = f.origin === 'lookup' ? figureBasisSaid(f) : said('line.part.basis.short', { jurisdiction: f.jurisdiction, cited: citedText(f) })
    const key = JSON.stringify(basis)
    if (seen.has(key)) continue
    seen.add(key)
    bases.push(basis)
  }
  const statuses = [...new Set(figures.map((f) => f.status))]
  return said(figures.length === 1 ? 'line.part.figureUsed.one' : 'line.part.figureUsed.many', {
    what,
    bases: joined(bases, 'join.semicolon'),
    statuses: statuses.join(', ')
  })
}

export function figureNeededText(what: string, figures: readonly AppliedFigure[]): string {
  const value = figureNeededSaid(what, figures)
  return typeof value === 'string' ? value : english(value as Said)
}
