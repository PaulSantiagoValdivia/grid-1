import { describe, expect, it } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import * as canvas from '@napi-rs/canvas'
import { SANS, SERIF, useSheetFonts } from '../fonts'

describe('the sheet fonts (VEW-7)', () => {
  it('registers a serif and a sans under Grid\'s own names', () => {
    useSheetFonts(canvas)
    const families = GlobalFonts.families.map((f) => f.family)
    expect(families).toContain(SERIF)
    expect(families).toContain(SANS)
  })
  it('registers them once', () => {
    useSheetFonts(canvas)
    useSheetFonts(canvas)
    expect(GlobalFonts.families.filter((f) => f.family === SERIF).length).toBe(1)
  })
})
