import { describe, expect, it, vi } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import * as canvas from '@napi-rs/canvas'
import { SANS, SERIF, registerSheetFonts } from '../fonts'

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
})
