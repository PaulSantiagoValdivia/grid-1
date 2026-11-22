import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { planForFloor } from '../floors'
import { buildFloorPlan } from '../floorplan'
import { planStairs } from '../stairs'
import { stairSymbol } from '../stairSymbol'
import { liftSymbol } from '../liftSymbol'
import { floorAbove } from '../above'
import { distance } from '../vec2'
import { TOLERANCES, withTolerances } from '../tolerances'
import { exterior, stairHouse, stairRoomHouse, twoFloorHouse, flat, room } from '../../test-support/plans'

/**
 * SHT-11 (lab DR-5): the plan symbols the core works out for the viewer to draw. A stair from the
 * stair the plan states, cut at `planCutHeight` with a break line on the floor it rises from; a
 * cross in a lift shaft; and the outline of the floor above, less what runs along this floor's own.
 */
const lengthOf = (line: readonly { x: number; y: number }[]): number => line.slice(1).reduce((sum, p, i) => sum + distance(line[i]!, p), 0)
const theStair = () => planStairs(stairHouse(), () => new Set()).stairs[0]!

describe('a stair symbol', () => {
  it('cuts the stair on the floor it rises from where the flight reaches the cut height', () => {
    const stair = theStair()
    const symbol = stairSymbol(stair, 'lower')
    expect(TOLERANCES.planCutHeight.value).toBe(1.2)
    expect(symbol.cut).not.toBeNull()
    // The break crosses the walking line (x 0.6) where the nosings reach 1.2 m.
    const along = (1.2 / stair.riserHeight - 1) * stair.going
    const middle = symbol.cut!.reduce((sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }), { x: 0, y: 0 })
    expect(middle.x).toBeCloseTo(0.6, 6)
    expect(middle.y).toBeCloseTo(0.6 + along, 6)
    // The break runs from one edge of the flight to the other.
    expect(symbol.cut![0]!.x).toBeCloseTo(0.6 + 0.45, 6)
    expect(symbol.cut![3]!.x).toBeCloseTo(0.6 - 0.45, 6)
  })

  it('marks every line past the break as above the cut, and none before it', () => {
    const stair = theStair()
    const symbol = stairSymbol(stair, 'lower')
    const along = (1.2 / stair.riserHeight - 1) * stair.going
    const slant = stair.width / 4
    for (const line of symbol.lines.filter((l) => l.kind === 'riser')) {
      const y = (line.points[0]!.y + line.points[1]!.y) / 2 - 0.6
      if (y < along - slant) expect(line.above).toBe(false)
      if (y > along + slant) expect(line.above).toBe(true)
    }
    // 14 risers: 4 wholly below, 2 crossed by the break, each in two, 8 wholly above.
    const risers = symbol.lines.filter((l) => l.kind === 'riser')
    expect(risers).toHaveLength(16)
    expect(risers.filter((l) => !l.above)).toHaveLength(6)
    // The walking line in two, meeting at the cut; the arrow at its upper end.
    const walk = symbol.lines.filter((l) => l.kind === 'walk')
    expect(walk.map((l) => l.above)).toEqual([false, true])
    expect(walk[0]!.points[walk[0]!.points.length - 1]).toEqual(walk[1]!.points[0])
    expect(lengthOf(walk[0]!.points) + lengthOf(walk[1]!.points)).toBeCloseTo(2.8, 9)
    expect(symbol.arrow![0]).toEqual(stair.line[stair.line.length - 1])
  })

  it('draws the stair whole on the floor it arrives on, and where it climbs no higher than the cut', () => {
    const stair = theStair()
    const upper = stairSymbol(stair, 'upper')
    expect(upper.cut).toBeNull()
    expect(upper.lines.every((l) => !l.above)).toBe(true)
    expect(upper.lines.filter((l) => l.kind === 'riser')).toHaveLength(14)
    const low = withTolerances({ planCutHeight: 3 }, () => stairSymbol(stair, 'lower'))
    expect(low.cut).toBeNull()
    expect(low.lines.every((l) => !l.above)).toBe(true)
  })

  it('cuts a stair with a landing in the flight that reaches the cut, and dashes the landing above it', () => {
    const plan: FloorPlan = { ...twoFloorHouse(), stairs: [{ id: 's2', from: 'ground', to: 'first', width: 0.9, risers: 16, run: [[0.6, 0.6], [0.6, 2.0], [3.4, 2.0]] }] }
    const stair = planStairs(plan, () => new Set()).stairs[0]!
    expect(stair.flights).toHaveLength(2)
    const symbol = stairSymbol(stair, 'lower')
    expect(symbol.cut).not.toBeNull()
    const landing = symbol.lines.filter((l) => l.points === stair.landings[0]!.outline)
    expect(landing).toHaveLength(1)
    // Its floor stands below the cut, so it is seen, and the cut falls in the second flight.
    expect(stair.landings[0]!.risersBelow * stair.riserHeight).toBeLessThan(1.2)
    expect(landing[0]!.above).toBe(false)
    expect(symbol.cut!.every((p) => p.y > 1.5)).toBe(true)
    expect(symbol.lines.filter((l) => l.kind === 'outline' && l.closed && l.points === stair.flights[0]!.outline)[0]!.above).toBe(false)
  })

  it('is what the drawing of each floor carries', () => {
    const ground = buildFloorPlan(planForFloor(stairHouse(), 'ground')).stairs[0]!
    const first = buildFloorPlan(planForFloor(stairHouse(), 'first')).stairs[0]!
    expect(ground.symbol.cut).not.toBeNull()
    expect(first.symbol.cut).toBeNull()
  })
})

