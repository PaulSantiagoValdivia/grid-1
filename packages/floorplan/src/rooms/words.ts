/**
 * Reading a line of rooms text into words, and a word into a number or a point.
 *
 * A line is split at spaces; a word in double or single quotes may hold spaces; `#` starts a
 * comment outside quotes; a comma at the end of a word is dropped, so a line may read like a
 * sentence. Lengths are metres, written as plain numbers. A number may be a sum written with
 * digits and the signs + - * / and brackets, such as `3.0+0.3`: nothing else is evaluated.
 */

/** A problem that stops the reading, with its code and the line it is on. */
export class RoomsStop extends Error {
  override readonly name = 'RoomsStop'
  constructor(
    readonly code: string,
    message: string,
    readonly line: number | null = null
  ) {
    super(message)
  }
}

/** The words of one line, without its comment. */
export function wordsOf(line: string, at: number): string[] {
  const out: string[] = []
  let word = ''
  let started = false
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote !== null) {
      if (c === quote) quote = null
      else word += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      started = true
      continue
    }
    if (c === '#') break
    if (c === ' ' || c === '\t') {
      if (started) out.push(word)
      word = ''
      started = false
      continue
    }
    word += c
    started = true
  }
  if (quote !== null) throw new RoomsStop('rooms/syntax', `line ${at}: a quote is opened and never closed.`, at)
  if (started) out.push(word)
  return out.map((w) => (w.endsWith(',') ? w.slice(0, -1) : w)).filter((w) => w !== '')
}

/** A sum of numbers: digits, a point, + - * / and brackets. Anything else is not read. */
function evaluate(text: string): number | null {
  let i = 0
  const peek = (): string => text[i] ?? ''
  const skip = (): void => {
    while (peek() === ' ') i++
  }
  function atom(): number | null {
    skip()
    if (peek() === '(') {
      i++
      const value = sum()
      skip()
      if (value === null || peek() !== ')') return null
      i++
      return value
    }
    if (peek() === '-' || peek() === '+') {
      const sign = peek() === '-' ? -1 : 1
      i++
      const value = atom()
      return value === null ? null : sign * value
    }
    const m = /^\d+(?:\.\d*)?|^\.\d+/.exec(text.slice(i))
    if (!m) return null
    i += m[0].length
    return Number(m[0])
  }
  function product(): number | null {
    let value = atom()
    for (;;) {
      skip()
      const op = peek()
      if (value === null || (op !== '*' && op !== '/')) return value
      i++
      const next = atom()
      if (next === null) return null
      value = op === '*' ? value * next : value / next
    }
  }
  function sum(): number | null {
    let value = product()
    for (;;) {
      skip()
      const op = peek()
      if (value === null || (op !== '+' && op !== '-')) return value
      i++
      const next = product()
      if (next === null) return null
      value = op === '+' ? value + next : value - next
    }
  }
  const value = sum()
  skip()
  return value !== null && i === text.length && Number.isFinite(value) ? value : null
}

/** A length in metres. */
export function numberOf(word: string, at: number): number {
  if (/^[0-9.+\-*/() ]+$/.test(word)) {
    const value = evaluate(word)
    if (value !== null) return value
  }
  if (/^[0-9.]+\s*(mm|cm|m|ft|in|'|")$/.test(word)) {
    throw new RoomsStop('rooms/units', `line ${at}: '${word}' has a unit. Write lengths in metres as plain numbers, for example 3.6.`, at)
  }
  throw new RoomsStop('rooms/syntax', `line ${at}: expected a number in metres, found '${word}'.`, at)
}

/** A point written `x,y` with no space. */
export function pointOf(word: string, at: number): [number, number] {
  const parts = word.split(',')
  if (parts.length !== 2) {
    throw new RoomsStop('rooms/syntax', `line ${at}: expected a point written x,y with no space (for example 3.2,0), found '${word}'.`, at)
  }
  return [numberOf(parts[0]!, at), numberOf(parts[1]!, at)]
}

/** Is this word a number as `numberOf` reads it? */
export function isNumberWord(word: string): boolean {
  return /^[0-9.+\-*/()]+$/.test(word) && evaluate(word) !== null
}

/** A length as rooms text writes it: up to four decimals, no trailing zeros. */
export function metres(value: number): string {
  const rounded = Math.round(value * 10000) / 10000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** Two decimals, for messages. */
export const f2 = (value: number): string => value.toFixed(2)
