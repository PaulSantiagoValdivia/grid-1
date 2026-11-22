/**
 * The full check as notes a person reads on the plan.
 *
 * The notes of the core's plan checks come from the core, unchanged. The notes of the
 * figure checks are built here: each title is the finding's one wording (`checks/messages.ts`,
 * MSG-1), the same words as its `message`, and the detail says more from its code and ids.
 * Names come back as their own segments, so a list can set them apart without parsing text.
 * Pure.
 */

import {
  GENERAL_GUIDANCE_LABEL,
  areaText,
  figureText,
  metresText,
  planFloors,
  rounded,
  type FindingCode as PlanFindingCode,
  type NotCheckedReason as PlanNotCheckedReason,
  type FloorPlan
} from '@ongrid/floorplan/geometry'
import { planNotes as planCheckNotes, type NoteText, type PlanNote as PlanCheckNote } from '@ongrid/floorplan/notes'
import { ESCAPE_TOP_LEVEL, readForSentence, type VerificationStatus } from '../checks/figures'
import { wordings } from '../checks/messages'
import type { AppliedFigure, FigureFindingCode, RuleFinding, RulesReport } from '../checks/types'

export type { NoteText } from '@ongrid/floorplan/notes'

export interface PlanNote extends Omit<PlanCheckNote, 'tag'> {
  /** What the note is about: getting out, a bedroom's escape window, or a room's size. */
  readonly tag: 'Exit' | 'Escape' | 'Size'
}

export interface PlanNotesView {
  readonly notes: readonly PlanNote[]
  /** What the check did not cover, in its own words. Not notes, and not counted. */
  readonly notChecked: readonly string[]
  /** What the checks never look at, whatever the plan. The same lines every time. */
  readonly limits: readonly string[]
  /** Set when a figure found by a lookup was applied; null otherwise. */
  readonly lookupNotice: string | null
  /** Ends every list. */
  readonly label: string
}

type FigureFinding = RuleFinding & { readonly code: FigureFindingCode }
type PlanFinding = RuleFinding & { readonly code: PlanFindingCode }

const FIGURE_CODES: readonly string[] = [
  'room_too_small',
  'no_escape_opening',
  'escape_window_too_small',
  'escape_window_too_high'
] satisfies readonly FigureFindingCode[]

const PLAN_REASONS: ReadonlySet<string> = new Set(['no_stairs', 'cannot_be_drawn', 'way_out_not_drawn'] satisfies PlanNotCheckedReason[])

const isFigureFinding = (finding: RuleFinding): finding is FigureFinding => FIGURE_CODES.includes(finding.code)
const isPlanFinding = (finding: RuleFinding): finding is PlanFinding => !isFigureFinding(finding)

