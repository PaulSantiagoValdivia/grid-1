/**
 * MSG-11: the language a report is being written in, for the words around its lines: set for
 * the one report being written (`inLanguage`), as `withDisplay` sets a drawing's display.
 */
import { DEFAULT_LANGUAGE, say, sayValue, type Language, type MessageKey, type SayOptions, type Value, type Values } from '@ongrid/floorplan/messages'

let current: { readonly language: Language; readonly options: SayOptions } = { language: DEFAULT_LANGUAGE, options: {} }

/** Runs `write` with its words in `language`, with `decimal` as its decimal mark when given. */
export function inLanguage<T>(language: Language | undefined, decimal: 'point' | 'comma' | undefined, write: () => T): T {
  const before = current
  current = { language: language ?? DEFAULT_LANGUAGE, options: decimal === undefined ? {} : { decimal } }
  try {
    return write()
  } finally {
    current = before
  }
}

/** A key's wording in the report's language. */
export const t = (key: MessageKey, values?: Values): string => say(current.language, key, values, current.options)

/** A value in the report's language. */
export const tv = (value: Value): string => sayValue(current.language, value, current.options)

/** The report's language. */
export const reportLanguage = (): Language => current.language
