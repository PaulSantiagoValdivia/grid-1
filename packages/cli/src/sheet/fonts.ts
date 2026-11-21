/**
 * VEW-7: the sheet's two fonts, Source Serif 4 and Source Sans 3 (SIL Open Font License 1.1,
 * `fonts/OFL-SourceSerif4.txt` and `fonts/OFL-SourceSans3.txt`), shipped with Grid so a sheet
 * looks the same on every machine.
 *
 * The canvas reads the files itself, so nothing here imports `fs`. The folder is found from
 * where this code runs, and is only ever the install's own: `./fonts/` beside the built
 * `grid.mjs`, or `../fonts/` from its `chunks/` folder. Run from the sources (the tests), it is
 * the package's `fonts/`, two folders up from this file.
 */
import { fileURLToPath } from 'url'

export const SERIF = 'Grid Sheet Serif'
export const SANS = 'Grid Sheet Sans'

/**
 * System fonts for the scripts the bundled fonts lack (Chinese, Japanese, Korean, Thai,
 * Devanagari, emoji), by the names macOS, Windows and Linux give them. The canvas takes each
 * character from the first font in a list that has it; without a list it falls back only to
 * the system's default font, which has none of these, and draws a box.
 */
export const CJK_FONTS = [
  'Hiragino Sans', 'Hiragino Sans GB', 'Apple SD Gothic Neo',
  'Microsoft YaHei', 'Yu Gothic', 'Malgun Gothic',
  'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Noto Sans CJK KR', 'WenQuanYi Micro Hei',
] as const
const FALLBACK_FONTS = [
  ...CJK_FONTS,
  'Sukhumvit Set', 'Thonburi', 'Leelawadee UI', 'Noto Sans Thai',
  'Kohinoor Devanagari', 'Nirmala UI', 'Noto Sans Devanagari',
  'Arial Unicode MS',
  'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji',
]

/** A canvas font: one of the sheet's families, then the system's fonts, then its default. */
export function sheetFont(family: string, size: number, weight: 400 | 600 = 400): string {
  return `${weight} ${size}px "${family}", ${FALLBACK_FONTS.map((name) => `"${name}"`).join(', ')}, sans-serif`
}

export class FontsMissing extends Error {
  override readonly name = 'FontsMissing'
}

const FILES = [
  ['SourceSerif4-Regular.otf', SERIF],
  ['SourceSerif4-Semibold.otf', SERIF],
  ['SourceSans3-Regular.otf', SANS],
  ['SourceSans3-Semibold.otf', SANS],
] as const

/** The one folder the fonts are read from. */
export function fontsFolder(moduleUrl: string = import.meta.url): string {
  const relative = moduleUrl.endsWith('.ts') ? '../../fonts/' : /\/chunks\/[^/]*$/.test(moduleUrl) ? '../fonts/' : './fonts/'
  return fileURLToPath(new URL(relative, moduleUrl))
}

let registered = false

/** Registers the four fonts once. Throws FontsMissing when the install's folder lacks them. */
export function registerSheetFonts(canvas: typeof import('@napi-rs/canvas')): void {
  if (registered) return
  const folder = fontsFolder()
  const keys = FILES.map(([file, family]) => canvas.GlobalFonts.registerFromPath(`${folder}${file}`, family))
  if (keys.some((key) => key === null)) throw new FontsMissing('The sheet fonts are missing from this install of Grid: reinstall it.')
  registered = true
}
