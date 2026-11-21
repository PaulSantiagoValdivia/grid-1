import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { openingSides, roomOutlines } from '../rules/graph'
import { distance, fromTuple } from '../vec2'
import { door, edit, flat, longWallStrip, withOpening } from '../../test-support/plans'

/** The rooms on each side of an opening, as a sorted list with `null` for no room. */
function sides(plan: FloorPlan, openingId: string): (string | null)[] {
  const index = indexPlan(plan)
  const outlines = roomOutlines(plan, index)
  const opening = plan.openings.find((o) => o.id === openingId)!
  return openingSides(opening, index, outlines).sort((a, b) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1
  )
}

function turned(plan: FloorPlan, degrees: number): FloorPlan {
  const a = (degrees * Math.PI) / 180
  const turn = (p: readonly [number, number]): [number, number] => [
    p[0] * Math.cos(a) - p[1] * Math.sin(a),
    p[0] * Math.sin(a) + p[1] * Math.cos(a)
  ]
  return edit(plan, (copy) => {
    for (const w of copy.walls) {
      w.start = turn(w.start)
      w.end = turn(w.end)
    }
  })
}

/** Every wall drawn the other way round, with its openings kept in place (C2). */
function reversed(plan: FloorPlan): FloorPlan {
  return edit(plan, (copy) => {
    for (const w of copy.walls) {
      const length = distance(fromTuple(w.start), fromTuple(w.end))
      ;[w.start, w.end] = [w.end, w.start]
      for (const o of copy.openings) {
        if (o.wall === w.id) o.offset = length - o.offset - o.width
      }
    }
  })
}

const cases: [string, FloorPlan, string, (string | null)[]][] = [
  ['a door between two rooms', flat(), 'd_hk', ['hall', 'kitchen']],
  ['the front door', flat(), 'front', ['hall', null]],
  ['a door between bedroom and bathroom', flat(), 'd_bb', ['bathroom', 'bedroom']],
  ['the door on a long wall with three rooms', longWallStrip(), 'main', ['middle', null]],
  [
    'a narrow door 5 cm from a corner',
    withOpening(flat(), door('corner', 'hb', 0.05, 0.3)),
    'corner',
    ['bedroom', 'hall']
  ]
]

describe.each(cases)('%s', (_name, plan, id, expected) => {
  it('stands between the rooms it is in front of', () => {
    expect(sides(plan, id)).toEqual(expected)
  })

  it.each([37, 90, 211])('says the same when the plan is turned %d°', (degrees) => {
    expect(sides(turned(plan, degrees), id)).toEqual(expected)
  })

  it('says the same when every wall is drawn the other way round', () => {
    expect(sides(reversed(plan), id)).toEqual(expected)
  })
})

describe('a long wall', () => {
  it('joins only the room the door stands in front of, wherever it is along the wall', () => {
    const strip = longWallStrip()
    for (const [offset, room] of [
      [1, 'left'],
      [5.5, 'middle'],
      [10, 'right']
    ] as const) {
      const plan = edit(strip, (copy) => {
        copy.openings[0]!.offset = offset
      })
      expect(sides(plan, 'main')).toEqual([room, null])
    }
  })
})
