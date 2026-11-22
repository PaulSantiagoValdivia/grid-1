import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { LIGHT_COLORS_3D, planStill } from '@ongrid/viewer/src/still'
import { drawStill } from '../drawStill'

/**
 * 3D stills from a plain function call, in plain Node: no browser, no WebGL, no GPU, no app.
 */

const dir = mkdtempSync(join(tmpdir(), 'grid-still-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const flat = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) as FloorPlan

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return [view.getUint32(16), view.getUint32(20)]
}

describe('drawStill', () => {
  it('writes a PNG of the two-bed flat with no browser', async () => {
    // Nothing a browser gives is here: the still needs none of it.
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined')
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')

    // Without the label (MSG-3), the file holds exactly the still's pixels.
    const png = await drawStill(flat, { label: false })
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    expect(pngSize(png)).toEqual([1200, 800])
    const file = join(dir, 'flat.png')
    writeFileSync(file, png)

    // The file holds the still's own pixels.
    const image = await loadImage(readFileSync(file))
    const canvas = createCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = planStill(flat)
    const read = context.getImageData(0, 0, image.width, image.height).data
    expect(Buffer.from(read).equals(Buffer.from(pixels.data))).toBe(true)
    expect([...read.subarray(0, 3)]).toEqual([0xf1, 0xee, 0xe8])
    expect(LIGHT_COLORS_3D.background).toBe('#f1eee8')
  })

  it('stamps the label in the top-left corner and leaves the rest of the still as it was (MSG-3)', async () => {
    const pixelsOf = async (png: Uint8Array): Promise<Uint8ClampedArray> => {
      const image = await loadImage(Buffer.from(png))
      const canvas = createCanvas(image.width, image.height)
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, image.width, image.height).data
    }
    const labelled = await pixelsOf(await drawStill(flat))
    const plain = await pixelsOf(await drawStill(flat, { label: false }))
    const row = 1200 * 4
    // The strip is at most 30 rows high: everything under it is the still's own.
    expect(Buffer.from(labelled.subarray(30 * row)).equals(Buffer.from(plain.subarray(30 * row)))).toBe(true)
    expect(Buffer.from(labelled.subarray(0, 30 * row)).equals(Buffer.from(plain.subarray(0, 30 * row)))).toBe(false)
  })

  it('draws twice as wide and tall at scale 2', async () => {
    expect(pngSize(await drawStill(flat, { scale: 2 }))).toEqual([2400, 1600])
    expect(pngSize(await drawStill(flat, { width: 400, height: 300, scale: 0.5 }))).toEqual([200, 150])
  })

  it('refuses a scale that is not a number above 0', async () => {
    await expect(drawStill(flat, { scale: 0 })).rejects.toThrow(/above 0/)
    await expect(drawStill(flat, { scale: Number.NaN })).rejects.toThrow(/above 0/)
  })

  it('takes a still of the two-bed flat quickly', async () => {
    await drawStill(flat)
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      await drawStill(flat)
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    const median = times[2]!
    console.log(`A still of the two-bed flat, 1200 by 800, takes ${median.toFixed(0)} ms (median of 5).`)
    // A loose ceiling for slow CI machines: it catches a still that has become many times slower.
    expect(median).toBeLessThan(5000)
  })
})
