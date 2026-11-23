import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture, pictureToSvg, type TracePicture } from '..'
import type { SvgNode } from '../svgNode'

/**
 * HND-10 (C31): the plan's trace image, given to the picture by its caller, drawn over the rooms'
 * fills and under every line of the plan, where the plan places it.
 */

/** A one-pixel PNG, as a data: address; the picture's size is the caller's to say. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const trace: TracePicture = { href: PNG, width: 800, height: 600 }

function traced(image: Record<string, unknown>, extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({ ...(JSON.parse(JSON.stringify(flat())) as object), ...extra, referenceImage: { path: 'assets/scan.png', ...image } })
}

const part = (node: SvgNode): unknown => node.attrs['data-part']

describe('the trace image in a picture (HND-10)', () => {
  it('is drawn over the rooms\' fills and under the walls, at its opacity, by its placement', () => {
    const picture = planPicture(traced({ at: [-1, 9], scale: 0.02, opacity: 0.5 }), { trace })
    const at = picture.nodes.findIndex((node) => part(node) === 'trace-image')
    expect(at).toBeGreaterThan(0)
    expect(picture.nodes.slice(0, at).every((node) => part(node) === 'room')).toBe(true)
    expect(part(picture.nodes[at + 1]!)).not.toBe('room')
    expect(picture.nodes[at]!.attrs).toMatchObject({ href: PNG, width: 800, height: 600, opacity: '0.5', preserveAspectRatio: 'none', transform: 'matrix(0.02 0 0 0.02 -1 -9)' })
  })

  it('is written into the SVG file and draws nothing without one', () => {
    const plan = traced({ scale: 0.02 })
    expect(pictureToSvg(planPicture(plan, { trace }))).toContain(`<image data-part="trace-image" href="${PNG}"`)
    expect(pictureToSvg(planPicture(plan))).toBe(pictureToSvg(planPicture(parseFloorPlan(flat()))))
  })

  it('is drawn only under the floor it lies under', () => {
    const floors = { floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }] }
    const plan = traced({ floor: 'first', scale: 0.02 }, floors)
    const drawn = (floor: string): boolean => planPicture(plan, { floor, trace }).nodes.some((node) => part(node) === 'trace-image')
    expect(drawn('first')).toBe(true)
    expect(drawn('ground')).toBe(false)
  })

  it('is framed with the drawing, and alone on a floor with nothing drawn yet', () => {
    const plan = traced({ at: [20, 0], scale: 0.01 })
    const view = planPicture(plan, { trace }).view
    // The image reaches 28 m to the east, past the flat.
    expect(view.x + view.width).toBeGreaterThan(28)
    const empty = parseFloorPlan({ version: '1', units: 'm', walls: [], rooms: [], openings: [], referenceImage: { path: 'scan.png', at: [100, 50], scale: 0.01 } })
    const alone = planPicture(empty, { trace }).view
    // 8 × 6 m from (100, 50) down to (108, 44), with the frame's margin round it.
    expect(alone.x).toBeGreaterThan(99)
    expect(alone.x + alone.width).toBeLessThan(109)
    expect(-alone.y).toBeGreaterThan(50)
    expect(-alone.y).toBeLessThan(51)
  })

  it('is drawn only from a PNG or JPEG given as a data: address, never a file or the network', () => {
    const plan = traced({ scale: 0.02 })
    for (const href of ['assets/scan.png', 'https://example.invalid/x.png', 'file:///etc/hosts', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', `${PNG}"/><script>`]) {
      expect(() => planPicture(plan, { trace: { ...trace, href } }), href).toThrow(/data: address/)
    }
  })
})