const words = (text: string): NoteText => ({ text })
const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`)

/**
 * A length in metres as drawn: to the millimetre, without trailing zeros past the centimetre,
 * and with the digits that set it apart from `against`, the figure it was checked against
 * (ARE-7). The rounding is the core's (`metresText`).
 */
const metres = (value: number, against?: number): string =>
  metresText(value, Number.isInteger(rounded(value * 100, 1)) ? 2 : 3, against)
/** A figure in centimetres, as it was given (ARE-7): 0.775 m is 77.5 cm. */
const centimetres = (value: number): string => `${figureText(value * 100)} cm`

/** How far a figure has been checked, as a reader is told. */
const STATUS: Record<VerificationStatus, string> = {
  'ai-found': 'Found by an AI and not yet checked by a person',
  'human-entered': 'Entered by a person and not yet checked against the source',
  'checked-once': 'Checked once against the source',
  'checked-twice': 'Checked twice against the source',
  disputed: 'Disputed'
}

/**
 * Where a finding's figures come from and how far they have been checked, as one or two
 * sentences. Empty for a finding that compared nothing.
 */
function basisText(figures: readonly AppliedFigure[]): string {
  if (figures.length === 0) return ''
  const lookedUp = figures.filter((f) => f.origin === 'lookup')
  if (lookedUp.length > 0) {
    const urls = [...new Set(lookedUp.flatMap((f) => (f.source === undefined ? [] : [f.source.url])))]
    const where = urls.length === 0 ? '' : ` Source: ${urls.join(', ')}.`
    return ` Basis: figures found online for this place. ${STATUS['ai-found']}.${where}${readFor(figures)}`
  }
  const baselines = figures.filter((f) => f.origin === 'baseline')
  const cited = [...new Set(baselines.flatMap((f) => f.citations.map((c) => `${c.document} ${c.edition} ${c.clause}`)))]
  const place = [...new Set(baselines.map((f) => f.jurisdiction))].join(', ')
  const status = [...new Set(baselines.map((f) => STATUS[f.status]))].join('. ')
  return ` Basis: ${place} (${cited.join(', ')}). ${status}.${readFor(figures)}`
}

/** COD-2: which kind of building the figures were read for, as one more sentence. */
function readFor(figures: readonly AppliedFigure[]): string {
  return ` ${readForSentence(figures.map((f) => f.readFor))}.`
}

export function planNotes(plan: FloorPlan, report: RulesReport): PlanNotesView {
  const floors = planFloors(plan)
  const floorNames = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const roomNames = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const roomName = (id: string): string => roomNames.get(id) ?? id
  const floorName = (id: string): string => floorNames.get(id) ?? id

  const figureNote = (finding: FigureFinding): PlanNote => {
    // Every figure finding names one room.
    const room = finding.rooms[0] ?? null
    const shown = room === null ? '' : roomName(room)
    const base = {
      id: [finding.code, finding.floor, finding.rooms.join(','), finding.openings.join(',')].join(':'),
      floor: finding.floor,
      room,
      floorName: floors.length > 1 ? floorName(finding.floor) : null
    }
    const figures = finding.figures ?? []
    const basis = basisText(figures)
    const figure = (key: AppliedFigure['key']): AppliedFigure | undefined => figures.find((f) => f.key === key)
    switch (finding.code) {
      case 'room_too_small': {
        const measured = finding.area === undefined ? '' : `It measures ${areaText(finding.area, 2, finding.minimum)} m². `
        const need = finding.minimum === undefined ? '' : `Rooms people sleep or live in need at least ${finding.minimum} m².`
        return {
          ...base,
          tag: 'Size',
          // Every room_too_small carries its minimum; the wording has nothing to say without it.
          title: wordings.roomTooSmall(shown, finding.minimum ?? 0),
          detail: [words(`${measured}${need}${basis}`)]
        }
      }
      case 'no_escape_opening':
        return {
          ...base,
          tag: 'Escape',
          title: wordings.noEscapeOpening(shown),
          detail: [words(`It needs a window or a door to the outside that someone can climb through. ${readForSentence([ESCAPE_TOP_LEVEL.provenance.readFor])}.`)]
        }
      case 'escape_window_too_small': {
        const width = figure('escapeOpeningMinWidth')
        const height = figure('escapeOpeningMinHeight')
        const needs = [
          ...(finding.minimum === undefined ? [] : [`${figureText(finding.minimum)} m²`]),
          ...(width === undefined ? [] : [`${centimetres(width.value)} wide`]),
          ...(height === undefined ? [] : [`${centimetres(height.value)} tall`])
        ]
        const need = needs.length === 0 ? '' : ` A bedroom on this floor needs at least ${needs.join(', ')}.`
        return {
          ...base,
          tag: 'Escape',
          title: wordings.escapeWindowTooSmall(shown),
          detail: [words(`It opens ${areaText(finding.area ?? 0, 2, finding.minimum)} m² as drawn.${need}${basis}`)]
        }
      }
      case 'escape_window_too_high': {
        const need = finding.maximum === undefined ? '' : ` It needs to be ${figureText(finding.maximum)} m or lower.`
        return {
          ...base,
          tag: 'Escape',
          title: wordings.escapeWindowTooHigh(shown),
          detail: [words(`Its sill is ${metres(finding.sill ?? 0, finding.maximum)} m above the floor as drawn.${need}${basis}`)]
        }
      }
    }
  }

  // The core writes the notes of its own findings; only their place in the list is decided here.
  const fromCore = planCheckNotes(plan, {
    schemaVersion: report.schemaVersion,
    basis: 'general-baseline',
    label: GENERAL_GUIDANCE_LABEL,
    rules: report.rules,
    findings: report.findings.filter(isPlanFinding),
    // The core's notes read its notices to word a room cut off from a way out not drawn.
    notChecked: report.notChecked.filter((n): n is typeof n & { reason: PlanNotCheckedReason } => PLAN_REASONS.has(n.reason)),
    limits: []
  }).notes
  let next = 0
  return {
    notes: report.findings.map((finding) => (isFigureFinding(finding) ? figureNote(finding) : fromCore[next++]!)),
    notChecked: report.notChecked.map((n) => sentence(n.message)),
    limits: report.limits.map(sentence),
    lookupNotice: report.lookupNotice === undefined ? null : sentence(report.lookupNotice),
    label: sentence(report.label)
  }
}
