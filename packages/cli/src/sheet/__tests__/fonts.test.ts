import { resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it, vi } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import * as canvas from '@napi-rs/canvas'
import { CJK_FONTS, fontsFolder, sheetFont, SANS, SERIF, registerSheetFonts } from '../fonts'

describe('the sheet fonts (VEW-7)', () => {
  it('registers a serif and a sans under Grid\'s own names', () => {
    registerSheetFonts(canvas)
    const families = GlobalFonts.families.map((f) => f.family)
    expect(families).toContain(SERIF)
    expect(families).toContain(SANS)
  })
  it('registers each of the four faces once', async () => {
    // A fresh copy of the module, so its first call registers; the canvas counts every face.
    vi.resetModules()
    const fresh = await import('../fonts')
    const faces: string[] = []
    const counting = {
      GlobalFonts: {
        registerFromPath: (file: string, family?: string) => {
          const key = canvas.GlobalFonts.registerFromPath(file, family)
          if (key !== null) faces.push(file.slice(file.lastIndexOf('/') + 1))
          return key
        },
      },
    } as unknown as typeof canvas
    fresh.registerSheetFonts(counting)
    fresh.registerSheetFonts(counting)
    fresh.registerSheetFonts(counting)
    expect(faces.sort()).toEqual(['SourceSans3-Regular.otf', 'SourceSans3-Semibold.otf', 'SourceSerif4-Regular.otf', 'SourceSerif4-Semibold.otf'])
  })
  it('reads the fonts from the install\'s own folder only', () => {
    const at = (file: string) => pathToFileURL(resolve(file)).href
    const folder = (dir: string) => `${resolve(dir)}${sep}`
    expect(fontsFolder(at('/x/node_modules/ongrid/grid.mjs'))).toBe(folder('/x/node_modules/ongrid/fonts'))
    expect(fontsFolder(at('/x/node_modules/ongrid/chunks/sheet-AB12.mjs'))).toBe(folder('/x/node_modules/ongrid/fonts'))
    expect(fontsFolder(at('/x/server/grid.mjs'))).toBe(folder('/x/server/fonts'))
    expect(fontsFolder(at('/x/packages/cli/src/sheet/fonts.ts'))).toBe(folder('/x/packages/cli/fonts'))
  })

  it('sets each sheet font with the system\'s fonts after it, for what the bundled ones lack', () => {
    for (const family of [SANS, SERIF]) {
      const font = sheetFont(family, 12, 600)
      expect(font.startsWith(`600 12px "${family}", `)).toBe(true)
      expect(font.endsWith(', sans-serif')).toBe(true)
    }
  })
  const cjk = CJK_FONTS.some((family) => GlobalFonts.has(family))
  it.skipIf(!cjk)('draws a CJK name in a system font, not as the box (skipped when the machine has no CJK system font)', () => {
    registerSheetFonts(canvas)
    const ctx = canvas.createCanvas(10, 10).getContext('2d')
    ctx.font = sheetFont(SANS, 40)
    const box = ctx.measureText('\uE000').width
    const name = ctx.measureText('家').width
    expect(name).not.toBeCloseTo(box, 1)
    // An ideograph is one em wide in every CJK face.
    expect(name).toBeCloseTo(40, 0)
  })
})