describe('a lift symbol', () => {
  it('is a cross corner to corner in a shaft with four corners', () => {
    const square = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0.5 }, { x: 2, y: 2 }, { x: 0, y: 2 }]
    expect(liftSymbol(square).lines).toEqual([
      [{ x: 0, y: 0 }, { x: 2, y: 2 }],
      [{ x: 2, y: 0 }, { x: 0, y: 2 }]
    ])
  })

  it('is a cross on the widest point of any other shaft, inside it', () => {
    const l = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 4 }, { x: 0, y: 4 }]
    const { lines } = liftSymbol(l)
    expect(lines).toHaveLength(2)
    for (const [a, b] of lines) for (const p of [a, b]) expect(p.x >= 0 && p.y >= 0 && (p.x <= 1 || p.y <= 1)).toBe(true)
  })

  it('is drawn in each room used as a lift, on every floor, and in no other room', () => {
    const lifts = stairRoomHouse({ use: 'lift' })
    for (const floor of ['ground', 'first', 'second']) {
      const drawing = buildFloorPlan(planForFloor(lifts, floor))
      expect(drawing.lifts.map((l) => l.id)).toEqual([`${floor}-stair`])
      expect(drawing.lifts[0]!.lines).toHaveLength(2)
    }
    expect(buildFloorPlan(planForFloor(stairRoomHouse(), 'ground')).lifts).toEqual([])
    expect(buildFloorPlan(flat()).lifts).toEqual([])
  })
})

/** The flat on the ground floor, and on the first only its western half, x 0 to 5: a loft. */
function loftHouse(): FloorPlan {
  const ground = flat()
  const on = { floor: 'first' }
  return {
    ...ground,
    floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'Loft', level: 1 }],
    walls: [...ground.walls, exterior('l_s', [0, 0], [5, 0], on), exterior('l_e', [5, 0], [5, 8], on), exterior('l_n', [5, 8], [0, 8], on), exterior('l_w', [0, 8], [0, 0], on)],
    rooms: [...ground.rooms, room('loft', 'Loft', ['l_s', 'l_e', 'l_n', 'l_w'], 'first')]
  }
}

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

describe('the floor above', () => {
  it('draws nothing where the floor above stands on this one\'s outer walls', () => {
    const above = floorAbove(planForFloor(twoFloorHouse(), 'ground'))
    expect(above.floors).toEqual(['first'])
    expect(above.lines).toEqual([])
  })

  it('is nothing on the top floor, or on a plan of one floor', () => {
    expect(floorAbove(planForFloor(twoFloorHouse(), 'first'))).toEqual({ floors: [], lines: [] })
    expect(floorAbove(flat())).toEqual({ floors: [], lines: [] })
  })

  it('shows the edge of a loft across the floor below it', () => {
    const { lines } = floorAbove(planForFloor(loftHouse(), 'ground'))
    expect(lines).toHaveLength(1)
    const [line] = lines
    // The loft's east wall's outer face, x 5.1, from the south face of the walls to the north.
    for (const p of line!) expect(p.x).toBeCloseTo(5.1, 6)
    expect(lengthOf(line!)).toBeCloseTo(8.2, 6)
  })

  it('shows an overhang past the outer walls, as one line round it', () => {
    const { lines } = floorAbove(planForFloor(overhangHouse(), 'ground'))
    expect(lines).toHaveLength(1)
    // Up the east side from the ground floor's north face (y 8.1) to 10.1, across and back down.
    expect(lengthOf(lines[0]!)).toBeCloseTo(2 + 10.2 + 2, 6)
    expect(lines[0]!.every((p) => p.y >= 8.1 - 1e-9)).toBe(true)
  })

  it('reads the floor above from the whole plan, at the next level up', () => {
    const plan = stairRoomHouse()
    expect(floorAbove(planForFloor(plan, 'ground')).floors).toEqual(['first'])
    expect(floorAbove(planForFloor(plan, 'first')).floors).toEqual(['second'])
    expect(floorAbove(planForFloor(plan, 'second')).floors).toEqual([])
  })
})
