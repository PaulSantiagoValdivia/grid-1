/**
 * MSG-11: Grid's own words in English, the source language. Every sentence Grid writes for a
 * person is a key here, with its values as named placeholders (`{width}`), filled by `say`.
 * Every other language's file has exactly these keys and these placeholders (a test holds it).
 *
 * Keys: `label`; `join.*`, the words lists are joined with; `thing.*`, how a line names a part;
 * `issue.<code>`, a drawing check's own sentence; `check.*`, the plan checks' findings and
 * notices; `line.<code>.<field>`, the result record's wordings; `report.*`, the words of a
 * report around its lines. A key with a last part after its field (`.one`, `.many`, `.none`)
 * is one wording of several, chosen by the code that says it.
 *
 * Plain English, never anything that reads as "this plan complies" (MSG-3).
 */
import { checksEn } from './parts/checks.en'
import { describeEn } from './parts/describe.en'
import { drawingEn } from './parts/drawing.en'
import { issuesEn } from './parts/issues.en'
import { linesEn } from './parts/lines.en'
import { reportEn } from './parts/report.en'

const core = {
  label: 'General guidance, not your local rules',
  'join.and': ' and ',
  'join.or': ' or ',
  'join.comma': ', ',
  'join.semicolon': '; ',
  'join.commaOr': ', or ',
  'join.commaAnd': ', and '
} as const

export const en = { ...core, ...issuesEn, ...checksEn, ...linesEn, ...reportEn, ...describeEn, ...drawingEn } as const

export type MessageKey = keyof typeof en
