import { describe, expect, it } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import { el, toSvg } from '@ongrid/viewer/src/picture/svgNode'
import { planToSvg } from '@ongrid/viewer/src/picture'
import { drawPlan } from '../drawPlan'
import { SCRIPT_FONTS, scriptRuns, withScriptFonts } from '../scriptFonts'
import { twoBedFlat } from './twoBedFlat'

/**
 * VEW-7: room names in scripts the picture's font lacks (CJK, Thai, Devanagari, emoji) draw as
 * their own glyphs in a PNG, not as the box. Skia's SVG text takes one font for a whole
 * element, so each such run gets a `<tspan>` in a system font that has it.
 */

function named(name: string) {
  const plan = twoBedFlat()
  return { ...plan, rooms: plan.rooms.map((room) => (room.id === 'kitchen' ? { ...room, name } : room)) }
}

describe('script runs', () => {
  it('splits a name where its script changes, keeping spaces and digits with Latin', () => {
    expect(scriptRuns('Kitchen 家 2')).toEqual([
      { script: null, text: 'Kitchen ' },
      { script: 'cjk', text: '家' },
      { script: null, text: ' 2' }
    ])
  })
  it('knows each script it gives a font, and keeps marks and joiners in their run', () => {
    expect(scriptRuns('台所')).toEqual([{ script: 'cjk', text: '台所' }])
    expect(scriptRuns('キッチン、')).toEqual([{ script: 'cjk', text: 'キッチン、' }])
    expect(scriptRuns('부엌')).toEqual([{ script: 'hangul', text: '부엌' }])
    expect(scriptRuns('ห้องครัว')).toEqual([{ script: 'thai', text: 'ห้องครัว' }])
    expect(scriptRuns('रसोई')).toEqual([{ script: 'devanagari', text: 'रसोई' }])
    expect(scriptRuns('👨‍👩‍👧 🏠️ 👍🏽 🇯🇵')).toEqual([
      { script: 'emoji', text: '👨‍👩‍👧' },
      { script: null, text: ' ' },
      { script: 'emoji', text: '🏠️' },
      { script: null, text: ' ' },
      { script: 'emoji', text: '👍🏽' },
      { script: null, text: ' ' },
      { script: 'emoji', text: '🇯🇵' }
    ])
  })
  it('leaves the scripts the picture font has as they are', () => {
    expect(scriptRuns('Salle à manger · 12.5 m²')).toEqual([{ script: null, text: 'Salle à manger · 12.5 m²' }])
    expect(scriptRuns('Кухня Κουζίνα مطبخ')).toEqual([{ script: null, text: 'Кухня Κουζίνα مطبخ' }])
    expect(scriptRuns('')).toEqual([])
  })
})

describe('withScriptFonts', () => {
  const installed = (family: string) => family === 'Hiragino Sans' || family === 'Thonburi'
  it('puts each run in a tspan of the first installed font for its script, inside text only', () => {
    const nodes = [
      el('g', { transform: 'scale(2)' }, [
        el('text', { 'font-family': 'Helvetica', dy: '4' }, ['Kitchen 家', el('tspan', {}, ['ครัว'])]),
        el('title', {}, ['家'])
      ])
    ]
    expect(toSvg(withScriptFonts(nodes, installed))).toBe(
      '<g transform="scale(2)"><text font-family="Helvetica" dy="4">Kitchen <tspan font-family="Hiragino Sans">家</tspan>' +
        '<tspan><tspan font-family="Thonburi">ครัว</tspan></tspan></text><title>家</title></g>'
    )
  })
  it('leaves a run as it is when no font for its script is installed', () => {
    const nodes = [el('text', {}, ['रसोई 家'])]
    expect(withScriptFonts(nodes, () => false)).toEqual(nodes)
  })
})

describe('drawPlan with names in other scripts (VEW-7)', () => {
  it('keeps the SVG file as it was', async () => {
    const plan = named('台所')
    expect(await drawPlan(plan, { format: 'svg' })).toBe(planToSvg(plan))
  })

  const cjk = SCRIPT_FONTS.cjk.some((family) => GlobalFonts.has(family))
  it.skipIf(!cjk)('draws a Japanese room name as its glyphs, not the box (skipped when the machine has no CJK system font)', async () => {
    const png = async (name: string) => Buffer.from(await drawPlan(named(name), { format: 'png' }))
    // Two private-use characters both draw as the font's box: the same picture.
    const box = await png('')
    expect((await png('')).equals(box)).toBe(true)
    // A Japanese name in a real font draws something else.
    expect((await png('家')).equals(box)).toBe(false)
  })
})
