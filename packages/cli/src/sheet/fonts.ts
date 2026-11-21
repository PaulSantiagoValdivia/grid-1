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
