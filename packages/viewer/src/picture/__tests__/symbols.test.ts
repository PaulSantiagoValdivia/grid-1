import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { exterior, flat, room, stairRoomHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { planToSvg } from '../planSvg'
import { LINE_PX, TECHNICAL_LOOK, lineMetres } from '../look'

/**
 * SHT-11 (lab DR-5): a lift shaft's cross and the dashed outline of the floor above, in the 2D
 * picture that `planToSvg` and the app's canvas share (`scene.ts`). The shapes are the core's
 * (`buildFloorPlan`'s `lifts`, `floorAbove`); the look only says how they are drawn.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

/** The flat on the ground floor, and a first floor 2 m deeper to the north: an overhang. */
function overhangHouse(): FloorPlan {
  const ground = flat()
  const on = { floor: 'first' }
  return {
    ...ground,
    floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'First floor', level: 1 }],
    walls: [...ground.walls, exterior('u_s', [0, 0], [10, 0], on), exterior('u_e', [10, 0], [10, 10], on), exterior('u_n', [10, 10], [0, 10], on), exterior('u_w', [0, 10], [0, 0], on)],
    rooms: [...ground.rooms, room('up', 'Room', ['u_s', 'u_e', 'u_n', 'u_w'], 'first')]
  }
}

describe('a lift shaft in the 2D picture', () => {
  it('gets a cross, corner to corner, on every floor it serves', () => {
    for (const floor of ['ground', 'first', 'second']) {
      const svg = planToSvg(stairRoomHouse({ use: 'lift' }), { floor })
      expect(parts(svg, 'lift')).toHaveLength(1)
      expect(parts(svg, 'lift')[0]).toContain(`data-id="${floor}-stair"`)
      expect(parts(svg, 'lift-cross')).toHaveLength(2)
    }
  })

  it('is not drawn where no room is used as a lift', () => {
    expect(parts(planToSvg(stairRoomHouse(), { floor: 'ground' }), 'lift')).toEqual([])
  })
})

describe('the floor above in the 2D picture', () => {
  it('is drawn dashed where it overhangs the floor drawn, in the look\'s pen and dashes', () => {
    const svg = planToSvg(overhangHouse(), { floor: 'ground', look: 'technical', paperScale: 100 })
    expect(parts(svg, 'above')).toHaveLength(1)
    expect(parts(svg, 'above')[0]).toContain('data-floors="first"')
    const [line] = parts(svg, 'above-line')
    expect(parts(svg, 'above-line')).toHaveLength(1)
    const metres = lineMetres(TECHNICAL_LOOK, 0.01, 100)
    expect(line).toContain(`stroke-dasharray="${metres.dash('above').map((v) => String(Number(v.toPrecision(4)))).join(' ')}"`)
    // Over the room fills and under the walls.
    expect(svg.indexOf('data-part="above"')).toBeGreaterThan(svg.lastIndexOf('data-part="room"'))
    expect(svg.indexOf('data-part="above"')).toBeLessThan(svg.indexOf('data-part="wall"'))
  })

  it('is left off with show.above false, as `--hide above` asks', () => {
    expect(parts(planToSvg(overhangHouse(), { floor: 'ground', show: { above: false } }), 'above')).toEqual([])
  })

  it('names itself in the key when the picture has one', () => {
    expect(planToSvg(overhangHouse(), { floor: 'ground', show: { key: true } })).toContain('Above: the floor over this one')
    expect(planToSvg(twoFloorHouse(), { floor: 'ground', show: { key: true } })).not.toContain('Above: the floor over this one')
  })

  it('adds nothing where the floor above stands on this one\'s walls, or on the top floor', () => {
    expect(planToSvg(twoFloorHouse(), { floor: 'ground' })).toBe(planToSvg(twoFloorHouse(), { floor: 'ground', show: { above: false } }))
    expect(parts(planToSvg(overhangHouse(), { floor: 'first' }), 'above')).toEqual([])
  })

  it('draws its dashes in screen pixels in the working look', () => {
    expect(LINE_PX.aboveDash).toEqual([4, 3])
    expect(parts(planToSvg(overhangHouse(), { floor: 'ground' }), 'above-line')[0]).toContain('stroke-dasharray=')
  })
})
