// @vitest-environment jsdom
/**
 * VEW-1: the app's 2D view and `grid draw` draw a plan with one function, `planScene` in
 * `@ongrid/viewer`. For the same plan, size and look, the SVG `grid draw` writes holds, byte
 * for byte, what the app's `<svg>` holds: the file only adds its own root and a sheet of paper.
 *
 * The app is the real `Canvas2D`, rendered in jsdom. The command's side is `drawFile`, the
 * function `grid draw` calls, and `drawPlan`, the one it calls in turn, at the size the command
 * draws (1200 pixels wide, as tall as the plan's shape asks). The plans are the lab's eight
 * buildings in `packages/floorplan/fixtures/`, in each of the three looks.
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { Canvas2D } from '@ongrid/viewer/src/canvas2d/Canvas2D'
import { installResizeObserver, type ResizeController } from '@ongrid/viewer/src/canvas2d/__tests__/canvas-test-utils'
import { LOOK_NAMES, LOOKS, pictureView, type LookName } from '@ongrid/viewer/src/picture'
import { drawFile } from '../../command/draw'
import { drawPlan } from '../drawPlan'

const FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const BUILDINGS = readdirSync(FIXTURES)
  .filter((name) => name.endsWith('.json'))
  .sort()

const building = (name: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')))

let resize: ResizeController
beforeAll(() => {
  resize = installResizeObserver()
})
afterEach(cleanup)

/** What the app's 2D view draws inside its `<svg>`, at the size `grid draw` draws the plan. */
function appDrawing(plan: FloorPlan, look: LookName): { inner: string; viewBox: string | null } {
  const { width, height } = pictureView(plan)
  resize.set(width, height)
  const { container } = render(<Canvas2D floorPlan={plan} look={LOOKS[look]} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no canvas drawn')
  return { inner: svg.innerHTML, viewBox: svg.getAttribute('viewBox') }
}

/** The file's root and its sheet of paper: all it adds to the app's drawing. */
const HEAD = /^<svg [^>]*><rect data-part="paper" [^>]*><\/rect>/

const CASES = BUILDINGS.flatMap((name) => LOOK_NAMES.map((look) => [name, look] as const))

describe('the app and grid draw draw the same SVG', () => {
  it('has the eight buildings to compare', () => {
    expect(BUILDINGS).toHaveLength(8)
  })

  it.each(CASES)('for %s in the %s look', async (name, look) => {
    const app = appDrawing(building(name), look)
    const file = await drawPlan(building(name), { format: 'svg', look })

    // Make sure there is something to compare.
    expect(app.inner.length).toBeGreaterThan(1000)
    const head = HEAD.exec(file)?.[0]
    expect(head, 'the file starts with its root and its paper').toBeDefined()
    expect(head).toContain(`viewBox="${app.viewBox}"`)
    expect(file).toBe(`${head}${app.inner}</svg>\n`)
  })

  it('through the function grid draw calls, with what went wrong, where the floor drawn has nothing to mark', async () => {
    // `drawFile` marks the result record's lines on the drawing and lists them under it (MSG-8);
    // the app marks none. On a floor with none of them, the drawing is the app's, byte for byte.
    let compared = 0
    for (const name of BUILDINGS) {
      const plan = building(name)
      const loaded = { file: name, plan, issues: [], broken: new Set<string>() }
      const file = String((await drawFile(loaded, { png: false }, 1)).file)
      const app = appDrawing(plan, 'technical')
      // With a key under it, the plan sits in its own frame above the key.
      const drawing = file.includes('data-part="key"')
        ? /<svg x="0" y="0" [^>]*>([\s\S]*)<\/svg><g data-part="key"/.exec(file)?.[1]
        : file.replace(HEAD, '').replace(/<\/svg>\n$/, '')
      expect(drawing, name).toBeDefined()
      if (/data-part="(fault-mark|undrawn)/.test(drawing!)) continue
      expect(drawing, name).toBe(app.inner)
      compared += 1
    }
    expect(compared, 'buildings with no mark on the floor drawn').toBeGreaterThan(0)
  })
})
