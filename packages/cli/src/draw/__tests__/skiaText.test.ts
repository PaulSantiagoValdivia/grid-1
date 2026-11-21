import { describe, expect, it } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { planPicture, planToSvg } from '@ongrid/viewer/src/picture'
import type { SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { el, toSvg } from '@ongrid/viewer/src/picture/svgNode'
import { drawPlan } from '../drawPlan'
import { dyAsY } from '../skiaText'
import { twoBedFlat } from './twoBedFlat'

/**
 * VEW-7: Skia moves a centred text by only half its `dy`, so in a PNG a room's area ran into
 * its name. The PNG's text is written with `y` instead, which Skia places in full.
 */

describe('dyAsY', () => {
  it('adds a text\'s dy to its y, and leaves everything else as it is', () => {
    const nodes = [
      el('g', { transform: 'translate(1 2) scale(0.01)' }, [
        el('text', { 'data-part': 'area', dy: '16', 'text-anchor': 'middle' }, ['8.06', ' m²']),
        el('text', { x: 11, y: 4, dy: '-5' }, [el('tspan', { dy: '3' }, ['a'])]),
        el('text', { dy: '0.35em' }, ['b']),
        el('rect', { dy: '2' }, [])
      ])
    ]
    expect(toSvg(dyAsY(nodes))).toBe(
      '<g transform="translate(1 2) scale(0.01)">' +
        '<text data-part="area" text-anchor="middle" y="16">8.06 m²</text>' +
        '<text x="11" y="-1"><tspan dy="3">a</tspan></text>' +
        '<text dy="0.35em">b</text>' +
        '<rect dy="2"></rect></g>'
    )
  })
})

/** The rows with ink in a column band of a PNG, between two rows. */
async function inkRows(png: Uint8Array, x: number, top: number, bottom: number): Promise<number[]> {
  const image = await loadImage(Buffer.from(png))
  const context = createCanvas(image.width, image.height).getContext('2d')
  context.drawImage(image, 0, 0)
  const left = Math.round(x - 20)
  const { data } = context.getImageData(left, top, 40, bottom - top)
  const rows: number[] = []
  for (let row = 0; row < bottom - top; row++) {
    for (let column = 0; column < 40; column++) {
      if (data[(row * 40 + column) * 4]! < 128) {
        rows.push(top + row)
        break
      }
    }
  }
  return rows
}

/** Where the label group holding a room's name is anchored, in picture pixels. */
function labelAnchor(plan: ReturnType<typeof twoBedFlat>, name: string): { x: number; y: number } {
  const picture = planPicture(plan)
  const find = (nodes: readonly SvgNode[]): SvgNode | undefined => {
    for (const node of nodes) {
      const isLabel = node.children.some((child) => typeof child !== 'string' && child.attrs['data-part'] === 'label' && child.children[0] === name)
      if (isLabel) return node
      const inner = find(node.children.filter((child): child is SvgNode => typeof child !== 'string'))
      if (inner) return inner
    }
    return undefined
  }
  const match = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(String(find(picture.nodes)?.attrs.transform))
  if (!match) throw new Error(`no label for ${name}`)
  const { view, width, height } = picture
  return { x: ((Number(match[1]) - view.x) / view.width) * width, y: ((Number(match[2]) - view.y) / view.height) * height }
}

describe('drawPlan places text as the SVG does (VEW-7)', () => {
  it('keeps the SVG file as it was', async () => {
    expect(await drawPlan(twoBedFlat(), { format: 'svg' })).toBe(planToSvg(twoBedFlat()))
    expect(planToSvg(twoBedFlat())).toContain('data-part="area" dy="16"')
  })

  it('draws a room\'s area under its name with a gap, not into it', async () => {
    const plan = twoBedFlat()
    const png = await drawPlan(plan, { format: 'png' })
    const at = labelAnchor(plan, 'Kitchen')
    const rows = await inkRows(png, at.x, Math.round(at.y) - 15, Math.round(at.y) + 25)
    // The name sits on the anchor's line; the area's baseline is 16 px lower, its figures
    // about 8 px tall. Between them, at least one row without ink.
    const gap = rows.findIndex((row, index) => index > 0 && row - rows[index - 1]! > 1)
    expect(gap).toBeGreaterThan(0)
    expect(rows[gap - 1]!).toBeLessThanOrEqual(at.y + 4)
    expect(rows[rows.length - 1]!).toBeGreaterThanOrEqual(at.y + 12)
  })
})
