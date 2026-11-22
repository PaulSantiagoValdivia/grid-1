/**
 * MSG-3: how a figure is said. A figure is always the figure used here, with its basis (where
 * it comes from) and its status (how far a person has checked it), and never what the plan or
 * the reader "needs": Grid applies a figure, it does not say what the reader's rules are.
 * The report, the result record and the notes a person reads all word a figure from here.
 */
import { figureText } from '@ongrid/floorplan/geometry'
import type { FigureKey, VerificationStatus } from './figures'
import type { AppliedFigure } from './types'

/** How far a figure has been checked, as a reader is told. */
export const FIGURE_STATUS_WORDS: Readonly<Record<VerificationStatus, string>> = {
  'ai-found': 'found by an AI and not yet checked by a person',
  'human-entered': 'entered by a person and not yet checked against the source',
  'checked-once': 'checked once against the source',
  'checked-twice': 'checked twice against the source',
  disputed: 'disputed'
}

/** What each figure is, in plain words. */
export const FIGURE_NAMES: Readonly<Record<FigureKey, string>> = {
  habitableRoomMinArea: 'the smallest floor area of a room people live or sleep in',
  escapeOpeningMinArea: 'the smallest clear area of an escape opening',
  escapeOpeningMinAreaGrade: 'the smallest clear area of an escape opening at ground level',
  escapeOpeningMinWidth: 'the narrowest clear width of an escape opening',
  escapeOpeningMinHeight: 'the lowest clear height of an escape opening',
  escapeOpeningMaxSill: 'the highest sill of an escape opening',
  routeMinWidth: 'the narrowest width of a route',
  exitDoorClearWidth: 'the narrowest clear width of a door out'
}

/** "6.5 m²". */
export function figureValueText(figure: Pick<AppliedFigure, 'value' | 'unit'>): string {
  return `${figureText(figure.value)} ${figure.unit}`
}

/** "US model codes, IBC 2024 1208.4; IRC 2024 R312.1, read 2026-11-14", or "looked up for this place, <url>". */
export function figureBasisText(figure: AppliedFigure): string {
  if (figure.origin === 'lookup') return `looked up for this place${figure.source ? `, ${figure.source.url}` : ''}`
  const cited = figure.citations.map((c) => `${c.document} ${c.edition} ${c.clause}`).join('; ')
  return `${figure.jurisdiction}, ${cited}, read ${figure.readOn}`
}

/** "status ai-found: found by an AI and not yet checked by a person". */
export function figureStatusText(figure: AppliedFigure): string {
  return `status ${figure.status}: ${FIGURE_STATUS_WORDS[figure.status]}`
}

/**
 * One figure as a line of a report: "The figure used here for the smallest floor area of a room
 * people live or sleep in is 6.5 m² (habitableRoomMinArea). Basis: US model codes, IBC 2024
 * 1208.4; IRC 2024 R312.1, read 2026-11-14. Status ai-found: found by an AI and not yet checked
 * by a person."
 */
export function figureUsedText(figure: AppliedFigure): string {
  const basis = figureBasisText(figure)
  const status = figureStatusText(figure)
  return `The figure used here for ${FIGURE_NAMES[figure.key]} is ${figureValueText(figure)} (${figure.key}). Basis: ${basis}. ${status.charAt(0).toUpperCase()}${status.slice(1)}.`
}

/**
 * The figures of one finding, short, for what a line "needed": "the figure used here, at least
 * 6.5 m² (US model codes, IBC 2024 1208.4; IRC 2024 R312.1, status ai-found)". `what` is the
 * figure as the finding compares it ("at least 6.5 m²").
 */
export function figureNeededText(what: string, figures: readonly AppliedFigure[]): string {
  if (figures.length === 0) return what
  const bases = [...new Set(figures.map((f) => (f.origin === 'lookup' ? figureBasisText(f) : `${f.jurisdiction}, ${f.citations.map((c) => `${c.document} ${c.edition} ${c.clause}`).join('; ')}`)))]
  const statuses = [...new Set(figures.map((f) => f.status))]
  return `the figure${figures.length === 1 ? '' : 's'} used here, ${what} (${bases.join('; ')}, status ${statuses.join(', ')})`
}
