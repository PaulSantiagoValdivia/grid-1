/**
 * MSG-9: the one way Grid turns the bytes of a file into text.
 *
 * A file saved with a byte-order mark, as many Windows programs save it, is read without the
 * mark. A file in UTF-16, with or without its mark, is read as UTF-16. Anything else must be
 * UTF-8, read strictly: a byte that is not part of a UTF-8 character refuses the file, saying
 * where, instead of turning letters into question marks (a Latin-1 'Salón' would otherwise reach
 * the exports as 'Sal?n'). No file, no `fs`: the project's files hand the bytes over.
 */

/** Why a file's bytes are not text Grid reads. The message is one line, and says where. */
export class TextNotDecoded extends Error {
  override readonly name = 'TextNotDecoded'
}

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be'

/** The encoding a file's first bytes show, and how many bytes of mark to skip. */
function encodingOf(bytes: Uint8Array): { encoding: TextEncoding; skip: number } {
  const [a, b, c, d] = [bytes[0], bytes[1], bytes[2], bytes[3]]
  if (a === 0xef && b === 0xbb && c === 0xbf) return { encoding: 'utf-8', skip: 3 }
  if ((a === 0xff && b === 0xfe && c === 0 && d === 0) || (a === 0 && b === 0 && c === 0xfe && d === 0xff)) {
    throw new TextNotDecoded('is saved as UTF-32, which Grid does not read: save it as UTF-8.')
  }
  if (a === 0xff && b === 0xfe) return { encoding: 'utf-16le', skip: 2 }
  if (a === 0xfe && b === 0xff) return { encoding: 'utf-16be', skip: 2 }
  // Without a mark: a JSON file starts with a letter of plain ASCII, which UTF-16 pairs with a zero.
  if (bytes.length >= 2 && a !== 0 && b === 0) return { encoding: 'utf-16le', skip: 0 }
  if (bytes.length >= 2 && a === 0 && b !== 0) return { encoding: 'utf-16be', skip: 0 }
  return { encoding: 'utf-8', skip: 0 }
}

/** The position of the first byte that is not part of a UTF-8 character, or -1. */
export function firstBadUtf8Byte(bytes: Uint8Array, from = 0): number {
  let i = from
  while (i < bytes.length) {
    const lead = bytes[i]!
    if (lead < 0x80) {
      i++
      continue
    }
    // The length of the character, and the range its second byte must be in (no overlong
    // forms, no surrogates, nothing past U+10FFFF).
    let length: number
    let low = 0x80
    let high = 0xbf
    if (lead >= 0xc2 && lead <= 0xdf) length = 2
    else if (lead >= 0xe0 && lead <= 0xef) {
      length = 3
      if (lead === 0xe0) low = 0xa0
      if (lead === 0xed) high = 0x9f
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      length = 4
      if (lead === 0xf0) low = 0x90
      if (lead === 0xf4) high = 0x8f
    } else return i
    for (let k = 1; k < length; k++) {
      const next = bytes[i + k]
      if (next === undefined) return i
      // The character that breaks off is no character: its first byte is where the file goes wrong.
      if (k === 1 ? next < low || next > high : next < 0x80 || next > 0xbf) return i
    }
    i += length
  }
  return -1
}

/** The line a byte is on, counted from 1. */
function lineOf(bytes: Uint8Array, at: number): number {
  let line = 1
  for (let i = 0; i < at; i++) if (bytes[i] === 0x0a) line++
  return line
}

/**
 * The text of a file's bytes, or `TextNotDecoded` saying why not. Lone halves of a UTF-16
 * pair are refused too: they are no character.
 */
export function decodeText(bytes: Uint8Array): { readonly text: string; readonly encoding: TextEncoding } {
  const { encoding, skip } = encodingOf(bytes)
  if (encoding === 'utf-8') {
    const bad = firstBadUtf8Byte(bytes, skip)
    if (bad >= 0) {
      throw new TextNotDecoded(
        `is not UTF-8 text: byte ${bad + 1} (line ${lineOf(bytes, bad)}) is not part of any UTF-8 character. ` +
          'It may be saved as Latin-1 or Windows-1252; save it as UTF-8.',
      )
    }
    return { text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(skip)), encoding }
  }
  const body = bytes.subarray(skip)
  if (body.length % 2 !== 0) throw new TextNotDecoded(`looks like UTF-16 text but ends half way through a character: save it as UTF-8.`)
  try {
    return { text: new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(body), encoding }
  } catch {
    throw new TextNotDecoded(`looks like UTF-16 text but holds half of a character pair: save it as UTF-8.`)
  }
}
