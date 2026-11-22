/**
 * MSG-11: how the drawing checks say their sentences. Each `Issue` keeps its sentence by key and
 * values (`said`, from `messages/en.ts`) and its English (`message`), made from it.
 * The values here are the parts several checks share: a point, a list of names, a figure with
 * its thousands grouped.
 */

import type { Said, Value } from '../messages/say'
import { joined, said } from '../messages/say'
import type { Issue } from './validate'

/**
 * An issue with its sentence: `issue.message` is the English of `sentence`, written in its place
 * by the caller. `said` is set as a property that is not enumerable, so the record reads,
 * compares and prints as it did before it had one.
 */
export function withSaid<T extends Omit<Issue, 'said'>>(issue: T, sentence: Said): T & { readonly said: Said } {
  return Object.defineProperty(issue, 'said', { value: sentence, enumerable: false }) as T & { readonly said: Said }
}

/** A point, `(x, y)`, from two figures already rounded. */
export const pointSaid = (x: string, y: string): Said => said('issue.part.point', { x: { num: x }, y: { num: y } })

/** Names or figures, `a, b and c`, or the first `most` of them and how many more. */
export function namesSaid(values: readonly Value[], most = 6): Value {
  const shown = values.length > most ? [...values.slice(0, most), said('issue.part.more', { n: values.length - most })] : [...values]
  return joined(shown, 'join.comma', 'join.and')
}

/**
 * A figure written with its thousands grouped, as `toLocaleString('en')` writes it ("1,234.56"),
 * said with the language's group and decimal marks.
 */
export function groupedNum(text: string): Value {
  const [whole = '', decimals] = text.split('.')
  const groups = joined(whole.split(','), 'issue.join.group')
  return decimals === undefined ? groups : said('issue.part.decimal', { whole: groups, decimals })
}
