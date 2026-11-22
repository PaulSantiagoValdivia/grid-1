/**
 * MSG-11: Grid's own words in Spanish.
 *
 * Status: draft translation, not reviewed. Written from the English (`en.ts`) and read by no
 * person yet. A named architect is to review every line, the building terms and the label
 * first; until then this file and every word in it stays a draft. An AI is never recorded as
 * its reviewer.
 *
 * The same keys and placeholders as `en.ts` (a test holds it). Names from the plan are never
 * translated: they come in as values, quoted.
 */
import type { Messages } from './say'
import { checksEs } from './parts/checks.es'
import { describeEs } from './parts/describe.es'
import { drawingEs } from './parts/drawing.es'
import { issuesEs } from './parts/issues.es'
import { linesEs } from './parts/lines.es'
import { reportEs } from './parts/report.es'

export const STATUS = 'draft translation, not reviewed'

export const es: Messages = {
  label: 'Orientación general, no sus normas locales',
  'join.and': ' y ',
  'join.or': ' o ',
  'join.comma': ', ',
  'join.semicolon': '; ',
  'join.commaOr': ' o ',
  'join.commaAnd': ' y ',
  ...issuesEs,
  ...checksEs,
  ...linesEs,
  ...reportEs,
  ...describeEs,
  ...drawingEs
}
