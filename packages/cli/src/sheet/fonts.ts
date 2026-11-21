/**
 * VEW-7: the sheet's two fonts, Source Serif 4 and Source Sans 3 (SIL Open Font License 1.1,
 * `fonts/OFL-SourceSerif4.txt` and `fonts/OFL-SourceSans3.txt`), shipped with Grid so a sheet
 * looks the same on every machine.
 *
 * The canvas reads the files itself, so nothing here imports `fs`. The folder is found from
 * where this code runs: `fonts/` beside the built `grid.mjs`, beside its chunk folder, or two
 * folders up from this source file in tests.
 */
import { fileURLToPath } from 'url'

export const SERIF = 'Grid Sheet Serif'
export const SANS = 'Grid Sheet Sans'

export class FontsMissing extends Error {
  override readonly name = 'FontsMissing'
}

const FILES = [
  ['SourceSerif4-Regular.otf', SERIF],
  ['SourceSerif4-Semibold.otf', SERIF],
  ['SourceSans3-Regular.otf', SANS],
  ['SourceSans3-Semibold.otf', SANS],
] as const

const CANDIDATES = ['./fonts/', '../fonts/', '../../fonts/']
let registered = false

/** Registers the four fonts once. Throws FontsMissing when none of the folders holds them. */
export function registerSheetFonts(canvas: typeof import('@napi-rs/canvas')): void {
  if (registered) return
  for (const candidate of CANDIDATES) {
    const folder = fileURLToPath(new URL(candidate, import.meta.url))
    const keys = FILES.map(([file, family]) => canvas.GlobalFonts.registerFromPath(`${folder}${file}`, family))
    if (keys.every((key) => key !== null)) {
      registered = true
      return
    }
  }
  throw new FontsMissing('The sheet fonts are missing from this install of Grid: reinstall it.')
}
