/**
 * VEW-7: the words of a client sheet (`sheet.json`), written by the author, never by Grid.
 *
 * Every string follows the plan's own text rule (MSG-9): no line break, control character,
 * direction character or lone surrogate. One paragraph is one string. A refusal names the
 * field and the limit, never the text.
 */
import { z } from 'zod'
import { NAME_MAX, quoted, UNSAFE_TEXT } from './planText'

export const SHEET_HEADLINE_MAX = 200
export const SHEET_PARAGRAPH_MAX = 1200
export const SHEET_PARAGRAPHS_MAX = 3

export interface SheetWords {
  readonly version: '1'
  readonly name?: string
  readonly headline?: string
  readonly intro?: readonly string[]
  readonly floors?: Readonly<Record<string, readonly string[]>>
}

export class SheetWordsRefused extends Error {
  override readonly name = 'SheetWordsRefused'
}

function textProblem(where: string, value: unknown, max: number): string | null {
  if (typeof value !== 'string') return `${where} must be text`
  if (value.length === 0) return `${where} is empty`
  if (value.length > max) return `${where} is longer than ${max} characters`
  if (UNSAFE_TEXT.test(value)) return `${where} holds a line break, a control character or a direction character`
  return null
}

function paragraphsProblem(where: string, value: unknown): string | null {
  if (!Array.isArray(value)) return `${where} must be a list of paragraphs`
  if (value.length > SHEET_PARAGRAPHS_MAX) return `${where} has more than ${SHEET_PARAGRAPHS_MAX} paragraphs`
  for (let i = 0; i < value.length; i++) {
    const problem = textProblem(`${where}[${i}]`, value[i], SHEET_PARAGRAPH_MAX)
    if (problem) return problem
  }
  return null
}

const FIELDS = new Set(['version', 'name', 'headline', 'intro', 'floors'])
/** A key short and plain enough to print back; anything else is named without its text. */
const PLAIN_KEY = /^[A-Za-z0-9_.-]{1,64}$/

/** Null when the words are fine; else one line naming the field and the limit. */
export function sheetWordsProblem(raw: unknown, floorIds: readonly string[]): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'it must be a JSON object'
  const given = raw as Record<string, unknown>
  for (const key of Object.keys(given)) {
    if (!FIELDS.has(key)) return PLAIN_KEY.test(key) ? `${quoted(key)} is not a field of a sheet` : 'it holds a field a sheet does not have'
  }
  if (given['version'] !== '1') return 'version must be "1"'
  if ('name' in given) {
    const problem = textProblem('name', given['name'], NAME_MAX)
    if (problem) return problem
  }
  if ('headline' in given) {
    const problem = textProblem('headline', given['headline'], SHEET_HEADLINE_MAX)
    if (problem) return problem
  }
  if ('intro' in given) {
    const problem = paragraphsProblem('intro', given['intro'])
    if (problem) return problem
  }
  if ('floors' in given) {
    const floors = given['floors']
    if (typeof floors !== 'object' || floors === null || Array.isArray(floors)) return 'floors must be an object keyed by floor id'
    for (const [id, paragraphs] of Object.entries(floors)) {
      if (!floorIds.includes(id)) {
        return PLAIN_KEY.test(id) ? `floors names ${quoted(id)}, which is not a floor of the plan` : 'floors names a floor the plan does not have'
      }
      const problem = paragraphsProblem(`floors.${id}`, paragraphs)
      if (problem) return problem
    }
  }
  return null
}

export const SheetWordsSchema = z
  .object({
    version: z.literal('1'),
    name: z.string().optional(),
    headline: z.string().optional(),
    intro: z.array(z.string()).optional(),
    floors: z.record(z.array(z.string())).optional(),
  })
  .strict()

/** The words of a sheet, or throws `SheetWordsRefused` naming the field and the limit. */
export function parseSheetWords(raw: unknown, floorIds: readonly string[]): SheetWords {
  const problem = sheetWordsProblem(raw, floorIds)
  if (problem !== null) throw new SheetWordsRefused(problem)
  return SheetWordsSchema.parse(raw) as SheetWords
}
